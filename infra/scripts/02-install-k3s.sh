#!/usr/bin/env bash
# =============================================================================
# 02-install-k3s.sh — Automated k3s Cluster Installation
# 
# Usage:
#   Server (first node):  sudo ./02-install-k3s.sh server --ip 10.0.1.10
#   Server (join HA):     sudo ./02-install-k3s.sh server --ip 10.0.1.11 --join https://10.0.1.10:6443 --token <TOKEN>
#   Agent (worker):       sudo ./02-install-k3s.sh agent  --join https://10.0.1.10:6443 --token <TOKEN>
# =============================================================================
set -euo pipefail

ROLE="${1:-}"
IP=""
JOIN_URL=""
TOKEN=""

# Parse arguments
shift || true
while [[ $# -gt 0 ]]; do
  case $1 in
    --ip)     IP="$2";       shift 2 ;;
    --join)   JOIN_URL="$2"; shift 2 ;;
    --token)  TOKEN="$2";    shift 2 ;;
    *)        echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "============================================"
echo " CloudGreen OS — k3s Installation"
echo " Role: ${ROLE}"
echo "============================================"

if [[ "$ROLE" == "server" ]]; then
  
  if [[ -z "$IP" ]]; then
    echo "ERROR: --ip is required for server role"
    echo "Usage: sudo ./02-install-k3s.sh server --ip <NODE_IP>"
    exit 1
  fi

  EXEC_ARGS="server"
  
  if [[ -n "$JOIN_URL" && -n "$TOKEN" ]]; then
    # Joining an existing HA cluster
    echo "[*] Joining existing cluster at ${JOIN_URL}..."
    export K3S_URL="$JOIN_URL"
    export K3S_TOKEN="$TOKEN"
  else
    # Initializing a new cluster
    echo "[*] Initializing new cluster (first server)..."
    EXEC_ARGS+=" --cluster-init"
  fi

  EXEC_ARGS+=" --secrets-encryption"
  EXEC_ARGS+=" --protect-kernel-defaults"
  EXEC_ARGS+=" --tls-san ${IP}"
  EXEC_ARGS+=" --write-kubeconfig-mode 644"
  EXEC_ARGS+=" --kube-apiserver-arg audit-log-path=/var/log/k3s-audit.log"
  EXEC_ARGS+=" --kube-apiserver-arg audit-log-maxage=30"
  EXEC_ARGS+=" --kube-apiserver-arg audit-log-maxbackup=10"
  EXEC_ARGS+=" --kube-apiserver-arg audit-log-maxsize=100"
  
  # Kubelet memory reservation for 8 GB nodes
  EXEC_ARGS+=" --kubelet-arg system-reserved=memory=512Mi"
  EXEC_ARGS+=" --kubelet-arg eviction-hard=memory.available<200Mi"
  EXEC_ARGS+=" --kubelet-arg eviction-soft=memory.available<500Mi"
  EXEC_ARGS+=" --kubelet-arg eviction-soft-grace-period=memory.available=1m"
  
  echo "[*] Installing k3s server..."
  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="$EXEC_ARGS" sh -

  echo ""
  echo "============================================"
  echo " ✓ k3s server installed!"
  echo ""
  echo " Node Token (for joining workers):"
  sudo cat /var/lib/rancher/k3s/server/node-token
  echo ""
  echo " Kubeconfig: /etc/rancher/k3s/k3s.yaml"
  echo " Test: sudo k3s kubectl get nodes"
  echo "============================================"

elif [[ "$ROLE" == "agent" ]]; then

  if [[ -z "$JOIN_URL" || -z "$TOKEN" ]]; then
    echo "ERROR: --join and --token are required for agent role"
    echo "Usage: sudo ./02-install-k3s.sh agent --join https://<SERVER_IP>:6443 --token <TOKEN>"
    exit 1
  fi

  echo "[*] Installing k3s agent (worker)..."
  export K3S_URL="$JOIN_URL"
  export K3S_TOKEN="$TOKEN"

  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="agent \
    --protect-kernel-defaults \
    --kubelet-arg system-reserved=memory=512Mi \
    --kubelet-arg eviction-hard=memory.available<200Mi" sh -

  echo ""
  echo "============================================"
  echo " ✓ k3s agent installed and joined cluster!"
  echo " Verify on server: sudo k3s kubectl get nodes"
  echo "============================================"

else
  echo "Usage: sudo ./02-install-k3s.sh <server|agent> [options]"
  echo ""
  echo "Options:"
  echo "  --ip <IP>        Node IP address (required for server)"
  echo "  --join <URL>     Cluster URL to join (https://<IP>:6443)"
  echo "  --token <TOKEN>  Node token from first server"
  echo ""
  echo "Examples:"
  echo "  First server:    sudo ./02-install-k3s.sh server --ip 10.0.1.10"
  echo "  Join server:     sudo ./02-install-k3s.sh server --ip 10.0.1.11 --join https://10.0.1.10:6443 --token <TOKEN>"
  echo "  Worker agent:    sudo ./02-install-k3s.sh agent --join https://10.0.1.10:6443 --token <TOKEN>"
  exit 1
fi
