const API = "http://localhost:8787";
const GQL = "http://localhost:4000/graphql";

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}

async function jpost(url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const health = await jget(`${API}/api/health`);
  if (!health.ok) throw new Error("Health check failed");

  const login = await jpost(`${API}/api/auth/login`, { email: "admin@cloudgreen.local", role: "admin" });
  const token = login.token;

  await jpost(`${API}/api/token/mint`, { account: "org-treasury", amount: 500 }, token);
  await jpost(`${API}/api/token/transfer`, { from: "org-treasury", to: "supplier-rewards", amount: 50 }, token);
  await jpost(
    `${API}/api/suppliers/emissions/upload`,
    { csv: "supplier,scope,emissionsKg\nAcme Steel,scope3,100.4\nBlue Plastics,scope3,90.1" },
    token
  );

  await jpost(`${API}/api/analytics/events`, {
    event: "smoke_test",
    distinctId: "ci",
    properties: { source: "scripts/smoke-test.mjs" },
  });

  const gql = await jpost(GQL, {
    query: "{ carbonSignal { intensity mode } tokenBalances { entries { account balance } } }",
  });
  if (!gql.data?.carbonSignal?.mode) throw new Error("GraphQL failed");

  console.log("Smoke test passed.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
