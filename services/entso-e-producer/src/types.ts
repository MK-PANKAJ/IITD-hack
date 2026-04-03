// =============================================================================
// CloudGreen OS — ENTSO-E Producer Types
// Shared interfaces for the carbon intensity pipeline
// =============================================================================

/** ENTSO-E generation fuel type codes (B01–B20) mapped to fuel categories */
export type FuelCode =
  | "B01" // Biomass
  | "B02" // Fossil Brown coal/Lignite
  | "B03" // Fossil Coal-derived gas
  | "B04" // Fossil Gas
  | "B05" // Fossil Hard coal
  | "B06" // Fossil Oil
  | "B07" // Fossil Oil shale
  | "B08" // Fossil Peat
  | "B09" // Geothermal
  | "B10" // Hydro Pumped Storage
  | "B11" // Hydro Run-of-river and poundage
  | "B12" // Hydro Water Reservoir
  | "B13" // Marine
  | "B14" // Nuclear
  | "B15" // Other renewable
  | "B16" // Solar
  | "B17" // Waste
  | "B18" // Wind Offshore
  | "B19" // Wind Onshore
  | "B20"; // Other

/** A single generation data point returned by ENTSO-E */
export interface GenerationDataPoint {
  fuelCode: FuelCode;
  fuelName: string;
  /** Power output in MW */
  powerMW: number;
  /** Period start (ISO 8601) */
  periodStart: string;
  /** Period end (ISO 8601) */
  periodEnd: string;
}

/** Aggregated fuel mix for a given time period */
export interface FuelMix {
  zone: string;
  periodStart: string;
  periodEnd: string;
  totalMW: number;
  entries: GenerationDataPoint[];
}

/** Carbon intensity calculation result */
export interface CarbonIntensityResult {
  zone: string;
  /** gCO₂eq per kWh */
  intensity: number;
  /** Scheduling mode derived from intensity */
  mode: "green" | "balanced" | "defer" | "critical";
  totalGenerationMW: number;
  renewableSharePercent: number;
  fossilSharePercent: number;
  source: "entsoe" | "electricitymaps" | "open-meteo-estimator" | "fallback-static";
  periodStart: string;
  periodEnd: string;
  timestamp: string;
  fuelBreakdown: FuelBreakdownEntry[];
}

/** Individual fuel type contribution to the carbon intensity */
export interface FuelBreakdownEntry {
  fuelCode: FuelCode;
  fuelName: string;
  powerMW: number;
  sharePercent: number;
  emissionFactor: number;
  /** gCO₂eq contributed by this fuel type */
  contributionGrams: number;
}

/** Kafka message envelope for the carbon-events topic */
export interface CarbonEvent {
  eventId: string;
  eventType: "carbon-intensity-update";
  version: "1.0.0";
  producedAt: string;
  payload: CarbonIntensityResult;
}

/** ENTSO-E XML parsed time series entry */
export interface EntsoETimeSeries {
  "mRID": string;
  "businessType"?: string;
  "inBiddingZone_Domain.mRID"?: string;
  "MktPSRType"?: { psrType: string };
  "Period"?: EntsoEPeriod | EntsoEPeriod[];
}

export interface EntsoEPeriod {
  "timeInterval": {
    start: string;
    end: string;
  };
  "resolution": string;
  "Point": EntsoEPoint | EntsoEPoint[];
}

export interface EntsoEPoint {
  "position": string | number;
  "quantity": string | number;
}
