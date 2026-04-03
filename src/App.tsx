import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CarbonAwareSdk } from "./services/carbon";
import "./index.css";

// ── API Base URL ──────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
const GQL_URL = (import.meta.env.VITE_GRAPHQL_URL as string | undefined) ?? "http://localhost:4000/graphql";

/** Wrapper around fetch() that prepends API_BASE to relative /api/ paths. */
const apiFetch = (url: string, init?: RequestInit) => {
  return fetch(`${API_BASE}${url}`, init);
};

const TRANSFER_FROM = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/** SHA-256 Digest for Verifiable Data Integrity */
async function sha256(message: string) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

type Dashboard = {
  signal: { intensity: number; mode: string; source: string; ts: string };
  historical: { hour: string; intensity: number }[];
  workloads: { name: string; status: string }[];
};

type GreenOpsAnalyze = {
  mode: string;
  energyKw: number;
  suggestion: string;
  snippetPreview: string;
  llm: string;
};

type RoutingPlan = {
  workloadName: string;
  mode: string;
  carbonIntensity: number;
  target: { provider: string; region: string; schedule: string; replicas: number };
  reason: string;
  tofuEquivalent: string;
  ts: string;
};

type CsrdReport = {
  reportId: string;
  format: string;
  summary: {
    organization: string;
    year: number;
    totalKg: number;
    riskClass: string;
    generatedAt: string;
  };
  htmlPreview: string;
};

type ExecutiveOverview = {
  suppliers: number;
  uploadedEmissionRows: number;
  totalEmissionKg: number;
  openIncidents: number;
  slaStatus: string;
  updatedAt: string;
};

type AnalyticsSummary = {
  totalEvents: number;
  eventCounts: Record<string, number>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`);
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export default function App() {
  const [authToken, setAuthToken] = useState<string>("");
  const [authMsg, setAuthMsg] = useState<string>("");

  const [codeInput, setCodeInput] = useState("for i in range(100):... # Simulate workload");
  const [greenOps, setGreenOps] = useState<GreenOpsAnalyze | null>(null);
  const [greenOpsError, setGreenOpsError] = useState<string | null>(null);
  const [isGreenOpsLoading, setIsGreenOpsLoading] = useState(false);

  const [routingWorkload, setRoutingWorkload] = useState("api-cluster-prod");
  const [routing, setRouting] = useState<RoutingPlan | null>(null);
  const [routingErr, setRoutingErr] = useState<string | null>(null);

  const [transferTo, setTransferTo] = useState("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"); // Hardhat #1
  const [transferAmount, setTransferAmount] = useState(0);
  const [tokenRes, setTokenRes] = useState("");

  const [csrdOrg, setCsrdOrg] = useState("Global Manufacturing Corp");
  const [csrd, setCsrd] = useState<CsrdReport | null>(null);

  const [supplierRes, setSupplierRes] = useState("");
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  const [newSupName, setNewSupName] = useState("");
  const [newSupEmail, setNewSupEmail] = useState("");
  const [newSupCountry, setNewSupCountry] = useState("");

  const [graphRes, setGraphRes] = useState("");
  const [incidentRes, setIncidentRes] = useState("");
  const [analyticsRes, setAnalyticsRes] = useState("");
  const [gqlRes, setGqlRes] = useState("");
  const [gqlRaw, setGqlRaw] = useState<any>(null);

  const [isUploading, setIsUploading] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchJson<Dashboard>("/api/dashboard"),
    refetchInterval: 30000,
  });

  const { data: execOverview, refetch: refetchOverview } = useQuery({
    queryKey: ["executive-overview"],
    queryFn: () => fetchJson<ExecutiveOverview>("/api/executive/overview"),
    refetchInterval: 30000,
  });

  const { data: tokenBalances, refetch: refetchBalances } = useQuery({
    queryKey: ["token-balances"],
    queryFn: () => fetchJson<{ balances: Record<string, number> }>("/api/token/balances"),
    refetchInterval: 10000,
  });

  const currentFromBalance = tokenBalances?.balances[TRANSFER_FROM] || 0;

  const [gridIntensity, setGridIntensity] = useState<number>(0);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  useEffect(() => {
    const checkCarbon = async () => {
      try {
        const sdk = new CarbonAwareSdk();
        const intensity = await sdk.getEmissionsDataForLocation('uk-south');
        const score = intensity[0].rating;
        setGridIntensity(score);
        if (score > 300) setIsDirty(true);
        else setIsDirty(false);
      } catch (err) {
        console.error("Carbon SDK failed", err);
      }
    };
    checkCarbon();
    const interval = setInterval(checkCarbon, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (data?.signal) {
      if (data.signal.mode === "critical" || data.signal.intensity > 400) {
        document.body.classList.add("theme-critical");
      } else {
        document.body.classList.remove("theme-critical");
      }
    }
  }, [data?.signal]);

  const [pipeLog, setPipeLog] = useState<{ ts: string, msg: string, type: string }[]>([]);
  const [pipeRunning, setPipeRunning] = useState(false);

  const runE2EPipeline = async () => {
    if (isDirty) return;
    if (!authToken) {
      setPipeLog([{ ts: new Date().toISOString().split("T")[1].slice(0, -1), msg: "Error: Authentication missing. Please authenticate as Admin below.", type: "error" }]);
      return;
    }
    setPipeRunning(true);
    setPipeLog([{ ts: new Date().toISOString().split("T")[1].slice(0, -1), msg: "Initiating remote pipeline execution...", type: "info" }]);
    try {
      const res = await apiFetch("/api/pipeline/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
         setPipeLog(json.logs || [{ ts: new Date().toISOString().split("T")[1].slice(0, -1), msg: "Server Error: Orchestrator failed.", type: "error" }]);
      } else {
         setPipeLog(json.logs);
         refetchOverview();
         refetchBalances();
      }

    } catch (e: any) {
      setPipeLog([{ ts: new Date().toISOString().split("T")[1].slice(0, -1), msg: `Network failure: ${e.message}`, type: "error" }]);
    }
    setPipeRunning(false);
  };

  const analyzeGreenOps = async () => {
    setGreenOpsError(null);
    setGreenOps(null);
    setIsGreenOpsLoading(true);
    try {
      const u = `/api/greenops/analyze?code=${encodeURIComponent(codeInput)}`;
      const json = await fetchJson<GreenOpsAnalyze>(u);
      setGreenOps(json);
    } catch (e: any) {
      setGreenOpsError(e?.message || "GreenOps request failed");
    } finally {
      setIsGreenOpsLoading(false);
    }
  };

  const planRouting = async () => {
    setRoutingErr(null);
    setRouting(null);
    try {
      const json = await fetchJson<RoutingPlan>(`/api/routing/plan?workload=${encodeURIComponent(routingWorkload)}`);
      setRouting(json);
    } catch (e: any) {
      setRoutingErr(e?.message || "Routing request failed");
    }
  };

  const generateCsrd = async () => {
    try {
      const res = await apiFetch("/api/csrd/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization: csrdOrg, year: 2026 }),
      });
      const json = (await res.json()) as CsrdReport;
      setCsrd(json);
      await trackAnalytics("csrd_generated", { org: csrdOrg });
    } catch (e: any) {
      console.error("CSRD failed", e);
    }
  };

  const onboardSupplier = async () => {
    if (newSupName.length < 2 || newSupCountry.length < 2 || !newSupEmail.includes("@")) {
      setSupplierRes("Error: Invalid inputs. Name/Country min 2 chars, valid email required.");
      return;
    }
    setSupplierRes("Processing...");
    try {
      const res = await apiFetch("/api/suppliers/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSupName, email: newSupEmail, country: newSupCountry }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSupplierRes(`Error: ${json.error || "Onboarding failed"}`);
        return;
      }
      setSupplierRes(`Onboarded: ${json.name} (${json.id})`);
      setIsAddingSupplier(false);
      setNewSupName(""); setNewSupEmail(""); setNewSupCountry("");
      refetchOverview();
      await trackAnalytics("supplier_onboarded", { name: json.name });
    } catch (err: any) {
      setSupplierRes(`Network Error: ${err.message}`);
    }
  };

  const loadGraphExposure = async () => {
    const json = await fetchJson<{ nodes: { name: string; totalKg: number; risk: string }[]; totalSuppliers: number }>(
      "/api/graph/exposure"
    );
    if (json.nodes.length === 0) {
      setGraphRes("No supplier graph data yet.");
      return;
    }
    const top = json.nodes[0];
    setGraphRes(`Top exposure: ${top.name} (${top.totalKg} kgCO2e, risk=${top.risk}), suppliers=${json.totalSuppliers}`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setGraphRes("Reading CSV and calculating integrity hash...");

    try {
      const fileText = await file.text();
      const rawLines = fileText.trim().split(/\r?\n/);
      const lastLine = rawLines[rawLines.length - 1];

      let signature = "";
      let csvText = fileText;

      if (lastLine.startsWith("# SIGNATURE:")) {
        signature = lastLine.replace("# SIGNATURE:", "").trim();
        csvText = rawLines.slice(0, -1).join("\n").trim();
      } else {
        setGraphRes("Error: CSRD CSV file is missing the integrated '# SIGNATURE: <hex>' validation line at the bottom.");
        setIsUploading(false);
        return;
      }

      const vcHash = await sha256(csvText);
      
      // Calculate Total Emissions for ZK-Proof Input
      const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      lines.shift(); // skip header
      const totalEmissions = lines.reduce((sum, line) => {
        const parts = line.split(",");
        const val = Number(parts[2]);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);

      setGraphRes(`Generating ZK-Proof for ${Math.round(totalEmissions)} kgCO2e...`);
      
      // Step 1: Generate ZK-Proof (In production, this happens on supplier side)
      const proofRes = await apiFetch("/api/zk/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emissionKg: totalEmissions }),
      });
      const proofData = await proofRes.json();
      if (!proofRes.ok) throw new Error(proofData.error || "Proof generation failed");

      setGraphRes("Submitting Verifiable Ingestion Request with Intrinsic CSV Signature...");

      // Step 2: Submit to Verifiable Pipeline
      const ingestRes = await apiFetch("/api/suppliers/emissions/upload", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": authToken ? `Bearer ${authToken}` : ""
        },
        body: JSON.stringify({ 
          csv: csvText, 
          vcHash, 
          signature,
          proof: {
            proof: proofData.proof,
            publicSignals: proofData.publicSignals,
            totalEmissionKg: proofData.totalEmissionKg
          }
        }),
      });

      const json = await ingestRes.json();
      if (!ingestRes.ok) {
        setGraphRes(`Verification Failed: ${json.error || "Cryptographic rejection"}`);
      } else {
        setGraphRes(`Verified! Batch ${json.batchId.slice(0, 8)}... integrated with ${json.credentials.length} VCs.`);
        await loadGraphExposure();
        await trackAnalytics("verifiable_csv_uploaded", { batchId: json.batchId });
      }
    } catch (err: any) {
      setGraphRes(`System Error: ${err.message}`);
    } finally {
      setIsUploading(false);
      // Reset input so user can re-upload same file
      e.target.value = "";
    }
  };

  const createIncident = async () => {
    if (!authToken) {
      setIncidentRes("Error: Authentication required to trigger alerts.");
      return;
    }
    const res = await apiFetch("/api/oncall/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
      body: JSON.stringify({ title: "Supplier upload latency spike", severity: "high", owner: "oncall-greenops" }),
    });
    const json = await res.json();
    if (!res.ok) {
      setIncidentRes(`Failed: ${json.error}`);
      return;
    }
    setIncidentRes(`Incident created: ${json.id} (${json.severity})`);
    refetchOverview();
  };

  const transferToken = async () => {
    if (transferAmount <= 0) {
      setTokenRes("Error: Amount must be positive.");
      return;
    }
    const EVM_REGEX = /^0x[a-fA-F0-9]{40}$/;
    if (!EVM_REGEX.test(transferTo)) {
      setTokenRes("Error: Invalid Recipient Address. Must be 42-char 0x hex string.");
      return;
    }

    setTokenRes("Initiating on-chain transfer...");
    try {
      const res = await apiFetch("/api/tokens/transfer", {
        method: "POST",
        body: JSON.stringify({
          from: TRANSFER_FROM,
          to: transferTo,
          amount: transferAmount,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setTokenRes(`Error: ${json.error || "Transfer failed"}`);
        return;
      }
      setTokenRes(`Success: Tx ${json.tx.slice(0, 16)}... Confirmed.`);
      refetchBalances();
    } catch (e: any) {
      setTokenRes(`Network error: ${e.message}`);
    }
  };

  const loginAsAdmin = async () => {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin@cloudgreen.test", password: "admin123", role: "admin" }),
    });
    const json = await res.json();
    setAuthToken(json.token || "");
    setAuthMsg(json.token ? "Admin token ready." : "Login failed.");
  };

  const trackAnalytics = async (evtName: string = "dashboard_view", props: any = {}) => {
    try {
      await apiFetch("/api/telemetry/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: evtName,
          distinctId: "prod-admin-01",
          properties: { ...props, section: "production", ts: new Date().toISOString() },
        }),
      });
      const summary = await fetchJson<AnalyticsSummary>("/api/telemetry/summary");
      setAnalyticsRes(`Total events: ${summary.totalEvents}, latest: ${evtName}`);
    } catch (e) {
      console.warn("Telemetry offline");
    }
  };

  const runGraphQLCheck = async () => {
    setGqlRes("Executing query...");
    try {
      const res = await fetch(GQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "{ carbonSignal { intensity mode source } tokenBalances { entries { account balance } } executiveOverview { suppliers openIncidents slaStatus } }",
        }),
      });
      const json = await res.json();
      if (json.errors) {
        setGqlRes(`GraphQL error: ${json.errors[0]?.message || "unknown"}`);
        return;
      }
      setGqlRaw(json.data);
      setGqlRes(`Success: Received ${json.data.tokenBalances.entries.length} wallet records.`);
      await trackAnalytics("graphql_query", { operation: "HealthCheck" });
    } catch (e: any) {
      setGqlRes(`GraphQL disconnected: ${e.message}`);
    }
  };

  return (
    <div className="app-shell">
      <header className="dashboard-header">
        <div className="header-brand">
          <div className="brand-dot"></div>
          <div>
            <h1>CloudGreen OS</h1>
            <p className="muted">Zero-Cost Sustainability Terminal</p>
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* Foundation & Telemetry */}
        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2><span className="pulse"></span> Live Carbon Status</h2>
          {isLoading || !data ? (
            <p className="muted">Synchronizing telemetry...</p>
          ) : (
            <>
              <div className="kv" style={{ display: 'flex', gap: '24px' }}>
                <p>Intensity: <strong>{data.signal.intensity} gCO2/kWh</strong></p>
                <p>Status: <strong style={{ color: data.signal.mode === 'critical' ? 'var(--error)' : '#4aec74' }}>{data.signal.mode.toUpperCase()}</strong></p>
                <p>Oracle: <strong>{data.signal.source}</strong></p>
              </div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={data.historical}>
                    <defs>
                      <linearGradient id="colorIntensity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2ea043" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2ea043" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="hour" stroke="#8b949e" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#8b949e" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(18,25,33,0.9)', border: '1px solid rgba(46,160,67,0.3)', borderRadius: '8px' }}
                      itemStyle={{ color: '#f0f6fc' }}
                    />
                    <Area type="monotone" dataKey="intensity" stroke="#4aec74" strokeWidth={3} fillOpacity={1} fill="url(#colorIntensity)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="row" style={{ marginTop: '16px' }}>
                <button onClick={() => refetch()}>Refresh Signal</button>
              </div>
            </>
          )}
        </section>

        {/* E2E WORKLOAD PIPELINE */}
        <section className={`card ${isDirty ? "border-red-900" : ""}`} style={{ gridColumn: '1 / -1', background: isDirty ? 'rgba(248, 81, 73, 0.05)' : 'rgba(46, 160, 67, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2>End-to-End Interconnected Workflow Log</h2>
              <p className="muted">L1 Trust &rarr; L3 Orchestrator &rarr; L4 Intelligence &rarr; L5 Token Reward</p>
            </div>
            {gridIntensity > 0 && (
              <div className={`grid-badge ${isDirty ? "dirty" : "clean"}`}>
                {isDirty ? "⚠️" : "✔️"}
                {gridIntensity} g/kWh
              </div>
            )}
          </div>
          
          <div className="row">
            <button 
               onClick={runE2EPipeline} 
               disabled={pipeRunning || isDirty}
               style={isDirty ? { borderColor: 'var(--error)', color: 'var(--error)', background: 'transparent' } : {}}
            >
              {pipeRunning ? "Executing Lifecycle..." : isDirty ? "Grid too Dirty to Execute" : "Execute Automated Workflow"}
            </button>
          </div>

          {isDirty && (
            <div className="error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🚨 Local grid intensity is high ({gridIntensity}g/kWh). Compute-heavy workloads are paused to prevent carbon spikes.</span>
            </div>
          )}

          {pipeLog.length > 0 && (
            <div className="textarea" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px' }}>
                  <div className="status-row">
                    <span>Source:</span>
                    <span className="mono">{TRANSFER_FROM.slice(0, 10)}...</span>
                  </div>
              {pipeLog.map((log, i) => (
                <div key={i}>
                  <span className="muted">[{log.ts}]</span>{' '}
                  <span style={{ color: log.type === 'error' ? 'var(--error)' : log.type === 'success' ? '#4aec74' : '#fff' }}>
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Intelligence */}
        <section className="card">
          <h2>GreenOps Advisor (AI)</h2>
          <p className="muted">Energy-aware code analysis using self-hosted LLM.</p>
          <textarea
            className="textarea"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            rows={5}
          />
          <div className="row">
            <button onClick={analyzeGreenOps} disabled={isGreenOpsLoading}>
              {isGreenOpsLoading ? "Analyzing..." : "Analyze Energy"}
            </button>
            <button onClick={() => setCodeInput("for i in range(1000000):\n    x = i*i\n    y = x%97")}>Load Example Workload</button>
          </div>
          {isGreenOpsLoading ? (
            <p className="muted" style={{ fontStyle: "italic", animation: "pulse 1.5s infinite" }}>
              ⏳ Llama 3.1 is analyzing code and generating optimizations. This may take up to 60 seconds...
            </p>
          ) : null}
          {greenOpsError ? <p className="error">{greenOpsError}</p> : null}
          {greenOps ? (
            <div className="kv">
              <p>Mode: <strong>{greenOps.mode.toUpperCase()}</strong> | Energy: <strong>{greenOps.energyKw} kW</strong></p>
              <p>Model: {greenOps.llm}</p>
              <p className="mono">{greenOps.suggestion}</p>
            </div>
          ) : null}
        </section>

        <section className="card">
          <h2>Multi-Cloud Planner</h2>
          <p className="muted">Time-shifted routing using OpenTofu logic.</p>
          <div className="row">
            <input value={routingWorkload} onChange={(e) => setRoutingWorkload(e.target.value)} />
            <button onClick={planRouting}>Get Optimal Route</button>
          </div>
          {routingErr ? <p className="error">{routingErr}</p> : null}
          {routing ? (
            <div className="kv">
              <p>Intensity: <strong>{routing.carbonIntensity} gCO2/kWh</strong></p>
              <p>Target: <strong>{routing.target.provider} / {routing.target.region}</strong></p>
              <p>Schedule: <strong>{routing.target.schedule}</strong></p>
              <p className="mono">{routing.reason}</p>
            </div>
          ) : null}
        </section>

        <section className="card">
          <h2>CSRD Compliance</h2>
          <p className="muted">Generate XBRL-validated corporate emission reports.</p>
          <div className="row">
            <input value={csrdOrg} onChange={(e) => setCsrdOrg(e.target.value)} placeholder="Organization Name" />
            <button onClick={generateCsrd}>Generate Report</button>
          </div>
          {csrd ? (
            <div className="kv">
              <p>ID: <strong>{csrd.reportId}</strong></p>
              <p>Risk: <strong>{csrd.summary.riskClass}</strong> | Emitted: <strong>{csrd.summary.totalKg} kgCO2e</strong></p>

              <div style={{ marginTop: "12px", padding: "12px", background: "#f0f6fc", borderRadius: "6px", color: "#1b1f23", border: "1px solid #d0d7de" }}>
                <p className="muted" style={{ fontSize: "11px", marginBottom: "8px", color: "#6e7781" }}>Parsed Report Preview (CSRD-Compliant):</p>
                <div
                  className="report-preview"
                  style={{ fontSize: "14px", lineHeight: "1.5" }}
                  dangerouslySetInnerHTML={{ __html: csrd.htmlPreview }}
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="card">
          <h2>Supply Chain Graph</h2>
          <p className="muted">Neo4j-powered supplier analysis.</p>
          <div className="row">
            {!isAddingSupplier ? (
              <button onClick={() => setIsAddingSupplier(true)}>Onboard Supplier</button>
            ) : (
              <button onClick={() => setIsAddingSupplier(false)} className="outline">Cancel</button>
            )}
            <input
              type="file"
              id="csv-upload"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => document.getElementById('csv-upload')?.click()}
              disabled={isUploading}
            >
              {isUploading ? "Processing..." : "Upload Intensity CSV"}
            </button>
            <button onClick={loadGraphExposure}>Exposure Query</button>
          </div>
          {isAddingSupplier && (
            <div className="form-group" style={{ marginTop: '16px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px' }}>
              <div className="column" style={{ gap: '8px' }}>
                <input value={newSupName} onChange={e => setNewSupName(e.target.value)} placeholder="Supplier Name (e.g. Foxconn)" />
                <input value={newSupEmail} onChange={e => setNewSupEmail(e.target.value)} placeholder="Contact Email" />
                <input value={newSupCountry} onChange={e => setNewSupCountry(e.target.value)} placeholder="Country Code (e.g. TW)" />
                <button onClick={onboardSupplier} style={{ width: '100%', marginTop: '8px' }}>Submit Onboarding</button>
              </div>
            </div>
          )}
          <div className="kv">
            {supplierRes ? <p className="mono" style={{ fontSize: '13px', color: supplierRes.startsWith('Error') ? 'var(--error)' : '#4aec74' }}>{supplierRes}</p> : null}
            {graphRes ? <p>{graphRes}</p> : null}
          </div>
        </section>

        <section className="card">
          <h2>Executive KPIs</h2>
          <p className="muted">High-level telemetry and PagerDuty alerts.</p>
          <div className="row">
            <button onClick={createIncident}>Trigger Alert</button>
            <button onClick={() => refetchOverview()}>Sync KPIs</button>
          </div>
          {incidentRes ? <p className="mono" style={{ color: '#f85149' }}>{incidentRes}</p> : null}
          {execOverview && (
            <div className="kv">
              <p>Suppliers: <strong>{execOverview.suppliers}</strong> | Rows: <strong>{execOverview.uploadedEmissionRows}</strong></p>
              <p>Incidents: <strong>{execOverview.openIncidents}</strong> | SLA: <strong>{execOverview.slaStatus}</strong></p>
            </div>
          )}
        </section>

        {/* Ecosystem */}
        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>GreenCredit Token Ledger</h2>
          <p className="muted">GCRD tokens are minted automatically when CSV data passes ZK verification. Use this panel to transfer tokens between wallets.</p>
          <div className="row">
            <input value={authToken} onChange={(e) => setAuthToken(e.target.value)} placeholder="Bearer token" style={{ maxWidth: '300px' }} />
            <button onClick={loginAsAdmin}>Authenticate as Admin</button>
            {authMsg ? <span className="mono">{authMsg}</span> : null}
          </div>
          <hr style={{ width: '100%', borderColor: 'rgba(255,255,255,0.05)', margin: '8px 0' }} />
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="column">
              <label className="muted" style={{ fontSize: '0.75rem', marginBottom: '4px', display: 'block' }}>
                From Wallet (Signer-Locked | Balance: <strong>{currentFromBalance} GCRD</strong>)
              </label>
              <input value={TRANSFER_FROM} readOnly style={{ opacity: 0.6, cursor: 'not-allowed', background: 'rgba(255,255,255,0.05)' }} />
            </div>
            <div className="column">
              <label className="muted" style={{ fontSize: '0.75rem', marginBottom: '4px', display: 'block' }}>Recipient (Strict EVM Address)</label>
              <input value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="0x..." />
            </div>
            <div className="column">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="muted" style={{ fontSize: '0.75rem', display: 'block' }}>Amount</label>
                <button 
                  onClick={() => setTransferAmount(currentFromBalance)} 
                  style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(255,255,255,0.1)' }}
                >
                  Max
                </button>
              </div>
              <input type="number" value={transferAmount} onChange={(e) => setTransferAmount(Number(e.target.value))} />
            </div>
            <button onClick={transferToken} style={{ height: '38px', alignSelf: 'flex-end' }}>Transfer Tokens</button>
          </div>
          {tokenRes ? <div className="kv"><p className="mono">{tokenRes}</p></div> : null}
        </section>

        <section className="card">
          <h2>GraphQL Hub</h2>
          <p className="muted">Execute federated queries across all layers.</p>
          <div className="row">
            <button onClick={runGraphQLCheck}>Run Health Query</button>
          </div>
          {gqlRes ? <div className="kv"><p className="mono" style={{ color: '#4aec74' }}>{gqlRes}</p></div> : null}
          {gqlRaw && (
            <pre className="textarea" style={{ fontSize: '11px', marginTop: '8px', maxHeight: '150px', overflow: 'auto' }}>
              {JSON.stringify(gqlRaw, null, 2)}
            </pre>
          )}
        </section>

        <section className="card">
          <h2>Telemetry Platform</h2>
          <p className="muted">Analytics tracking component tests.</p>
          <div className="row">
            <button onClick={() => trackAnalytics("dashboard_event_pulse", { manual: true })}>Emit Dashboard Event</button>
          </div>
          {analyticsRes ? <div className="kv"><p className="mono">{analyticsRes}</p></div> : null}
        </section>
      </main>
    </div>
  );
}
