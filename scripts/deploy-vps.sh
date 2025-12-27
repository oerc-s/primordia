#!/bin/bash
# Deploy Primordia to VPS
# Usage: ./deploy-vps.sh user@host

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 user@host"
    exit 1
fi

TARGET="$1"
REMOTE_DIR="/opt/primordia"

echo "=== Deploying Primordia to $TARGET ==="

# Create archive
echo "Creating archive..."
cd "$(dirname "$0")/.."
tar -czf /tmp/primordia.tar.gz \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.git' \
    .

# Copy to server
echo "Copying to server..."
scp /tmp/primordia.tar.gz "$TARGET:/tmp/"

# Deploy
echo "Deploying..."
ssh "$TARGET" << 'EOF'
set -e
sudo mkdir -p /opt/primordia
sudo chown $USER:$USER /opt/primordia
cd /opt/primordia
tar -xzf /tmp/primordia.tar.gz
rm /tmp/primordia.tar.gz

# Install dependencies
cd sdk-ts && npm install && npm run build && cd ..
cd clearing-kernel && npm install && npm run build && cd ..

# Create systemd service
sudo tee /etc/systemd/system/primordia-kernel.service << 'SERVICE'
[Unit]
Description=Primordia Clearing Kernel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/primordia/clearing-kernel
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable primordia-kernel
sudo systemctl start primordia-kernel

echo "Deployment complete!"
systemctl status primordia-kernel --no-pager
EOF

echo "=== Deployment Complete ==="
echo "Kernel running at: http://$TARGET:3000/healthz"
