import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

// Generate unique username per test run to avoid conflicts
const uniqueId = () => Math.random().toString(36).slice(2, 8);
const RUN_ID = uniqueId();

// ─── Helpers ──────────────────────────────────────────────

async function adminCreateUser(page, username, password, role = 'user') {
  await page.goto('/admin');
  await expect(page.locator('.admin-header h1')).toHaveText('APIForge Admin');

  await page.route('**/auth/login', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'admin-token-' + RUN_ID,
        user: { id: 'admin-1', username: body.username, role: 'admin' },
      }),
    });
  });

  await page.route('**/auth/register', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'user-token-' + RUN_ID,
        user: { id: 'user-' + uniqueId(), username: body.username, role: body.role || 'user' },
      }),
    });
  });

  const createdUsers = [];
  await page.route('**/api/users', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createdUsers),
    });
  });

  await page.getByTestId('admin-username').fill('admin@test.com');
  await page.getByTestId('admin-password').fill('password123');
  await page.getByTestId('admin-login-btn').click();

  await expect(page.locator('#admin-panel')).not.toHaveClass(/hidden/);
  await expect(page.getByTestId('admin-current-user')).toHaveText('admin@test.com');

  await page.getByTestId('new-username').fill(username);
  await page.getByTestId('new-password').fill(password);
  if (role === 'admin') {
    await page.getByTestId('new-role').selectOption('admin');
  }
  await page.getByTestId('create-user-btn').click();

  await expect(page.locator('#create-user-success')).toBeVisible();
  await expect(page.locator('#create-user-success')).toContainText(username);
}

async function loginUser(page, username, password = 'password123') {
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.locator('#auth-modal')).toBeVisible();
  await page.getByTestId('auth-modal-username').fill(username);
  await page.getByTestId('auth-modal-password').fill(password);
  await page.getByTestId('auth-modal-submit').click();
  await expect(page.getByTestId('app-username')).toHaveText(username);
}

async function importPetstoreSpec(page) {
  await page.evaluate((specStr) => {
    loadSpec(JSON.parse(specStr), { specMode: true });
  }, JSON.stringify(petstoreSpec));
  await expect(page.getByTestId('collection-name')).toHaveText('Petstore API');
}

async function setupLoginViaLocalStorage(page, username) {
  await page.evaluate(({ user }) => {
    localStorage.setItem('apiforge-app-auth', JSON.stringify({
      token: 'mock-token-for-' + user,
      user: { id: 'mock-id', username: user },
    }));
  }, { user: username });
  await page.reload();
  await expect(page.getByTestId('app-username')).toHaveText(username);
}

// ─── Scenario 1: First-Time Setup (Admin) ─────────────────

test.describe('Scenario 1: First-Time Setup (Admin)', () => {

  test('fresh install - register button is hidden on main page', {
    annotation: [
      { type: 'feature', description: 'first-time-setup' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('app-login-btn')).toBeVisible();
    await expect(page.getByTestId('app-register-btn')).not.toBeVisible();
  });

  test('admin page is accessible and shows login form', {
    annotation: [
      { type: 'feature', description: 'first-time-setup' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveTitle('APIForge Admin');
    await expect(page.locator('.admin-header h1')).toHaveText('APIForge Admin');
    await expect(page.getByTestId('admin-username')).toBeVisible();
    await expect(page.getByTestId('admin-password')).toBeVisible();
    await expect(page.locator('#admin-panel')).not.toBeVisible();
  });

  test('admin can login and create user accounts', {
    annotation: [
      { type: 'feature', description: 'first-time-setup' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Mock backend and login as admin', async () => {
      await page.goto('/admin');

      const createdUsers = [];

      await page.route('**/auth/login', async (route) => {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: 'admin-token',
            user: { id: 'admin-1', username: body.username, role: 'admin' },
          }),
        });
      });

      await page.route('**/auth/register', async (route) => {
        const body = route.request().postDataJSON();
        const newUser = {
          id: 'user-' + uniqueId(),
          username: body.username,
          role: body.role || 'user',
          created_at: new Date().toISOString(),
        };
        createdUsers.push(newUser);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ token: 'token-' + newUser.id, user: newUser }),
        });
      });

      await page.route('**/api/users', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createdUsers),
        });
      });

      await page.getByTestId('admin-username').fill('admin@test.com');
      await page.getByTestId('admin-password').fill('password123');
      await page.getByTestId('admin-login-btn').click();

      await expect(page.locator('#admin-panel')).not.toHaveClass(/hidden/);
      await expect(page.getByTestId('admin-current-user')).toHaveText('admin@test.com');
    });

    await test.step('Action: Create admin and regular users', async () => {
      await page.getByTestId('new-username').fill('admin_user_' + RUN_ID);
      await page.getByTestId('new-password').fill('password123');
      await page.getByTestId('new-role').selectOption('admin');
      await page.getByTestId('create-user-btn').click();
      await expect(page.locator('#create-user-success')).toBeVisible();

      await page.getByTestId('new-username').fill('regular_user_' + RUN_ID);
      await page.getByTestId('new-password').fill('password123');
      await page.getByTestId('new-role').selectOption('user');
      await page.getByTestId('create-user-btn').click();
      await expect(page.locator('#create-user-success')).toBeVisible();
      await expect(page.locator('#create-user-success')).toContainText('regular_user_' + RUN_ID);
    });

    await test.step('Verify: Users in list', async () => {
      await expect(page.getByTestId('users-tbody')).toContainText('admin_user_' + RUN_ID);
      await expect(page.getByTestId('users-tbody')).toContainText('regular_user_' + RUN_ID);
    });
  });

  test('admin login is rejected for non-admin users', {
    annotation: [
      { type: 'feature', description: 'first-time-setup' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Mock non-admin login', async () => {
      await page.goto('/admin');
      await page.route('**/auth/login', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: 'user-token',
            user: { id: 'user-1', username: 'regular@test.com', role: 'user' },
          }),
        });
      });
    });

    await test.step('Action: Login as non-admin', async () => {
      await page.getByTestId('admin-username').fill('regular@test.com');
      await page.getByTestId('admin-password').fill('password123');
      await page.getByTestId('admin-login-btn').click();
    });

    await test.step('Verify: Access denied', async () => {
      await expect(page.locator('#admin-login-error')).toBeVisible();
      await expect(page.locator('#admin-login-error')).toContainText('admin role required');
      await expect(page.locator('#admin-panel')).not.toBeVisible();
    });
  });
});

// ─── Scenario 2: User Login & First Use ───────────────────

test.describe('Scenario 2: User Login & First Use', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('login, import spec, browse endpoints, switch modes', {
    annotation: [
      { type: 'feature', description: 'user-first-use' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Mock login and collections', async () => {
      await page.route('**/auth/login', async (route) => {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: 'user-token-' + RUN_ID,
            user: { id: 'user-1', username: body.username },
          }),
        });
      });
      await page.route('**/api/collections', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        } else {
          await route.continue();
        }
      });
    });

    await test.step('Action: Login via UI', async () => {
      await expect(page.getByTestId('app-login-btn')).toBeVisible();
      await page.getByTestId('app-login-btn').click();
      await expect(page.locator('#auth-modal')).toBeVisible();
      await page.getByTestId('auth-modal-username').fill('user@test.com');
      await page.getByTestId('auth-modal-password').fill('password123');
      await page.getByTestId('auth-modal-submit').click();
      await expect(page.getByTestId('app-username')).toHaveText('user@test.com');
      await expect(page.getByTestId('app-logout-btn')).toBeVisible();
    });

    await test.step('Action: Import spec and browse', async () => {
      await importPetstoreSpec(page);
      await expect(page.getByTestId('folder-pets')).toBeVisible();
      await page.getByTestId('folder-pets').click();
      const getEndpoint = page.locator('.endpoint-item').filter({ hasText: 'GET' }).filter({ hasText: '/pets' }).first();
      await getEndpoint.click();
      await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);
    });

    await test.step('Action: Try it and switch tabs', async () => {
      await page.getByTestId('docs-try-btn').click();
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('GET');
      const urlValue = await page.locator('[data-testid="url-input"]').inputValue();
      expect(urlValue).toContain('/pets');
    });

    await test.step('Verify: Docs and client tabs work', async () => {
      const docsTab = page.locator('[data-testid="request-tab"][data-tab-type="docs"]');
      await docsTab.click();
      await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);

      const clientTab = page.locator('[data-testid="request-tab"][data-tab-type="client"]').last();
      await clientTab.click();
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('GET');
      const urlAfter = await page.locator('[data-testid="url-input"]').inputValue();
      expect(urlAfter).toContain('/pets');
    });
  });
});

// ─── Scenario 3: Full API Testing Workflow ────────────────

test.describe('Scenario 3: Full API Testing Workflow', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('import spec, configure request, send, use tabs', {
    annotation: [
      { type: 'feature', description: 'api-testing-workflow' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Login and import spec', async () => {
      await setupLoginViaLocalStorage(page, 'workflow_user');
      await importPetstoreSpec(page);
    });

    await test.step('Action: Select GET /pets and configure', async () => {
      await page.getByTestId('folder-pets').click();
      const getEndpoint = page.locator('.endpoint-item').filter({ hasText: 'GET' }).filter({ hasText: '/pets' }).first();
      await getEndpoint.click();
      await page.getByTestId('docs-try-btn').click();
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('GET');

      await page.locator('.tab', { hasText: 'Params' }).click();
      await page.getByTestId('add-param-btn').click();
      const rows = page.locator('[data-testid="params-table"] tbody tr');
      const lastRow = rows.last();
      await lastRow.locator('[data-testid="param-key"]').fill('limit');
      await lastRow.locator('[data-testid="param-value"]').fill('10');
    });

    await test.step('Action: Intercept and send request', async () => {
      let capturedUrl = '';
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.includes('/pets') && !url.includes('localhost:3001')) {
          capturedUrl = url;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ id: 1, name: 'Buddy', species: 'dog' }]),
          });
        } else {
          await route.continue();
        }
      });
      await page.getByTestId('send-btn').click();
      await expect(page.locator('[data-testid="response-status"]')).toBeVisible({ timeout: 10000 });
    });

    await test.step('Action: Open new tab with POST endpoint', async () => {
      const tabCountBefore = await page.locator('[data-testid="request-tab"]').count();
      await page.locator('[data-testid="tab-new"]').click();
      await expect(page.locator('[data-testid="request-tab"]')).toHaveCount(tabCountBefore + 1);

      const postEndpoint = page.locator('.endpoint-item').filter({ hasText: 'POST' }).first();
      await postEndpoint.click();
      await page.getByTestId('docs-try-btn').click();
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('POST');
    });

    await test.step('Verify: Tab state preserved', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await expect(page.locator('#tab-body')).not.toHaveClass(/hidden/);

      await page.evaluate(() => {
        if (window.bodyEditor) {
          window.bodyEditor.setValue('{"name": "TestPet", "species": "dog"}');
        }
      });

      const clientTabs = page.locator('[data-testid="request-tab"][data-tab-type="client"]');
      const clientCount = await clientTabs.count();
      for (let i = 0; i < clientCount; i++) {
        const tabText = await clientTabs.nth(i).textContent();
        if (tabText && tabText.includes('GET') && tabText.includes('/pets')) {
          await clientTabs.nth(i).click();
          break;
        }
      }

      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('GET');
      const firstTabUrl = await page.locator('[data-testid="url-input"]').inputValue();
      expect(firstTabUrl).toContain('/pets');
    });
  });
});

// ─── Scenario 4: Multi-Tab Workflow ───────────────────────

test.describe('Scenario 4: Multi-Tab Workflow', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('create multiple tabs, switch, modify, close', {
    annotation: [
      { type: 'feature', description: 'multi-tab-workflow' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Import spec and create tabs', async () => {
      await importPetstoreSpec(page);
      await page.getByTestId('folder-pets').click();

      const getEndpoint = page.locator('.endpoint-item').filter({ hasText: 'GET' }).filter({ hasText: '/pets' }).first();
      await getEndpoint.click();
      await page.getByTestId('docs-try-btn').click();
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('GET');

      const postEndpoint = page.locator('.endpoint-item').filter({ hasText: 'POST' }).first();
      await postEndpoint.click();
      await page.getByTestId('docs-try-btn').click();
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('POST');

      const getByIdEndpoint = page.locator('.endpoint-item').filter({ hasText: 'GET' }).filter({ hasText: '/pets/' }).first();
      if (await getByIdEndpoint.isVisible()) {
        await getByIdEndpoint.click();
        await page.getByTestId('docs-try-btn').click();
      } else {
        await page.locator('[data-testid="tab-new"]').click();
        await page.locator('[data-testid="url-input"]').fill('/pets/123');
      }
    });

    await test.step('Verify: Multiple tabs exist', async () => {
      const tabCount = await page.locator('[data-testid="request-tab"]').count();
      expect(tabCount).toBeGreaterThanOrEqual(3);
    });

    await test.step('Action: Modify POST tab body', async () => {
      const clientTabs = page.locator('[data-testid="request-tab"][data-tab-type="client"]');
      const clientCount = await clientTabs.count();
      for (let i = 0; i < clientCount; i++) {
        const tabText = await clientTabs.nth(i).textContent();
        if (tabText && tabText.includes('POST')) {
          await clientTabs.nth(i).click();
          break;
        }
      }
      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.evaluate(() => {
        if (window.bodyEditor) {
          window.bodyEditor.setValue('{"name": "ModifiedPet"}');
        }
      });
    });

    await test.step('Verify: Tab state preserved after switching', async () => {
      const clientTabs = page.locator('[data-testid="request-tab"][data-tab-type="client"]');
      const clientCount = await clientTabs.count();

      for (let i = 0; i < clientCount; i++) {
        const tabText = await clientTabs.nth(i).textContent();
        if (tabText && tabText.includes('GET')) {
          await clientTabs.nth(i).click();
          break;
        }
      }
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('GET');

      for (let i = 0; i < clientCount; i++) {
        const tabText = await clientTabs.nth(i).textContent();
        if (tabText && tabText.includes('POST')) {
          await clientTabs.nth(i).click();
          break;
        }
      }
      await page.locator('.tab', { hasText: 'Body' }).click();
      const bodyValue = await page.evaluate(() => {
        return window.bodyEditor ? window.bodyEditor.getValue() : '';
      });
      expect(bodyValue).toContain('ModifiedPet');
    });

    await test.step('Action: Close last tab', async () => {
      const tabCount = await page.locator('[data-testid="request-tab"]').count();
      const lastTab = page.locator('[data-testid="request-tab"]').last();
      await lastTab.click();
      await lastTab.locator('[data-testid="tab-close"]').click();
      const finalCount = await page.locator('[data-testid="request-tab"]').count();
      expect(finalCount).toBe(tabCount - 1);
    });
  });
});

// ─── Scenario 5: Auth Connector Workflow ──────────────────

test.describe('Scenario 5: Auth Connector Workflow', () => {

  const MOCK_USERS = [
    { id: '1', email: 'admin@test.com', name: 'Admin User', role: 'admin' },
    { id: '2', email: 'user@test.com', name: 'Regular User', role: 'user' },
  ];

  const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.connector-demo-token';

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
  });

  test('configure connector, search user, get token, send request with auth', {
    annotation: [
      { type: 'feature', description: 'auth-connector-workflow' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Mock routes and import spec', async () => {
      await page.route('**/admin/users/search', async (route) => {
        const body = route.request().postDataJSON();
        const q = (body?.query || '').toLowerCase();
        const filtered = MOCK_USERS.filter(
          (u) => u.email.includes(q) || u.name.toLowerCase().includes(q),
        );
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ users: filtered }),
        });
      });
      await page.route('**/admin/users/*/token', async (route) => {
        const url = route.request().url();
        const match = url.match(/\/users\/(\d+)\/token/);
        const id = match ? match[1] : null;
        const user = MOCK_USERS.find((u) => u.id === id);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: MOCK_TOKEN,
            user: user ? { id: user.id, email: user.email, role: user.role } : null,
            expiresIn: 3600,
          }),
        });
      });
      await importPetstoreSpec(page);
    });

    await test.step('Action: Configure connector and get token', async () => {
      await page.locator('.tab', { hasText: 'Auth' }).click();
      await expect(page.locator('#tab-auth')).not.toHaveClass(/hidden/);
      await page.locator('#auth-type-select').selectOption('connector');
      await expect(page.locator('#auth-connector-section')).not.toHaveClass(/hidden/);

      await page.locator('#connector-search-url').fill('http://localhost:3002/admin/users/search');
      await page.locator('#connector-token-url').fill('http://localhost:3002/admin/users/{id}/token');
      await page.locator('#connector-save-config').click();

      await page.locator('#connector-search-input').fill('admin');
      await page.locator('#connector-search-btn').click();
      await expect(page.locator('[data-testid="connector-user-row"]').first()).toBeVisible();
      await expect(page.locator('[data-testid="connector-user-row"]').first()).toContainText('admin@test.com');

      await page.locator('[data-testid="connector-get-token-btn"]').first().click();
      await expect(page.locator('#connector-active-token')).not.toHaveClass(/hidden/);
      await expect(page.locator('#connector-active-user')).toContainText('admin@test.com');
    });

    await test.step('Verify: Token applied to request', async () => {
      const token = await page.evaluate(() => window._connectorToken);
      expect(token).toBe(MOCK_TOKEN);

      let capturedAuth = null;
      await page.route('**/test-api-endpoint', async (route) => {
        capturedAuth = route.request().headers()['authorization'];
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      });

      await page.locator('#url-input').fill('http://localhost:3002/test-api-endpoint');
      await page.locator('#send-btn').click();
      await expect(page.locator('#response-status')).toBeVisible({ timeout: 5000 });
      expect(capturedAuth).toBe('Bearer ' + MOCK_TOKEN);
    });
  });
});

// ─── Scenario 6: Environment Variables Workflow ───────────

test.describe('Scenario 6: Environment Variables Workflow', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('apiforge-environments');
      localStorage.removeItem('apiforge-env-variables');
    });
    await page.reload();
  });

  test('add variables, use in URL and headers, verify resolution', {
    annotation: [
      { type: 'feature', description: 'env-variables-workflow' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Import spec and create environment', async () => {
      await importPetstoreSpec(page);
      await page.evaluate(() => {
        window.apiforgeEnv.addOrUpdate('Staging', {
          baseUrl: 'https://staging.example.com',
          apiKey: 'test-key-123',
        });
        window.apiforgeEnv.setActiveByName('Staging');
        if (typeof window.updateEnvVarBadge === 'function') window.updateEnvVarBadge();
      });
    });

    await test.step('Action: Open variable editor and add variable', async () => {
      await page.locator('[data-testid="env-vars-btn"]').click();
      const panel = page.locator('[data-testid="env-vars-panel"]');
      await expect(panel).not.toHaveClass(/hidden/);
      await expect(page.locator('[data-testid="env-vars-table"]')).toBeVisible();

      await page.locator('[data-testid="env-vars-add"]').click();
      const rows = page.locator('#env-vars-tbody tr');
      const lastRow = rows.last();
      await lastRow.locator('[data-testid="env-var-key"]').fill('customVar');
      await lastRow.locator('[data-testid="env-var-value"]').fill('customValue');
      await page.locator('[data-testid="env-vars-close"]').click();
      await expect(panel).toHaveClass(/hidden/);
    });

    await test.step('Verify: Variable substitution works', async () => {
      const urlResult = await page.evaluate(() => {
        return substituteVariables('{{baseUrl}}/pets', window.appState.activeEnv.variables);
      });
      expect(urlResult).toBe('https://staging.example.com/pets');

      const headerResult = await page.evaluate(() => {
        return substituteVariables('Bearer {{apiKey}}', window.appState.activeEnv.variables);
      });
      expect(headerResult).toBe('Bearer test-key-123');

      const customResult = await page.evaluate(() => {
        return substituteVariables('{{customVar}}', window.appState.activeEnv.variables);
      });
      expect(customResult).toBe('customValue');
    });
  });
});

// ─── Scenario 7: Share & cURL ─────────────────────────────

test.describe('Scenario 7: Share & cURL', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('set up request, copy cURL, generate share link, load shared request', {
    annotation: [
      { type: 'feature', description: 'share-curl-workflow' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page, context }) => {
    await test.step('Setup: Import spec and configure POST request', async () => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await importPetstoreSpec(page);
      await page.getByTestId('folder-pets').click();
      const postEndpoint = page.locator('.endpoint-item').filter({ hasText: 'POST' }).first();
      await postEndpoint.click();
      await page.getByTestId('docs-try-btn').click();
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('POST');

      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.evaluate(() => {
        if (window.bodyEditor) {
          window.bodyEditor.setValue('{"name": "ShareTestPet", "species": "cat"}');
        }
      });
    });

    await test.step('Action: Copy cURL', async () => {
      await page.locator('[data-testid="copy-curl-btn"]').click();
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('curl');
      expect(clipboardText).toContain('-X POST');
      expect(clipboardText).toContain('ShareTestPet');
    });

    await test.step('Action: Load shared request', async () => {
      const shareData = {
        method: 'POST',
        url: '/pets',
        headers: { 'Content-Type': 'application/json' },
        body: '{"name": "SharedPet"}',
        bodyType: 'json',
      };
      await page.evaluate((data) => {
        const json = JSON.stringify(data);
        const encoded = btoa(unescape(encodeURIComponent(json)));
        window.location.hash = '#/share/' + encoded;
        window.loadSharedRequest();
      }, shareData);
    });

    await test.step('Verify: Shared request loaded', async () => {
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('POST');
      await expect(page.locator('[data-testid="url-input"]')).toHaveValue('/pets');
    });
  });
});

// ─── Scenario 8: Theme & Preferences ─────────────────────

test.describe('Scenario 8: Theme & Preferences', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('apiforge-theme'));
    await page.reload();
  });

  test('switch themes and verify persistence across reload', {
    annotation: [
      { type: 'feature', description: 'theme-preferences' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Verify: Default dark theme', async () => {
      const picker = page.locator('[data-testid="theme-select"]');
      await expect(picker).toHaveValue('dark');
    });

    await test.step('Action: Switch to light and verify', async () => {
      const picker = page.locator('[data-testid="theme-select"]');
      await picker.selectOption('light');
      await expect(page.locator('html')).toHaveClass(/theme-light/);
      const lightBg = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
      );
      expect(lightBg).toBe('#f5f5fa');
    });

    await test.step('Verify: Light theme persists after reload', async () => {
      await page.reload();
      await expect(page.locator('html')).toHaveClass(/theme-light/);
      await expect(page.locator('[data-testid="theme-select"]')).toHaveValue('light');
    });

    await test.step('Action: Switch to midnight and verify', async () => {
      await page.locator('[data-testid="theme-select"]').selectOption('midnight');
      await expect(page.locator('html')).toHaveClass(/theme-midnight/);
      const midnightBg = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
      );
      expect(midnightBg).toBe('#0d0f1a');
    });

    await test.step('Verify: Midnight theme persists after reload', async () => {
      await page.reload();
      await expect(page.locator('html')).toHaveClass(/theme-midnight/);
      await expect(page.locator('[data-testid="theme-select"]')).toHaveValue('midnight');
    });
  });
});
