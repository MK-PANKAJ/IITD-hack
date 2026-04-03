// =============================================================================
// CloudGreen OS — ENTSO-E Producer Configuration
// Environment-driven config with Zod validation and safe defaults
// =============================================================================

import { z } from "zod";

const configSchema = z.object({
  // ── ENTSO-E API ──────────────────────────────────────────────────────────
  /** ENTSO-E REST API security token (free registration at transparency.entsoe.eu) */
  ENTSOE_API_TOKEN: z.string().min(1, "ENTSOE_API_TOKEN is required"),

  /** ENTSO-E bidding zone EIC code. Default: Germany (50 Hz) */
  ENTSOE_BIDDING_ZONE: z.string().default("10YDE-VE-------2"),

  /** ENTSO-E base URL */
  ENTSOE_BASE_URL: z.string().url().default("https://web-api.tp.entsoe.eu"),

  // ── Kafka ────────────────────────────────────────────────────────────────
  /** Kafka bootstrap server (Strimzi internal service DNS) */
  KAFKA_BROKERS: z
    .string()
    .default("cloudgreen-kafka-kafka-bootstrap.kafka-system.svc.cluster.local:9092"),

  /** Target Kafka topic */
  KAFKA_TOPIC: z.string().default("carbon-events"),

  /** Kafka client ID */
  KAFKA_CLIENT_ID: z.string().default("entso-e-producer"),

  // ── Fallback APIs ────────────────────────────────────────────────────────
  /** ElectricityMap API key (optional fallback) */
  CO2SIGNAL_API_KEY: z.string().optional(),

  /** Fallback zone for ElectricityMap / Open-Meteo (ISO 3166-1 alpha-2) */
  FALLBACK_ZONE: z.string().default("IN"),

  /** Latitude for Open-Meteo weather estimator fallback */
  FALLBACK_LATITUDE: z.coerce.number().default(28.6139),

  /** Longitude for Open-Meteo weather estimator fallback */
  FALLBACK_LONGITUDE: z.coerce.number().default(77.209),

  // ── Scheduling ───────────────────────────────────────────────────────────
  /** Cron expression for the polling interval */
  POLL_CRON: z.string().default("*/15 * * * *"),

  /** Whether to run an immediate fetch on startup */
  RUN_ON_STARTUP: z.coerce.boolean().default(true),

  // ── Observability ────────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof configSchema>;

let _config: AppConfig | null = null;

/**
 * Parse and validate configuration from environment variables.
 * Throws a descriptive error on validation failure.
 */
export function loadConfig(): AppConfig {
  if (_config) return _config;

  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${issues}`);
  }

  _config = result.data;
  return _config;
}

/**
 * Well-known ENTSO-E bidding zone mapping for display purposes.
 * Not exhaustive — only commonly used zones.
 */
export const BIDDING_ZONE_NAMES: Record<string, string> = {
  "10YDE-VE-------2": "Germany (DE)",
  "10YFR-RTE------C": "France (FR)",
  "10YES-REE------0": "Spain (ES)",
  "10YIT-GRTN-----B": "Italy (IT)",
  "10YNL----------L": "Netherlands (NL)",
  "10YBE----------2": "Belgium (BE)",
  "10YAT-APG------L": "Austria (AT)",
  "10YPL-AREA-----S": "Poland (PL)",
  "10YPT-REN------W": "Portugal (PT)",
  "10YCZ-CEPS-----N": "Czech Republic (CZ)",
  "10Y1001A1001A82H": "Denmark DK1",
  "10Y1001A1001A83F": "Denmark DK2",
  "10YNO-0--------C": "Norway NO1",
  "10YSE-1--------K": "Sweden SE1",
  "10YFI-1--------U": "Finland (FI)",
  "10YCH-SWISSGRIDZ": "Switzerland (CH)",
  "10YGB----------A": "Great Britain (GB)",
  "10YIE-1001A00010": "Ireland (IE)",
  "10YGR-HTSO-----Y": "Greece (GR)",
  "10YRO-TEL------P": "Romania (RO)",
  "10YHU-MAVIR----U": "Hungary (HU)",
};
