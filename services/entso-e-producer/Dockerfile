# =============================================================================
# CloudGreen OS — ENTSO-E Carbon Intensity Producer
# Multi-stage build: compile TypeScript → slim production image
# =============================================================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine AS runtime

LABEL org.opencontainers.image.title="cloudgreen-entso-e-producer"
LABEL org.opencontainers.image.description="ENTSO-E → Kafka carbon intensity pipeline"
LABEL org.opencontainers.image.vendor="CloudGreen OS"

RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist

USER appuser

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "process.exit(0)"]

CMD ["node", "dist/index.js"]
