#!/usr/bin/env node
/**
 * Distro Daemon - Regenerates release artifacts + upstream patches
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const PATCHES = join(DIST, 'upstream_patches');
const SNIPPETS = join(DIST, 'snippets');
const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function ensureDirs(): void {
  [DIST, PATCHES, SNIPPETS].forEach(d => {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  });
}

function buildPackages(): void {
  console.log('[distro] Building sdk-ts...');
  try {
    execSync('npm run build', { cwd: join(ROOT, 'sdk-ts'), stdio: 'pipe' });
    console.log('[distro] sdk-ts: OK');
  } catch { console.log('[distro] sdk-ts: SKIP (not configured)'); }

  console.log('[distro] Building clearing-kernel...');
  try {
    execSync('npm run build', { cwd: join(ROOT, 'clearing-kernel'), stdio: 'pipe' });
    console.log('[distro] clearing-kernel: OK');
  } catch { console.log('[distro] clearing-kernel: SKIP'); }

  console.log('[distro] Building mcp-server...');
  try {
    execSync('npm run build', { cwd: join(ROOT, 'mcp-server'), stdio: 'pipe' });
    console.log('[distro] mcp-server: OK');
  } catch { console.log('[distro] mcp-server: SKIP'); }
}

function generateUpstreamPatches(): void {
  // LangChain integration patch
  const langchainPatch = `# Primordia LangChain Integration Patch
# Apply to: langchain-ai/langchain

diff --git a/libs/langchain/langchain/callbacks/primordia.py b/libs/langchain/langchain/callbacks/primordia.py
new file mode 100644
--- /dev/null
+++ b/libs/langchain/langchain/callbacks/primordia.py
@@ -0,0 +1,30 @@
+"""Primordia MSR callback handler for LangChain."""
+from langchain.callbacks.base import BaseCallbackHandler
+
+class PrimordiaCallback(BaseCallbackHandler):
+    def __init__(self, hook):
+        self.hook = hook
+
+    def on_llm_end(self, response, **kwargs):
+        usage = response.llm_output.get("token_usage", {})
+        self.hook.on_llm_call(
+            model=kwargs.get("model", "unknown"),
+            input_tokens=usage.get("prompt_tokens", 0),
+            output_tokens=usage.get("completion_tokens", 0),
+            cost_usd=0.0  # Calculate based on model
+        )
`;
  writeFileSync(join(PATCHES, 'langchain.patch'), langchainPatch);

  // CrewAI integration patch
  const crewaiPatch = `# Primordia CrewAI Integration Patch
# Apply to: joaomdmoura/crewAI

diff --git a/src/crewai/primordia.py b/src/crewai/primordia.py
new file mode 100644
--- /dev/null
+++ b/src/crewai/primordia.py
@@ -0,0 +1,20 @@
+"""Primordia MSR integration for CrewAI."""
+
+def wrap_crew(crew, hook):
+    original_kickoff = crew.kickoff
+    def wrapped_kickoff(*args, **kwargs):
+        result = original_kickoff(*args, **kwargs)
+        hook.on_tool_call("crew_kickoff", 0, 0.0)
+        return result
+    crew.kickoff = wrapped_kickoff
+    return crew
`;
  writeFileSync(join(PATCHES, 'crewai.patch'), crewaiPatch);

  console.log('[distro] Generated upstream patches');
}

function generateSnippets(): void {
  // MCP config snippet
  const mcpConfig = {
    mcpServers: {
      "primordia-clearing": {
        command: "node",
        args: ["./mcp-server/build/index.js"],
        env: {
          PRIMORDIA_KERNEL_URL: "http://localhost:3000"
        }
      }
    }
  };
  writeFileSync(join(SNIPPETS, 'claude-desktop-mcp.json'), JSON.stringify(mcpConfig, null, 2));

  // Quick start snippet
  const quickstart = `# Primordia Quick Start

## Install SDK
npm install @primordia/sdk
# or
pip install primordia-sdk

## Create MSR
import { make_msr } from '@primordia/sdk';
const msr = await make_msr({...}, privateKey);

## Net receipts (requires kernel)
curl -X POST http://localhost:3000/v1/net \\
  -H "Content-Type: application/json" \\
  -d '{"agent_id":"...", "receipts":[...]}'
`;
  writeFileSync(join(SNIPPETS, 'quickstart.md'), quickstart);

  console.log('[distro] Generated snippets');
}

async function runCycle(): Promise<void> {
  console.log('[distro-daemon] Running distribution cycle...');
  ensureDirs();
  buildPackages();
  generateUpstreamPatches();
  generateSnippets();
  console.log('[distro-daemon] Cycle complete');
}

async function main(): Promise<void> {
  console.error('[distro-daemon] Starting...');
  await runCycle();
  setInterval(runCycle, INTERVAL_MS);
}

main().catch(console.error);
