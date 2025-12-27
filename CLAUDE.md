# PRIMORDIA - Project State

> Last updated: 2024-12-25
> Status: SHIPPED - 2028 READY

## HARD FINANCIAL OBJECTIVE

**$1,000,000 prepaid Clearing Credit**

Monetization ONLY at clearing layer:
1. IAN signing + netting bps fee (5 bps)
2. Credit spread on draws (200 bps)
3. Default/resolve fee ($25,000)

Free tier: verify-only (rate-limited), NO netting signature, NO credit, NO default resolution.

## ANTI-EXTRACTION BOUNDARY

- Specs are public (anyone can emit MSR/FC offline)
- Moat = signed IAN + credit issuance + default resolution + Primordia Seal
- Kernel signing keys NEVER leave runtime secrets
- SDKs support offline verify/emit
- "Clearing-grade" netting requires kernel signature

## THE 3 RAILS (2028 READY)

### RAIL-1: SETTLEMENT + NETTING
| Primitive | Version |
|-----------|---------|
| MSR | v0.1 - Machine Settlement Receipt |
| IAN | v0.1 - Inter-Agent Netting |

### RAIL-2: CREDIT + COMMITMENTS + DEFAULT
| Primitive | Version |
|-----------|---------|
| FC | v0.1 - Future Commitment |
| MBS | v0.1 - Machine Balance Sheet |
| DBP | v0.1 - Default/Bankruptcy Primitive |

### RAIL-3: ATTESTED METERING
| Primitive | Version |
|-----------|---------|
| ComputeMeterReceipt | v0.1 - GPU/CPU epochs |
| EnergyMeterReceipt | v0.1 - kWh/kW epochs |

## DISTRIBUTION

### DISTRO-A: Runtime Hooks
```
@primordia/runtime-hook (npm)
primordia-runtime-hook (PyPI)
```
- Shadow mode: emits MSR locally
- Paid mode: batches → /v1/net → signed IAN
- Wrappers: wrap_openai, wrap_anthropic, wrap_langchain

### DISTRO-B: MCP Server
```
@primordia/mcp-server (npm)
```
Tools:
- verify_receipt (FREE)
- verify_seal (FREE)
- net_receipts (PAID)
- open_credit_line (PAID)
- commit_future (PAID)
- trigger_default (PAID)

## REPO LAYOUT

```
primordia/
├── orchestrator/          # MAESTRO controller
├── agents/                # Agent prompts
├── daemons/               # 4 production daemons
│   ├── primordia-daemon   # Health + KPI
│   ├── conformance-daemon # Nightly conformance
│   ├── cash-daemon        # Credit monitoring
│   └── distro-daemon      # Artifact generation
├── hooks/                 # Git hooks
├── spec/                  # Canonical specs (public)
├── sdk-ts/                # @primordia/sdk
├── sdk-py/                # primordia-sdk
├── runtime-hook-ts/       # DISTRO-A TS
├── runtime-hook-py/       # DISTRO-A PY
├── mcp-server/            # DISTRO-B MCP
├── clearing-kernel/       # Paid kernel
├── conformance/           # Test vectors (FROZEN)
├── dist/                  # Release artifacts
│   ├── upstream_patches/  # LangChain, CrewAI patches
│   ├── snippets/          # MCP config, quickstart
│   └── release/           # MANIFEST.md
└── scripts/               # One-liners
```

## CLEARING KERNEL ENDPOINTS

### FREE (rate-limited 100 req/min)
```
GET  /healthz
GET  /v1/spec
POST /v1/verify
```

### PAID (402 if no credit)
```
POST /v1/net                → signed IAN (5 bps)
POST /v1/credit/packs       → available packs
POST /v1/credit/create_intent → Stripe checkout
POST /v1/stripe/webhook     → credit ledger
POST /v1/credit/open        → open credit line
POST /v1/credit/draw        → draw from line
POST /v1/fc/commit          → commit FC
POST /v1/default/trigger    → trigger default
POST /v1/default/resolve    → resolve ($25k)
POST /v1/seal/issue         → issue seal (admin)
POST /v1/seal/verify        → verify seal
```

## PRICING

| Item | Price |
|------|-------|
| Credit Pack (100k) | $100,000 |
| Credit Pack (250k) | $250,000 |
| Credit Pack (1M) | $1,000,000 |
| Netting Fee | 5 bps |
| Credit Spread | 200 bps |
| Default Resolve | $25,000 |

## ORCHESTRATOR COMMANDS

```bash
primordia status   # System status
primordia build    # Build all (parallel waves)
primordia swarm    # Run conformance
primordia ship     # Package for distribution
primordia distro   # Generate artifacts
primordia prod     # Production test commands
primordia cash     # Financial status
```

## SCRIPTS

```bash
./scripts/build.sh        # Build all
./scripts/test.sh         # Run conformance
./scripts/start-kernel.sh # Start kernel
./scripts/prod-test.sh    # Production smoke test
```

## CONFORMANCE (FROZEN v0.1.0)

```
conformance/
├── vectors.json   # FROZEN - DO NOT MODIFY
├── run.ts         # TypeScript runner
└── run.py         # Python runner
```

Output: `CONFORMANCE: PASS` or `CONFORMANCE: FAIL`

## NO-GO LIST

- ❌ Building 9 rails
- ❌ Building UIs/dashboards
- ❌ Integrations-first for dozens of providers
- ❌ Depending on partners for core function
- ❌ Shipping keys or secrets in repo

## KEY INSIGHT

**Canonicality = Time Ownership**

We own the signed IAN outputs.
We issue credit lines.
We resolve defaults.
We stamp the Primordia Seal.

No kernel signature = no clearing-grade settlement.
No credit = 402 BOOKS OPEN.
No alternative = MUST use us.
