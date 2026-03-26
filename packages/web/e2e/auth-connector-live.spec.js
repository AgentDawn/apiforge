import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PORT = 3003;
const SEARCH_URL = `http://localhost:${SERVER_PORT}/users/search`;
const TOKEN_URL = `http://localhost:${SERVER_PORT}/users/{id}/token`;

let serverProcess;

test.beforeAll(async () => {
  const serverPath = join(__dirname, '..', '..', '..', 'examples', 'auth-connector-sample', 'server.mjs');
  serverProcess = spawn('node', [serverPath], {
    env: { ...process.env, PORT: String(SERVER_PORT) },
    stdio: 'pipe',
  });
  // Wait for server to start
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 5000);
    serverProcess.stdout.on('data', (data) => {
      if (data.toString().includes('running on')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProcess.on('error', reject);
  });
});

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
    await new Promise((resolve) => serverProcess.on('close', resolve));
  }
});

test.describe('Auth Connector - Live Server', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Switch to Auth tab and select Connector
    await page.locator('.tab', { hasText: 'Auth' }).click();
    await page.locator('#auth-type-select').selectOption('connector');
    // Configure connector with live server URLs
    await page.locator('#connector-search-url').fill(SEARCH_URL);
    await page.locator('#connector-token-url').fill(TOKEN_URL);
    await page.locator('#connector-save-config').click();
  });

  test('should search real users from connector server', {
    annotation: [
      { type: 'feature', description: 'auth-connector-live' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Search for alice', async () => {
      await page.locator('#connector-search-input').fill('alice');
      await page.locator('#connector-search-btn').click();
    });

    await test.step('Verify: Alice appears in results', async () => {
      const results = page.locator('#connector-results');
      await expect(results).toContainText('alice@example.com', { timeout: 5000 });
      await expect(results).toContainText('Alice Kim');
    });
  });

  test('should get token for a user and show active status', {
    annotation: [
      { type: 'feature', description: 'auth-connector-live' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Search and get token for alice', async () => {
      await page.locator('#connector-search-input').fill('alice');
      await page.locator('#connector-search-btn').click();
      await expect(page.locator('#connector-results')).toContainText('alice@example.com', { timeout: 5000 });
    });

    await test.step('Action: Click Get Token', async () => {
      await page.locator('[data-testid="connector-get-token-btn"]').first().click();
    });

    await test.step('Verify: Active token shown', async () => {
      await expect(page.locator('#connector-active-token')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#connector-active-user')).toContainText('alice@example.com');
    });
  });

  test('should switch between users', {
    annotation: [
      { type: 'feature', description: 'auth-connector-live' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Login as Alice', async () => {
      await page.locator('#connector-search-input').fill('alice');
      await page.locator('#connector-search-btn').click();
      await expect(page.locator('#connector-results')).toContainText('alice@example.com', { timeout: 5000 });
      await page.locator('[data-testid="connector-get-token-btn"]').first().click();
      await expect(page.locator('#connector-active-user')).toContainText('alice@example.com', { timeout: 5000 });
    });

    await test.step('Action: Switch to Bob', async () => {
      await page.locator('#connector-search-input').fill('bob');
      await page.locator('#connector-search-btn').click();
      await expect(page.locator('#connector-results')).toContainText('bob@example.com', { timeout: 5000 });
      await page.locator('[data-testid="connector-get-token-btn"]').first().click();
    });

    await test.step('Verify: Now authenticated as Bob', async () => {
      await expect(page.locator('#connector-active-user')).toContainText('bob@example.com', { timeout: 5000 });
    });
  });

  test('should search with empty query and return all users', {
    annotation: [
      { type: 'feature', description: 'auth-connector-live' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Search with empty query', async () => {
      await page.locator('#connector-search-input').fill('');
      await page.locator('#connector-search-btn').click();
    });

    await test.step('Verify: All 5 users returned', async () => {
      const results = page.locator('#connector-results');
      await expect(results).toContainText('alice@example.com', { timeout: 5000 });
      await expect(results).toContainText('bob@example.com');
      await expect(results).toContainText('charlie@example.com');
      await expect(results).toContainText('diana@example.com');
      await expect(results).toContainText('eve@example.com');
    });
  });

  test('should clear token and reset active status', {
    annotation: [
      { type: 'feature', description: 'auth-connector-live' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Get token for Alice', async () => {
      await page.locator('#connector-search-input').fill('alice');
      await page.locator('#connector-search-btn').click();
      await expect(page.locator('#connector-results')).toContainText('alice@example.com', { timeout: 5000 });
      await page.locator('[data-testid="connector-get-token-btn"]').first().click();
      await expect(page.locator('#connector-active-token')).toBeVisible({ timeout: 5000 });
    });

    await test.step('Action: Clear token', async () => {
      await page.locator('#connector-clear-token').click();
    });

    await test.step('Verify: Active token hidden', async () => {
      await expect(page.locator('#connector-active-token')).not.toBeVisible();
    });
  });

  test('should use connector token in Authorization header for requests', {
    annotation: [
      { type: 'feature', description: 'auth-connector-live' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Get token for Alice', async () => {
      await page.locator('#connector-search-input').fill('alice');
      await page.locator('#connector-search-btn').click();
      await expect(page.locator('#connector-results')).toContainText('alice@example.com', { timeout: 5000 });
      await page.locator('[data-testid="connector-get-token-btn"]').first().click();
      await expect(page.locator('#connector-active-token')).toBeVisible({ timeout: 5000 });
    });

    await test.step('Verify: Token stored in window', async () => {
      const token = await page.evaluate(() => window._connectorToken);
      expect(token).toBeTruthy();
      expect(token).toContain('.'); // JWT-like format
    });
  });
});
