export class CloudGreenClient {
  constructor(private baseUrl = "http://localhost:8787") {}

  async health() {
    return this.get("/api/health");
  }

  async carbonCurrent(zone = "IN") {
    return this.get(`/api/carbon/current?zone=${encodeURIComponent(zone)}`);
  }

  async mint(account: string, amount: number) {
    return this.post("/api/token/mint", { account, amount });
  }

  async transfer(from: string, to: string, amount: number) {
    return this.post("/api/token/transfer", { from, to, amount });
  }

  async executiveOverview() {
    return this.get("/api/executive/overview");
  }

  private async get(path: string) {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json();
  }

  private async post(path: string, body: unknown) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return res.json();
  }
}
