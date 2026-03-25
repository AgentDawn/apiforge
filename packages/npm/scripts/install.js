import { createWriteStream, existsSync, mkdirSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(__dirname, '..', 'bin');

const PLATFORM_MAP = {
  'darwin-x64': 'apiforge-darwin-x64',
  'darwin-arm64': 'apiforge-darwin-arm64',
  'linux-x64': 'apiforge-linux-x64',
  'linux-arm64': 'apiforge-linux-arm64',
  'win32-x64': 'apiforge-win32-x64.exe',
  'win32-arm64': 'apiforge-win32-arm64.exe',
};

function getBinaryName() {
  const key = `${process.platform}-${process.arch}`;
  const name = PLATFORM_MAP[key];
  if (!name) {
    console.warn(`Warning: No prebuilt binary for ${key}. Build from source with "cargo build --release".`);
    return null;
  }
  return name;
}

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function main() {
  const binaryName = getBinaryName();
  if (!binaryName) return;

  const dest = join(BIN_DIR, binaryName);
  if (existsSync(dest)) {
    console.log('apiforge binary already exists, skipping download.');
    return;
  }

  // TODO: Replace with actual GitHub release URL when publishing
  const version = process.env.npm_package_version || '0.1.0';
  const baseUrl = `https://github.com/user/apiforge/releases/download/v${version}`;
  const url = `${baseUrl}/${binaryName}`;

  console.log(`Downloading apiforge binary for ${process.platform}-${process.arch}...`);

  if (!existsSync(BIN_DIR)) mkdirSync(BIN_DIR, { recursive: true });

  try {
    await download(url, dest);
    if (process.platform !== 'win32') {
      chmodSync(dest, 0o755);
    }
    console.log('apiforge binary installed successfully.');
  } catch (e) {
    console.warn(`Could not download binary: ${e.message}`);
    console.warn('You can build from source: cd packages/apiforge-rs && cargo build --release');
  }
}

main();
