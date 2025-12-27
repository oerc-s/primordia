#!/usr/bin/env node
/**
 * Hook: zero-UI enforcement
 * FAIL HARD if UI/dashboard code found
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Forbidden patterns
const FORBIDDEN = [
  'react',
  'vue',
  'angular',
  'svelte',
  'dashboard',
  'frontend',
  'ui-components',
  '<html',
  'createElement',
  'render(',
  'styled-components',
  'tailwind',
  'css-in-js'
];

// Allowed exceptions
const ALLOWED_FILES = [
  'index.html', // Static spec site
  'announce.md' // Marketing
];

function checkFile(path) {
  const content = readFileSync(path, 'utf-8').toLowerCase();
  const violations = [];

  for (const pattern of FORBIDDEN) {
    if (content.includes(pattern.toLowerCase())) {
      violations.push(pattern);
    }
  }

  return violations;
}

function walkDir(dir, violations = []) {
  if (!existsSync(dir)) return violations;

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);

    // Skip node_modules and dist
    if (entry.name === 'node_modules' || entry.name === '.git') continue;

    // Skip allowed files
    if (ALLOWED_FILES.includes(entry.name)) continue;

    if (entry.isDirectory()) {
      walkDir(path, violations);
    } else if (entry.isFile() && /\.(js|ts|jsx|tsx|json)$/.test(entry.name)) {
      const fileViolations = checkFile(path);
      if (fileViolations.length > 0) {
        violations.push({ file: path, patterns: fileViolations });
      }
    }
  }

  return violations;
}

// Check main directories
const dirsToCheck = ['sdk-ts/src', 'sdk-py', 'clearing-kernel/src', 'agents', 'daemons'];

let allViolations = [];

for (const dir of dirsToCheck) {
  const violations = walkDir(join(ROOT, dir));
  allViolations.push(...violations);
}

// Filter out false positives
allViolations = allViolations.filter(v => {
  // Allow <html in static file generators (distro-publisher, distro-daemon)
  if (v.file.includes('spec-site') || v.file.includes('snippets')) return false;
  if (v.file.includes('distro-publisher') || v.file.includes('distro-daemon')) return false;
  // Allow 'render' if it's about rendering text
  if (v.patterns.length === 1 && v.patterns[0] === 'render(') return false;
  return true;
});

if (allViolations.length > 0) {
  console.error('FAIL: UI patterns detected');
  for (const v of allViolations) {
    console.error(`  ${v.file}: ${v.patterns.join(', ')}`);
  }
  process.exit(1);
}

console.log('PASS: zero-ui');
