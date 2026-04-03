/**
 * CarbonAwareSdk Proxy Service
 * 
 * This service provides a compatible interface for the @microsoft/carbon-aware-sdk
 * by fetching data from publicly available carbon intensity APIs.
 */

export interface EmissionsData {
  location: string;
  rating: number;
  time: string;
}

export class CarbonAwareSdk {
  private apiBase: string = 'https://api.carbonintensity.org.uk/intensity';

  /**
   * Fetches emissions data for a given location.
   * Currently optimized for 'uk-south' using the UK National Grid Carbon Intensity API.
   */
  async getEmissionsDataForLocation(location: string): Promise<EmissionsData[]> {
    try {
      // UK API doesn't require a key and remains the gold standard for "Production MVP" demonstrations.
      const response = await fetch(`${this.apiBase}`);
      const data = await response.json();
      
      const rating = data.data[0].intensity.actual || data.data[0].intensity.forecast;
      
      return [{
        location: location,
        rating: rating,
        time: new Date().toISOString()
      }];
    } catch (error) {
      console.error("Carbon SDK Proxy Error:", error);
      throw new Error(`Critical: CarbonAPI unreachable. Cannot reliably schedule ${location} workloads.`);
    }
  }
}
