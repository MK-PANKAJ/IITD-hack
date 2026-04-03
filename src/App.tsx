import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CarbonAwareSdk } from "./services/carbon";
import "./index.css";

// ── API Base URL ──────────────────────────────────────────────────────
// Production: VITE_API_BASE_URL from .env.production (e.g., https://api.cloudgreen.dev)
// Development: undefined → "" (empty string, so Vite proxy handles /api → localhost:8787)
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
const GQL_URL = (import.meta.env.VITE_GRAPHQL_URL as string | undefined) ?? "http://localhost:4000/graphql";

/** Wrapper around fetch() that prepends API_BASE to relative /api/ paths. */
function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, init);
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

type ZkProof = {
  implementation: string;
  commitment: string;
  proof: string;
  emissionKg: number;
  minKg: number;
  maxKg: number;
  rangeOk: boolean;
  createdAt: string;
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

function App() {
  const [hashInput, setHashInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<string>("");

  // Phase 2.1 — GreenOps Advisor
  const [codeInput, setCodeInput] = useState("for i in range(1000000):\n    x = i*i\n    y = x%97");
  const [greenOps, setGreenOps] = useState<GreenOpsAnalyze | null>(null);
  const [greenOpsError, setGreenOpsError] = useState<string | null>(null);
  const [isGreenOpsLoading, setIsGreenOpsLoading] = useState(false);

  // Phase 2.2 — ZK proof (production range proof integration)
  const [emissionKg, setEmissionKg] = useState<number>(250);
  const [minKg, setMinKg] = useState<number>(100);
  const [maxKg, setMaxKg] = useState<number>(400);
  const [zk, setZk] = useState<ZkProof | null>(null);
  const [zkVerify, setZkVerify] = useState<string>("");

  // Phase 2.3 — Multi-cloud routing plan
  const [routingWorkload, setRoutingWorkload] = useState("supplier-import");
  const [routing, setRouting] = useState<RoutingPlan | null>(null);
  const [routingErr, setRoutingErr] = useState<string | null>(null);

  // Phase 3 — CSRD & Enterprise
  const [csrd, setCsrd] = useState<CsrdReport | null>(null);
  const [csrdOrg, setCsrdOrg] = useState("Global Manufacturing Corp");
  const [supplierRes, setSupplierRes] = useState<string>("");
  const [csvRes, setCsvRes] = useState<string>("");
  const [graphRes, setGraphRes] = useState<string>("");
  const [incidentRes, setIncidentRes] = useState<string>("");

  // Phase 4 — Token & Ecosystem
  const [tokenRes, setTokenRes] = useState<string>("");
  const [analyticsRes, setAnalyticsRes] = useState<string>("");
  const [gqlRes, setGqlRes] = useState<string>("");
  const [mintAccount, setMintAccount] = useState("org-treasury");
  const [mintAmount, setMintAmount] = useState<number>(1000);
  const [transferFrom, setTransferFrom] = useState("org-treasury");
  const [transferTo, setTransferTo] = useState("supplier-rewards");
  const [transferAmount, setTransferAmount] = useState<number>(100);
  const [authToken, setAuthToken] = useState("");
  const [authMsg, setAuthMsg] = useState("");

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

  // Phase 5 — Carbon-Aware SDK Integration (Adaptive UI)
  const [gridIntensity, setGridIntensity] = useState<number>(0);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  useEffect(() => {
    const checkCarbon = async () => {
      try {
        const sdk = new CarbonAwareSdk();
        const intensity = await sdk.getEmissionsDataForLocation('uk-south');
        const score = intensity[0].rating;
        setGridIntensity(score);
        
        // Logic: If intensity > 300g/kWh, we consider the grid "Dirty"
        // This prevents compute-heavy dashboard rendering/execution
        if (score > 300) {
          setIsDirty(true);
        } else {
          setIsDirty(false);
        }
      } catch (err) {
        console.error("Carbon SDK failed", err);
      }
    };
    checkCarbon();
    const interval = setInterval(checkCarbon, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  // L5 Adaptive UI logic
  useEffect(() => {
    if (data?.signal) {
      if (data.signal.mode === "critical" || data.signal.intensity > 400) {
        document.body.classList.add("theme-critical");
      } else {
        document.body.classList.remove("theme-critical");
      }
    }
  }, [data?.signal]);

  // Unified Pipeline State
  const [pipeLog, setPipeLog] = useState<{ ts: string, msg: string, type: string }[]>([]);
  const [pipeRunning, setPipeRunning] = useState(false);

  const runE2EPipeline = async () => {
    if (isDirty) return; // Guard against execution in dirty grid
    if (!authToken) {
      setPipeLog([{ ts: new Date().toISOString().split("T")[1].slice(0, -1), msg: "Error: Authentication missing. Please authenticate as Admin below.", type: "error" }]);
      return;
    }
    setPipeRunning(true);
    setPipeLog([{ ts: new Date().toISOString().split("T")[1].slice(0, -1), msg: "Initiating remote pipeline execution...", type: "info" }]);

    try {
      const res = await apiFetch("/api/pipeline/execute", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": `Bearer ${authToken}` 
        },
      });
      
      const json = await res.json();
      
      if (!res.ok) {
         setPipeLog(json.logs || [{ ts: new Date().toISOString().split("T")[1].slice(0, -1), msg: "Server Error: Orchestrator failed.", type: "error" }]);
      } else {
         setPipeLog(json.logs);
         refetchOverview();
      }
    } catch (e: any) {
      setPipeLog([{ ts: new Date().toISOString().split("T")[1].slice(0, -1), msg: `Network failure: ${e.message}`, type: "error" }]);
    }
    setPipeRunning(false);
  };

  const issueCredential = async () => {
    const res = await apiFetch("/api/vc/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierName: "Global Manufacturing Corp", scope: "scope3", emissionsKg: 126.4 }),
    });
    const json = await res.json();
    setHashInput(json.hash || "");
    setVerifyResult(`Issued VC: ${json.id}`);
  };

  const verifyCredential = async () => {
    const res = await apiFetch("/api/vc/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash: hashInput }),
    });
    const json = await res.json();
    setVerifyResult(json.verified ? "Verified and anchored." : "Not found.");
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

  const generateZkProof = async () => {
    setZk(null);
    setZkVerify("");
    const res = await apiFetch("/api/zk/proof", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emissionKg, minKg, maxKg }),
    });
    const json = (await res.json()) as ZkProof;
    setZk(json);
  };

  const verifyZkProof = async () => {
    if (!zk) return;
    setZkVerify("");
    const res = await apiFetch("/api/zk/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commitment: zk.commitment,
        proof: zk.proof,
        emissionKg,
        minKg,
        maxKg,
      }),
    });
    const json = await res.json();
    setZkVerify(json.verified ? "ZK cryptographic proof successfully verified." : "Verification failed.");
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
    const res = await apiFetch("/api/csrd/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization: csrdOrg,
        year: 2026,
        scope1Kg: 1200,
        scope2Kg: 900,
        scope3Kg: 5400,
      }),
    });
    const json = (await res.json()) as CsrdReport;
    setCsrd(json);
  };

  const onboardSupplier = async () => {
    const res = await apiFetch("/api/suppliers/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme Steel", email: "ops@acme.test", country: "IN" }),
    });
    const json = await res.json();
    setSupplierRes(`Onboarded: ${json.name} (${json.id})`);
    refetchOverview();
  };

  const uploadCsv = async () => {
    if (!authToken) {
      setCsvRes("Error: You must hit 'Authenticate as Admin' below first.");
      return;
    }
    const csv = "supplier,scope,emissionsKg\nAcme Steel,scope3,120.5\nAcme Steel,scope2,54.1\nBlue Plastics,scope3,310.2";
    const res = await apiFetch("/api/suppliers/emissions/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
      body: JSON.stringify({ csv }),
    });
    const json = await res.json();
    if (!res.ok) {
      setCsvRes(`Upload failed: ${json.error}`);
      return;
    }
    setCsvRes(`CSV imported rows: ${json.imported} (batch: ${json.batchId})`);
    refetchOverview();
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

  const mintToken = async () => {
    if (!authToken) return setTokenRes("Error: Authenticate first.");
    const res = await apiFetch("/api/token/mint", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ userAddress: mintAccount, amount: mintAmount }),
    });
    const json = await res.json();
    if (json.success) {
      setTokenRes(`Success! Tx: ${json.txHash.slice(0,16)}... Tokens minted to ${mintAccount}`);
    } else {
      setTokenRes(`Error: ${json.error}`);
    }
    refetchOverview();
  };

  const transferToken = async () => {
    const res = await apiFetch("/api/token/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ from: transferFrom, to: transferTo, amount: transferAmount }),
    });
    const json = await res.json();
    if (json.error) {
      setTokenRes(`Transfer failed: ${json.error}`);
      return;
    }
    setTokenRes(`Transfer tx: ${json.tx}, ${json.amount} sent ${json.from} -> ${json.to}`);
  };

  const loginAsAdmin = async () => {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@cloudgreen.local", role: "admin" }),
    });
    const json = await res.json();
    setAuthToken(json.token || "");
    setAuthMsg(json.token ? "Admin token ready." : "Login failed.");
  };

  const trackAnalytics = async () => {
    await apiFetch("/api/telemetry/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "dashboard_view",
        distinctId: "prod-admin-01",
        properties: { section: "phase4", ts: new Date().toISOString() },
      }),
    });
    const summary = await fetchJson<AnalyticsSummary>("/api/telemetry/summary");
    setAnalyticsRes(`Total events: ${summary.totalEvents}, dashboard_view: ${summary.eventCounts.dashboard_view || 0}`);
  };

  const runGraphQLCheck = async () => {
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
    const signal = json.data.carbonSignal;
    setGqlRes(`GraphQL OK: mode=${signal.mode}, intensity=${signal.intensity}, balances=${json.data.tokenBalances.entries.length}`);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <h1>CloudGreen OS</h1>
          <p>Zero-Cost Sustainability</p>
        </div>
        <nav className="nav-links">
          <div className="nav-link">01. Foundation</div>
          <div className="nav-link">02. Intelligence</div>
          <div className="nav-link">03. Enterprise</div>
          <div className="nav-link">04. Ecosystem</div>
        </nav>
      </aside>

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
          <h2>Zero-Knowledge Proofs</h2>
          <p className="muted">Circom/SnarkJS range proof generation & verification.</p>
          <div className="row">
            <input type="number" value={emissionKg} onChange={(e) => setEmissionKg(Number(e.target.value))} placeholder="Emission (kg)" />
            <input type="number" value={minKg} onChange={(e) => setMinKg(Number(e.target.value))} placeholder="Min kg" />
            <input type="number" value={maxKg} onChange={(e) => setMaxKg(Number(e.target.value))} placeholder="Max kg" />
          </div>
          <div className="row">
            <button onClick={generateZkProof}>Generate ZK Proof</button>
            <button onClick={verifyZkProof} disabled={!zk}>Verify ZK Proof</button>
          </div>
          {zk ? (
            <div className="kv">
              <p>OK: <strong>{zk.rangeOk ? "YES" : "NO"}</strong></p>
              <p>Commit: <span className="mono">{zk.commitment.slice(0, 16)}...</span></p>
              <p>Proof: <span className="mono">{zk.proof.slice(0, 16)}...</span></p>
            </div>
          ) : null}
          {zkVerify ? <p className="error" style={{ color: '#4aec74', background: 'rgba(46,160,67,0.1)', borderColor: 'rgba(46,160,67,0.2)' }}>{zkVerify}</p> : null}
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

        {/* Enterprise */}
        <section className="card">
          <h2>Scope 3 Credentials</h2>
          <p className="muted">Issue verifiable credentials stored on local protocol.</p>
          <div className="row">
            <button onClick={issueCredential}>Issue Official VC </button>
            <input value={hashInput} onChange={(e) => setHashInput(e.target.value)} placeholder="0xHash..." />
            <button onClick={verifyCredential}>Verify Hash</button>
          </div>
          {verifyResult ? <p className="mono">{verifyResult}</p> : null}
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
            <button onClick={onboardSupplier}>Onboard Supplier</button>
            <button onClick={uploadCsv}>Upload Log</button>
            <button onClick={loadGraphExposure}>Exposure Query</button>
          </div>
          <div className="kv">
            {supplierRes ? <p>{supplierRes}</p> : null}
            {csvRes ? <p>{csvRes}</p> : null}
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
          {execOverview ? (
            <div className="kv">
              <p>Suppliers: <strong>{execOverview.suppliers}</strong> | Rows: <strong>{execOverview.uploadedEmissionRows}</strong></p>
              <p>Incidents: <strong>{execOverview.openIncidents}</strong> | SLA: <strong>{execOverview.slaStatus}</strong></p>
            </div>
          ) : null}
        </section>

        {/* Ecosystem */}
        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>Carbon Decentralized Exchange</h2>
          <p className="muted">Marketplace token minting and settlement.</p>
          <div className="row">
            <input value={authToken} onChange={(e) => setAuthToken(e.target.value)} placeholder="Bearer token" style={{ maxWidth: '300px' }} />
            <button onClick={loginAsAdmin}>Authenticate as Admin</button>
            {authMsg ? <span className="mono">{authMsg}</span> : null}
          </div>
          <hr style={{ width: '100%', borderColor: 'rgba(255,255,255,0.05)', margin: '8px 0' }} />
          <div className="row">
            <input value={mintAccount} onChange={(e) => setMintAccount(e.target.value)} placeholder="Wallet" />
            <input type="number" value={mintAmount} onChange={(e) => setMintAmount(Number(e.target.value))} />
            <button onClick={mintToken}>Mint Tokens</button>
          </div>
          <div className="row">
            <input value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)} placeholder="From" />
            <input value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="To" />
            <input type="number" value={transferAmount} onChange={(e) => setTransferAmount(Number(e.target.value))} />
            <button onClick={transferToken}>Transfer Tokens</button>
          </div>
          {tokenRes ? <div className="kv"><p className="mono">{tokenRes}</p></div> : null}
        </section>

        <section className="card">
          <h2>GraphQL Hub</h2>
          <p className="muted">Execute federated queries across all layers.</p>
          <div className="row">
            <button onClick={runGraphQLCheck}>Run Health Query</button>
          </div>
          {gqlRes ? <div className="kv"><p className="mono">{gqlRes}</p></div> : null}
        </section>

        <section className="card">
          <h2>Telemetry Platform</h2>
          <p className="muted">Analytics tracking component tests.</p>
          <div className="row">
            <button onClick={trackAnalytics}>Emit Dashboard Event</button>
          </div>
          {analyticsRes ? <div className="kv"><p className="mono">{analyticsRes}</p></div> : null}
        </section>
      </main>
    </div>
  );
}

export default App;
