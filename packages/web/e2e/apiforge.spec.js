import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

test.describe('APIForge Web UI', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ─── Scenario 1: Initial Page Load ───────────────────────
  test('should display initial UI elements', {
    annotation: [
      { type: 'feature', description: 'initial-load' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Verify: Check sidebar elements', async () => {
      await expect(page.locator('.sidebar h1')).toHaveText('APIForge');
      await expect(page.locator('.version')).toHaveText('v0.1.0');
      await expect(page.locator('#import-file-btn')).toBeVisible();
    });

    await test.step('Verify: Check request panel elements', async () => {
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('GET');
      await expect(page.locator('[data-testid="url-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="send-btn"]')).toHaveText('Send');
    });

    await test.step('Verify: Check tab bar and environment', async () => {
      await expect(page.locator('.tab.active')).toHaveText('Params');
      await expect(page.locator('[data-testid="env-selector"]')).toBeVisible();
    });

    await test.step('Verify: Check response panel', async () => {
      await expect(page.locator('#response-empty')).toBeVisible();
      await expect(page.locator('#response-content')).toHaveClass(/hidden/);
    });
  });

  // ─── Scenario 2: Tab Switching ────────────────────────────
  test('should switch between request tabs', {
    annotation: [
      { type: 'feature', description: 'tab-switching' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Switch to Headers tab', async () => {
      await page.locator('.tab', { hasText: 'Headers' }).click();
      await expect(page.locator('#tab-headers')).not.toHaveClass(/hidden/);
      await expect(page.locator('#tab-params')).toHaveClass(/hidden/);
    });

    await test.step('Action: Switch to Body tab', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await expect(page.locator('#tab-body')).not.toHaveClass(/hidden/);
      await expect(page.locator('#tab-headers')).toHaveClass(/hidden/);
    });

    await test.step('Action: Switch to Auth tab', async () => {
      await page.locator('.tab', { hasText: 'Auth' }).click();
      await expect(page.locator('#tab-auth')).not.toHaveClass(/hidden/);
      await expect(page.locator('#tab-body')).toHaveClass(/hidden/);
    });

    await test.step('Action: Switch back to Params tab', async () => {
      await page.locator('.tab', { hasText: 'Params' }).click();
      await expect(page.locator('#tab-params')).not.toHaveClass(/hidden/);
      await expect(page.locator('#tab-auth')).toHaveClass(/hidden/);
    });
  });

  // ─── Scenario 3: Import OpenAPI Spec via File Upload ──────
  test('should import OpenAPI spec and render collection tree', {
    annotation: [
      { type: 'feature', description: 'spec-import' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load petstore spec', async () => {
      const specJson = JSON.stringify(petstoreSpec);
      await page.evaluate((specStr) => {
        const spec = JSON.parse(specStr);
        loadSpec(spec, { specMode: false });
      }, specJson);
    });

    await test.step('Verify: Check collection tree rendered', async () => {
      await expect(page.locator('[data-testid="collection-name"]')).toHaveText('Petstore API');
      await expect(page.locator('[data-testid="folder-pets"]')).toBeVisible();
      await expect(page.locator('[data-testid="folder-users"]')).toBeVisible();
    });
  });

  // ─── Scenario 4: Browse Collection Tree ───────────────────
  test('should expand/collapse folders and show endpoints', {
    annotation: [
      { type: 'feature', description: 'collection-tree' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec', async () => {
      await page.evaluate((specStr) => {
        loadSpec(JSON.parse(specStr), { specMode: false });
      }, JSON.stringify(petstoreSpec));
    });

    await test.step('Action: Expand Pets folder', async () => {
      const petsFolder = page.locator('[data-testid="folder-pets"]');
      await expect(petsFolder).toBeVisible();
      await petsFolder.click();

      const petsContent = page.locator('.folder').filter({ has: page.locator('[data-testid="folder-pets"]') }).locator('.folder-content');
      await expect(petsContent).not.toHaveClass(/hidden/);

      const endpointItems = petsContent.locator('.endpoint-item');
      await expect(endpointItems).toHaveCount(4);
    });

    await test.step('Action: Collapse Pets folder', async () => {
      const petsFolder = page.locator('[data-testid="folder-pets"]');
      await petsFolder.click();
      const petsContent = page.locator('.folder').filter({ has: page.locator('[data-testid="folder-pets"]') }).locator('.folder-content');
      await expect(petsContent).toHaveClass(/hidden/);
    });
  });

  // ─── Scenario 5: Select Endpoint and Populate URL Bar ─────
  test('should populate URL and method when endpoint is selected', {
    annotation: [
      { type: 'feature', description: 'endpoint-selection' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and navigate to endpoint', async () => {
      await page.evaluate((specStr) => {
        loadSpec(JSON.parse(specStr), { specMode: false });
      }, JSON.stringify(petstoreSpec));
      await page.locator('[data-testid="folder-pets"]').click();
    });

    await test.step('Action: Click GET /pets endpoint', async () => {
      const getEndpoint = page.locator('.endpoint-item').filter({ hasText: 'GET' }).filter({ hasText: '/pets' }).first();
      await getEndpoint.click();
    });

    await test.step('Verify: Check URL and method populated', async () => {
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('GET');
      const urlValue = await page.locator('[data-testid="url-input"]').inputValue();
      expect(urlValue).toContain('/pets');
      const getEndpoint = page.locator('.endpoint-item').filter({ hasText: 'GET' }).filter({ hasText: '/pets' }).first();
      await expect(getEndpoint).toHaveClass(/active/);
    });
  });

  // ─── Scenario 6: Environment Switching ────────────────────
  test('should switch environments and update URL base', {
    annotation: [
      { type: 'feature', description: 'environment-switching' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec, create environment, select endpoint', async () => {
      await page.evaluate((specStr) => {
        loadSpec(JSON.parse(specStr), { specMode: false });
        // Manually create an environment (not from spec servers)
        appState.environments.push({ name: 'Staging', baseUrl: 'https://staging.example.com', variables: { baseUrl: 'https://staging.example.com' } });
        renderEnvironments();
      }, JSON.stringify(petstoreSpec));

      const envSelector = page.locator('[data-testid="env-selector"]');
      const options = envSelector.locator('option');
      await expect(options).toHaveCount(2); // "No Environment" + "Staging"

      await page.locator('[data-testid="folder-pets"]').click();
      const getEndpoint = page.locator('.endpoint-item').filter({ hasText: 'GET' }).filter({ hasText: '/pets' }).first();
      await getEndpoint.click();
    });

    await test.step('Action: Select Staging environment', async () => {
      const envSelector = page.locator('[data-testid="env-selector"]');
      await envSelector.selectOption({ index: 1 });
    });

    await test.step('Verify: URL includes server base', async () => {
      const urlValue = await page.locator('[data-testid="url-input"]').inputValue();
      expect(urlValue).toMatch(/^https?:\/\//);
      expect(urlValue).toContain('/pets');
    });

    await test.step('Action: Switch back to No Environment', async () => {
      const envSelector = page.locator('[data-testid="env-selector"]');
      await envSelector.selectOption({ value: '' });
      const urlAfter = await page.locator('[data-testid="url-input"]').inputValue();
      expect(urlAfter).toBe('/pets');
    });
  });

  // ─── Scenario 7: POST Endpoint with Request Body ─────────
  test('should populate body editor for POST endpoints', {
    annotation: [
      { type: 'feature', description: 'post-body' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and navigate to POST endpoint', async () => {
      await page.evaluate((specStr) => {
        loadSpec(JSON.parse(specStr), { specMode: false });
      }, JSON.stringify(petstoreSpec));
      await page.locator('[data-testid="folder-pets"]').click();
      const postEndpoint = page.locator('.endpoint-item').filter({ hasText: 'POST' }).first();
      await postEndpoint.click();
    });

    await test.step('Verify: Method is POST and body has content', async () => {
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('POST');
      const bodyValue = await page.locator('[data-testid="body-editor"]').innerText();
      expect(bodyValue.trim().length).toBeGreaterThan(0);
      expect(() => JSON.parse(bodyValue.trim())).not.toThrow();
    });

    await test.step('Verify: Headers include Content-Type', async () => {
      await page.locator('.tab', { hasText: 'Headers' }).click();
      const ctRow = page.locator('[data-testid="header-row"]').filter({ has: page.locator('[data-testid="header-key"][value="Content-Type"]') });
      await expect(ctRow).toHaveCount(1);
      await expect(ctRow.locator('[data-testid="header-value"]')).toHaveValue('application/json');
    });
  });

  // ─── Scenario 8: Auth Token Input ─────────────────────────
  test('should allow entering a bearer token', {
    annotation: [
      { type: 'feature', description: 'auth-token' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Switch to Auth tab and enter token', async () => {
      await page.locator('.tab', { hasText: 'Auth' }).click();
      await expect(page.locator('#tab-auth')).not.toHaveClass(/hidden/);
      const tokenInput = page.locator('[data-testid="auth-token"]');
      await tokenInput.fill('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
      await expect(tokenInput).toHaveValue('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
    });
  });

  // ─── Scenario 9: Manual URL Entry and Send ────────────────
  test('should allow manual URL entry and send request', {
    annotation: [
      { type: 'feature', description: 'manual-request' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Enter URL and send request', async () => {
      const urlInput = page.locator('[data-testid="url-input"]');
      await urlInput.fill('https://httpbin.org/get');
      await page.locator('[data-testid="send-btn"]').click();
    });

    await test.step('Verify: Response received', async () => {
      await expect(page.locator('#response-content')).not.toHaveClass(/hidden/, { timeout: 10000 });
      await expect(page.locator('[data-testid="response-status"]')).toBeVisible();
      const timing = await page.locator('[data-testid="response-timing"]').textContent();
      expect(timing).toMatch(/\d+ ms/);
      const body = await page.locator('[data-testid="response-body"]').textContent();
      expect(body.length).toBeGreaterThan(0);
    });
  });

  // ─── Scenario 10: File Upload Import Flow ─────────────────
  test('should import spec via file input', {
    annotation: [
      { type: 'feature', description: 'file-import' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Upload spec file', async () => {
      const specPath = join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json');
      const fileInput = page.locator('#spec-file-input');
      await fileInput.setInputFiles(specPath);
    });

    await test.step('Verify: Collection tree rendered', async () => {
      await expect(page.locator('[data-testid="collection-name"]')).toHaveText('Petstore API');
      await expect(page.locator('[data-testid="folder-pets"]')).toBeVisible();
    });
  });

  // ─── Scenario 11: Full Workflow - Import, Browse, Execute ─
  test('should complete full workflow: import -> browse -> select -> send', {
    annotation: [
      { type: 'feature', description: 'full-workflow' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Import spec and create environment', async () => {
      await page.evaluate((specStr) => {
        loadSpec(JSON.parse(specStr), { specMode: false });
        appState.environments.push({ name: 'Local', baseUrl: 'http://localhost:3001', variables: { baseUrl: 'http://localhost:3001' } });
        renderEnvironments();
      }, JSON.stringify(petstoreSpec));
      await expect(page.locator('[data-testid="collection-name"]')).toHaveText('Petstore API');
      await page.locator('[data-testid="env-selector"]').selectOption({ index: 1 });
    });

    await test.step('Action: Browse and select endpoint', async () => {
      await page.locator('[data-testid="folder-pets"]').click();
      const endpoint = page.locator('.endpoint-item').filter({ hasText: 'GET' }).filter({ hasText: '/pets' }).first();
      await endpoint.click();
      const url = await page.locator('[data-testid="url-input"]').inputValue();
      expect(url).toMatch(/^https?:\/\//);
    });

    await test.step('Action: Configure headers and auth', async () => {
      await page.locator('.tab', { hasText: 'Headers' }).click();
      await expect(page.locator('#tab-headers')).not.toHaveClass(/hidden/);
      await page.locator('.tab', { hasText: 'Auth' }).click();
      await page.locator('[data-testid="auth-token"]').fill('test-jwt-token');
    });

    await test.step('Action: Send request and verify response', async () => {
      await page.locator('[data-testid="send-btn"]').click();
      await expect(page.locator('#response-content')).not.toHaveClass(/hidden/, { timeout: 10000 });
      await expect(page.locator('[data-testid="response-status"]')).toBeVisible();
    });
  });

  // ─── Scenario 12: Method Selector ─────────────────────────
  test('should allow changing HTTP method', {
    annotation: [
      { type: 'feature', description: 'method-selector' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Verify: Default is GET and can change methods', async () => {
      const methodSelect = page.locator('[data-testid="method-select"]');
      await expect(methodSelect).toHaveValue('GET');
      await methodSelect.selectOption('POST');
      await expect(methodSelect).toHaveValue('POST');
      await methodSelect.selectOption('DELETE');
      await expect(methodSelect).toHaveValue('DELETE');
    });
  });

  // ─── Scenario 13: Response Error Display ──────────────────
  test('should show error when request fails', {
    annotation: [
      { type: 'feature', description: 'error-display' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Send request to invalid URL', async () => {
      await page.locator('[data-testid="url-input"]').fill('http://localhost:99999/invalid');
      await page.locator('[data-testid="send-btn"]').click();
    });

    await test.step('Verify: Error response displayed', async () => {
      await expect(page.locator('#response-content')).not.toHaveClass(/hidden/, { timeout: 10000 });
      await expect(page.locator('[data-testid="response-status"]')).toContainText('Error');
    });
  });

  // ─── Scenario 14: Headers Key-Value Editor ──────────────
  test('should show headers as key-value table with add/remove', {
    annotation: [
      { type: 'feature', description: 'headers-kv-editor' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Switch to Headers tab', async () => {
      await page.locator('.tab', { hasText: 'Headers' }).click();
      await expect(page.locator('#tab-headers')).not.toHaveClass(/hidden/);
    });

    await test.step('Verify: Headers table is visible with key-value inputs', async () => {
      await expect(page.locator('[data-testid="headers-editor"]')).toBeVisible();
      await expect(page.locator('[data-testid="add-header-btn"]')).toBeVisible();
    });

    await test.step('Action: Add a header row', async () => {
      await page.locator('[data-testid="add-header-btn"]').click();
      await expect(page.locator('[data-testid="header-row"]')).toHaveCount(1);
      await page.locator('[data-testid="header-key"]').first().fill('X-Custom');
      await page.locator('[data-testid="header-value"]').first().fill('test-value');
    });

    await test.step('Action: Add a second header and remove it', async () => {
      await page.locator('[data-testid="add-header-btn"]').click();
      await expect(page.locator('[data-testid="header-row"]')).toHaveCount(2);
      await page.locator('[data-testid="header-delete"]').last().click();
      await expect(page.locator('[data-testid="header-row"]')).toHaveCount(1);
    });

    await test.step('Verify: Remaining header has correct values', async () => {
      await expect(page.locator('[data-testid="header-key"]').first()).toHaveValue('X-Custom');
      await expect(page.locator('[data-testid="header-value"]').first()).toHaveValue('test-value');
    });
  });

  // ─── Scenario 15: Headers checkbox disables header ───────
  test('should disable header via checkbox', {
    annotation: [
      { type: 'feature', description: 'headers-kv-checkbox' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Add a header', async () => {
      await page.locator('.tab', { hasText: 'Headers' }).click();
      await page.locator('[data-testid="add-header-btn"]').click();
      await page.locator('[data-testid="header-key"]').first().fill('X-Disabled');
      await page.locator('[data-testid="header-value"]').first().fill('should-not-send');
    });

    await test.step('Action: Uncheck the header', async () => {
      await page.locator('.header-enabled').first().uncheck();
      await expect(page.locator('.header-enabled').first()).not.toBeChecked();
    });

    await test.step('Verify: Disabled header not sent with request', async () => {
      // Read headers via evaluate - disabled headers should be excluded
      const headers = await page.evaluate(() => readHeaders());
      expect(headers).not.toHaveProperty('X-Disabled');
    });
  });

  // ─── Scenario 16: Headers sent with request ──────────────
  test('should send headers with request', {
    annotation: [
      { type: 'feature', description: 'headers-sent' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Add custom header and URL', async () => {
      await page.locator('[data-testid="url-input"]').fill('https://httpbin.org/headers');
      await page.locator('.tab', { hasText: 'Headers' }).click();
      await page.locator('[data-testid="add-header-btn"]').click();
      await page.locator('[data-testid="header-key"]').first().fill('X-Test-Header');
      await page.locator('[data-testid="header-value"]').first().fill('hello-world');
    });

    await test.step('Action: Send request', async () => {
      await page.locator('[data-testid="send-btn"]').click();
      await expect(page.locator('#response-content')).not.toHaveClass(/hidden/, { timeout: 10000 });
    });

    await test.step('Verify: Response contains custom header', async () => {
      const body = await page.locator('[data-testid="response-body"]').textContent();
      expect(body).toContain('X-Test-Header');
    });
  });
});
