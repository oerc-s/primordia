#!/bin/bash
# Build CDN artifacts (.tgz, .whl) for distribution without npm/pypi

set -e

DIST_DIR="dist/artifacts"
VERSION="0.1.0"

echo "=== PRIMORDIA ARTIFACT BUILD ==="
echo "Version: $VERSION"
echo ""

mkdir -p "$DIST_DIR"

# =====================
# MCP Server (.tgz)
# =====================
echo "1. Building MCP Server..."
cd mcp-server
npm run build
npm pack
mv primordia-mcp-server-*.tgz "../$DIST_DIR/primordia-mcp-server-$VERSION.tgz"
cd ..
echo "   Created: $DIST_DIR/primordia-mcp-server-$VERSION.tgz"

# =====================
# SDK TypeScript (.tgz)
# =====================
echo "2. Building SDK TypeScript..."
cd sdk-ts
npm run build 2>/dev/null || echo "   (build script may not exist)"
npm pack
mv primordia-sdk-*.tgz "../$DIST_DIR/primordia-sdk-$VERSION.tgz" 2>/dev/null || echo "   (no package produced)"
cd ..

# =====================
# SDK Python (.whl)
# =====================
echo "3. Building SDK Python..."
cd sdk-py
if [ -f "setup.py" ] || [ -f "pyproject.toml" ]; then
  pip install build 2>/dev/null || true
  python -m build --wheel 2>/dev/null || echo "   (build failed, manual build needed)"
  mv dist/*.whl "../$DIST_DIR/" 2>/dev/null || echo "   (no wheel produced)"
else
  echo "   (no setup.py or pyproject.toml found)"
fi
cd ..

# =====================
# Runtime Hook Python (.whl)
# =====================
echo "4. Building Runtime Hook Python..."
cd runtime-hook-py
if [ -f "setup.py" ] || [ -f "pyproject.toml" ]; then
  python -m build --wheel 2>/dev/null || echo "   (build failed, manual build needed)"
  mv dist/*.whl "../$DIST_DIR/" 2>/dev/null || echo "   (no wheel produced)"
else
  echo "   (no setup.py or pyproject.toml found)"
fi
cd ..

# =====================
# Checksums
# =====================
echo "5. Generating checksums..."
cd "$DIST_DIR"
sha256sum *.tgz *.whl 2>/dev/null > checksums.sha256 || echo "   (some files missing)"
cd ../..

echo ""
echo "=== ARTIFACTS READY ==="
ls -la "$DIST_DIR"

echo ""
echo "Upload to CDN:"
echo "  cdn.kaledge.app/primordia-mcp-server-$VERSION.tgz"
echo "  cdn.kaledge.app/primordia-sdk-$VERSION.tgz"
echo "  cdn.kaledge.app/primordia_sdk-$VERSION-py3-none-any.whl"
echo "  cdn.kaledge.app/checksums.sha256"
