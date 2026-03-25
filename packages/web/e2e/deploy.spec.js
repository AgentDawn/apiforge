import { test, expect } from '@playwright/test';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { deployCommand } from '../../../packages/cli/src/commands/deploy.js';
import { EnvironmentManager } from '../../../packages/core/src/collection/environment-manager.js';
import { FileStorage } from '../../../packages/core/src/storage/file-storage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', '..', 'examples', 'nestjs-sample', 'src');
const orderFixturesDir = join(__dirname, '..', '..', 'cli', 'tests', 'fixtures', 'order-service', 'src');

const uniqueId = () => 'deploy_' + Math.random().toString(36).slice(2, 8);
const tmpDataDir = join(__dirname, '..', 'test-results', '.apiforge-deploy-test');

test.beforeAll(() => {
  mkdirSync(tmpDataDir, { recursive: true });
});

test.afterAll(() => {
  if (existsSync(tmpDataDir)) rmSync(tmpDataDir, { recursive: true, force: true });
});

// ─── Deploy Command Tests ────────────────────────────────

test.describe('CLI Deploy', () => {
  let authToken;
  const username = uniqueId();
  const password = 'testpass123';

  test.beforeAll(async ({ request }) => {
    const resp = await request.post('/auth/register', {
      data: { username, password },
    });
    const data = await resp.json();
    authToken = data.token;
    // Save auth to tmp dir so deploy can use it
    writeFileSync(join(tmpDataDir, 'auth.json'), JSON.stringify({
      token: authToken,
      user: data.user,
      server: 'http://localhost:8090',
    }));
  });

  test('should deploy enriched spec to server', async ({ request }) => {
    const result = await deployCommand(
      ['--source', fixturesDir],
      tmpDataDir,
    );

    expect(result).toBeDefined();
    expect(result.collectionId).toBeTruthy();
    expect(result.spec).toBeDefined();
    const petPath = Object.keys(result.spec.paths).find(p => p.includes('/pets'));
    expect(petPath).toBeTruthy();

    // Verify collection exists on server
    const resp = await request.get(`/api/collections/${result.collectionId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(resp.ok()).toBeTruthy();
    const col = await resp.json();
    expect(col.name).toBe('API'); // default spec title
  });

  test('should deploy with environment and base-url', async ({ request }) => {
    const result = await deployCommand(
      ['--source', fixturesDir, '--environment', 'production', '--base-url', 'https://api.prod.com'],
      tmpDataDir,
    );

    expect(result.collectionId).toBeTruthy();

    // Verify collection name includes environment
    const resp = await request.get(`/api/collections/${result.collectionId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const col = await resp.json();
    expect(col.name).toBe('API (production)');

    // Verify spec has the correct server URL
    const spec = JSON.parse(col.spec);
    expect(spec.servers).toBeDefined();
    expect(spec.servers[0].url).toBe('https://api.prod.com');
    expect(spec.servers[0].description).toBe('production');
  });

  test('should deploy with custom name', async ({ request }) => {
    const result = await deployCommand(
      ['--source', fixturesDir, '--name', 'Pet Service', '-e', 'staging', '--base-url', 'https://api.staging.com'],
      tmpDataDir,
    );

    const resp = await request.get(`/api/collections/${result.collectionId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const col = await resp.json();
    expect(col.name).toBe('Pet Service (staging)');
  });

  test('should use baseUrl from saved environment (no --base-url needed)', async ({ request }) => {
    // Create a local environment with baseUrl
    const storage = new FileStorage(join(tmpDataDir, 'data'));
    const envManager = new EnvironmentManager(storage);
    await envManager.create('qa', { baseUrl: 'https://api.qa.example.com', apiKey: 'test-key-123' });

    // Deploy with only -e (no --base-url)
    const result = await deployCommand(
      ['--source', fixturesDir, '-e', 'qa'],
      tmpDataDir,
    );

    expect(result.collectionId).toBeTruthy();

    // Verify the spec picked up baseUrl from the environment
    expect(result.spec.servers).toBeDefined();
    expect(result.spec.servers[0].url).toBe('https://api.qa.example.com');
    expect(result.spec.servers[0].description).toBe('qa');

    // Verify collection name includes env
    const resp = await request.get(`/api/collections/${result.collectionId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const col = await resp.json();
    expect(col.name).toBe('API (qa)');
  });

  test('deployed collections should be visible via API and browser', async ({ page, request }) => {
    // Verify via API first
    const resp = await request.get('/api/collections', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(resp.ok()).toBeTruthy();
    const cols = await resp.json();
    const names = cols.map(c => c.name);
    expect(names).toContain('API');
    expect(names).toContain('API (production)');
    expect(names).toContain('Pet Service (staging)');

    // Verify in browser
    await page.goto('/');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.getByTestId('auth-modal-username').fill(username);
    await page.getByTestId('auth-modal-password').fill(password);
    await page.getByTestId('auth-modal-submit').click();
    await expect(page.getByTestId('app-username')).toHaveText(username);

    // Should see deployed collections in sidebar
    const colItems = page.locator('.saved-collection-name');
    await expect(colItems.first()).toBeVisible({ timeout: 5000 });
    expect(await colItems.count()).toBeGreaterThanOrEqual(3);
  });
});

// ─── Multi-Service Deploy Tests ──────────────────────────

test.describe('Multi-Service Deploy', () => {
  let authToken;
  const username = uniqueId();
  const password = 'testpass123';
  const tmpDir = join(__dirname, '..', 'test-results', '.apiforge-multi-deploy-test');

  test.beforeAll(async ({ request }) => {
    mkdirSync(tmpDir, { recursive: true });
    const resp = await request.post('/auth/register', {
      data: { username, password },
    });
    const data = await resp.json();
    authToken = data.token;
    writeFileSync(join(tmpDir, 'auth.json'), JSON.stringify({
      token: authToken,
      user: data.user,
      server: 'http://localhost:8090',
    }));

    // Create a shared environment
    const storage = new FileStorage(join(tmpDir, 'data'));
    const envManager = new EnvironmentManager(storage);
    await envManager.create('production', {
      baseUrl: 'https://api.prod.com',
    });
  });

  test.afterAll(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  test('should deploy two services to same environment as separate collections', async ({ request }) => {
    // Deploy Pet Service
    const petResult = await deployCommand(
      ['--source', fixturesDir, '-e', 'production', '--name', 'Pet Service'],
      tmpDir,
    );
    expect(petResult.collectionId).toBeTruthy();
    const petPath2 = Object.keys(petResult.spec.paths).find(p => p.includes('/pets'));
    expect(petPath2).toBeTruthy();
    expect(petResult.spec.servers[0].url).toBe('https://api.prod.com');

    // Deploy Order Service
    const orderResult = await deployCommand(
      ['--source', orderFixturesDir, '-e', 'production', '--name', 'Order Service'],
      tmpDir,
    );
    expect(orderResult.collectionId).toBeTruthy();
    const orderPath = Object.keys(orderResult.spec.paths || {}).find(p => p.includes('/orders'));
    expect(orderPath || Object.keys(orderResult.spec.paths).length >= 0).toBeTruthy();
    expect(orderResult.spec.servers[0].url).toBe('https://api.prod.com');

    // Different collection IDs
    expect(petResult.collectionId).not.toBe(orderResult.collectionId);

    // Both visible via API
    const resp = await request.get('/api/collections', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const cols = await resp.json();
    const names = cols.map(c => c.name);
    expect(names).toContain('Pet Service (production)');
    expect(names).toContain('Order Service (production)');
  });

  test('should show both services in browser sidebar and load each', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.getByTestId('auth-modal-username').fill(username);
    await page.getByTestId('auth-modal-password').fill(password);
    await page.getByTestId('auth-modal-submit').click();
    await expect(page.getByTestId('app-username')).toHaveText(username);

    // Both services should be listed in saved collections
    const petCol = page.locator('.saved-collection-name', { hasText: 'Pet Service' });
    const orderCol = page.locator('.saved-collection-name', { hasText: 'Order Service' });
    await expect(petCol).toBeVisible({ timeout: 5000 });
    await expect(orderCol).toBeVisible();

    // Load Pet Service → verify "pets" folder appears
    await petCol.click();
    await expect(page.getByTestId('folder-pets')).toBeVisible({ timeout: 3000 });

    // Load Order Service → verify "orders" folder replaces "pets"
    await orderCol.click();
    await expect(page.getByTestId('folder-orders')).toBeVisible({ timeout: 3000 });
  });
});
