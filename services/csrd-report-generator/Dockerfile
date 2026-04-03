# =============================================================================
# CloudGreen OS — CSRD Report Generator
# Multi-stage build for WeasyPrint PDF generation service.
#
# Build:   docker build -t cloudgreen/csrd-report-generator .
# Run:     docker run -v $(pwd)/reports:/app/reports \
#            --env-file .env cloudgreen/csrd-report-generator \
#            --org "CloudGreen Industries" --year 2026
# =============================================================================

# ── Stage 1: Build dependencies ─────────────────────────────────────────────
FROM python:3.12-slim AS base

# WeasyPrint system dependencies (Cairo, Pango, GDK-Pixbuf, fonts)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-inter \
    fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Stage 2: Application ────────────────────────────────────────────────────
COPY . .

# Default output directory (mount as volume for persistence)
RUN mkdir -p /app/reports

# Health label for Kubernetes probes
LABEL maintainer="CloudGreen OS <infra@cloudgreen.dev>"
LABEL org.opencontainers.image.title="CSRD Report Generator"
LABEL org.opencontainers.image.description="WeasyPrint-based CSRD compliance PDF generator"

ENTRYPOINT ["python", "generate_report.py"]
CMD ["--org", "CloudGreen Industries", "--year", "2026", "--output", "/app/reports"]
