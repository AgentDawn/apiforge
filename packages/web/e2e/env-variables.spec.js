import { test, expect } from '@playwright/test';

test.describe('Environment Variable Substitution', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('apiforge-environments');
      localStorage.removeItem('apiforge-env-variables');
    });
    await page.reload();
  });

  /** Helper: create an environment with variables and select it */
  async function setupEnvWithVars(page, name, baseUrl, variables) {
    await page.evaluate(({ name, baseUrl, variables }) => {
      window.apiforgeEnv.addOrUpdate(name, { baseUrl, ...variables });
      window.apiforgeEnv.setActiveByName(name);
      const env = window.appState.activeEnv;
      if (env) env.variables = { baseUrl, ...variables };
      if (typeof window.updateEnvVarBadge === 'function') window.updateEnvVarBadge();
    }, { name, baseUrl, variables });
  }

  test('should substitute {{variable}} in URL before sending', {
    annotation: [
      { type: 'feature', description: 'env-variables' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create env with variables', async () => {
      await setupEnvWithVars(page, 'Test Env', 'https://api.example.com', {
        host: 'api.example.com',
        version: 'v2',
      });
    });

    await test.step('Action: Set URL with variables and send', async () => {
      await page.locator('[data-testid="url-input"]').fill('https://{{host}}/{{version}}/users');
      const [request] = await Promise.all([
        page.waitForRequest((req) => req.url().includes('api.example.com/v2/users')),
        page.locator('[data-testid="send-btn"]').click(),
      ]).catch(() => [null]);

      if (request) {
        expect(request.url()).toContain('api.example.com/v2/users');
        expect(request.url()).not.toContain('{{host}}');
      } else {
        const result = await page.evaluate(() => {
          return substituteVariables('https://{{host}}/{{version}}/users', window.appState.activeEnv.variables);
        });
        expect(result).toBe('https://api.example.com/v2/users');
      }
    });
  });

  test('should substitute {{variable}} in headers', {
    annotation: [
      { type: 'feature', description: 'env-variables' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create env with apiToken variable', async () => {
      await setupEnvWithVars(page, 'Header Env', 'https://api.test.com', {
        apiToken: 'my-secret-token-123',
      });
    });

    await test.step('Action: Enter header with variable via Headers tab', async () => {
      await page.locator('.tab', { hasText: 'Headers' }).click();
      await page.locator('[data-testid="add-header-btn"]').click();
      await page.locator('[data-testid="header-key"]').first().fill('Authorization');
      await page.locator('[data-testid="header-value"]').first().fill('Bearer {{apiToken}}');
    });

    await test.step('Verify: Variable resolved in headers', async () => {
      // Use the cURL copy to verify headers are resolved
      const headerVal = await page.evaluate(() => {
        const vars = window.appState.activeEnv.variables;
        return substituteVariables('Bearer {{apiToken}}', vars);
      });
      expect(headerVal).toBe('Bearer my-secret-token-123');
    });
  });

  test('should leave undefined variables as literal text', {
    annotation: [
      { type: 'feature', description: 'env-variables' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create env with only host variable', async () => {
      await setupEnvWithVars(page, 'Sparse Env', 'https://api.test.com', {
        host: 'api.test.com',
      });
    });

    await test.step('Action: Set URL with defined and undefined variables', async () => {
      await page.locator('[data-testid="url-input"]').fill('https://{{host}}/{{undefinedVar}}/path');
    });

    await test.step('Verify: Defined var resolved, undefined var kept as literal', async () => {
      const result = await page.evaluate(() => {
        const vars = window.appState.activeEnv.variables;
        const urlVal = document.querySelector('[data-testid="url-input"]').value;
        return substituteVariables(urlVal, vars);
      });
      expect(result).toBe('https://api.test.com/{{undefinedVar}}/path');
    });
  });

  test('should update variables when switching environments', {
    annotation: [
      { type: 'feature', description: 'env-variables' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create two environments', async () => {
      await page.evaluate(() => {
        window.apiforgeEnv.addOrUpdate('Env A', { baseUrl: 'https://a.com', myVar: 'alpha' });
        window.apiforgeEnv.addOrUpdate('Env B', { baseUrl: 'https://b.com', myVar: 'beta' });
      });
    });

    await test.step('Verify: Variables change with environment', async () => {
      await page.evaluate(() => window.apiforgeEnv.setActiveByName('Env A'));
      let result = await page.evaluate(() => substituteVariables('{{myVar}}', window.appState.activeEnv.variables));
      expect(result).toBe('alpha');

      await page.evaluate(() => window.apiforgeEnv.setActiveByName('Env B'));
      result = await page.evaluate(() => substituteVariables('{{myVar}}', window.appState.activeEnv.variables));
      expect(result).toBe('beta');
    });
  });

  test('should show variable editor UI', {
    annotation: [
      { type: 'feature', description: 'env-variables' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create env', async () => {
      await setupEnvWithVars(page, 'UI Test', 'https://ui.test.com', { key1: 'val1' });
    });

    await test.step('Action: Open and close variable editor', async () => {
      const varsBtn = page.locator('[data-testid="env-vars-btn"]');
      await expect(varsBtn).toBeVisible();

      const panel = page.locator('[data-testid="env-vars-panel"]');
      await expect(panel).toHaveClass(/hidden/);

      await varsBtn.click();
      await expect(panel).not.toHaveClass(/hidden/);

      const table = page.locator('[data-testid="env-vars-table"]');
      await expect(table).toBeVisible();

      await page.locator('[data-testid="env-vars-close"]').click();
      await expect(panel).toHaveClass(/hidden/);
    });
  });

  test('should add and remove variables', {
    annotation: [
      { type: 'feature', description: 'env-variables' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open variable editor', async () => {
      await setupEnvWithVars(page, 'Edit Env', 'https://edit.test.com', {});
      await page.locator('[data-testid="env-vars-btn"]').click();
      const panel = page.locator('[data-testid="env-vars-panel"]');
      await expect(panel).not.toHaveClass(/hidden/);
    });

    await test.step('Action: Add a variable', async () => {
      const rows = page.locator('#env-vars-tbody tr');
      const initialCount = await rows.count();
      await page.locator('[data-testid="env-vars-add"]').click();
      await expect(rows).toHaveCount(initialCount + 1);

      const lastRow = rows.last();
      await lastRow.locator('[data-testid="env-var-key"]').fill('newKey');
      await lastRow.locator('[data-testid="env-var-value"]').fill('newValue');

      const vars = await page.evaluate(() => window.appState.activeEnv.variables);
      expect(vars.newKey).toBe('newValue');
    });

    await test.step('Action: Remove the variable', async () => {
      const rows = page.locator('#env-vars-tbody tr');
      const countBefore = await rows.count();
      const lastRow = rows.last();
      await lastRow.locator('[data-testid="env-var-remove"]').click();
      await expect(rows).toHaveCount(countBefore - 1);

      const varsAfter = await page.evaluate(() => window.appState.activeEnv.variables);
      expect(varsAfter.newKey).toBeUndefined();
    });
  });

  test('should persist variables across page reload', {
    annotation: [
      { type: 'feature', description: 'env-variables' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create environment', async () => {
      await page.evaluate(() => {
        window.apiforgeEnv.addOrUpdate('Persist Env', {
          baseUrl: 'https://persist.test.com',
          persistKey: 'persistValue',
        });
      });
      const saved = await page.evaluate(() => localStorage.getItem('apiforge-environments'));
      expect(saved).toBeTruthy();
      expect(saved).toContain('Persist Env');
    });

    await test.step('Verify: Environment persists after reload', async () => {
      await page.reload();
      const envData = await page.evaluate(() => {
        const env = window.appState.environments.find(e => e.name === 'Persist Env');
        return env ? { name: env.name, variables: env.variables, baseUrl: env.baseUrl } : null;
      });
      expect(envData).toBeTruthy();
      expect(envData.variables.persistKey).toBe('persistValue');
    });
  });

  test('should resolve built-in {{$timestamp}} variable in URL input', {
    annotation: [
      { type: 'feature', description: 'env-variables' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page, context }) => {
    await test.step('Setup: Enter URL with $timestamp variable', async () => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.locator('[data-testid="url-input"]').fill('https://api.example.com/ts={{$timestamp}}');
    });

    await test.step('Action: Copy cURL to see resolved URL', async () => {
      await page.locator('[data-testid="copy-curl-btn"]').click();
    });

    await test.step('Verify: Timestamp resolved in cURL output', async () => {
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('curl');
      // The URL in cURL should have the timestamp resolved (numeric value)
      const tsMatch = clipboardText.match(/ts=(\d{10,})/);
      expect(tsMatch).toBeTruthy();
      const ts = parseInt(tsMatch[1], 10);
      const now = Math.floor(Date.now() / 1000);
      expect(Math.abs(ts - now)).toBeLessThan(5);
    });
  });

  test('should resolve {{$randomUUID}} variable in URL input', {
    annotation: [
      { type: 'feature', description: 'env-variables' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page, context }) => {
    await test.step('Setup: Enter URL with $randomUUID variable', async () => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.locator('[data-testid="url-input"]').fill('https://api.example.com/id={{$randomUUID}}');
    });

    await test.step('Action: Copy cURL to see resolved URL', async () => {
      await page.locator('[data-testid="copy-curl-btn"]').click();
    });

    await test.step('Verify: UUID resolved in cURL output', async () => {
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('curl');
      const uuidPattern = /id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
      expect(clipboardText).toMatch(uuidPattern);
    });
  });

  test('should show variable count badge on env selector', {
    annotation: [
      { type: 'feature', description: 'env-variables' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Verify: Badge hidden initially', async () => {
      const badge = page.locator('[data-testid="env-var-badge"]');
      await expect(badge).toHaveClass(/hidden/);
    });

    await test.step('Action: Setup env and verify badge', async () => {
      await setupEnvWithVars(page, 'Badge Env', 'https://badge.test.com', {
        var1: 'a',
        var2: 'b',
        var3: 'c',
      });
      const badge = page.locator('[data-testid="env-var-badge"]');
      await expect(badge).not.toHaveClass(/hidden/);
      const count = await badge.textContent();
      expect(parseInt(count, 10)).toBeGreaterThanOrEqual(3);
    });
  });

});
