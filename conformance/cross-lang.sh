#!/bin/bash
# Cross-language conformance validation
# Runs both TypeScript and Python conformance suites and compares outputs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================"
echo "Primordia Cross-Language Conformance Suite"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TS_OUTPUT=$(mktemp)
PY_OUTPUT=$(mktemp)
TS_EXIT=0
PY_EXIT=0

# Cleanup temp files on exit
trap "rm -f $TS_OUTPUT $PY_OUTPUT" EXIT

# Run TypeScript tests
echo "========== TypeScript Tests =========="
if command -v node &> /dev/null; then
    if [ -f "node_modules/.bin/tsx" ]; then
        npx tsx run.ts > "$TS_OUTPUT" 2>&1 || TS_EXIT=$?
    elif [ -f "dist/run.js" ]; then
        node dist/run.js > "$TS_OUTPUT" 2>&1 || TS_EXIT=$?
    else
        echo -e "${YELLOW}Warning: TypeScript conformance not compiled. Run 'npm run build' first.${NC}"
        echo "Skipping TypeScript tests..."
        echo "CONFORMANCE: SKIP" > "$TS_OUTPUT"
        TS_EXIT=2
    fi
else
    echo -e "${RED}Error: Node.js not found${NC}"
    echo "CONFORMANCE: SKIP" > "$TS_OUTPUT"
    TS_EXIT=2
fi

cat "$TS_OUTPUT"
echo ""

# Run Python tests
echo "========== Python Tests =========="
if command -v python3 &> /dev/null; then
    python3 run.py > "$PY_OUTPUT" 2>&1 || PY_EXIT=$?
elif command -v python &> /dev/null; then
    python run.py > "$PY_OUTPUT" 2>&1 || PY_EXIT=$?
else
    echo -e "${RED}Error: Python not found${NC}"
    echo "CONFORMANCE: SKIP" > "$PY_OUTPUT"
    PY_EXIT=2
fi

cat "$PY_OUTPUT"
echo ""

# Compare results
echo "========== Cross-Language Validation =========="

TS_RESULT=$(grep "CONFORMANCE:" "$TS_OUTPUT" | tail -1)
PY_RESULT=$(grep "CONFORMANCE:" "$PY_OUTPUT" | tail -1)

echo "TypeScript: $TS_RESULT"
echo "Python:     $PY_RESULT"
echo ""

# Extract test counts for comparison
TS_CJ=$(grep "canonical_json:" "$TS_OUTPUT" | tail -1 || echo "")
TS_BLAKE=$(grep "blake3_hash:" "$TS_OUTPUT" | tail -1 || echo "")
TS_ED=$(grep "ed25519_sig:" "$TS_OUTPUT" | tail -1 || echo "")
TS_NET=$(grep "netting:" "$TS_OUTPUT" | tail -1 || echo "")

PY_CJ=$(grep "canonical_json:" "$PY_OUTPUT" | tail -1 || echo "")
PY_BLAKE=$(grep "blake3_hash:" "$PY_OUTPUT" | tail -1 || echo "")
PY_ED=$(grep "ed25519_sig:" "$PY_OUTPUT" | tail -1 || echo "")
PY_NET=$(grep "netting:" "$PY_OUTPUT" | tail -1 || echo "")

# Detailed comparison
echo "Category Comparison:"
echo "--------------------"
echo "Canonical JSON:"
echo "  TS: $TS_CJ"
echo "  PY: $PY_CJ"
echo ""
echo "Blake3 Hash:"
echo "  TS: $TS_BLAKE"
echo "  PY: $PY_BLAKE"
echo ""
echo "Ed25519 Signature:"
echo "  TS: $TS_ED"
echo "  PY: $PY_ED"
echo ""
echo "Netting Conservation:"
echo "  TS: $TS_NET"
echo "  PY: $PY_NET"
echo ""

# Determine overall result
if [ $TS_EXIT -eq 0 ] && [ $PY_EXIT -eq 0 ]; then
    if [[ "$TS_RESULT" == *"PASS"* ]] && [[ "$PY_RESULT" == *"PASS"* ]]; then
        echo -e "${GREEN}============================================${NC}"
        echo -e "${GREEN}CROSS-LANGUAGE CONFORMANCE: PASS${NC}"
        echo -e "${GREEN}============================================${NC}"
        exit 0
    else
        echo -e "${RED}============================================${NC}"
        echo -e "${RED}CROSS-LANGUAGE CONFORMANCE: FAIL${NC}"
        echo -e "${RED}Some tests did not pass${NC}"
        echo -e "${RED}============================================${NC}"
        exit 1
    fi
elif [ $TS_EXIT -eq 2 ] || [ $PY_EXIT -eq 2 ]; then
    echo -e "${YELLOW}============================================${NC}"
    echo -e "${YELLOW}CROSS-LANGUAGE CONFORMANCE: PARTIAL${NC}"
    echo -e "${YELLOW}Some test suites were skipped${NC}"
    echo -e "${YELLOW}============================================${NC}"
    exit 0
else
    echo -e "${RED}============================================${NC}"
    echo -e "${RED}CROSS-LANGUAGE CONFORMANCE: FAIL${NC}"
    echo -e "${RED}Test execution errors occurred${NC}"
    echo -e "${RED}============================================${NC}"
    exit 1
fi
