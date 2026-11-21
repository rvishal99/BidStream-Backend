#!/bin/bash
# ==============================================================================
# BidStream AWS EC2 Free Tier Initialization Script
# Recommended OS: Ubuntu 24.04 LTS or 22.04 LTS (t2.micro or t3.micro)
# ==============================================================================

set -e

echo ">>> [1/5] Updating system packages..."
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y curl git ufw ca-certificates gnupg

echo ">>> [2/5] Setting up 2GB Swap space (Prevents OOM on 1GB RAM instances)..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf
    sudo sysctl -p
    echo "Swap allocated successfully!"
else
    echo "Swap already exists, skipping."
fi

echo ">>> [3/5] Installing Docker Engine & Docker Compose Plugin..."
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow current user to run docker without sudo
sudo usermod -aG docker $USER

echo ">>> [4/5] Configuring firewall (UFW)..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo ">>> [5/5] Setup complete!"
echo "------------------------------------------------------------------"
echo "NEXT STEPS:"
echo "1. Run: newgrp docker (or log out and log back in to refresh group)"
echo "2. Clone your repository (if not already done)"
echo "3. Copy .env.production.example to .env and fill in credentials"
echo "4. Run: docker compose -f docker-compose.prod.yml up -d --build"
echo "5. Check status: docker compose -f docker-compose.prod.yml ps"
echo "------------------------------------------------------------------"
