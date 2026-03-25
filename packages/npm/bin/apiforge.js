#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getBinaryName() {
  const platform = process.platform;
  const arch = process.arch;
  const ext = platform === 'win32' ? '.exe' : '';
  return `apiforge-${platform}-${arch}${ext}`;
}

function findBinary() {
  // 1. Local binary (downloaded by postinstall)
  const localBin = join(__dirname, '..', 'bin', getBinaryName());
  if (existsSync(localBin)) return localBin;

  // 2. Development: built binary in workspace
  const devBin = join(__dirname, '..', '..', 'apiforge-rs', 'target', 'release', `apiforge${process.platform === 'win32' ? '.exe' : ''}`);
  if (existsSync(devBin)) return devBin;

  const devBinDebug = join(__dirname, '..', '..', 'apiforge-rs', 'target', 'debug', `apiforge${process.platform === 'win32' ? '.exe' : ''}`);
  if (existsSync(devBinDebug)) return devBinDebug;

  console.error('Error: apiforge binary not found.');
  console.error('Run "npm run postinstall" or build from source with "cargo build --release"');
  process.exit(1);
}

const binary = findBinary();
try {
  execFileSync(binary, process.argv.slice(2), { stdio: 'inherit' });
} catch (e) {
  process.exit(e.status || 1);
}
