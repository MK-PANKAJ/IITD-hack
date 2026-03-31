# CloudGreen OS (Full Local Build)

Working MVP implementation aligned to the `CloudGreenOS_FreeStack_MVP.docx` blueprint:

- Carbon signal API with free-source fallback (`CO2signal` key optional, `Open-Meteo` estimator fallback)
- GreenOps recommendation endpoint
- Phase 2 GreenOps AI endpoint with Ollama support (`OLLAMA_BASE_URL` + `OLLAMA_MODEL`) and fallback mode
- Phase 2 ZK proof round-trip demo endpoints (placeholder until circom/snarkjs integration)
- Phase 2 multi-cloud routing plan endpoint (carbon-aware scheduling output)
- Phase 3 CSRD report generation endpoint
- Phase 3 supplier onboarding + CSV emissions ingestion endpoints
- Phase 3 supply-chain exposure query endpoint (Neo4j-style graph semantics)
- Phase 3 executive overview + on-call incident endpoints
- Phase 4 token mint/transfer endpoints (local smart-contract equivalent)
- Phase 4 marketplace matching with trade settlement records
- Phase 4 GraphQL Yoga API server (`http://localhost:4000/graphql`)
- Phase 4 analytics event ingestion + summary endpoints
- OpenAPI spec + starter TypeScript/Python SDKs
- Scope 3 Verifiable Credential issue + verify flow (local anchor store)
- Marketplace order-book API (buy/sell orders)
- React dashboard for live carbon mode, historical chart, workload status, and VC flow

## Stack

- Frontend: React + Vite + TypeScript + Recharts + React Query
- Backend: Fastify + Zod + Axios
- License-friendly dependencies only (MIT/Apache/BSD style)

## Run

```bash
pnpm install
pnpm dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8787`
- GraphQL: `http://localhost:4000/graphql`

## Optional env

Set this to use live CO2signal values:

```bash
CO2SIGNAL_API_KEY=your_key_here
```

If not set, backend uses free weather-based estimation + deterministic fallback.

## Security / Auth

- Login route: `POST /api/auth/login`
- Returns a bearer token (HMAC-signed, local dev auth)
- Protected routes:
  - `POST /api/token/mint`
  - `POST /api/token/transfer`
  - `POST /api/suppliers/emissions/upload`
  - `POST /api/oncall/incidents`

Use header:

```http
Authorization: Bearer <token>
```

## Main endpoints

- `POST /api/auth/login`
- `GET /api/health`
- `GET /api/carbon/current?zone=IN`
- `GET /api/dashboard`
- `GET /api/greenops/analyze?code=...`
- `POST /api/zk/proof`
- `POST /api/zk/verify`
- `GET /api/routing/plan?workload=supplier-import`
- `POST /api/csrd/report`
- `POST /api/suppliers/onboard`
- `GET /api/suppliers`
- `POST /api/suppliers/emissions/upload`
- `GET /api/graph/exposure?supplier=...`
- `POST /api/oncall/incidents`
- `GET /api/oncall/incidents`
- `GET /api/executive/overview`
- `POST /api/token/mint`
- `POST /api/token/transfer`
- `GET /api/token/balances`
- `POST /api/analytics/events`
- `GET /api/analytics/summary`
- `POST /api/vc/issue`
- `POST /api/vc/verify`
- `POST /api/marketplace/orders`
- `GET /api/marketplace/book`

## Phase progress in this codebase

- Phase 1: core MVP routes + dashboard + VC + marketplace (implemented)
- Phase 2: GreenOps, ZK demo, routing planner, adaptive dashboard sections (implemented)
- Phase 3: CSRD + supplier + graph + executive/on-call APIs and UI sections (implemented as local runnable services)
- Phase 4: token simulation + upgraded marketplace matching + GraphQL + analytics + OpenAPI/SDK scaffold (implemented for local MVP)

## GraphQL

- Endpoint: `http://localhost:4000/graphql`
- Query examples: `carbonSignal`, `tokenBalances`, `executiveOverview`, `orderBook(side: "buy")`

## Developer assets

- OpenAPI spec: `openapi/cloudgreen-os.yaml`
- TypeScript SDK starter: `sdks/typescript/client.ts`
- Python SDK starter: `sdks/python/client.py`

## Verification

- Build check:
  - `pnpm build`
- End-to-end smoke test:
  - `pnpm smoke`
  - Verifies auth, token ops, supplier CSV upload, analytics, and GraphQL health query

## Gap note vs original enterprise blueprint

This repo is now a full local running implementation of all phase capabilities.  
Enterprise infrastructure pieces in the original document (full Kubernetes operators, Keycloak cluster, Neo4j deployment, Hardhat chain deployment, Argo workflows, PostHog Helm stack) are represented here with local runnable equivalents and API-compatible stubs, rather than full multi-service production cluster manifests.
