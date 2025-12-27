#!/bin/bash
# Publish to npm + PyPI if credentials exist
set -e

cd "$(dirname "$0")/.."

echo "═══════════════════════════════════════════════════════════════"
echo "  PUBLISH CHECK"
echo "═══════════════════════════════════════════════════════════════"

NPM_READY=false
PYPI_READY=false

# Check npm
if [ -n "$NPM_TOKEN" ]; then
  echo "[npm] Token found"
  NPM_READY=true
elif npm whoami &> /dev/null; then
  echo "[npm] Already logged in"
  NPM_READY=true
else
  echo "[npm] Not authenticated"
fi

# Check PyPI
if [ -n "$PYPI_TOKEN" ]; then
  echo "[pypi] Token found"
  PYPI_READY=true
elif [ -f ~/.pypirc ]; then
  echo "[pypi] .pypirc found"
  PYPI_READY=true
else
  echo "[pypi] Not authenticated"
fi

echo ""

# NPM publish
if [ "$NPM_READY" = true ]; then
  echo "═══════════════════════════════════════════════════════════════"
  echo "  PUBLISHING TO NPM"
  echo "═══════════════════════════════════════════════════════════════"

  if [ -n "$NPM_TOKEN" ]; then
    echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > ~/.npmrc
  fi

  cd sdk-ts && npm publish --access public && cd ..
  cd mcp-server && npm publish --access public && cd ..
  cd runtime-hook-ts && npm publish --access public && cd ..

  echo "[npm] Published 3 packages"
else
  echo "═══════════════════════════════════════════════════════════════"
  echo "  NPM PUBLISH COMMANDS (run manually)"
  echo "═══════════════════════════════════════════════════════════════"
  echo "npm login"
  echo "cd sdk-ts && npm publish --access public"
  echo "cd ../mcp-server && npm publish --access public"
  echo "cd ../runtime-hook-ts && npm publish --access public"
fi

echo ""

# PyPI publish
if [ "$PYPI_READY" = true ]; then
  echo "═══════════════════════════════════════════════════════════════"
  echo "  PUBLISHING TO PYPI"
  echo "═══════════════════════════════════════════════════════════════"

  cd sdk-py
  python -m build
  if [ -n "$PYPI_TOKEN" ]; then
    twine upload dist/* -u __token__ -p "$PYPI_TOKEN"
  else
    twine upload dist/*
  fi
  cd ..

  cd runtime-hook-py
  python -m build
  if [ -n "$PYPI_TOKEN" ]; then
    twine upload dist/* -u __token__ -p "$PYPI_TOKEN"
  else
    twine upload dist/*
  fi
  cd ..

  echo "[pypi] Published primordia-sdk + primordia-runtime-hook"
else
  echo "═══════════════════════════════════════════════════════════════"
  echo "  PYPI PUBLISH COMMANDS (run manually)"
  echo "═══════════════════════════════════════════════════════════════"
  echo "pip install twine build"
  echo "cd sdk-py && python -m build && twine upload dist/*"
  echo "cd ../runtime-hook-py && python -m build && twine upload dist/*"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  PUBLISH COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
