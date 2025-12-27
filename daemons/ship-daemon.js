#!/usr/bin/env node
/**
 * Daemon: ship-daemon
 * Packages SDKs + produces dist artifacts; publishes if tokens exist
 */

import { spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SHIP_INTERVAL = 30 * 60 * 1000; // 30 minutes

function log(msg) {
  console.log(`[ship-daemon] ${new Date().toISOString()} ${msg}`);
}

function hashFile(path) {
  if (!existsSync(path)) return null;
  const content = readFileSync(path);
  return createHash('sha256').update(content).digest('hex');
}

async function buildSdkTs() {
  const sdkPath = join(ROOT, 'sdk-ts');
  if (!existsSync(join(sdkPath, 'package.json'))) {
    log('SDK-TS not found');
    return false;
  }

  log('Building SDK-TS...');
  return new Promise((resolve) => {
    const proc = spawn('npm', ['run', 'build'], {
      cwd: sdkPath,
      shell: true,
      stdio: 'pipe'
    });
    proc.on('close', (code) => {
      log(`SDK-TS build: ${code === 0 ? 'OK' : 'FAIL'}`);
      resolve(code === 0);
    });
  });
}

async function buildKernel() {
  const kernelPath = join(ROOT, 'clearing-kernel');
  if (!existsSync(join(kernelPath, 'package.json'))) {
    log('Kernel not found');
    return false;
  }

  log('Building Kernel...');
  return new Promise((resolve) => {
    const proc = spawn('npm', ['run', 'build'], {
      cwd: kernelPath,
      shell: true,
      stdio: 'pipe'
    });
    proc.on('close', (code) => {
      log(`Kernel build: ${code === 0 ? 'OK' : 'FAIL'}`);
      resolve(code === 0);
    });
  });
}

async function createArtifacts() {
  const distPath = join(ROOT, 'dist', 'packages');
  mkdirSync(distPath, { recursive: true });

  const manifest = {
    timestamp: new Date().toISOString(),
    artifacts: [],
    checksums: {}
  };

  // SDK-TS artifact info
  const sdkTsPkg = join(ROOT, 'sdk-ts', 'package.json');
  if (existsSync(sdkTsPkg)) {
    const pkg = JSON.parse(readFileSync(sdkTsPkg, 'utf-8'));
    manifest.artifacts.push({
      name: pkg.name,
      version: pkg.version,
      type: 'npm'
    });
  }

  // SDK-PY artifact info
  const sdkPyPkg = join(ROOT, 'sdk-py', 'pyproject.toml');
  if (existsSync(sdkPyPkg)) {
    manifest.artifacts.push({
      name: 'primordia-sdk',
      version: '0.1.0',
      type: 'pypi'
    });
  }

  // Write manifest
  writeFileSync(
    join(distPath, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  log(`Created ${manifest.artifacts.length} artifact entries`);
  return manifest;
}

async function publishIfTokens() {
  const npmToken = process.env.NPM_TOKEN;
  const pypiToken = process.env.PYPI_TOKEN;

  if (npmToken) {
    log('NPM_TOKEN found, would publish to npm');
    // Actual publish would go here
  } else {
    log('NPM_TOKEN not set, skipping npm publish');
  }

  if (pypiToken) {
    log('PYPI_TOKEN found, would publish to PyPI');
    // Actual publish would go here
  } else {
    log('PYPI_TOKEN not set, skipping PyPI publish');
  }
}

async function shipCycle() {
  log('Starting ship cycle...');

  // Build components
  await buildSdkTs();
  await buildKernel();

  // Create artifacts
  await createArtifacts();

  // Publish if tokens exist
  await publishIfTokens();

  log('Ship cycle complete');
}

async function main() {
  log('Starting ship-daemon');

  // Initial ship
  await shipCycle();

  // Scheduled ships
  setInterval(shipCycle, SHIP_INTERVAL);

  log('Daemon running');
}

process.on('SIGINT', () => {
  log('Shutting down');
  process.exit(0);
});

main().catch(console.error);
