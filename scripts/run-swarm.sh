#!/bin/bash
# Run Primordia Agent Swarm (Unix)

cd "$(dirname "$0")/.."
node orchestrator/primordia.js swarm
