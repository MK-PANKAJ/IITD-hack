# 🌱 CloudGreen OS — Full Local MVP

![License](https://img.shields.io/badge/license-MIT-green)
![Stack](https://img.shields.io/badge/stack-FOSS-blue)
![Build](https://img.shields.io/badge/build-local--mvp-success)
![Node](https://img.shields.io/badge/node-18+-brightgreen)

**CloudGreen OS** is a working **local MVP implementation** of a carbon-aware cloud optimization platform.
It follows the **CloudGreenOS_FreeStack_MVP architecture**, using a **100% Free & Open Source stack** with **$0 licensing cost**.

The platform demonstrates how enterprises can **track, verify, optimize, and trade carbon data** across digital infrastructure and supply chains.

This repository provides a **fully runnable local implementation** of all **four platform phases**, using local substitutes for enterprise infrastructure while maintaining **API compatibility** with production deployments.

---

# 🚀 Platform Capabilities

The system is built around **four progressive phases**.

## 1️⃣ Phase 1 — Foundation

Core carbon data infrastructure.

* Carbon Signal API integration
* `CO2signal` API support (optional)
* **Open-Meteo fallback estimator**
* Scope 3 **Verifiable Credential issuance**
* Credential verification workflow
* Local anchor verification store

---

## 2️⃣ Phase 2 — Intelligence

AI and optimization layer.

* **GreenOps recommendation engine**
* AI advisory endpoint powered by **Ollama**
* ZK proof demonstration endpoints
* Multi-cloud **carbon-aware routing planner**

---

## 3️⃣ Phase 3 — Enterprise

Enterprise compliance and supply chain intelligence.

* **CSRD report generator**
* Supplier onboarding workflow
* CSV emissions ingestion pipeline
* Supply chain exposure queries
* **Neo4j graph-based analytics**

---

## 4️⃣ Phase 4 — Ecosystem

Marketplace and sustainability economy.

* Token mint and transfer APIs
* Carbon credit trading simulation
* Marketplace matching engine
* Order-book trading system
* Settlement records
* **GraphQL Federation API**

---

# 🧱 Technology Stack

## Frontend

* **React 19**
* **Vite**
* **TypeScript**
* **Recharts**
* **TanStack React Query**
* **Zustand**

---

## Backend

* **Node.js**
* **Fastify**
* **Zod**
* **Axios**

---

## Infrastructure (Docker)

* **PostgreSQL 16**
* **Neo4j 5.x Community Edition**
* **Kafka (KRaft mode)**
* **Keycloak 25**

---

# ⚙️ Getting Started

## 1️⃣ Install Dependencies

Ensure you have:

* **Node.js 18+**
* **pnpm**

Then run:

```bash
pnpm install
```

---

## 2️⃣ Optional Environment Variables

To use live carbon intensity values from **CO2signal**:

```bash
CO2SIGNAL_API_KEY=your_api_key_here
```

If not provided, the backend automatically uses the **Open-Meteo estimation fallback**.

---

## 3️⃣ Start Development Servers

Run both **frontend and backend simultaneously**:

```bash
pnpm dev
```

---

## 🌐 Local Service URLs

| Service          | URL                                                            |
| ---------------- | -------------------------------------------------------------- |
| Frontend         | [http://localhost:5173](http://localhost:5173)                 |
| Backend REST API | [http://localhost:8787](http://localhost:8787)                 |
| GraphQL API      | [http://localhost:4000/graphql](http://localhost:4000/graphql) |

---

# 🐳 Running Infrastructure Locally

To launch all required infrastructure services:

```bash
docker compose up -d
```

This starts the following services:

| Service    | Port        |
| ---------- | ----------- |
| Kafka      | 9092        |
| PostgreSQL | 5432        |
| Neo4j      | 7474 / 7687 |
| Keycloak   | 8180        |

For Kubernetes deployment instructions (k3s / Ubuntu server), see:

```
infra/README.md
```

---

# 🔐 Authentication

The development environment uses a **local HMAC-based authentication system**.

### Login

```http
POST /api/auth/login
```

Returns a **Bearer token**.

### Use Token

Attach the token to protected routes:

```
Authorization: Bearer <token>
```

⚠️ In production environments this is replaced with **Keycloak SSO**.

---

# 🧪 Testing & Verification

Run the **end-to-end smoke test**:

```bash
pnpm smoke
```

This verifies:

* Authentication
* Token operations
* Supplier CSV ingestion
* Analytics endpoints
* GraphQL health queries

---

### Build Verification

```bash
pnpm build
```

---

# 📚 Developer Resources

### OpenAPI Specification

```
openapi/cloudgreen-os.yaml
```

---

### SDK Starters

**TypeScript**

```
sdks/typescript/client.ts
```

**Python**

```
sdks/python/client.py
```

---

# 📊 Architecture Vision

CloudGreen OS demonstrates a future where:

* **Carbon data becomes verifiable**
* **Cloud workloads become carbon-aware**
* **Supply chains become transparent**
* **Sustainability becomes programmable**

---

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

# 📜 License

This project uses a **100% FOSS stack** and is released under the **MIT License**.

---

✅ **CloudGreen OS — Building the Operating System for Sustainable Infrastructure.**

