// =============================================================================
// CloudGreen OS — ENTSO-E Carbon Intensity Producer
// Main entry point: cron-scheduled pipeline that fetches European grid
// generation data from ENTSO-E, calculates carbon intensity, and publishes
// to the Kafka carbon-events topic.
//
// Falls back gracefully:
//   1. ENTSO-E Transparency Platform (primary — European zones)
//   2. ElectricityMap API (if CO2SIGNAL_API_KEY set)
//   3. Open-Meteo weather-based estimator (universal fallback)
//   4. Static fallback value (last resort)
// =============================================================================

import { CronJob } from "cron";
import axios from "axios";
import { loadConfig, BIDDING_ZONE_NAMES } from "./config.js";
import { EntsoEClient } from "./entsoe-client.js";
import { calculateCarbonIntensity } from "./carbon-calculator.js";
import { CarbonEventProducer } from "./kafka-producer.js";
import type { CarbonIntensityResult } from "./types.js";

// ── Config & Clients ───────────────────────────────────────────────────────
const config = loadConfig();
const entsoeClient = new EntsoEClient(config);
const kafkaProducer = new CarbonEventProducer(config);

const zoneName =
  BIDDING_ZONE_NAMES[config.ENTSOE_BIDDING_ZONE] ?? config.ENTSOE_BIDDING_ZONE;

// ── Fallback: ElectricityMap ───────────────────────────────────────────────
async function fallbackElectricityMap(): Promise<CarbonIntensityResult | null> {
  const apiKey = config.CO2SIGNAL_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await axios.get(
      "https://api.electricitymap.org/v3/carbon-intensity/latest",
      {
        headers: { "auth-token": apiKey },
        params: { zone: config.FALLBACK_ZONE },
        timeout: 8_000,
      }
    );

    const intensity = response.data?.carbonIntensity;
    if (typeof intensity !== "number") return null;

    const rounded = Math.round(intensity);
    console.info(
      `[Fallback] ElectricityMap → zone=${config.FALLBACK_ZONE}, intensity=${rounded} gCO₂/kWh`
    );

    return {
      zone: config.FALLBACK_ZONE,
      intensity: rounded,
      mode: getMode(rounded),
      totalGenerationMW: 0,
      renewableSharePercent: 0,
      fossilSharePercent: 0,
      source: "electricitymaps",
      periodStart: new Date().toISOString(),
      periodEnd: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      fuelBreakdown: [],
    };
  } catch (err) {
    console.warn("[Fallback] ElectricityMap unavailable:", (err as Error).message);
    return null;
  }
}

// ── Fallback: Open-Meteo Weather Estimator ─────────────────────────────────
function estimateFromWeather(tempC: number, windKmh: number): number {
  const baseline = 540;
  const renewableBoost = Math.max(0, windKmh - 10) * 3.2;
  const coolingPenalty = Math.max(0, tempC - 28) * 5.5;
  return Math.max(120, Math.round(baseline - renewableBoost + coolingPenalty));
}

async function fallbackOpenMeteo(): Promise<CarbonIntensityResult | null> {
  try {
    const response = await axios.get("https://api.open-meteo.com/v1/forecast", {
      params: {
        latitude: config.FALLBACK_LATITUDE,
        longitude: config.FALLBACK_LONGITUDE,
        current: "temperature_2m,wind_speed_10m",
      },
      timeout: 8_000,
    });

    const current = response.data?.current ?? {};
    const intensity = estimateFromWeather(
      Number(current.temperature_2m ?? 29),
      Number(current.wind_speed_10m ?? 8)
    );

    console.info(
      `[Fallback] Open-Meteo → estimated intensity=${intensity} gCO₂/kWh`
    );

    return {
      zone: config.FALLBACK_ZONE,
      intensity,
      mode: getMode(intensity),
      totalGenerationMW: 0,
      renewableSharePercent: 0,
      fossilSharePercent: 0,
      source: "open-meteo-estimator",
      periodStart: new Date().toISOString(),
      periodEnd: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      fuelBreakdown: [],
    };
  } catch (err) {
    console.warn("[Fallback] Open-Meteo unavailable:", (err as Error).message);
    return null;
  }
}

// ── Static Fallback ────────────────────────────────────────────────────────
function staticFallback(): CarbonIntensityResult {
  console.warn("[Fallback] Using static fallback intensity=515 gCO₂/kWh");
  return {
    zone: config.FALLBACK_ZONE,
    intensity: 515,
    mode: "critical",
    totalGenerationMW: 0,
    renewableSharePercent: 0,
    fossilSharePercent: 0,
    source: "fallback-static",
    periodStart: new Date().toISOString(),
    periodEnd: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    fuelBreakdown: [],
  };
}

// ── Mode Classification ────────────────────────────────────────────────────
function getMode(intensity: number): CarbonIntensityResult["mode"] {
  if (intensity <= 220) return "green";
  if (intensity <= 360) return "balanced";
  if (intensity <= 500) return "defer";
  return "critical";
}

// ── Main Pipeline Step ─────────────────────────────────────────────────────
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 10;

async function runPipeline(): Promise<void> {
  const startTime = Date.now();

  console.info(
    `\n${"═".repeat(72)}\n` +
      `[Pipeline] Carbon intensity fetch started at ${new Date().toISOString()}\n` +
      `[Pipeline] Primary: ENTSO-E zone=${zoneName}\n` +
      `${"═".repeat(72)}`
  );

  let result: CarbonIntensityResult | null = null;

  // Strategy 1: ENTSO-E (primary)
  try {
    const fuelMix = await entsoeClient.fetchActualGeneration();
    result = calculateCarbonIntensity(fuelMix);
    console.info(
      `[Pipeline] ENTSO-E success → intensity=${result.intensity} gCO₂/kWh, ` +
        `mode=${result.mode}, renewable=${result.renewableSharePercent}%`
    );
  } catch (err) {
    console.warn(`[Pipeline] ENTSO-E failed: ${(err as Error).message}`);
  }

  // Strategy 2: ElectricityMap (fallback)
  if (!result) {
    result = await fallbackElectricityMap();
  }

  // Strategy 3: Open-Meteo (fallback)
  if (!result) {
    result = await fallbackOpenMeteo();
  }

  // Strategy 4: Static fallback (last resort)
  if (!result) {
    result = staticFallback();
  }

  // Publish to Kafka
  try {
    await kafkaProducer.publish(result);
    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures++;
    console.error(
      `[Pipeline] Kafka publish failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ` +
        (err as Error).message
    );

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(
        `[Pipeline] FATAL: ${MAX_CONSECUTIVE_FAILURES} consecutive Kafka failures. Exiting.`
      );
      process.exit(1);
    }
  }

  const elapsed = Date.now() - startTime;
  console.info(`[Pipeline] Completed in ${elapsed}ms\n`);
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.info(
    `\n` +
      `╔══════════════════════════════════════════════════════════════════════╗\n` +
      `║  CloudGreen OS — ENTSO-E Carbon Intensity Producer                 ║\n` +
      `╠══════════════════════════════════════════════════════════════════════╣\n` +
      `║  Zone    : ${zoneName.padEnd(56)}║\n` +
      `║  Brokers : ${config.KAFKA_BROKERS.substring(0, 56).padEnd(56)}║\n` +
      `║  Topic   : ${config.KAFKA_TOPIC.padEnd(56)}║\n` +
      `║  Schedule: ${config.POLL_CRON.padEnd(56)}║\n` +
      `╚══════════════════════════════════════════════════════════════════════╝\n`
  );

  // Connect Kafka producer
  await kafkaProducer.connect();

  // Run immediately on startup if configured
  if (config.RUN_ON_STARTUP) {
    console.info("[Scheduler] Running initial fetch on startup...");
    await runPipeline();
  }

  // Schedule recurring fetches
  const job = new CronJob(
    config.POLL_CRON,
    async () => {
      try {
        await runPipeline();
      } catch (err) {
        console.error("[Scheduler] Unhandled pipeline error:", (err as Error).message);
      }
    },
    null, // onComplete
    true, // start immediately
    "UTC"
  );

  console.info(`[Scheduler] Cron job started: ${config.POLL_CRON} (UTC)`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.info(`\n[Shutdown] Received ${signal}, cleaning up...`);
    job.stop();
    await kafkaProducer.disconnect();
    console.info("[Shutdown] Goodbye.");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[FATAL] Startup failed:", err);
  process.exit(1);
});
