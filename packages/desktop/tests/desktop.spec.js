/**
 * Tauri Desktop E2E Tests using Playwright + WebView2 CDP
 *
 * Strategy: Launch the Tauri app with WebView2 remote debugging enabled,
 * then connect Playwright to the CDP endpoint. This reuses the same
 * frontend as packages/web/public.
 *
 * Run: npx playwright test tests/desktop.spec.js
 */

import { test, expect, chromium } from '@playwright/test';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appPath = join(
  __dirname, '..', 'src-tauri', 'target', 'release', 'apiforge-desktop.exe'
);

const CDP_PORT = 9222;

let appProcess;
let browser;
let page;

test.describe('APIForge Desktop', () => {
  test.beforeAll(async () => {
    // Launch app with WebView2 remote debugging
    appProcess = spawn(appPath, [], {
      env: {
        ...process.env,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
      },
      stdio: 'ignore',
    });

    // Wait for CDP to be ready
    await new Promise((resolve) => {
      const check = async () => {
        try {
          const resp = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
          if (resp.ok) return resolve();
        } catch {}
        setTimeout(check, 500);
      };
      check();
      // Timeout after 15s
      setTimeout(resolve, 15000);
    });

    // Connect Playwright to CDP
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    const contexts = browser.contexts();
    // Find the context with actual content (not about:blank)
    for (const ctx of contexts) {
      const pages = ctx.pages();
      for (const p of pages) {
        const url = p.url();
        if (url && url !== 'about:blank') {
          page = p;
          break;
        }
      }
      if (page) break;
    }
    // Fallback: use first page and wait for content
    if (!page) {
      page = contexts[0]?.pages()[0];
    }
    if (page) {
      await page.waitForSelector('[data-testid="url-input"]', { timeout: 10000 });
    }
  });

  test.afterAll(async () => {
    if (browser) await browser.close();
    if (appProcess) appProcess.kill();
  });

  test('should have the app window with content', async () => {
    expect(page).toBeTruthy();
  });

  test('should display the URL input', async () => {
    await expect(page.getByTestId('url-input')).toBeVisible();
  });

  test('should display the HTTP method selector', async () => {
    await expect(page.getByTestId('method-select')).toBeVisible();
  });

  test('should display the Send button', async () => {
    await expect(page.getByTestId('send-btn')).toBeVisible();
  });

  test('should display import button', async () => {
    await expect(page.locator('#import-file-btn')).toBeVisible();
  });

  test('should display agent toggle button', async () => {
    await expect(page.getByTestId('agent-toggle-btn')).toBeVisible();
  });

  test('should open and close agent panel', async () => {
    await page.getByTestId('agent-toggle-btn').click();
    await expect(page.getByTestId('agent-panel')).not.toHaveClass(/hidden/);

    await page.locator('#agent-toggle-btn-close').click();
    await expect(page.getByTestId('agent-panel')).toHaveClass(/hidden/);
  });

  test('should load a spec and show collection', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Desktop Test API', version: '1.0.0' },
      paths: {
        '/test': {
          get: {
            tags: ['Test'],
            summary: 'Test endpoint',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr));
    }, JSON.stringify(spec));

    await expect(page.getByTestId('collection-name')).toHaveText('Desktop Test API');
  });

  test('should expand folder and show endpoint', async () => {
    await page.locator('.folder-header').click();
    await expect(page.getByTestId('endpoint-get--test')).toBeVisible();
  });

  test('should populate URL when endpoint is clicked', async () => {
    await page.getByTestId('endpoint-get--test').click();
    const urlInput = page.getByTestId('url-input');
    await expect(urlInput).toHaveValue(/\/test/);
  });
});
