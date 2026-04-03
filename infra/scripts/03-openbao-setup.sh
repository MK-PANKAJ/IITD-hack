#!/usr/bin/env bash
# =============================================================================
# 03-openbao-setup.sh — OpenBao Post-Initialization Configuration
# Run INSIDE the OpenBao pod after init + unseal.
#
# This script:
#   1. Enables the Kubernetes auth backend
#   2. Creates a policy for CloudGreen app secrets
#   3. Binds ServiceAccounts to the policy
#   4. Seeds initial secret paths
#
# Usage:
#   kubectl -n vault-system cp infra/scripts/03-openbao-setup.sh openbao-0:/tmp/
#   kubectl -n vault-system exec -ti openbao-0 -- sh /tmp/03-openbao-setup.sh
#
# Prerequisites:
#   - OpenBao must be initialized and unsealed
#   - BAO_TOKEN must be set (root token from init)
# =============================================================================
set -euo pipefail

echo "============================================"
echo " OpenBao — Post-Init Configuration"
echo "============================================"

# --------------------------------------------------
# Verify OpenBao is unsealed
# --------------------------------------------------
echo "[1/6] Checking OpenBao status..."
bao status || {
  echo "ERROR: OpenBao is sealed or unreachable. Unseal first."
  exit 1
}

# --------------------------------------------------
# Enable KV secrets engine (v2)
# --------------------------------------------------
echo "[2/6] Enabling KV v2 secrets engine..."
bao secrets enable -path=cloudgreen -version=2 kv 2>/dev/null || \
  echo "  (already enabled)"

# --------------------------------------------------
# Enable Kubernetes auth backend
# --------------------------------------------------
echo "[3/6] Enabling Kubernetes auth backend..."
bao auth enable kubernetes 2>/dev/null || \
  echo "  (already enabled)"

# Configure the Kubernetes auth backend
# Uses the pod's mounted ServiceAccount token
bao write auth/kubernetes/config \
  kubernetes_host="https://${KUBERNETES_SERVICE_HOST}:${KUBERNETES_SERVICE_PORT}" \
  token_reviewer_jwt="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" \
  kubernetes_ca_cert="$(cat /var/run/secrets/kubernetes.io/serviceaccount/ca.crt)"

echo "  ✓ Kubernetes auth configured"

# --------------------------------------------------
# Create policies
# --------------------------------------------------
echo "[4/6] Creating access policies..."

# Read-only policy for application pods
bao policy write cloudgreen-readonly - <<EOF
# CloudGreen OS — Read-only secrets access
path "cloudgreen/data/kafka/*" {
  capabilities = ["read", "list"]
}
path "cloudgreen/data/registry/*" {
  capabilities = ["read", "list"]
}
path "cloudgreen/data/app/*" {
  capabilities = ["read", "list"]
}
path "cloudgreen/metadata/*" {
  capabilities = ["read", "list"]
}
EOF

# Admin policy for CI/CD pipelines
bao policy write cloudgreen-admin - <<EOF
# CloudGreen OS — Admin secrets access (for CI/CD)
path "cloudgreen/data/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "cloudgreen/metadata/*" {
  capabilities = ["read", "list", "delete"]
}
path "cloudgreen/delete/*" {
  capabilities = ["update"]
}
path "cloudgreen/undelete/*" {
  capabilities = ["update"]
}
path "sys/policies/*" {
  capabilities = ["read", "list"]
}
EOF

echo "  ✓ Policies created: cloudgreen-readonly, cloudgreen-admin"

# --------------------------------------------------
# Create Kubernetes auth roles
# --------------------------------------------------
echo "[5/6] Creating Kubernetes auth roles..."

# Role for application pods in kafka-system namespace
bao write auth/kubernetes/role/cloudgreen-kafka-app \
  bound_service_account_names=cloudgreen-app \
  bound_service_account_namespaces=kafka-system \
  policies=cloudgreen-readonly \
  ttl=1h \
  max_ttl=4h

# Role for application pods in registry-system namespace
bao write auth/kubernetes/role/cloudgreen-registry-app \
  bound_service_account_names=cloudgreen-app \
  bound_service_account_namespaces=registry-system \
  policies=cloudgreen-readonly \
  ttl=1h \
  max_ttl=4h

# Role for CI/CD (default namespace)
bao write auth/kubernetes/role/cloudgreen-cicd \
  bound_service_account_names=cloudgreen-cicd \
  bound_service_account_namespaces=default \
  policies=cloudgreen-admin \
  ttl=30m \
  max_ttl=1h

echo "  ✓ Kubernetes roles created"

# --------------------------------------------------
# Seed initial secrets
# --------------------------------------------------
echo "[6/6] Seeding initial secret paths..."

bao kv put cloudgreen/kafka/credentials \
  bootstrap_servers="cloudgreen-kafka-kafka-bootstrap.kafka-system.svc.cluster.local:9092" \
  security_protocol="PLAINTEXT" \
  note="Update with TLS credentials for production"

bao kv put cloudgreen/registry/credentials \
  registry_url="http://apicurio-registry.registry-system.svc.cluster.local:8080" \
  registry_api_version="v3" \
  note="Update with auth tokens for production"

bao kv put cloudgreen/app/config \
  co2signal_api_key="PLACEHOLDER_REPLACE_ME" \
  ollama_base_url="http://ollama.default.svc.cluster.local:11434" \
  environment="staging" \
  note="Replace placeholder values with real credentials"

echo "  ✓ Initial secrets seeded"

echo ""
echo "============================================"
echo " ✓ OpenBao configuration complete!"
echo ""
echo " Test secrets access:"
echo "   bao kv get cloudgreen/kafka/credentials"
echo "   bao kv get cloudgreen/app/config"
echo "============================================"
