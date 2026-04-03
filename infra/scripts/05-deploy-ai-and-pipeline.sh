#!/usr/bin/env bash
# =============================================================================
# 05-deploy-ai-and-pipeline.sh — Deploy Ollama + ENTSO-E Pipeline
# Deploys the AI inference layer (Ollama with Llama 3.1) and the ENTSO-E
# carbon intensity Kafka producer to the k3s cluster.
#
# Prerequisites:
#   - k3s cluster running (scripts 01-02)
#   - Kafka cluster ready (cloudgreen-kafka in kafka-system)
#   - One node labeled: kubectl label node <node> cloudgreen.io/role=ai-inference
#   - One node tainted: kubectl taint node <node> cloudgreen.io/role=ai-inference:NoSchedule
#
# Usage: ./infra/scripts/05-deploy-ai-and-pipeline.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  CloudGreen OS — AI & Pipeline Deployment                          ║"
echo "║  $(date -u '+%Y-%m-%d %H:%M:%S UTC')                                          ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

# --------------------------------------------------
# Pre-flight Checks
# --------------------------------------------------
echo "--- Pre-flight Checks ---"

# Check kubectl connectivity
if ! kubectl cluster-info > /dev/null 2>&1; then
  echo "[✗] Cannot connect to Kubernetes cluster. Is kubectl configured?"
  exit 1
fi
echo "[✓] kubectl connected"

# Check that Kafka is ready
KAFKA_READY=$(kubectl -n kafka-system get kafka cloudgreen-kafka -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "Unknown")
if [ "${KAFKA_READY}" != "True" ]; then
  echo "[⚠] Kafka cluster is not Ready (status: ${KAFKA_READY})"
  echo "    Ensure Kafka is running before deploying the ENTSO-E producer."
  echo "    The deployment will proceed but the producer may fail to connect."
fi
echo "[✓] Kafka cluster status: ${KAFKA_READY}"

# Check for AI node label
AI_NODES=$(kubectl get nodes -l cloudgreen.io/role=ai-inference --no-headers 2>/dev/null | wc -l)
if [ "${AI_NODES}" -lt 1 ]; then
  echo ""
  echo "[!] No nodes labeled with cloudgreen.io/role=ai-inference"
  echo "    You MUST label a node before Ollama can schedule:"
  echo ""
  echo "    kubectl label node <your-ai-node> cloudgreen.io/role=ai-inference"
  echo "    kubectl taint node <your-ai-node> cloudgreen.io/role=ai-inference:NoSchedule"
  echo ""
  read -p "    Continue anyway? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
else
  echo "[✓] AI inference node(s) found: ${AI_NODES}"
fi

echo ""

# --------------------------------------------------
# Step 1: Deploy AI System (Ollama)
# --------------------------------------------------
echo "--- Step 1: Deploy AI System ---"

echo "[1/5] Creating ai-system namespace..."
kubectl apply -f "${INFRA_DIR}/ollama/namespace.yaml"

echo "[2/5] Applying resource quota..."
kubectl apply -f "${INFRA_DIR}/ollama/resource-quota.yaml"

echo "[3/5] Applying network policies..."
kubectl apply -f "${INFRA_DIR}/ollama/network-policy.yaml"

echo "[4/5] Creating model storage PVC..."
kubectl apply -f "${INFRA_DIR}/ollama/pvc.yaml"

echo "[5/5] Deploying Ollama server..."
kubectl apply -f "${INFRA_DIR}/ollama/deployment.yaml"
kubectl apply -f "${INFRA_DIR}/ollama/service.yaml"

echo ""
echo "[⏳] Waiting for Ollama to be ready (this may take 2-5 minutes)..."
kubectl -n ai-system rollout status deployment/ollama --timeout=300s || {
  echo "[⚠] Ollama deployment did not become ready within 5 minutes."
  echo "    Check: kubectl -n ai-system describe pod -l app=ollama"
  echo "    Continuing with model loader anyway..."
}

echo ""
echo "[📥] Launching Llama 3.1 model loader job..."
# Delete previous job if exists (jobs are immutable)
kubectl -n ai-system delete job ollama-model-loader 2>/dev/null || true
kubectl apply -f "${INFRA_DIR}/ollama/model-loader-job.yaml"

echo "[ℹ] Model download runs in the background (10-30 min on slow networks)."
echo "    Monitor: kubectl -n ai-system logs -f job/ollama-model-loader"
echo ""

# --------------------------------------------------
# Step 2: Deploy ENTSO-E Producer
# --------------------------------------------------
echo "--- Step 2: Deploy ENTSO-E Carbon Intensity Producer ---"

# Check if the secret has been populated
ENTSOE_TOKEN=$(kubectl -n kafka-system get secret entso-e-credentials -o jsonpath='{.data.ENTSOE_API_TOKEN}' 2>/dev/null | base64 -d 2>/dev/null || echo "")
if [ -z "${ENTSOE_TOKEN}" ] || [ "${ENTSOE_TOKEN}" = "REPLACE_WITH_YOUR_ENTSOE_API_TOKEN" ]; then
  echo "[⚠] ENTSO-E API token not configured."
  echo "    Create the secret first:"
  echo ""
  echo "    kubectl create secret generic entso-e-credentials \\"
  echo "      --namespace=kafka-system \\"
  echo "      --from-literal=ENTSOE_API_TOKEN=<your-token> \\"
  echo "      --dry-run=client -o yaml | kubectl apply -f -"
  echo ""
  echo "    Register at: https://transparency.entsoe.eu/"
  echo ""
  echo "[ℹ] Applying secret template (you must update the token)..."
  kubectl apply -f "${INFRA_DIR}/entso-e/entso-e-secret.yaml"
else
  echo "[✓] ENTSO-E API token found in secret"
fi

echo "[1/1] Deploying ENTSO-E producer..."
kubectl apply -f "${INFRA_DIR}/entso-e/entso-e-producer.yaml"

echo ""
echo "[⏳] Waiting for ENTSO-E producer to be ready..."
kubectl -n kafka-system rollout status deployment/entso-e-producer --timeout=120s || {
  echo "[⚠] ENTSO-E producer did not start within 2 minutes."
  echo "    Check: kubectl -n kafka-system logs -l app=entso-e-producer"
}

echo ""

# --------------------------------------------------
# Summary
# --------------------------------------------------
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  Deployment Complete                                               ║"
echo "╠══════════════════════════════════════════════════════════════════════╣"
echo "║                                                                    ║"
echo "║  Ollama:                                                           ║"
echo "║    Internal endpoint: ollama.ai-system.svc.cluster.local:11434     ║"
echo "║    Model: llama3.1:8b (loading in background)                      ║"
echo "║                                                                    ║"
echo "║  ENTSO-E Producer:                                                 ║"
echo "║    Namespace: kafka-system                                         ║"
echo "║    Topic: carbon-events                                            ║"
echo "║    Schedule: Every 15 minutes                                      ║"
echo "║                                                                    ║"
echo "║  Next Steps:                                                       ║"
echo "║    1. Monitor model download:                                      ║"
echo "║       kubectl -n ai-system logs -f job/ollama-model-loader         ║"
echo "║    2. Verify with smoke test:                                      ║"
echo "║       ./infra/scripts/04-smoke-test.sh                             ║"
echo "║    3. Update server OLLAMA_BASE_URL to:                            ║"
echo "║       http://ollama.ai-system.svc.cluster.local:11434              ║"
echo "║                                                                    ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
