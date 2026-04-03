#!/usr/bin/env bash
# =============================================================================
# 01-prepare-node.sh — Ubuntu VM Hardening for k3s
# Run as root on EVERY node before installing k3s.
#
# Usage: sudo ./01-prepare-node.sh
# =============================================================================
set -euo pipefail

echo "============================================"
echo " CloudGreen OS — Node Preparation"
echo " Target: Ubuntu 22.04 / 24.04 LTS"
echo "============================================"

# --------------------------------------------------
# 1. System update
# --------------------------------------------------
echo "[1/8] Updating system packages..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

# --------------------------------------------------
# 2. Install essential packages
# --------------------------------------------------
echo "[2/8] Installing required packages..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  curl \
  wget \
  ca-certificates \
  gnupg \
  lsb-release \
  jq \
  htop \
  iotop \
  net-tools \
  nfs-common \
  open-iscsi \
  ufw \
  fail2ban \
  unattended-upgrades \
  apt-listchanges \
  apparmor \
  apparmor-utils

# --------------------------------------------------
# 3. Disable swap (required by Kubernetes)
# --------------------------------------------------
echo "[3/8] Disabling swap..."
swapoff -a
sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab
# Verify
if free | grep -q "Swap:.*0.*0.*0"; then
  echo "  ✓ Swap disabled"
else
  echo "  ⚠ Swap may still be active — check 'free -h'"
fi

# --------------------------------------------------
# 4. Load required kernel modules
# --------------------------------------------------
echo "[4/8] Loading kernel modules..."
cat > /etc/modules-load.d/k8s.conf <<EOF
overlay
br_netfilter
ip_vs
ip_vs_rr
ip_vs_wrr
ip_vs_sh
nf_conntrack
EOF

modprobe overlay
modprobe br_netfilter
modprobe ip_vs
modprobe ip_vs_rr
modprobe ip_vs_wrr
modprobe ip_vs_sh
modprobe nf_conntrack

# --------------------------------------------------
# 5. Sysctl tuning for container networking
# --------------------------------------------------
echo "[5/8] Configuring sysctl parameters..."
cat > /etc/sysctl.d/99-k8s.conf <<EOF
# IPv4 forwarding (required for container networking)
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1

# Connection tracking tuning
net.netfilter.nf_conntrack_max = 131072

# File descriptor limits
fs.file-max = 131072
fs.inotify.max_user_watches = 524288
fs.inotify.max_user_instances = 1024

# Memory overcommit (conservative — important for 8 GB nodes)
vm.overcommit_memory = 1
vm.panic_on_oom = 0

# Protect kernel defaults (k3s --protect-kernel-defaults checks these)
vm.swappiness = 0
kernel.panic = 10
kernel.panic_on_oops = 1
EOF

sysctl --system > /dev/null 2>&1

# --------------------------------------------------
# 6. Configure UFW firewall
# --------------------------------------------------
echo "[6/8] Configuring firewall rules..."
ufw --force reset > /dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing

# SSH
ufw allow 22/tcp comment "SSH"

# k3s API server
ufw allow 6443/tcp comment "k3s API server"

# k3s etcd (HA only, server-to-server)
ufw allow 2379:2380/tcp comment "k3s etcd"

# Kubelet metrics
ufw allow 10250/tcp comment "Kubelet API"

# Flannel VXLAN
ufw allow 8472/udp comment "Flannel VXLAN"

# WireGuard (if using k3s with WireGuard flannel backend)
ufw allow 51820/udp comment "WireGuard"

# Traefik ingress (HTTP/HTTPS)
ufw allow 80/tcp comment "HTTP ingress"
ufw allow 443/tcp comment "HTTPS ingress"

# NodePort range
ufw allow 30000:32767/tcp comment "NodePort services"

ufw --force enable
echo "  ✓ UFW enabled with k3s rules"

# --------------------------------------------------
# 7. Configure Fail2ban
# --------------------------------------------------
echo "[7/8] Configuring fail2ban..."
cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# --------------------------------------------------
# 8. Enable automatic security updates
# --------------------------------------------------
echo "[8/8] Enabling unattended security updates..."
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<EOF
Unattended-Upgrade::Allowed-Origins {
    "\${distro_id}:\${distro_codename}-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

systemctl enable unattended-upgrades

echo ""
echo "============================================"
echo " ✓ Node preparation complete!"
echo " Next: Run 02-install-k3s.sh"
echo "============================================"
