import { test, expect } from '@playwright/test';

const MOCK_USERS = [
  { id: '1', email: 'admin@test.com', name: 'Admin User', role: 'admin' },
  { id: '2', email: 'user@test.com', name: 'Regular User', role: 'user' },
];

const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJhZG1pbkB0ZXN0LmNvbSIsInJvbGUiOiJhZG1pbiJ9.demo-signature';

function setupMockRoutes(page) {
  return Promise.all([
    page.route('**/admin/users/search', async (route) => {
      const body = route.request().postDataJSON();
      const q = (body?.query || '').toLowerCase();
      const filtered = MOCK_USERS.filter(
        (u) => u.email.includes(q) || u.name.toLowerCase().includes(q) || u.role.includes(q),
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: filtered }),
      });
    }),
    page.route('**/admin/users/*/token', async (route) => {
      const url = route.request().url();
      const match = url.match(/\/users\/(\d+)\/token/);
      const id = match ? match[1] : null;
      const user = MOCK_USERS.find((u) => u.id === id);
      if (!user) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not found' }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: MOCK_TOKEN, user: { id: user.id, email: user.email, role: user.role }, expiresIn: 3600 }),
      });
    }),
  ]);
}

test.describe('Auth Connector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('apiforge-auth-type');
      localStorage.removeItem('apiforge-auth-config');
      localStorage.removeItem('apiforge-connector-config');
      localStorage.removeItem('apiforge-connector-token');
      window._connectorToken = null;
    });
    await page.reload();
    await setupMockRoutes(page);
    await page.locator('.tab', { hasText: 'Auth' }).click();
    await expect(page.locator('#tab-auth')).not.toHaveClass(/hidden/);
  });

  test('should show Connector option in auth type selector', {
    annotation: [
      { type: 'feature', description: 'auth-connector' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    const select = page.locator('#auth-type-select');
    const options = await select.locator('option').allTextContents();
    expect(options).toContain('Connector');
  });

  test('should display connector config fields when selected', {
    annotation: [
      { type: 'feature', description: 'auth-connector' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.locator('#auth-type-select').selectOption('connector');
    await expect(page.locator('#auth-connector-section')).not.toHaveClass(/hidden/);
    await expect(page.locator('#connector-search-url')).toBeVisible();
    await expect(page.locator('#connector-token-url')).toBeVisible();
    await expect(page.locator('#connector-save-config')).toBeVisible();
  });

  test('should save connector configuration', {
    annotation: [
      { type: 'feature', description: 'auth-connector' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Fill and save config', async () => {
      await page.locator('#auth-type-select').selectOption('connector');
      await page.locator('#connector-search-url').fill('http://localhost:3002/admin/users/search');
      await page.locator('#connector-token-url').fill('http://localhost:3002/admin/users/{id}/token');
      await page.locator('#connector-save-config').click();
    });

    await test.step('Verify: Config saved to localStorage', async () => {
      const config = await page.evaluate(() => {
        const raw = localStorage.getItem('apiforge-connector-config');
        return raw ? JSON.parse(raw) : null;
      });
      expect(config).not.toBeNull();
      expect(config.searchUrl).toBe('http://localhost:3002/admin/users/search');
      expect(config.tokenUrl).toBe('http://localhost:3002/admin/users/{id}/token');
    });
  });

  test('should search users and display results', {
    annotation: [
      { type: 'feature', description: 'auth-connector' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Configure connector', async () => {
      await page.locator('#auth-type-select').selectOption('connector');
      await page.locator('#connector-search-url').fill('http://localhost:3002/admin/users/search');
      await page.locator('#connector-token-url').fill('http://localhost:3002/admin/users/{id}/token');
      await page.locator('#connector-save-config').click();
    });

    await test.step('Action: Search for admin', async () => {
      await page.locator('#connector-search-input').fill('admin');
      await page.locator('#connector-search-btn').click();
    });

    await test.step('Verify: Results displayed', async () => {
      const results = page.locator('[data-testid="connector-user-row"]');
      await expect(results.first()).toBeVisible();
      await expect(results.first()).toContainText('admin@test.com');
    });
  });

  test('should get token for a user and show active status', {
    annotation: [
      { type: 'feature', description: 'auth-connector' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Configure and search', async () => {
      await page.locator('#auth-type-select').selectOption('connector');
      await page.locator('#connector-search-url').fill('http://localhost:3002/admin/users/search');
      await page.locator('#connector-token-url').fill('http://localhost:3002/admin/users/{id}/token');
      await page.locator('#connector-save-config').click();
      await page.locator('#connector-search-input').fill('admin');
      await page.locator('#connector-search-btn').click();
      await expect(page.locator('[data-testid="connector-user-row"]').first()).toBeVisible();
    });

    await test.step('Action: Get token', async () => {
      await page.locator('[data-testid="connector-get-token-btn"]').first().click();
    });

    await test.step('Verify: Token active', async () => {
      await expect(page.locator('#connector-active-token')).not.toHaveClass(/hidden/);
      await expect(page.locator('#connector-active-user')).toContainText('admin@test.com');
    });
  });

  test('should apply connector token to Authorization header', {
    annotation: [
      { type: 'feature', description: 'auth-connector' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Configure, search, get token', async () => {
      await page.locator('#auth-type-select').selectOption('connector');
      await page.locator('#connector-search-url').fill('http://localhost:3002/admin/users/search');
      await page.locator('#connector-token-url').fill('http://localhost:3002/admin/users/{id}/token');
      await page.locator('#connector-save-config').click();
      await page.locator('#connector-search-input').fill('admin');
      await page.locator('#connector-search-btn').click();
      await expect(page.locator('[data-testid="connector-user-row"]').first()).toBeVisible();
      await page.locator('[data-testid="connector-get-token-btn"]').first().click();
      await expect(page.locator('#connector-active-token')).not.toHaveClass(/hidden/);
    });

    await test.step('Verify: Token stored and applied', async () => {
      const token = await page.evaluate(() => window._connectorToken);
      expect(token).toBe(MOCK_TOKEN);

      let capturedAuth = null;
      await page.route('**/test-endpoint', async (route) => {
        capturedAuth = route.request().headers()['authorization'];
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      });

      await page.locator('#url-input').fill('http://localhost:3002/test-endpoint');
      await page.locator('#send-btn').click();
      await expect(page.locator('#response-status')).toBeVisible({ timeout: 5000 });
      expect(capturedAuth).toBe('Bearer ' + MOCK_TOKEN);
    });
  });

  test('should clear connector token', {
    annotation: [
      { type: 'feature', description: 'auth-connector' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Get a token', async () => {
      await page.locator('#auth-type-select').selectOption('connector');
      await page.locator('#connector-search-url').fill('http://localhost:3002/admin/users/search');
      await page.locator('#connector-token-url').fill('http://localhost:3002/admin/users/{id}/token');
      await page.locator('#connector-save-config').click();
      await page.locator('#connector-search-input').fill('admin');
      await page.locator('#connector-search-btn').click();
      await expect(page.locator('[data-testid="connector-user-row"]').first()).toBeVisible();
      await page.locator('[data-testid="connector-get-token-btn"]').first().click();
      await expect(page.locator('#connector-active-token')).not.toHaveClass(/hidden/);
    });

    await test.step('Action: Clear token', async () => {
      await page.locator('#connector-clear-token').click();
    });

    await test.step('Verify: Token cleared', async () => {
      await expect(page.locator('#connector-active-token')).toHaveClass(/hidden/);
      const token = await page.evaluate(() => window._connectorToken);
      expect(token).toBeNull();
      const stored = await page.evaluate(() => localStorage.getItem('apiforge-connector-token'));
      expect(stored).toBeNull();
    });
  });

  test('should persist connector config across reload', {
    annotation: [
      { type: 'feature', description: 'auth-connector' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Save config', async () => {
      await page.locator('#auth-type-select').selectOption('connector');
      await page.locator('#connector-search-url').fill('http://localhost:3002/admin/users/search');
      await page.locator('#connector-token-url').fill('http://localhost:3002/admin/users/{id}/token');
      await page.locator('#connector-save-config').click();
    });

    await test.step('Verify: Config persists after reload', async () => {
      await page.reload();
      await setupMockRoutes(page);
      await page.locator('.tab', { hasText: 'Auth' }).click();
      await page.locator('#auth-type-select').selectOption('connector');

      const searchUrl = await page.locator('#connector-search-url').inputValue();
      const tokenUrl = await page.locator('#connector-token-url').inputValue();
      expect(searchUrl).toBe('http://localhost:3002/admin/users/search');
      expect(tokenUrl).toBe('http://localhost:3002/admin/users/{id}/token');
    });
  });
});
