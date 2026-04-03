// =============================================================================
// CloudGreen OS — ENTSO-E Transparency Platform API Client
// Fetches Actual Generation Per Type (A75) data and parses XML → FuelMix
//
// Documentation: https://transparency.entsoe.eu/content/static_content/Static%20content/web%20api/Guide.html
// =============================================================================

import axios, { type AxiosInstance } from "axios";
import { XMLParser } from "fast-xml-parser";
import type { AppConfig } from "./config.js";
import type {
  FuelCode,
  FuelMix,
  GenerationDataPoint,
  EntsoETimeSeries,
  EntsoEPeriod,
  EntsoEPoint,
} from "./types.js";

/** Map ENTSO-E PSR type codes to human-readable names */
const FUEL_CODE_NAMES: Record<string, string> = {
  B01: "Biomass",
  B02: "Fossil Brown Coal / Lignite",
  B03: "Fossil Coal-derived Gas",
  B04: "Fossil Gas",
  B05: "Fossil Hard Coal",
  B06: "Fossil Oil",
  B07: "Fossil Oil Shale",
  B08: "Fossil Peat",
  B09: "Geothermal",
  B10: "Hydro Pumped Storage",
  B11: "Hydro Run-of-river",
  B12: "Hydro Water Reservoir",
  B13: "Marine",
  B14: "Nuclear",
  B15: "Other Renewable",
  B16: "Solar",
  B17: "Waste",
  B18: "Wind Offshore",
  B19: "Wind Onshore",
  B20: "Other",
};

export class EntsoEClient {
  private readonly http: AxiosInstance;
  private readonly parser: XMLParser;
  private readonly zone: string;

  constructor(private readonly config: AppConfig) {
    this.zone = config.ENTSOE_BIDDING_ZONE;

    this.http = axios.create({
      baseURL: config.ENTSOE_BASE_URL,
      timeout: 30_000,
      headers: { Accept: "application/xml" },
    });

    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: true,
      trimValues: true,
      isArray: (name) =>
        ["TimeSeries", "Period", "Point"].includes(name),
    });
  }

  /**
   * Fetch Actual Generation Per Type (document type A75) for the configured
   * bidding zone. Returns the most recent fuel mix data.
   *
   * ENTSO-E uses the `in_Domain` parameter with EIC codes.
   */
  async fetchActualGeneration(): Promise<FuelMix> {
    const now = new Date();
    const periodEnd = new Date(now);
    // Round up to the next hour
    periodEnd.setMinutes(0, 0, 0);
    periodEnd.setHours(periodEnd.getHours() + 1);

    const periodStart = new Date(periodEnd);
    periodStart.setHours(periodStart.getHours() - 1);

    const params = {
      securityToken: this.config.ENTSOE_API_TOKEN,
      documentType: "A75", // Actual generation per type
      processType: "A16", // Realised
      in_Domain: this.zone,
      periodStart: this.formatDateTime(periodStart),
      periodEnd: this.formatDateTime(periodEnd),
    };

    console.info(
      `[ENTSO-E] Fetching generation data for zone=${this.zone} ` +
        `period=${params.periodStart}–${params.periodEnd}`
    );

    const response = await this.http.get("/api", { params });
    const xml = response.data;

    if (typeof xml !== "string" || xml.includes("Acknowledgement_MarketDocument")) {
      // ENTSO-E returns an Acknowledgement XML on errors
      const parsed = this.parser.parse(xml);
      const reason =
        parsed?.Acknowledgement_MarketDocument?.Reason?.text ??
        "Unknown ENTSO-E error";
      throw new Error(`ENTSO-E API error: ${reason}`);
    }

    return this.parseGenerationXml(xml, periodStart, periodEnd);
  }

  /**
   * Parse the ENTSO-E GL_MarketDocument XML into a structured FuelMix.
   */
  private parseGenerationXml(
    xml: string,
    periodStart: Date,
    periodEnd: Date
  ): FuelMix {
    const parsed = this.parser.parse(xml);
    const doc =
      parsed?.GL_MarketDocument ?? parsed?.["GL_MarketDocument"];

    if (!doc) {
      throw new Error("Unexpected XML structure — no GL_MarketDocument found");
    }

    const timeSeriesList: EntsoETimeSeries[] = Array.isArray(doc.TimeSeries)
      ? doc.TimeSeries
      : doc.TimeSeries
        ? [doc.TimeSeries]
        : [];

    const entries: GenerationDataPoint[] = [];

    for (const ts of timeSeriesList) {
      const psrType = ts.MktPSRType?.psrType as FuelCode | undefined;
      if (!psrType) continue;

      const periods: EntsoEPeriod[] = Array.isArray(ts.Period)
        ? ts.Period
        : ts.Period
          ? [ts.Period]
          : [];

      for (const period of periods) {
        const points: EntsoEPoint[] = Array.isArray(period.Point)
          ? period.Point
          : period.Point
            ? [period.Point]
            : [];

        // Take the latest point in the period
        const latestPoint = points[points.length - 1];
        if (!latestPoint) continue;

        const powerMW = Number(latestPoint.quantity);
        if (!Number.isFinite(powerMW) || powerMW < 0) continue;

        entries.push({
          fuelCode: psrType,
          fuelName: FUEL_CODE_NAMES[psrType] ?? psrType,
          powerMW,
          periodStart: period.timeInterval?.start ?? periodStart.toISOString(),
          periodEnd: period.timeInterval?.end ?? periodEnd.toISOString(),
        });
      }
    }

    const totalMW = entries.reduce((sum, e) => sum + e.powerMW, 0);

    console.info(
      `[ENTSO-E] Parsed ${entries.length} generation entries, total=${totalMW.toFixed(0)} MW`
    );

    return {
      zone: this.zone,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalMW,
      entries,
    };
  }

  /**
   * Format a Date to ENTSO-E's required format: YYYYMMDDHHmm
   */
  private formatDateTime(date: Date): string {
    return (
      date.getUTCFullYear().toString() +
      (date.getUTCMonth() + 1).toString().padStart(2, "0") +
      date.getUTCDate().toString().padStart(2, "0") +
      date.getUTCHours().toString().padStart(2, "0") +
      date.getUTCMinutes().toString().padStart(2, "0")
    );
  }
}
