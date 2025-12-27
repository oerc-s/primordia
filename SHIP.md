# SHIP NOW

## NPM PUBLISH

```bash
# Login (une fois)
npm login

# Publish
cd C:/Users/trunk/primordia/sdk-ts
npm publish --access public

cd C:/Users/trunk/primordia/mcp-server
npm publish --access public

cd C:/Users/trunk/primordia/clearing-kernel
npm publish --access public
```

## PYPI PUBLISH

```bash
pip install twine

cd C:/Users/trunk/primordia/sdk-py
twine upload dist/*
```

## KERNEL DEPLOY (Railway/Fly)

```bash
cd C:/Users/trunk/primordia/clearing-kernel

# Railway
railway login
railway init
railway up

# Ou Fly
fly launch
fly deploy
```

## APRÈS PUBLISH

Les users peuvent:

```bash
# NPM
npm install @primordia/sdk
npm install @primordia/mcp-server

# PyPI
pip install primordia-sdk
```

## MCP CONFIG (copy-paste)

```json
{
  "mcpServers": {
    "primordia-clearing": {
      "command": "npx",
      "args": ["-y", "@primordia/mcp-server"],
      "env": {
        "PRIMORDIA_KERNEL_URL": "https://clearing.primordia.dev"
      }
    }
  }
}
```

## UPSTREAM PRS

```bash
# Si GITHUB_TOKEN set
export GITHUB_TOKEN="ghp_..."
./scripts/open-upstream-prs.sh

# Sinon: patches manuels dans dist/upstream_patches/
```

## SMOKE TEST

```bash
TEST_MODE=true ./scripts/smoke-one.sh
```

## C'EST LIVE

```
@primordia/sdk         → npm
@primordia/mcp-server  → npm
primordia-sdk          → PyPI
clearing.primordia.dev → Kernel
```
