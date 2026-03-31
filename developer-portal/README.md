# CloudGreen Developer Portal

This directory acts as the Phase 4 developer portal scaffold.

## Included

- OpenAPI contract: `../openapi/cloudgreen-os.yaml`
- TypeScript SDK starter: `../sdks/typescript/client.ts`
- Python SDK starter: `../sdks/python/client.py`
- GraphQL endpoint: `http://localhost:4000/graphql`

## Quickstart

1. Run platform:
   - `pnpm dev`
2. View API contract:
   - Open `openapi/cloudgreen-os.yaml`
3. Use SDK starter:
   - Import and call methods from `sdks/typescript/client.ts`

## Auth

1. Get token from:
   - `POST /api/auth/login`
2. Use `Authorization: Bearer <token>` for protected routes:
   - `/api/token/*`
   - `/api/suppliers/emissions/upload`
   - `/api/oncall/incidents`
