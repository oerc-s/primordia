#!/bin/bash
# Run conformance tests
cd "$(dirname "$0")/.."
npx tsx conformance/run.ts && python conformance/run.py
