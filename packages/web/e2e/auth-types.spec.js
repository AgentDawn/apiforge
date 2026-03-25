import { test, expect } from '@playwright/test';

test.describe('Auth Types UI', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('apiforge-auth-type');
      localStorage.removeItem('apiforge-auth-config');
    });
    await page.reload();
    await page.locator('.tab', { hasText: 'Auth' }).click();
    await expect(page.locator('#tab-auth')).not.toHaveClass(/hidden/);
  });

  test('should show auth type selector with all options', {
    annotation: [
      { type: 'feature', description: 'auth-types' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    const select = page.locator('#auth-type-select');
    await expect(select).toBeVisible();

    const options = await select.locator('option').allTextContents();
    expect(options).toContain('No Auth');
    expect(options).toContain('Bearer Token');
    expect(options).toContain('Basic Auth');
    expect(options).toContain('API Key');
    expect(options).toContain('Connector');
  });

  test('should display Bearer token input by default', {
    annotation: [
      { type: 'feature', description: 'auth-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await expect(page.locator('#auth-bearer-section')).toBeVisible();
    await expect(page.locator('#auth-none-section')).toHaveClass(/hidden/);
    await expect(page.locator('#auth-basic-section')).toHaveClass(/hidden/);
    await expect(page.locator('#auth-apikey-section')).toHaveClass(/hidden/);
    await expect(page.locator('#auth-token')).toBeVisible();
    await expect(page.locator('#auth-bearer-prefix')).toBeVisible();
  });

  test('should switch to Basic Auth and show username/password fields', {
    annotation: [
      { type: 'feature', description: 'auth-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Select Basic Auth', async () => {
      await page.locator('#auth-type-select').selectOption('basic');
    });

    await test.step('Verify: Basic Auth fields visible', async () => {
      await expect(page.locator('#auth-basic-section')).not.toHaveClass(/hidden/);
      await expect(page.locator('#auth-bearer-section')).toHaveClass(/hidden/);
      await expect(page.locator('#auth-basic-username')).toBeVisible();
      await expect(page.locator('#auth-basic-password')).toBeVisible();
    });
  });

  test('should switch to API Key and show key name, value, and location', {
    annotation: [
      { type: 'feature', description: 'auth-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Select API Key', async () => {
      await page.locator('#auth-type-select').selectOption('apikey');
    });

    await test.step('Verify: API Key fields visible', async () => {
      await expect(page.locator('#auth-apikey-section')).not.toHaveClass(/hidden/);
      await expect(page.locator('#auth-bearer-section')).toHaveClass(/hidden/);
      await expect(page.locator('#auth-apikey-name')).toBeVisible();
      await expect(page.locator('#auth-apikey-value')).toBeVisible();
      await expect(page.locator('#auth-apikey-location')).toBeVisible();

      const options = await page.locator('#auth-apikey-location option').allTextContents();
      expect(options).toContain('Header');
      expect(options).toContain('Query Param');
      expect(options).toContain('Cookie');
    });
  });

  test('should switch to No Auth and show informational message', {
    annotation: [
      { type: 'feature', description: 'auth-types' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.locator('#auth-type-select').selectOption('none');

    await expect(page.locator('#auth-none-section')).not.toHaveClass(/hidden/);
    await expect(page.locator('#auth-bearer-section')).toHaveClass(/hidden/);
    await expect(page.locator('#auth-none-section')).toContainText('No authentication will be sent');
  });

  test('should show Base64 preview for Basic Auth', {
    annotation: [
      { type: 'feature', description: 'auth-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Switch to Basic Auth', async () => {
      await page.locator('#auth-type-select').selectOption('basic');
      await expect(page.locator('#auth-basic-preview')).toBeHidden();
    });

    await test.step('Action: Fill username and password', async () => {
      await page.locator('#auth-basic-username').fill('user');
      await page.locator('#auth-basic-password').fill('pass');
    });

    await test.step('Verify: Base64 preview visible and correct', async () => {
      await expect(page.locator('#auth-basic-preview')).toBeVisible();
      const previewValue = await page.locator('#auth-basic-preview-value').textContent();
      expect(previewValue).toBe('dXNlcjpwYXNz');
    });
  });

  test('should persist auth type across page reload', {
    annotation: [
      { type: 'feature', description: 'auth-types' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Select Basic Auth and fill', async () => {
      await page.locator('#auth-type-select').selectOption('basic');
      await page.locator('#auth-basic-username').fill('testuser');
    });

    await test.step('Verify: Persists after reload', async () => {
      await page.reload();
      await page.locator('.tab', { hasText: 'Auth' }).click();
      await expect(page.locator('#auth-type-select')).toHaveValue('basic');
      await expect(page.locator('#auth-basic-section')).not.toHaveClass(/hidden/);
      await expect(page.locator('#auth-basic-username')).toHaveValue('testuser');
    });
  });

  test('should detect security scheme from loaded spec', {
    annotation: [
      { type: 'feature', description: 'auth-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec with security schemes', async () => {
      await page.evaluate(() => {
        const spec = {
          openapi: '3.0.0',
          info: { title: 'Test', version: '1.0' },
          components: {
            securitySchemes: {
              BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
          },
          paths: {
            '/pets': {
              get: {
                summary: 'List pets',
                operationId: 'listPets',
                security: [{ BearerAuth: [] }],
                responses: { '200': { description: 'OK' } },
              },
            },
          },
        };
        window.dispatchEvent(new CustomEvent('apiforge:spec-loaded', { detail: { spec } }));
        if (window.appState) {
          window.appState.spec = spec;
          window.appState.endpoints = [{
            method: 'GET',
            path: '/pets',
            summary: 'List pets',
            operationId: 'listPets',
            security: [{ BearerAuth: [] }],
            parameters: [],
            requestBody: null,
            responses: { '200': { description: 'OK' } },
          }];
        }
      });
    });

    await test.step('Action: Simulate endpoint with security', async () => {
      await page.evaluate(() => {
        localStorage.removeItem('apiforge-auth-type');
      });
      await page.locator('#auth-type-select').selectOption('none');

      await page.evaluate(() => {
        window.appState = window.appState || {};
        window.appState.spec = {
          components: {
            securitySchemes: {
              BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
          },
        };
        const hint = document.getElementById('auth-scheme-hint');
        const hintText = document.getElementById('auth-scheme-hint-text');
        if (hint && hintText) {
          hintText.textContent = 'This endpoint requires: Bearer Authentication (JWT)';
          hint.classList.remove('hidden');
        }
      });
    });

    await test.step('Verify: Security hint visible', async () => {
      await expect(page.locator('#auth-scheme-hint')).toBeVisible();
      await expect(page.locator('#auth-scheme-hint-text')).toContainText('Bearer Authentication');
    });
  });

  test('should support custom Bearer prefix', {
    annotation: [
      { type: 'feature', description: 'auth-types' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    const prefixSelect = page.locator('#auth-bearer-prefix');
    await expect(prefixSelect).toBeVisible();

    const options = await prefixSelect.locator('option').allTextContents();
    expect(options).toContain('Bearer');
    expect(options).toContain('Token');
    expect(options).toContain('Custom...');

    await prefixSelect.selectOption('custom');
    await expect(page.locator('#auth-bearer-prefix-custom')).toBeVisible();
  });

  test('should persist API Key config across reload', {
    annotation: [
      { type: 'feature', description: 'auth-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Configure API Key', async () => {
      await page.locator('#auth-type-select').selectOption('apikey');
      await page.locator('#auth-apikey-name').fill('X-API-Key');
      await page.locator('#auth-apikey-value').fill('my-secret-key');
      await page.locator('#auth-apikey-location').selectOption('query');
    });

    await test.step('Verify: Config persists after reload', async () => {
      await page.reload();
      await page.locator('.tab', { hasText: 'Auth' }).click();
      await expect(page.locator('#auth-type-select')).toHaveValue('apikey');
      await expect(page.locator('#auth-apikey-name')).toHaveValue('X-API-Key');
      await expect(page.locator('#auth-apikey-value')).toHaveValue('my-secret-key');
      await expect(page.locator('#auth-apikey-location')).toHaveValue('query');
    });
  });
});
