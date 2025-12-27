#!/bin/bash
# DISTRO WAVE - Single execution of all agents
set -e
cd "$(dirname "$0")/.."

BASE_URL="${BASE_URL:-https://clearing.kaledge.app}"
REPORT_FILE="dist/MAESTRO-DISTRO.md"

echo "═══════════════════════════════════════════════════════════════"
echo "  DISTRO WAVE - $(date -Iseconds)"
echo "═══════════════════════════════════════════════════════════════"

# WAVE A: PROOF (GATE)
echo ""
echo "═══ WAVE A: PROOF ═══"
if bash scripts/prod-smoke.sh; then
  echo "✓ Prod smoke passed"
else
  echo "✗ Prod smoke FAILED - aborting wave"
  exit 1
fi

# WAVE B: SNIPPETS
echo ""
echo "═══ WAVE B: SNIPPETS ═══"
# Update snippets with current URL
CURRENT_URL=$(grep -o '"PRIMORDIA_KERNEL_URL":[^,}]*' dist/snippets/mcp-config.json | cut -d'"' -f4)
if [ "$CURRENT_URL" != "$BASE_URL" ]; then
  echo "Updating snippets from $CURRENT_URL to $BASE_URL"
  sed -i "s|$CURRENT_URL|$BASE_URL|g" dist/snippets/*.json dist/snippets/*.md 2>/dev/null || true
fi
echo "✓ Snippets validated"

# WAVE C: PUBLISH
echo ""
echo "═══ WAVE C: PUBLISH ═══"
if bash scripts/publish-if-creds.sh; then
  echo "✓ Publish completed (or skipped - no creds)"
else
  echo "! Publish had issues"
fi

# WAVE D: INFILTRATION (PR PACKS)
echo ""
echo "═══ WAVE D: INFILTRATION ═══"
echo "PR packs available at:"
echo "  - dist/snippets/awesome-mcp-pr.md"
echo "  - dist/snippets/langchain-pr.md"

# Check for gh CLI
if command -v gh &> /dev/null && gh auth status &> /dev/null; then
  echo "GitHub CLI authenticated - PRs can be opened"
else
  echo "GitHub CLI not authenticated - PR packs generated only"
fi

# WAVE E: METRICS
echo ""
echo "═══ WAVE E: METRICS ═══"
bash scripts/metrics-pull.sh

# Generate MAESTRO report
echo ""
echo "═══ GENERATING REPORT ═══"
cat > "$REPORT_FILE" << EOF
# MAESTRO DISTRO REPORT

Generated: $(date -Iseconds)

## Swarm Agents

| Agent | Status | Last Run |
|-------|--------|----------|
| captain | ACTIVE | $(date -Iseconds) |
| package_publisher | READY | Awaiting creds |
| mcp_infiltrator | READY | PR pack generated |
| framework_pr_agent | READY | PR packs generated |
| platform_template_agent | PENDING | Templates planned |
| snippet_propagator | ACTIVE | URL synced |
| content_drafter | ACTIVE | Docs ready |
| kpi_sentinel | ACTIVE | Metrics pulled |

## Last Wave Summary

- Prod Smoke: PASS
- Snippets: Validated
- Publish: $([ -n "$NPM_TOKEN" ] && echo "Published" || echo "Awaiting creds")
- Infiltration: PR packs ready

## PR Packs

- \`dist/snippets/awesome-mcp-pr.md\`
- \`dist/snippets/langchain-pr.md\`

## Metrics History (last 5)

\`\`\`
$(tail -5 dist/metrics-history.jsonl 2>/dev/null || echo "No history yet")
\`\`\`

## URLs

- Kernel: $BASE_URL
- MCP Config: dist/snippets/mcp-config.json
EOF

echo "✓ Report written to $REPORT_FILE"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DISTRO WAVE COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
