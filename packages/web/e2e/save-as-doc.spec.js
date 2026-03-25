import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);
const specStr = JSON.stringify(petstoreSpec);

test.describe('Save as Doc', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('[data-testid="request-tab-bar"]');
  });

  test('should show Save as Doc button for sourceless tab', {
    annotation: [
      { type: 'feature', description: 'save-as-doc' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Type a URL in blank tab (no source)', async () => {
      await page.locator('[data-testid="url-input"]').fill('https://api.example.com/v1/users');
    });

    await test.step('Verify Save as Doc button is visible', async () => {
      const btn = page.locator('[data-testid="save-as-doc-btn"]');
      await expect(btn).toBeVisible();
    });
  });

  test('should hide Save as Doc button for spec-linked tab', {
    annotation: [
      { type: 'feature', description: 'save-as-doc' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Load spec and select endpoint (client mode)', async () => {
      await page.evaluate((s) => {
        loadSpec(JSON.parse(s), { specMode: false });
      }, specStr);
      await expect(page.locator('[data-testid="collection-name"]')).toBeVisible({ timeout: 5000 });
      const folder = page.locator('.folder-header').first();
      await folder.click();
      const endpoint = page.locator('.endpoint-item').first();
      await expect(endpoint).toBeVisible({ timeout: 3000 });
      await endpoint.click();
    });

    await test.step('Verify Save as Doc button is hidden', async () => {
      const btn = page.locator('[data-testid="save-as-doc-btn"]');
      await expect(btn).toBeHidden();
    });
  });

  test('should open create doc modal when clicked', {
    annotation: [
      { type: 'feature', description: 'save-as-doc' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Enter URL and click Save as Doc', async () => {
      await page.locator('[data-testid="url-input"]').fill('https://api.stripe.com/v1/customers');
      await page.locator('[data-testid="save-as-doc-btn"]').click();
    });

    await test.step('Verify modal is visible', async () => {
      const modal = page.locator('[data-testid="save-doc-modal"]');
      await expect(modal).toBeVisible();
      await expect(page.locator('#save-doc-title')).toHaveText('Create New API Doc');
    });
  });

  test('should auto-detect base URL from request URL', {
    annotation: [
      { type: 'feature', description: 'save-as-doc' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Enter URL and open modal', async () => {
      await page.locator('[data-testid="url-input"]').fill('https://api.stripe.com/v1/customers');
      await page.locator('[data-testid="save-as-doc-btn"]').click();
    });

    await test.step('Verify base URL is auto-detected', async () => {
      const baseUrlInput = page.locator('[data-testid="save-doc-baseurl"]');
      await expect(baseUrlInput).toHaveValue('https://api.stripe.com');
    });
  });

  test('should create new doc and load in sidebar', {
    annotation: [
      { type: 'feature', description: 'save-as-doc' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Enter URL and open modal', async () => {
      await page.locator('[data-testid="method-select"]').selectOption('POST');
      await page.locator('[data-testid="url-input"]').fill('https://api.stripe.com/v1/customers');
      await page.locator('[data-testid="save-as-doc-btn"]').click();
    });

    await test.step('Fill in doc details and create', async () => {
      await page.locator('[data-testid="save-doc-name"]').fill('Stripe API');
      await page.locator('[data-testid="save-doc-submit"]').click();
    });

    await test.step('Verify doc is loaded in sidebar', async () => {
      await expect(page.locator('[data-testid="collection-name"]')).toHaveText('Stripe API', { timeout: 3000 });
    });

    await test.step('Verify doc is stored in localStorage', async () => {
      const docs = await page.evaluate(() => JSON.parse(localStorage.getItem('apiforge-user-docs') || '[]'));
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Stripe API');
      expect(docs[0].baseUrl).toBe('https://api.stripe.com');
      expect(docs[0].endpoints).toHaveLength(1);
      expect(docs[0].endpoints[0].method).toBe('POST');
      expect(docs[0].endpoints[0].path).toBe('/v1/customers');
    });
  });

  test('should link tab source after saving', {
    annotation: [
      { type: 'feature', description: 'save-as-doc' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Create a doc', async () => {
      await page.locator('[data-testid="url-input"]').fill('https://api.example.com/v1/items');
      await page.locator('[data-testid="save-as-doc-btn"]').click();
      await page.locator('[data-testid="save-doc-name"]').fill('Example API');
      await page.locator('[data-testid="save-doc-submit"]').click();
    });

    await test.step('Verify tab source is linked', async () => {
      const source = await page.evaluate(() => {
        const tab = window.appState.tabs.find(t => t.id === window.appState.activeTabId);
        return tab?.source;
      });
      expect(source).toBeTruthy();
      expect(source.createdFromSpec).toBe(true);
      expect(source.specTitle).toBe('Example API');
    });

    await test.step('Verify Save as Doc button is now hidden', async () => {
      const btn = page.locator('[data-testid="save-as-doc-btn"]');
      await expect(btn).toBeHidden();
    });
  });

  test('should detect existing doc with matching base URL', {
    annotation: [
      { type: 'feature', description: 'save-as-doc' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Pre-create a user doc in localStorage', async () => {
      await page.evaluate(() => {
        const docs = [{
          id: 'doc-test-123',
          title: 'My Test API',
          baseUrl: 'https://api.test.com',
          version: '1.0.0',
          endpoints: [{ method: 'GET', path: '/v1/items', summary: 'GET /v1/items', parameters: [], responses: {} }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }];
        localStorage.setItem('apiforge-user-docs', JSON.stringify(docs));
      });
    });

    await test.step('Enter URL with matching base URL and click Save as Doc', async () => {
      await page.locator('[data-testid="url-input"]').fill('https://api.test.com/v1/orders');
      await page.locator('[data-testid="save-as-doc-btn"]').click();
    });

    await test.step('Verify existing doc modal mode', async () => {
      const modal = page.locator('[data-testid="save-doc-modal"]');
      await expect(modal).toBeVisible();
      await expect(page.locator('#save-doc-title')).toHaveText('Add to Existing Doc');
      await expect(page.locator('#save-doc-existing-name')).toHaveText('My Test API');
    });
  });

  test('should add endpoint to existing doc', {
    annotation: [
      { type: 'feature', description: 'save-as-doc' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Pre-create a user doc', async () => {
      await page.evaluate(() => {
        const docs = [{
          id: 'doc-existing-1',
          title: 'Existing API',
          baseUrl: 'https://api.existing.com',
          version: '2.0.0',
          endpoints: [{ method: 'GET', path: '/users', summary: 'GET /users', parameters: [], responses: {} }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }];
        localStorage.setItem('apiforge-user-docs', JSON.stringify(docs));
      });
    });

    await test.step('Add a new endpoint to existing doc', async () => {
      await page.locator('[data-testid="method-select"]').selectOption('POST');
      await page.locator('[data-testid="url-input"]').fill('https://api.existing.com/users');
      await page.locator('[data-testid="save-as-doc-btn"]').click();
      await page.locator('[data-testid="save-doc-submit"]').click();
    });

    await test.step('Verify endpoint was added to existing doc', async () => {
      const docs = await page.evaluate(() => JSON.parse(localStorage.getItem('apiforge-user-docs') || '[]'));
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Existing API');
      expect(docs[0].endpoints).toHaveLength(2);
      expect(docs[0].endpoints[1].method).toBe('POST');
      expect(docs[0].endpoints[1].path).toBe('/users');
    });

    await test.step('Verify sidebar loaded with doc', async () => {
      await expect(page.locator('[data-testid="collection-name"]')).toHaveText('Existing API', { timeout: 3000 });
    });
  });

  test('should show source breadcrumb after saving', {
    annotation: [
      { type: 'feature', description: 'save-as-doc' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Create doc from sourceless tab', async () => {
      await page.locator('[data-testid="url-input"]').fill('https://api.breadcrumb.com/data');
      await page.locator('[data-testid="save-as-doc-btn"]').click();
      await page.locator('[data-testid="save-doc-name"]').fill('Breadcrumb API');
      await page.locator('[data-testid="save-doc-submit"]').click();
    });

    await test.step('Verify source breadcrumb is shown', async () => {
      const breadcrumb = page.locator('[data-testid="source-breadcrumb"]');
      await expect(breadcrumb).toBeVisible({ timeout: 3000 });
      const text = await breadcrumb.textContent();
      expect(text).toContain('Breadcrumb API');
    });
  });
});
