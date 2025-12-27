#!/bin/bash
# PRIMORDIA PRODUCTION DEPLOYMENT
# Deploys clearing-kernel with PostgreSQL to various platforms

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
KERNEL_DIR="$ROOT_DIR/clearing-kernel"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           PRIMORDIA PRODUCTION DEPLOY                         ║"
echo "╚═══════════════════════════════════════════════════════════════╝"

# Detect platform
detect_platform() {
    if command -v fly &> /dev/null; then
        echo "fly"
    elif command -v railway &> /dev/null; then
        echo "railway"
    elif command -v docker &> /dev/null; then
        echo "docker"
    else
        echo "none"
    fi
}

PLATFORM="${1:-$(detect_platform)}"
echo "Platform: $PLATFORM"

case "$PLATFORM" in
    fly)
        echo "[1/5] Building..."
        cd "$KERNEL_DIR"
        npm run build

        echo "[2/5] Launching Fly app..."
        if ! fly status &> /dev/null 2>&1; then
            fly launch --no-deploy --name primordia-clearing-kernel --region iad
        fi

        echo "[3/5] Creating PostgreSQL..."
        if ! fly postgres list | grep -q primordia-db; then
            fly postgres create --name primordia-db --region iad --initial-cluster-size 1 --vm-size shared-cpu-1x
            fly postgres attach primordia-db
        fi

        echo "[4/5] Setting secrets..."
        fly secrets set \
            ADMIN_API_KEY="${ADMIN_API_KEY:-$(openssl rand -hex 32)}" \
            TEST_MODE="${TEST_MODE:-false}" \
            2>/dev/null || true

        echo "[5/5] Deploying..."
        fly deploy

        BASE_URL="https://$(fly status --json 2>/dev/null | grep -o '"Hostname":"[^"]*"' | cut -d'"' -f4)"
        ;;

    railway)
        echo "Railway deployment requires manual setup:"
        echo "1. Push to GitHub"
        echo "2. Connect Railway to repo"
        echo "3. Add PostgreSQL addon"
        echo "4. Set environment variables"
        exit 0
        ;;

    docker)
        echo "[1/3] Starting PostgreSQL..."
        cd "$ROOT_DIR"
        docker compose up -d postgres

        echo "[2/3] Waiting for PostgreSQL..."
        sleep 10

        echo "[3/3] Starting kernel..."
        docker compose up -d --build clearing-kernel

        BASE_URL="http://localhost:3000"
        ;;

    *)
        echo "ERROR: No supported platform found"
        echo "Install one of: fly, railway, docker"
        exit 1
        ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "BASE_URL=$BASE_URL"
echo "MCP_URL=$BASE_URL"
echo "═══════════════════════════════════════════════════════════════"

# Write to env file
mkdir -p "$ROOT_DIR/dist"
cat > "$ROOT_DIR/dist/.env.production" << EOF
BASE_URL=$BASE_URL
MCP_URL=$BASE_URL
DEPLOYED_AT=$(date -Iseconds)
PLATFORM=$PLATFORM
EOF

# Run smoke test
echo ""
echo "Running smoke test..."
export BASE_URL
export TEST_MODE=true
bash "$SCRIPT_DIR/smoke-one.sh" || echo "Smoke test failed - check logs"

echo ""
echo "Next steps:"
echo "  1. Update dist/snippets/mcp-config.json with BASE_URL"
echo "  2. npm publish packages"
echo "  3. Submit to awesome-mcp-servers"
