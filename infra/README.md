# CloudGreen OS — Infrastructure Deployment Guide

> **Target:** k3s cluster on Ubuntu 22.04/24.04 LTS VMs (8 GB RAM per node)  
> **Stack:** Strimzi Kafka (KRaft), Apicurio Registry, OpenBao (secrets management)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Phase 1 — Provision & Harden Ubuntu VMs](#3-phase-1--provision--harden-ubuntu-vms)
4. [Phase 2 — Install k3s Cluster](#4-phase-2--install-k3s-cluster)
5. [Phase 3 — Install Helm & Base Services](#5-phase-3--install-helm--base-services)
6. [Phase 4 — Deploy Strimzi Kafka Operator (KRaft)](#6-phase-4--deploy-strimzi-kafka-operator-kraft)
7. [Phase 5 — Deploy Apicurio Schema Registry](#7-phase-5--deploy-apicurio-schema-registry)
8. [Phase 6 — Deploy OpenBao (Secrets Vault)](#8-phase-6--deploy-openbao-secrets-vault)
9. [Phase 7 — Verification & Smoke Tests](#9-phase-7--verification--smoke-tests)
10. [Memory Budget](#10-memory-budget)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      k3s Cluster (Ubuntu VMs)               │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  k3s Server  │  │  k3s Agent   │  │  k3s Agent   │      │
│  │  (control)   │  │  (worker-1)  │  │  (worker-2)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  Namespaces:                                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ kafka-system                                         │    │
│  │  ├─ Strimzi Operator                                 │    │
│  │  ├─ Kafka Broker (KRaft combined, 1 replica)         │    │
│  │  └─ Kafka Topics (carbon-events, workload-metrics)   │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ registry-system                                      │    │
│  │  └─ Apicurio Registry (in-memory / SQL-lite)         │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ vault-system                                         │    │
│  │  └─ OpenBao (standalone + file backend)              │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Design Decisions for 8 GB RAM:**
- Single-node KRaft (combined broker+controller) — eliminates ZooKeeper entirely
- JVM heap capped at 512 MB for Kafka, leaving ~512 MB for OS page cache
- Apicurio Registry uses in-memory storage (fits dev/staging; swap to PostgreSQL for prod)
- OpenBao runs in standalone mode with file storage (no Consul dependency)
- All operator pods have explicit resource requests/limits

---

## 2. Prerequisites

| Requirement        | Minimum Version | Notes                          |
|--------------------|-----------------|--------------------------------|
| Ubuntu Server      | 22.04 LTS       | 24.04 LTS also supported       |
| RAM per VM         | 8 GB            | 4 GB absolute minimum (risky)  |
| vCPU per VM        | 2               | 4 recommended for workers      |
| Disk per VM        | 40 GB SSD       | Kafka logs need fast I/O       |
| Helm               | 3.14+           | Installed post-k3s             |
| kubectl            | 1.28+           | Bundled with k3s               |
| Network            | Static IPs      | Or stable DHCP leases          |

### VM Layout (Minimum Viable)

| Hostname       | Role           | IP (example)   | RAM  |
|----------------|----------------|----------------|------|
| `cg-server-1`  | k3s server     | 10.0.1.10      | 8 GB |
| `cg-worker-1`  | k3s agent      | 10.0.1.11      | 8 GB |
| `cg-worker-2`  | k3s agent      | 10.0.1.12      | 8 GB |

> **Single-node option:** All manifests work on a single 8 GB node for dev/staging.

---

## 3. Phase 1 — Provision & Harden Ubuntu VMs

Run the automated setup script on **every** VM:

```bash
cd infra/scripts/
chmod +x 01-prepare-node.sh
sudo ./01-prepare-node.sh
```

The script performs:
- System update & essential packages
- Swap disable (required by Kubernetes)
- Kernel module loading (`br_netfilter`, `overlay`)
- Sysctl tuning for container networking
- UFW firewall rules for k3s ports
- Fail2ban installation
- Unattended security updates

See [`scripts/01-prepare-node.sh`](scripts/01-prepare-node.sh) for the full script.

---

## 4. Phase 2 — Install k3s Cluster

### 4a. Install Server Node (control plane)

```bash
# On cg-server-1
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --cluster-init \
  --secrets-encryption \
  --protect-kernel-defaults \
  --tls-san 10.0.1.10 \
  --tls-san cg-server-1 \
  --write-kubeconfig-mode 644 \
  --kube-apiserver-arg audit-log-path=/var/log/k3s-audit.log \
  --kube-apiserver-arg audit-log-maxage=30 \
  --kube-apiserver-arg audit-log-maxbackup=10 \
  --kube-apiserver-arg audit-log-maxsize=100" sh -
```

Retrieve the node token:
```bash
sudo cat /var/lib/rancher/k3s/server/node-token
```

### 4b. Join Worker Nodes

```bash
# On cg-worker-1 and cg-worker-2
export K3S_URL="https://10.0.1.10:6443"
export K3S_TOKEN="<paste-token-from-server>"

curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="agent \
  --protect-kernel-defaults" sh -
```

### 4c. Verify Cluster

```bash
# On server node
sudo k3s kubectl get nodes -o wide
# Expected: 3 nodes in Ready state
```

### 4d. Copy kubeconfig to your workstation

```bash
# On your local machine
scp user@10.0.1.10:/etc/rancher/k3s/k3s.yaml ~/.kube/cloudgreen-config
# Edit the file: replace 127.0.0.1 with 10.0.1.10
export KUBECONFIG=~/.kube/cloudgreen-config
kubectl get nodes
```

---

## 5. Phase 3 — Install Helm & Base Services

### 5a. Install Helm

```bash
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

### 5b. Create Namespaces

```bash
kubectl apply -f infra/namespaces.yaml
```

See [`namespaces.yaml`](namespaces.yaml).

### 5c. Apply Resource Quotas (memory guardrails)

```bash
kubectl apply -f infra/resource-quotas.yaml
```

See [`resource-quotas.yaml`](resource-quotas.yaml).

---

## 6. Phase 4 — Deploy Strimzi Kafka Operator (KRaft)

### 6a. Install Strimzi Operator via Helm

```bash
helm repo add strimzi https://strimzi.io/charts/
helm repo update

helm install strimzi-operator strimzi/strimzi-kafka-operator \
  --namespace kafka-system \
  --values infra/helm-values/strimzi-operator-values.yaml \
  --wait --timeout 5m
```

### 6b. Deploy Kafka Cluster (KRaft mode)

```bash
kubectl apply -f infra/kafka/kafka-kraft-cluster.yaml
```

### 6c. Create Application Topics

```bash
kubectl apply -f infra/kafka/kafka-topics.yaml
```

### 6d. Verify Kafka

```bash
# Wait for the Kafka pod to be ready (may take 2–3 minutes)
kubectl -n kafka-system wait kafka/cloudgreen-kafka \
  --for=condition=Ready --timeout=300s

# Check pods
kubectl -n kafka-system get pods

# Produce a test message
kubectl -n kafka-system run kafka-test-producer -ti --rm \
  --image=quay.io/strimzi/kafka:latest-kafka-3.8.0 \
  --restart=Never -- \
  bin/kafka-console-producer.sh \
    --bootstrap-server cloudgreen-kafka-kafka-bootstrap:9092 \
    --topic carbon-events
```

---

## 7. Phase 5 — Deploy Apicurio Schema Registry

Apicurio Registry provides schema governance for Kafka messages (Avro, Protobuf, JSON Schema).

### 7a. Deploy via Kubernetes manifests

```bash
kubectl apply -f infra/apicurio/
```

### 7b. Verify

```bash
kubectl -n registry-system wait deployment/apicurio-registry \
  --for=condition=Available --timeout=120s

# Test the API
kubectl -n registry-system port-forward svc/apicurio-registry 8080:8080 &
curl http://localhost:8080/apis/registry/v3/system/info
```

---

## 8. Phase 6 — Deploy OpenBao (Secrets Vault)

### 8a. Install via Helm

```bash
helm repo add openbao https://openbao.github.io/openbao-helm
helm repo update

helm install openbao openbao/openbao \
  --namespace vault-system \
  --values infra/helm-values/openbao-values.yaml \
  --wait --timeout 5m
```

### 8b. Initialize & Unseal

```bash
# Initialize (first time only — save these keys securely!)
kubectl -n vault-system exec -ti openbao-0 -- bao operator init \
  -key-shares=3 \
  -key-threshold=2

# Unseal (repeat with 2 of 3 keys)
kubectl -n vault-system exec -ti openbao-0 -- bao operator unseal <KEY_1>
kubectl -n vault-system exec -ti openbao-0 -- bao operator unseal <KEY_2>

# Verify
kubectl -n vault-system exec -ti openbao-0 -- bao status
```

### 8c. Configure Kubernetes Auth (for pod-native secret injection)

```bash
kubectl apply -f infra/openbao/k8s-auth-policy.yaml

# Run the setup script from within the pod
kubectl -n vault-system cp infra/scripts/03-openbao-setup.sh openbao-0:/tmp/
kubectl -n vault-system exec -ti openbao-0 -- sh /tmp/03-openbao-setup.sh
```

---

## 9. Phase 7 — Verification & Smoke Tests

Run the full-stack verification:

```bash
chmod +x infra/scripts/04-smoke-test.sh
./infra/scripts/04-smoke-test.sh
```

Expected output:
```
[✓] k3s cluster healthy (3 nodes)
[✓] Strimzi operator running
[✓] Kafka broker ready (KRaft)
[✓] Kafka topics created (carbon-events, workload-metrics)
[✓] Apicurio Registry API responding
[✓] OpenBao unsealed and healthy
```

---

## 10. Memory Budget

Breakdown for a single 8 GB worker node:

| Component             | Request | Limit  | Notes                              |
|-----------------------|---------|--------|------------------------------------|
| k3s system overhead   | ~500 MB | —      | kubelet + containerd + Traefik     |
| OS + page cache       | ~700 MB | —      | Critical for Kafka I/O             |
| Strimzi Operator      | 256 MB  | 384 MB | CRD controller only                |
| Kafka Broker (KRaft)  | 1 GB    | 1.5 GB | 512 MB heap + page cache headroom  |
| Apicurio Registry     | 256 MB  | 512 MB | In-memory store, JVM-based         |
| OpenBao               | 128 MB  | 256 MB | Go binary, very lightweight        |
| **Total reserved**    | **~2.8 GB** | **~3.9 GB** | Leaves ~4 GB for app workloads |

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Kafka OOMKilled | Heap too large, no page cache room | Reduce `-Xmx` in `kafka-kraft-cluster.yaml` |
| Strimzi operator CrashLoopBackOff | Feature gates misconfigured | Verify `STRIMZI_FEATURE_GATES` env var |
| OpenBao sealed after restart | Expected behavior | Re-unseal with threshold keys |
| Apicurio 503 | JVM warmup or OOM | Check `kubectl logs`, increase memory limit |
| k3s agent won't join | Firewall or token mismatch | Check UFW rules & token value |
| Node shows `NotReady` | Kernel params missing | Re-run `01-prepare-node.sh` |

---

## File Inventory

```
infra/
├── README.md                          ← This guide
├── namespaces.yaml                    ← Kubernetes namespaces
├── resource-quotas.yaml               ← Per-namespace memory guardrails
├── network-policies.yaml              ← Zero-trust network segmentation
├── helm-values/
│   ├── strimzi-operator-values.yaml   ← Strimzi Helm overrides
│   └── openbao-values.yaml            ← OpenBao Helm overrides
├── kafka/
│   ├── kafka-kraft-cluster.yaml       ← KRaft Kafka CR (low-memory)
│   └── kafka-topics.yaml              ← Application topics
├── apicurio/
│   ├── deployment.yaml                ← Apicurio Registry Deployment
│   ├── service.yaml                   ← ClusterIP service
│   └── configmap.yaml                 ← Registry configuration
├── openbao/
│   └── k8s-auth-policy.yaml           ← Vault policy + K8s auth role
└── scripts/
    ├── 01-prepare-node.sh             ← VM hardening
    ├── 02-install-k3s.sh              ← Automated k3s install
    ├── 03-openbao-setup.sh            ← Vault init automation
    └── 04-smoke-test.sh               ← Full-stack verification
```
