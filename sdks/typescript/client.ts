/**
 * CloudGreen OS — TypeScript SDK Client
 *
 * Auto-resolves the API base URL:
 *   • Production build (vite build): uses VITE_API_BASE_URL from .env.production
 *   • Local dev (vite dev):          falls back to "" (empty string) so the
 *                                    Vite proxy (/api → localhost:8787) works
 *   • Node.js / test:               pass baseUrl explicitly in constructor
 */

// Resolve at module level so tree-shaking can inline it
const RESOLVED_BASE_URL: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL as string) || "";

export class CloudGreenClient {
  private readonly baseUrl: string;
  private authToken: string | null = null;

  /**
   * @param baseUrl  Override the auto-resolved base URL.
   *                 Defaults to VITE_API_BASE_URL or "" (Vite proxy).
   */
  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? RESOLVED_BASE_URL).replace(/\/+$/, "");
  }

  /** Attach a Bearer token for authenticated endpoints. */
  setAuthToken(token: string | null): this {
    this.authToken = token;
    return this;
  }

  // ── Public API Methods ──────────────────────────────────────────────

  async health() {
    return this.get<{ ok: boolean; service: string }>("/api/health");
  }

  async carbonCurrent(zone = "IN") {
    return this.get<{ zone: string; intensity: number; mode: string; source: string }>(
      `/api/carbon/current?zone=${encodeURIComponent(zone)}`,
    );
  }

  async mint(account: string, amount: number) {
    return this.post<{ account: string; balance: number; tx: string }>(
      "/api/token/mint",
      { account, amount },
    );
  }

  async transfer(from: string, to: string, amount: number) {
    return this.post<{ from: string; to: string; amount: number; tx: string }>(
      "/api/token/transfer",
      { from, to, amount },
    );
  }

  async executiveOverview() {
    return this.get<{
      suppliers: number;
      uploadedEmissionRows: number;
      totalEmissionKg: number;
      openIncidents: number;
      slaStatus: string;
    }>("/api/executive/overview");
  }

  // ── Internal HTTP Helpers ───────────────────────────────────────────

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.authToken) h["Authorization"] = `Bearer ${this.authToken}`;
    return h;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }
}
