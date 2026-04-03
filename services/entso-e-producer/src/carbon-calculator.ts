// =============================================================================
// CloudGreen OS — Carbon Intensity Calculator
// Converts a fuel mix into a weighted-average carbon intensity (gCO₂eq/kWh)
// using IPCC AR6 median lifecycle emission factors.
//
// Sources:
//   - IPCC AR6 WGIII Annex III (2022)
//   - JRC Technical Report on lifecycle GHG emissions (EU, 2021)
// =============================================================================

import type { FuelCode, FuelMix, CarbonIntensityResult, FuelBreakdownEntry } from "./types.js";

/**
 * Emission factors in gCO₂eq/kWh (lifecycle, IPCC AR6 medians).
 * These include upstream (fuel extraction, transport) and combustion emissions.
 */
const EMISSION_FACTORS: Record<FuelCode, number> = {
  B01: 230,   // Biomass (wide range 52–410; median with LUC)
  B02: 1050,  // Fossil Brown Coal / Lignite
  B03: 490,   // Fossil Coal-derived Gas
  B04: 450,   // Fossil Gas (CCGT lifecycle)
  B05: 910,   // Fossil Hard Coal
  B06: 650,   // Fossil Oil (heavy fuel oil / diesel)
  B07: 900,   // Fossil Oil Shale
  B08: 1100,  // Fossil Peat
  B09: 38,    // Geothermal
  B10: 24,    // Hydro Pumped Storage (depends on source mix; using hydro proxy)
  B11: 24,    // Hydro Run-of-river
  B12: 24,    // Hydro Water Reservoir
  B13: 17,    // Marine (tidal, wave)
  B14: 12,    // Nuclear
  B15: 40,    // Other Renewable (average of minor renewables)
  B16: 45,    // Solar PV (utility-scale lifecycle)
  B17: 350,   // Waste (mixed waste incineration)
  B18: 12,    // Wind Offshore
  B19: 11,    // Wind Onshore
  B20: 500,   // Other (assume fossil-mix average)
};

/** Fuel codes classified as renewable */
const RENEWABLE_CODES = new Set<FuelCode>([
  "B01", "B09", "B10", "B11", "B12", "B13", "B15", "B16", "B18", "B19",
]);

/** Fuel codes classified as fossil */
const FOSSIL_CODES = new Set<FuelCode>([
  "B02", "B03", "B04", "B05", "B06", "B07", "B08",
]);

/**
 * Calculate the weighted-average carbon intensity from a fuel mix.
 *
 * Formula:
 *   intensity = Σ(powerMW_i × emissionFactor_i) / Σ(powerMW_i)
 *
 * Returns intensity in gCO₂eq/kWh, along with renewable/fossil share percentages
 * and a per-fuel breakdown.
 */
export function calculateCarbonIntensity(fuelMix: FuelMix): CarbonIntensityResult {
  const { entries, totalMW, zone, periodStart, periodEnd } = fuelMix;

  if (totalMW <= 0 || entries.length === 0) {
    return {
      zone,
      intensity: 0,
      mode: "green",
      totalGenerationMW: 0,
      renewableSharePercent: 0,
      fossilSharePercent: 0,
      source: "entsoe",
      periodStart,
      periodEnd,
      timestamp: new Date().toISOString(),
      fuelBreakdown: [],
    };
  }

  let totalWeightedEmissions = 0;
  let renewableMW = 0;
  let fossilMW = 0;
  const breakdown: FuelBreakdownEntry[] = [];

  for (const entry of entries) {
    const factor = EMISSION_FACTORS[entry.fuelCode] ?? 500;
    const contribution = entry.powerMW * factor;
    totalWeightedEmissions += contribution;

    if (RENEWABLE_CODES.has(entry.fuelCode)) {
      renewableMW += entry.powerMW;
    } else if (FOSSIL_CODES.has(entry.fuelCode)) {
      fossilMW += entry.powerMW;
    }

    breakdown.push({
      fuelCode: entry.fuelCode,
      fuelName: entry.fuelName,
      powerMW: entry.powerMW,
      sharePercent: round((entry.powerMW / totalMW) * 100, 1),
      emissionFactor: factor,
      contributionGrams: round(contribution, 0),
    });
  }

  // Sort breakdown by contribution (highest emitters first)
  breakdown.sort((a, b) => b.contributionGrams - a.contributionGrams);

  const intensity = round(totalWeightedEmissions / totalMW, 0);
  const renewableSharePercent = round((renewableMW / totalMW) * 100, 1);
  const fossilSharePercent = round((fossilMW / totalMW) * 100, 1);

  return {
    zone,
    intensity,
    mode: getMode(intensity),
    totalGenerationMW: round(totalMW, 0),
    renewableSharePercent,
    fossilSharePercent,
    source: "entsoe",
    periodStart,
    periodEnd,
    timestamp: new Date().toISOString(),
    fuelBreakdown: breakdown,
  };
}

/**
 * Map carbon intensity (gCO₂eq/kWh) to a CloudGreen scheduling mode.
 * Thresholds aligned with the existing server/index.js logic.
 */
function getMode(intensity: number): CarbonIntensityResult["mode"] {
  if (intensity <= 220) return "green";
  if (intensity <= 360) return "balanced";
  if (intensity <= 500) return "defer";
  return "critical";
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
