#!/usr/bin/env bash
# =============================================================================
# 04-smoke-test.sh — Full-Stack Infrastructure Verification
# Run from your workstation with kubectl configured.
#
# Usage: ./infra/scripts/04-smoke-test.sh
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0
WARN=0

check() {
  local name="$1"
  local cmd="$2"
  
  if eval "$cmd" > /dev/null 2>&1; then
    echo "[✓] $name"
    ((PASS++))
  else
    echo "[✗] $name"
    ((FAIL++))
  fi
}

warn_check() {
  local name="$1"
  local cmd="$2"
  
  if eval "$cmd" > /dev/null 2>&1; then
    echo "[✓] $name"
    ((PASS++))
  else
    echo "[⚠] $name (non-critical)"
    ((WARN++))
  fi
}

echo "============================================"
echo " CloudGreen OS — Infrastructure Smoke Test"
echo " $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================"
echo ""

# --------------------------------------------------
# Cluster Health
# --------------------------------------------------
echo "--- Cluster ---"
check "kubectl connectivity" \
  "kubectl cluster-info"

NODE_COUNT=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
check "k3s nodes found (${NODE_COUNT})" \
  "[ ${NODE_COUNT} -ge 1 ]"

READY_NODES=$(kubectl get nodes --no-headers 2>/dev/null | grep -c " Ready " || true)
check "All nodes Ready (${READY_NODES}/${NODE_COUNT})" \
  "[ ${READY_NODES} -eq ${NODE_COUNT} ]"

echo ""

# --------------------------------------------------
# Namespaces
# --------------------------------------------------
echo "--- Namespaces ---"
check "kafka-system namespace exists" \
  "kubectl get namespace kafka-system"

check "registry-system namespace exists" \
  "kubectl get namespace registry-system"

check "vault-system namespace exists" \
  "kubectl get namespace vault-system"

echo ""

# --------------------------------------------------
# Strimzi Operator
# --------------------------------------------------
echo "--- Strimzi Kafka Operator ---"
STRIMZI_PODS=$(kubectl -n kafka-system get pods -l strimzi.io/kind=cluster-operator --no-headers 2>/dev/null | grep -c "Running" || true)
check "Strimzi operator running (${STRIMZI_PODS} pod)" \
  "[ ${STRIMZI_PODS} -ge 1 ]"

echo ""

# --------------------------------------------------
# Kafka Cluster
# --------------------------------------------------
echo "--- Kafka Cluster (KRaft) ---"
check "Kafka CR exists" \
  "kubectl -n kafka-system get kafka cloudgreen-kafka"

KAFKA_READY=$(kubectl -n kafka-system get kafka cloudgreen-kafka -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "Unknown")
check "Kafka cluster Ready (status: ${KAFKA_READY})" \
  "[ '${KAFKA_READY}' = 'True' ]"

KAFKA_PODS=$(kubectl -n kafka-system get pods -l strimzi.io/cluster=cloudgreen-kafka --no-headers 2>/dev/null | grep -c "Running" || true)
check "Kafka broker pods running (${KAFKA_PODS})" \
  "[ ${KAFKA_PODS} -ge 1 ]"

# Topic verification
TOPIC_COUNT=$(kubectl -n kafka-system get kafkatopics --no-headers 2>/dev/null | wc -l)
check "Kafka topics created (${TOPIC_COUNT})" \
  "[ ${TOPIC_COUNT} -ge 3 ]"

# Check specific topics
for TOPIC in carbon-events workload-metrics greenops-recommendations supply-chain-events audit-log; do
  warn_check "Topic '${TOPIC}' exists" \
    "kubectl -n kafka-system get kafkatopic ${TOPIC}"
done

echo ""

# --------------------------------------------------
# ENTSO-E Carbon Intensity Producer
# --------------------------------------------------
echo "--- ENTSO-E Producer ---"
ENTSOE_PODS=$(kubectl -n kafka-system get pods -l app=entso-e-producer --no-headers 2>/dev/null | grep -c "Running" || true)
check "ENTSO-E producer running (${ENTSOE_PODS} pod)" \
  "[ ${ENTSOE_PODS} -ge 1 ]"

warn_check "ENTSO-E secret exists" \
  "kubectl -n kafka-system get secret entso-e-credentials"

echo ""

# --------------------------------------------------
# Ollama (AI System)
# --------------------------------------------------
echo "--- Ollama (AI Inference) ---"
check "ai-system namespace exists" \
  "kubectl get namespace ai-system"

OLLAMA_READY=$(kubectl -n ai-system get deployment ollama -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
check "Ollama deployment running (${OLLAMA_READY} ready)" \
  "[ '${OLLAMA_READY}' = '1' ]"

# Port-forward and test Ollama API
warn_check "Ollama API health check" \
  "kubectl -n ai-system port-forward svc/ollama 18434:11434 &
   PF_PID=\$!
   sleep 3
   curl -sf http://localhost:18434/api/tags
   kill \$PF_PID 2>/dev/null"

# Check if Llama 3.1 model is loaded
warn_check "Llama 3.1 model available" \
  "kubectl -n ai-system port-forward svc/ollama 18434:11434 &
   PF_PID=\$!
   sleep 3
   curl -sf http://localhost:18434/api/tags | grep -q 'llama3.1'
   RESULT=\$?
   kill \$PF_PID 2>/dev/null
   exit \$RESULT"

echo ""

# --------------------------------------------------
# Apicurio Registry
# --------------------------------------------------
echo "--- Apicurio Registry ---"
APICURIO_READY=$(kubectl -n registry-system get deployment apicurio-registry -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
check "Apicurio Registry running (${APICURIO_READY} ready)" \
  "[ '${APICURIO_READY}' = '1' ]"

# Port-forward and test API (timeout 5s)
warn_check "Apicurio API health check" \
  "kubectl -n registry-system port-forward svc/apicurio-registry 18080:8080 &
   PF_PID=\$!
   sleep 2
   curl -sf http://localhost:18080/health/ready
   kill \$PF_PID 2>/dev/null"

echo ""

# --------------------------------------------------
# OpenBao
# --------------------------------------------------
echo "--- OpenBao (Vault) ---"
OPENBAO_PODS=$(kubectl -n vault-system get pods -l app.kubernetes.io/name=openbao --no-headers 2>/dev/null | grep -c "Running" || true)
check "OpenBao pod running (${OPENBAO_PODS})" \
  "[ ${OPENBAO_PODS} -ge 1 ]"

BAO_SEALED=$(kubectl -n vault-system exec openbao-0 -- bao status -format=json 2>/dev/null | jq -r '.sealed' || echo "unknown")
check "OpenBao unsealed (sealed=${BAO_SEALED})" \
  "[ '${BAO_SEALED}' = 'false' ]"

warn_check "OpenBao KV engine accessible" \
  "kubectl -n vault-system exec openbao-0 -- bao kv list cloudgreen/"

echo ""

# --------------------------------------------------
# Resource Utilization
# --------------------------------------------------
echo "--- Resource Utilization ---"
warn_check "Node resource usage" \
  "kubectl top nodes 2>/dev/null && echo ''"

echo ""

# --------------------------------------------------
# Summary
# --------------------------------------------------
TOTAL=$((PASS + FAIL + WARN))
echo "============================================"
echo " Results: ${PASS} passed, ${FAIL} failed, ${WARN} warnings"
echo " Total checks: ${TOTAL}"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo " ⚠ Some checks failed. Review the output above."
  echo " Common fixes:"
  echo "   - Wait for pods: kubectl -n <ns> get pods -w"
  echo "   - Check events: kubectl -n <ns> get events --sort-by='.lastTimestamp'"
  echo "   - Check logs:   kubectl -n <ns> logs <pod>"
  exit 1
fi

echo ""
echo " ✓ All critical checks passed!"
exit 0
