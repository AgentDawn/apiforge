import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadAuth, getToken, serverFetch } from '../../../packages/cli/src/commands/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

const uniqueId = () => 'cli_' + Math.random().toString(36).slice(2, 8);

// Use temp data dir to avoid polluting real ~/.apiforge
const tmpDataDir = join(__dirname, '..', 'test-results', '.apiforge-cli-test');

test.beforeAll(() => {
  mkdirSync(tmpDataDir, { recursive: true });
});

test.afterAll(() => {
  if (existsSync(tmpDataDir)) rmSync(tmpDataDir, { recursive: true, force: true });
});

// ─── Auth Command Tests ──────────────────────────────────

test.describe('CLI Auth', () => {
  const username = uniqueId();
  const password = 'testpass123';

  test('should register a new user via CLI auth module', async ({ page, request }) => {
    // Register via server API (same as CLI would do)
    const resp = await request.post('/auth/register', {
      data: { username, password },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.token).toBeTruthy();
    expect(data.user.username).toBe(username);

    // Verify the token works — login in browser with same credentials
    await page.goto('/');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.getByTestId('auth-modal-username').fill(username);
    await page.getByTestId('auth-modal-password').fill(password);
    await page.getByTestId('auth-modal-submit').click();
    await expect(page.getByTestId('app-username')).toHaveText(username);
  });

  test('should login with existing credentials', async ({ request }) => {
    const resp = await request.post('/auth/login', {
      data: { username, password },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.token).toBeTruthy();
    expect(data.user.username).toBe(username);
  });

  test('should reject wrong password', async ({ request }) => {
    const resp = await request.post('/auth/login', {
      data: { username, password: 'wrongpassword' },
    });
    expect(resp.ok()).toBeFalsy();
    expect(resp.status()).toBe(401);
  });

  test('should reject duplicate registration', async ({ request }) => {
    const resp = await request.post('/auth/register', {
      data: { username, password },
    });
    expect(resp.ok()).toBeFalsy();
    expect(resp.status()).toBe(409);
  });

  test('loadAuth should return null when no auth file exists', async ({ page }) => {
    const auth = loadAuth(tmpDataDir);
    expect(auth).toBeNull();

    // Verify not-logged-in state in browser
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });
});

// ─── Collections Command Tests ───────────────────────────

test.describe('CLI Collections', () => {
  let authToken;
  let savedColId;
  const username = uniqueId();
  const password = 'testpass123';

  test.beforeAll(async ({ request }) => {
    // Register user for collection tests
    const resp = await request.post('/auth/register', {
      data: { username, password },
    });
    const data = await resp.json();
    authToken = data.token;
  });

  test('should save a collection to server', async ({ request }) => {
    const resp = await request.post('/api/collections', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Petstore CLI Test',
        spec: JSON.stringify(petstoreSpec),
      },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.id).toBeTruthy();
    expect(data.name).toBe('Petstore CLI Test');
    savedColId = data.id;
  });

  test('should list collections from server', async ({ request }) => {
    const resp = await request.get('/api/collections', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.length).toBeGreaterThan(0);
    const found = data.find(c => c.id === savedColId);
    expect(found).toBeTruthy();
    expect(found.name).toBe('Petstore CLI Test');
  });

  test('should get collection detail with spec', async ({ request }) => {
    const resp = await request.get(`/api/collections/${savedColId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.name).toBe('Petstore CLI Test');
    expect(data.spec).toBeTruthy();
    const spec = JSON.parse(data.spec);
    expect(spec.openapi).toBeTruthy();
    expect(spec.paths).toBeDefined();
  });

  test('should load server collection in browser UI', async ({ page }) => {
    await page.goto('/');

    // Login
    await page.getByRole('button', { name: 'Login' }).click();
    await page.getByTestId('auth-modal-username').fill(username);
    await page.getByTestId('auth-modal-password').fill(password);
    await page.getByTestId('auth-modal-submit').click();
    await expect(page.getByTestId('app-username')).toHaveText(username);

    // Wait for collections sidebar to show saved collection
    const colName = page.locator('.saved-collection-name', { hasText: 'Petstore CLI Test' });
    await expect(colName).toBeVisible({ timeout: 5000 });

    // Click collection name to load it
    await colName.click();

    // Verify spec loaded
    await expect(page.getByTestId('collection-name')).toBeVisible();
  });

  test('should delete collection from server', async ({ request }) => {
    const resp = await request.delete(`/api/collections/${savedColId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(resp.ok()).toBeTruthy();

    // Verify deleted
    const listResp = await request.get('/api/collections', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await listResp.json();
    const found = (data || []).find(c => c.id === savedColId);
    expect(found).toBeFalsy();
  });
});

// ─── API Token Tests ─────────────────────────────────────

test.describe('CLI API Tokens', () => {
  let authToken;
  let apiTokenRaw;
  let apiTokenId;
  const username = uniqueId();
  const password = 'testpass123';

  test.beforeAll(async ({ request }) => {
    const resp = await request.post('/auth/register', {
      data: { username, password },
    });
    const data = await resp.json();
    authToken = data.token;
  });

  test('should create an API token', async ({ request }) => {
    const resp = await request.post('/api/tokens', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name: 'CI Pipeline', expiresInDays: 30 },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.token).toBeTruthy();
    expect(data.token.startsWith('afk_')).toBeTruthy();
    expect(data.apiToken.name).toBe('CI Pipeline');
    expect(data.apiToken.id).toBeTruthy();
    expect(data.apiToken.prefix).toBeTruthy();
    apiTokenRaw = data.token;
    apiTokenId = data.apiToken.id;
  });

  test('should list API tokens', async ({ request }) => {
    const resp = await request.get('/api/tokens', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.length).toBe(1);
    expect(data[0].name).toBe('CI Pipeline');
    expect(data[0].prefix).toBe(apiTokenRaw.slice(0, 12));
  });

  test('should authenticate with API token (APIFORGE_TOKEN)', async ({ request }) => {
    // Use the API token directly as Bearer token (like CI would)
    const resp = await request.get('/api/collections', {
      headers: { Authorization: `Bearer ${apiTokenRaw}` },
    });
    expect(resp.ok()).toBeTruthy();
    // Should return empty array (no collections for this user yet)
    const data = await resp.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('should create collection with API token', async ({ request }) => {
    const resp = await request.post('/api/collections', {
      headers: { Authorization: `Bearer ${apiTokenRaw}` },
      data: {
        name: 'CI Collection',
        spec: JSON.stringify(petstoreSpec),
      },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.name).toBe('CI Collection');
  });

  test('should reject invalid API token', async ({ request }) => {
    const resp = await request.get('/api/collections', {
      headers: { Authorization: 'Bearer afk_invalidtoken123456789012345678901234' },
    });
    expect(resp.ok()).toBeFalsy();
    expect(resp.status()).toBe(401);
  });

  test('getToken should prefer APIFORGE_TOKEN env var', () => {
    const original = process.env.APIFORGE_TOKEN;
    process.env.APIFORGE_TOKEN = 'afk_test_env_token';
    expect(getToken(tmpDataDir)).toBe('afk_test_env_token');
    if (original) {
      process.env.APIFORGE_TOKEN = original;
    } else {
      delete process.env.APIFORGE_TOKEN;
    }
  });

  test('should revoke API token', async ({ request }) => {
    const resp = await request.delete(`/api/tokens/${apiTokenId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(resp.ok()).toBeTruthy();

    // Verify revoked token no longer works
    const resp2 = await request.get('/api/collections', {
      headers: { Authorization: `Bearer ${apiTokenRaw}` },
    });
    expect(resp2.ok()).toBeFalsy();
    expect(resp2.status()).toBe(401);
  });
});
