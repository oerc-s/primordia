#!/bin/bash
# Primordia Installation Script (Unix)

set -e

echo "=== Primordia Installation ==="
echo

cd "$(dirname "$0")/.."

# Install SDK-TS dependencies
echo "Installing SDK-TS dependencies..."
(cd sdk-ts && npm install)

# Install clearing-kernel dependencies
echo "Installing clearing-kernel dependencies..."
(cd clearing-kernel && npm install)

echo
echo "=== Installation Complete ==="
echo
echo "Run: node orchestrator/primordia.js status"
