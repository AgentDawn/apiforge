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

// ─── Helpers ──────────────────────────────────────────────

async function enableRegistration(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('#app-register-btn');
    if (btn) btn.classList.remove('hidden');
  });
}

async function registerViaUI(page, username, password = 'password123') {
  await enableRegistration(page);
  await page.getByRole('button', { name: 'Register' }).click();
  await page.getByTestId('auth-modal-username').fill(username);
  await page.getByTestId('auth-modal-password').fill(password);
  await page.getByTestId('auth-modal-submit').click();
  await expect(page.getByTestId('app-username')).toHaveText(username);
}

async function loginViaUI(page, username, password = 'password123') {
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByTestId('auth-modal-username').fill(username);
  await page.getByTestId('auth-modal-password').fill(password);
  await page.getByTestId('auth-modal-submit').click();
}

async function registerViaAPI(request, username, password = 'password123') {
  const resp = await request.post('/auth/register', {
    data: { username, password },
  });
  return resp.json();
}

// ─── App Auth Tests ───────────────────────────────────────

test.describe('App Auth - Register/Login/Logout', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('should show login button and hide register button by default', {
    annotation: [
      { type: 'feature', description: 'app-auth' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await expect(page.getByTestId('app-login-btn')).toBeVisible();
    await expect(page.getByTestId('app-register-btn')).not.toBeVisible();
    await expect(page.locator('#app-auth-logged-in')).toHaveClass(/hidden/);
  });

  test('should register a new account and be logged in', {
    annotation: [
      { type: 'feature', description: 'app-auth' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Enable registration', async () => {
      const username = 'test_' + uniqueId();
      await enableRegistration(page);
      await page.getByTestId('app-register-btn').click();
      await expect(page.locator('#auth-modal')).toBeVisible();
      await expect(page.locator('#auth-modal-title')).toHaveText('Register');

      await page.getByTestId('auth-modal-username').fill(username);
      await page.getByTestId('auth-modal-password').fill('password123');
      await page.getByTestId('auth-modal-submit').click();

      await expect(page.getByTestId('app-username')).toHaveText(username);
      await expect(page.locator('#app-auth-logged-out')).toHaveClass(/hidden/);
    });
  });

  test('should login with existing account', {
    annotation: [
      { type: 'feature', description: 'app-auth' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page, request }) => {
    await test.step('Setup: Register via API', async () => {
      const username = 'login_' + uniqueId();
      await registerViaAPI(request, username);
      await loginViaUI(page, username);
      await expect(page.getByTestId('app-username')).toHaveText(username);
    });
  });

  test('should show error for invalid login', {
    annotation: [
      { type: 'feature', description: 'app-auth' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await loginViaUI(page, 'nonexistent_' + uniqueId(), 'wrongpass');
    await expect(page.getByTestId('auth-modal-error')).toBeVisible();
    await expect(page.getByTestId('auth-modal-error')).toContainText('invalid');
  });

  test('should validate password length on register', {
    annotation: [
      { type: 'feature', description: 'app-auth' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await enableRegistration(page);
    await page.getByTestId('app-register-btn').click();
    await page.getByTestId('auth-modal-username').fill('short_' + uniqueId());
    await page.getByTestId('auth-modal-password').fill('short');
    await page.getByTestId('auth-modal-submit').click();

    await expect(page.getByTestId('auth-modal-error')).toBeVisible();
    await expect(page.getByTestId('auth-modal-error')).toContainText('6 characters');
  });

  test('should logout and show login button again', {
    annotation: [
      { type: 'feature', description: 'app-auth' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page, request }) => {
    await test.step('Setup: Login', async () => {
      const username = 'logout_' + uniqueId();
      await registerViaAPI(request, username);
      await loginViaUI(page, username);
      await expect(page.getByTestId('app-username')).toHaveText(username);
    });

    await test.step('Action: Logout', async () => {
      await page.getByTestId('app-logout-btn').click();
    });

    await test.step('Verify: Logged out state', async () => {
      await expect(page.getByTestId('app-login-btn')).toBeVisible();
      await expect(page.getByTestId('app-register-btn')).not.toBeVisible();
      await expect(page.locator('#app-auth-logged-in')).toHaveClass(/hidden/);
      const saved = await page.evaluate(() => localStorage.getItem('apiforge-app-auth'));
      expect(saved).toBeNull();
    });
  });

  test('should close modal on cancel', {
    annotation: [
      { type: 'feature', description: 'app-auth' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.locator('#auth-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#auth-modal')).not.toBeVisible();
  });

  test('should persist login across page reload', {
    annotation: [
      { type: 'feature', description: 'app-auth' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Register and reload', async () => {
      const username = 'persist_' + uniqueId();
      await registerViaUI(page, username);
      await page.reload();
    });

    await test.step('Verify: Still logged in', async () => {
      await expect(page.getByTestId('app-username')).toBeVisible();
      await expect(page.locator('#app-auth-logged-in')).not.toHaveClass(/hidden/);
    });
  });
  test('should show server URL field in login modal', {
    annotation: [
      { type: 'feature', description: 'app-auth' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.locator('#auth-modal')).toBeVisible();
    await expect(page.getByTestId('auth-modal-server')).toBeVisible();
  });

  test('should save server URL to localStorage on login', {
    annotation: [
      { type: 'feature', description: 'app-auth' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.getByRole('button', { name: 'Login' }).click();
    await page.getByTestId('auth-modal-server').fill('http://localhost:8090');
    await page.getByTestId('auth-modal-username').fill('testuser');
    await page.getByTestId('auth-modal-password').fill('password123');
    await page.getByTestId('auth-modal-submit').click();
    // Server URL should be saved regardless of login success
    const savedUrl = await page.evaluate(() => localStorage.getItem('apiforge-server-url'));
    expect(savedUrl).toBe('http://localhost:8090');
  });

  test('should restore server URL when reopening modal', {
    annotation: [
      { type: 'feature', description: 'app-auth' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Save server URL', async () => {
      await page.evaluate(() => localStorage.setItem('apiforge-server-url', 'https://api.example.com'));
    });

    await test.step('Verify: URL restored in modal', async () => {
      await page.getByRole('button', { name: 'Login' }).click();
      await expect(page.getByTestId('auth-modal-server')).toHaveValue('https://api.example.com');
    });
  });

  test('should strip trailing slash from server URL', {
    annotation: [
      { type: 'feature', description: 'app-auth' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.getByRole('button', { name: 'Login' }).click();
    await page.getByTestId('auth-modal-server').fill('http://localhost:8090/');
    await page.getByTestId('auth-modal-username').fill('testuser');
    await page.getByTestId('auth-modal-password').fill('password123');
    await page.getByTestId('auth-modal-submit').click();
    const savedUrl = await page.evaluate(() => localStorage.getItem('apiforge-server-url'));
    expect(savedUrl).toBe('http://localhost:8090');
  });
});

// ─── Collection CRUD Tests ────────────────────────────────

test.describe('Collection CRUD', () => {

  let username;
  let authToken;

  test.beforeAll(async ({ request }) => {
    username = 'coluser_' + uniqueId();
    const data = await registerViaAPI(request, username);
    authToken = data.token;
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('apiforge-app-auth', JSON.stringify({ token, user }));
    }, { token: authToken, user: { id: 'x', username } });
    await page.reload();
    await expect(page.getByTestId('app-username')).toHaveText(username);
  });

  test('should save current spec as collection', {
    annotation: [
      { type: 'feature', description: 'collection-crud' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec', async () => {
      await page.evaluate((specStr) => {
        loadSpec(JSON.parse(specStr));
      }, JSON.stringify(petstoreSpec));
      await expect(page.getByTestId('collection-name')).toHaveText('Petstore API');
    });

    await test.step('Action: Save collection', async () => {
      await page.getByTestId('save-collection-btn').click();
    });

    await test.step('Verify: Collection saved', async () => {
      await expect(page.getByTestId('save-collection-btn')).toHaveText('Saved!');
      await expect(page.getByTestId('saved-collections-list')).toContainText('Petstore API');
    });
  });

  test('should load a saved collection from server', {
    annotation: [
      { type: 'feature', description: 'collection-crud' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page, request }) => {
    await test.step('Setup: Save collection via API', async () => {
      await request.post('/api/collections', {
        headers: { Authorization: 'Bearer ' + authToken },
        data: { name: 'Load Test API', spec: JSON.stringify(petstoreSpec) },
      });
      await page.reload();
    });

    await test.step('Action: Load collection', async () => {
      await expect(page.getByTestId('saved-collections-list')).toContainText('Load Test API');
      await page.locator('.saved-collection-name', { hasText: 'Load Test API' }).click();
    });

    await test.step('Verify: Collection loaded', async () => {
      await expect(page.getByTestId('collection-name')).toHaveText('Petstore API');
      await expect(page.getByTestId('folder-pets')).toBeVisible();
    });
  });

  test('should delete a saved collection', {
    annotation: [
      { type: 'feature', description: 'collection-crud' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page, request }) => {
    await test.step('Setup: Save collection via API', async () => {
      await request.post('/api/collections', {
        headers: { Authorization: 'Bearer ' + authToken },
        data: { name: 'Delete Me', spec: '{}' },
      });
      await page.reload();
      await expect(page.getByTestId('saved-collections-list')).toContainText('Delete Me');
    });

    await test.step('Action: Delete collection', async () => {
      const item = page.locator('.sidebar-item', { hasText: 'Delete Me' });
      await item.locator('.saved-collection-delete').click();
    });

    await test.step('Verify: Collection deleted', async () => {
      await expect(page.getByTestId('saved-collections-list')).not.toContainText('Delete Me');
    });
  });

  test('should alert when trying to save without login', {
    annotation: [
      { type: 'feature', description: 'collection-crud' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.getByTestId('app-logout-btn').click();

    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr));
    }, JSON.stringify(petstoreSpec));

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('login');
      await dialog.accept();
    });
    await page.getByTestId('save-collection-btn').click();
  });
});
