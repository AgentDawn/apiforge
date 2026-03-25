import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const homedir = process.env.USERPROFILE || process.env.HOME;

// Path to the built Tauri binary
const appPath = join(
  __dirname,
  '..',
  'src-tauri',
  'target',
  'release',
  'apiforge-desktop.exe'
);

// Path to tauri-driver
const tauriDriverPath = join(homedir, '.cargo', 'bin', 'tauri-driver.exe');

let tauriDriver;

export const config = {
  specs: [join(__dirname, '*.spec.js')],
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'wry',
      'tauri:options': {
        application: appPath,
      },
    },
  ],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 30000,
  },

  // Start tauri-driver before tests
  onPrepare() {
    tauriDriver = spawn(tauriDriverPath, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Wait for driver to be ready
    return new Promise((resolve) => {
      tauriDriver.stdout.on('data', (data) => {
        if (data.toString().includes('listening')) resolve();
      });
      // Fallback timeout
      setTimeout(resolve, 3000);
    });
  },

  onComplete() {
    if (tauriDriver) tauriDriver.kill();
  },

  hostname: '127.0.0.1',
  port: 4444,
};
