#!/usr/bin/env node
/**
 * Agent: distro-publisher
 * Mandate: Publish scripts for npm/pypi + spec hosting files
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.env.PRIMORDIA_ROOT || process.cwd();
const DIST_PATH = join(ROOT, 'dist');

console.log('Distro Publisher Agent');
console.log('=======================');

// Create directories
mkdirSync(join(DIST_PATH, 'scripts'), { recursive: true });
mkdirSync(join(DIST_PATH, 'spec-site'), { recursive: true });

// NPM publish script
writeFileSync(join(DIST_PATH, 'scripts', 'publish-npm.sh'), `#!/bin/bash
# Publish @primordia/sdk to npm

set -e

cd "$(dirname "$0")/../../sdk-ts"

# Build
npm run build

# Check if logged in
npm whoami || (echo "Please run 'npm login' first" && exit 1)

# Publish
npm publish --access public

echo "Published @primordia/sdk to npm"
`);

// PyPI publish script
writeFileSync(join(DIST_PATH, 'scripts', 'publish-pypi.sh'), `#!/bin/bash
# Publish primordia-sdk to PyPI

set -e

cd "$(dirname "$0")/../../sdk-py"

# Build
python -m build

# Check if twine is installed
python -m twine --version || pip install twine

# Upload
python -m twine upload dist/*

echo "Published primordia-sdk to PyPI"
`);

// Spec site generator
const SPECS = ['MSR.md', 'FC.md', 'IAN.md', 'MBS.md', 'canonical-json.md'];
const specSitePath = join(DIST_PATH, 'spec-site');

let specHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Primordia Specifications</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #333; }
    ul { list-style: none; padding: 0; }
    li { margin: 10px 0; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .version { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Primordia Specifications</h1>
  <p class="version">Version 0.1</p>
  <ul>
`;

for (const spec of SPECS) {
  const srcPath = join(ROOT, 'spec', spec);
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, join(specSitePath, spec));
    specHtml += `    <li><a href="${spec}">${spec.replace('.md', '')}</a></li>\n`;
    console.log(`  Copied: ${spec}`);
  }
}

specHtml += `  </ul>
  <h2>SDKs</h2>
  <ul>
    <li><a href="https://npmjs.com/package/@primordia/sdk">TypeScript: @primordia/sdk</a></li>
    <li><a href="https://pypi.org/project/primordia-sdk">Python: primordia-sdk</a></li>
  </ul>
</body>
</html>`;

writeFileSync(join(specSitePath, 'index.html'), specHtml);
console.log('  Generated: index.html');

// Version file
writeFileSync(join(specSitePath, 'version.json'), JSON.stringify({
  version: '0.1.0',
  specs: {
    msr: '0.1',
    fc: '0.1',
    ian: '0.1',
    mbs: '0.1',
    canonical_json: '0.1'
  },
  updated: new Date().toISOString()
}, null, 2));

console.log('\nDistribution files ready');
console.log(`  npm: ${join(DIST_PATH, 'scripts', 'publish-npm.sh')}`);
console.log(`  pypi: ${join(DIST_PATH, 'scripts', 'publish-pypi.sh')}`);
console.log(`  specs: ${specSitePath}`);

process.exit(0);
