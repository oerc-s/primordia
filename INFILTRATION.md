# PRIMORDIA INFILTRATION STRATEGY

## PHASE 0: PRODUCTION DEPLOY (BLOCKER)

```bash
# Option A: Fly.io (recommended)
cd clearing-kernel
fly launch --name primordia-kernel
fly postgres create --name primordia-db
fly postgres attach primordia-db
fly secrets set ADMIN_API_KEY=$(openssl rand -hex 32)
fly secrets set TEST_MODE=false
fly deploy

# Get URL
export BASE_URL=$(fly status --json | jq -r '.Hostname')
echo "BASE_URL=https://$BASE_URL"

# Option B: Railway
# Push to GitHub, connect Railway, add PostgreSQL addon

# Option C: Any VPS with Docker
docker compose up -d
# Expose via Cloudflare Tunnel / ngrok / direct IP
```

**CONSTRAINT**: No distribution until BASE_URL is LIVE and smoke passes.

---

## PHASE 1: MCP INFILTRATION (Day 1-7)

### Why MCP First
- Zero code change for user (copy-paste JSON)
- Claude Desktop = 10M+ users
- Cursor/Windsurf = 5M+ devs
- Each tool call = potential receipt

### Execution

```bash
# 1. Publish MCP server
cd mcp-server
npm publish --access public

# 2. Submit to awesome-mcp-servers
gh repo fork punkpeye/awesome-mcp-servers
# Add entry:
# | primordia-clearing | Economic settlement for AI agents | npx @primordia/mcp-server |
gh pr create --title "Add Primordia Clearing MCP Server"

# 3. Create Claude Desktop config snippet
cat > dist/snippets/claude-desktop-config.json << 'EOF'
{
  "mcpServers": {
    "primordia": {
      "command": "npx",
      "args": ["-y", "@primordia/mcp-server"],
      "env": {
        "PRIMORDIA_KERNEL_URL": "https://clearing.kaledge.app"
      }
    }
  }
}
EOF
```

### Hook Points in MCP
```
User: "Track my AI costs"
       ↓
MCP tool: verify_receipt (FREE)
       ↓
User: "Reconcile with partner agent"
       ↓
MCP tool: net_receipts
       ↓
HTTP 402: BOOKS OPEN
       ↓
$$$
```

---

## PHASE 2: RUNTIME HOOKS (Day 7-14)

### Why Runtime Hooks
- Captures ALL LLM calls
- Shadow mode = zero risk
- One line of code
- Works with any framework

### Execution

```bash
# TypeScript
cd runtime-hook-ts
npm publish --access public

# Python
cd runtime-hook-py
pip install build twine
python -m build
twine upload dist/*
```

### Integration Pattern

```python
# Before (no visibility)
from openai import OpenAI
client = OpenAI()

# After (receipts emitted)
from openai import OpenAI
from primordia import wrap_openai

client = wrap_openai(OpenAI())  # ONE LINE
# Every call now emits MSR locally
```

### Marketing Angle
- "Free AI cost tracking"
- "See where your tokens go"
- "Shadow mode = zero risk"
- "Audit-ready receipts"

---

## PHASE 3: FRAMEWORK PRs (Day 14-30)

### Targets (in order)

| Framework | Users | PR Strategy |
|-----------|-------|-------------|
| LangChain | 100K+ | Callback handler |
| CrewAI | 50K+ | Task receipt hook |
| AutoGen | 30K+ | Agent wrapper |
| LlamaIndex | 40K+ | Callback |

### PR Template

```markdown
## Summary
Adds optional Primordia callback for economic receipt emission.
Shadow mode by default - no network calls, no blocking.

## Why
- Cost visibility per agent/task
- Audit trail for AI operations
- Optional settlement via clearing kernel

## Changes
- New callback: `PrimordiaCallback`
- No new dependencies (optional)
- Zero breaking changes
```

### Key Messaging
- "Optional" and "shadow mode" = easy merge
- "No external dependencies" = no concern
- "Cost visibility" = value prop everyone wants

---

## PHASE 4: PLATFORM TEMPLATES (Day 30-60)

### Targets

| Platform | Users | Integration |
|----------|-------|-------------|
| Replit | 20M+ | Template with hook |
| Vercel | 500K+ | AI SDK callback |
| Railway | 200K+ | One-click template |
| Render | 300K+ | Blueprint |

### Template Pattern

```
"Deploy AI Agent with Cost Tracking"
- Pre-configured with Primordia hook
- Shadow mode enabled
- Dashboard for receipts (local)
- Upgrade path to clearing
```

---

## CONSTRAINT ENFORCEMENT

### FREE (Always)
```
- SDK offline verify/emit
- /v1/verify
- /v1/seal/verify
- /healthz
- Local MSR storage
```

### PAID (402 Choke)
```
- /v1/net → SIGNED IAN
- /v1/credit/* → Credit operations
- /v1/default/* → Default resolution
- /v1/seal/issue → Seal issuance
```

### Trigger Points
1. "I need to reconcile with partner" → 402
2. "I need audit-ready proof" → 402
3. "I need credit line" → 402
4. "Partner defaulted" → 402 ($25K)

---

## METRICS TO TRACK

```json
{
  "phase": "infiltration",
  "metrics": {
    "npm_installs_mcp": 0,
    "npm_installs_hook": 0,
    "pip_installs_hook": 0,
    "msr_emitted_shadow": 0,
    "first_402": null,
    "first_credit_purchase": null,
    "first_signed_ian": null
  }
}
```

---

## TIMELINE

```
Day 0:   BASE_URL live, smoke pass
Day 1:   npm publish @primordia/mcp-server
Day 2:   PR awesome-mcp-servers
Day 3:   npm publish @primordia/runtime-hook
Day 4:   pip publish primordia-runtime-hook
Day 7:   Blog: "Free AI Cost Tracking"
Day 14:  PR LangChain
Day 21:  PR CrewAI
Day 30:  First 402 in production
Day 45:  First pack_dev purchase
Day 60:  First enterprise inquiry
Day 90:  $100K prepaid target
Day 180: $1M prepaid target
```

---

## ANTI-PATTERNS (DO NOT)

- ❌ Publish packages before BASE_URL live
- ❌ Make shadow mode require config
- ❌ Add mandatory dependencies
- ❌ Block execution on receipt emission
- ❌ Require API key for shadow mode
- ❌ Pitch "settlement" before "cost tracking"
