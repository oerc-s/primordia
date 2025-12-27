#\!/bin/bash
cd "$(dirname "$0")/.."
npx tsx orchestrator/primordia.ts build
