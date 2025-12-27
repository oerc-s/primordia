#!/bin/bash
# Open upstream PRs automatically (requires GITHUB_TOKEN)

set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN not set"
  echo "See dist/upstream_patches/APPLY.md for manual steps"
  exit 1
fi

PATCHES_DIR="$(dirname "$0")/../dist/upstream_patches"

# Repos to patch
declare -A REPOS=(
  ["langchain"]="langchain-ai/langchain"
  ["llamaindex"]="run-llama/llama_index"
  ["autogen"]="microsoft/autogen"
  ["crewai"]="joaomdmoura/crewAI"
)

for patch in langchain llamaindex autogen crewai; do
  REPO="${REPOS[$patch]}"
  PATCH_FILE="$PATCHES_DIR/$patch.patch"
  BRANCH="feature/primordia-msr-integration"

  echo "=== Processing $REPO ==="

  # Fork if needed (gh will skip if already forked)
  gh repo fork "$REPO" --clone=false 2>/dev/null || true

  # Clone fork
  FORK_URL="https://github.com/$(gh api user -q .login)/${REPO##*/}.git"
  CLONE_DIR="/tmp/primordia-pr-${patch}"
  rm -rf "$CLONE_DIR"
  git clone "$FORK_URL" "$CLONE_DIR"
  cd "$CLONE_DIR"

  # Create branch and apply patch
  git checkout -b "$BRANCH"
  git apply "$PATCH_FILE"
  git add .
  git commit -m "feat: Add Primordia MSR integration for economic settlement"

  # Push
  git push origin "$BRANCH"

  # Create PR
  gh pr create \
    --repo "$REPO" \
    --title "feat: Add Primordia MSR integration for economic settlement" \
    --body "$(cat <<EOF
## Summary

Adds Primordia MSR (Machine Settlement Receipt) integration for economic settlement of AI agent operations.

## Features

- Shadow mode by default (never blocks execution)
- Tracks LLM calls, tool usage, and task execution
- Accumulates receipts for batch netting
- Optional paid mode for signed IAN

## Links

- Primordia Protocol: https://primordia.dev
- MSR Spec: https://primordia.dev/spec/msr
EOF
)"

  echo "PR created for $REPO"
  cd -
done

echo "=== All PRs created ==="
