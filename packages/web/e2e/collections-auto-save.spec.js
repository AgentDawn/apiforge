import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

test.describe('Collections Auto-Save', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear localStorage collections and examples before each test
    await page.evaluate(() => {
      localStorage.removeItem('apiforge-saved-collections');
      localStorage.removeItem('apiforge-examples');
      window.appState.collections = [];
    });
    // Load spec with spec mode enabled
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: true });
    }, JSON.stringify(petstoreSpec));
    // Expand Pets folder
    await page.locator('[data-testid="folder-pets"]').click();
  });

  test('example click should auto-create collection request', {
    annotation: [
      { type: 'feature', description: 'collections-auto-save' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Click example item', async () => {
      const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
      await toggle.click();
      const exampleItem = page.locator('[data-testid="example-item"]').first();
      await expect(exampleItem).toBeVisible();
      await exampleItem.click();
    });

    await test.step('Verify: Collection request created', async () => {
      const collections = await page.evaluate(() => window.appState.collections);
      expect(collections.length).toBeGreaterThan(0);
      const col = collections[0];
      expect(col.requests.length).toBeGreaterThan(0);
      expect(col.requests[0].method).toBe('POST');
      expect(col.requests[0].endpointKey).toBe('POST /pets');
    });
  });

  test('collection should appear in COLLECTIONS sidebar section', {
    annotation: [
      { type: 'feature', description: 'collections-auto-save' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Click example to create collection', async () => {
      const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
      await toggle.click();
      const exampleItem = page.locator('[data-testid="example-item"]').first();
      await exampleItem.click();
    });

    await test.step('Verify: COLLECTIONS section has items', async () => {
      const collectionsSection = page.locator('#collections-section');
      await expect(collectionsSection).toBeVisible();
      const savedItems = page.locator('[data-testid="saved-request-item"]');
      await expect(savedItems.first()).toBeVisible({ visible: false }); // items start hidden under endpoint group
    });

    await test.step('Verify: Endpoint group is visible', async () => {
      const endpointHeader = page.locator('[data-testid="saved-endpoint-header"]').first();
      await expect(endpointHeader).toBeVisible();
    });
  });

  test('endpoint grouping shows method and path, not full request name', {
    annotation: [
      { type: 'feature', description: 'collections-auto-save' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Click example to create collection', async () => {
      const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
      await toggle.click();
      const exampleItem = page.locator('[data-testid="example-item"]').first();
      await exampleItem.click();
    });

    await test.step('Verify: Endpoint header shows method badge', async () => {
      const endpointHeader = page.locator('[data-testid="saved-endpoint-header"]').first();
      await expect(endpointHeader).toBeVisible();
      await expect(endpointHeader.locator('.method-badge')).toBeVisible();
    });

    await test.step('Verify: Expanding endpoint shows example name only (not full path)', async () => {
      const endpointHeader = page.locator('[data-testid="saved-endpoint-header"]').first();
      await endpointHeader.click();
      const savedItem = page.locator('[data-testid="saved-request-item"]').first();
      await expect(savedItem).toBeVisible();
      // The item should show just the example name, not the full "METHOD /path (Example)" string
      const itemText = await savedItem.textContent();
      expect(itemText).not.toMatch(/POST\s+\/pets/);
    });
  });

  test('endpoint group toggle expands and collapses examples', {
    annotation: [
      { type: 'feature', description: 'collections-auto-save' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Click example to create collection', async () => {
      const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
      await toggle.click();
      const exampleItem = page.locator('[data-testid="example-item"]').first();
      await exampleItem.click();
    });

    await test.step('Verify: Examples start hidden', async () => {
      const examplesDiv = page.locator('.saved-endpoint-examples').first();
      await expect(examplesDiv).toHaveClass(/hidden/);
    });

    await test.step('Action: Click endpoint header to expand', async () => {
      const endpointHeader = page.locator('[data-testid="saved-endpoint-header"]').first();
      await endpointHeader.click();
    });

    await test.step('Verify: Examples now visible', async () => {
      const examplesDiv = page.locator('.saved-endpoint-examples').first();
      await expect(examplesDiv).not.toHaveClass(/hidden/);
      const savedItem = page.locator('[data-testid="saved-request-item"]').first();
      await expect(savedItem).toBeVisible();
    });

    await test.step('Action: Click endpoint header again to collapse', async () => {
      const endpointHeader = page.locator('[data-testid="saved-endpoint-header"]').first();
      await endpointHeader.click();
    });

    await test.step('Verify: Examples hidden again', async () => {
      const examplesDiv = page.locator('.saved-endpoint-examples').first();
      await expect(examplesDiv).toHaveClass(/hidden/);
    });
  });

  test('closing and reopening Client tab should preserve data from collection', {
    annotation: [
      { type: 'feature', description: 'collections-auto-save' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Click example to create collection request', async () => {
      const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
      await toggle.click();
      const exampleItem = page.locator('[data-testid="example-item"]').first();
      await exampleItem.click();
    });

    await test.step('Verify: Data persisted in localStorage', async () => {
      const saved = await page.evaluate(() => localStorage.getItem('apiforge-saved-collections'));
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved);
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed[0].requests.length).toBeGreaterThan(0);
    });

    await test.step('Action: Expand endpoint group and click saved item', async () => {
      const endpointHeader = page.locator('[data-testid="saved-endpoint-header"]').first();
      await endpointHeader.click();
      const savedItem = page.locator('[data-testid="saved-request-item"]').first();
      await savedItem.click();
    });

    await test.step('Verify: Client tab opened with method set', async () => {
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      const method = await page.locator('[data-testid="method-select"]').inputValue();
      expect(method).toBe('POST');
    });
  });

  test('"Try it" should auto-create default collection request', {
    annotation: [
      { type: 'feature', description: 'collections-auto-save' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Click endpoint to open docs, then Try it', async () => {
      const postEndpoint = page.locator('[data-testid="endpoint-post--pets"]');
      await postEndpoint.click();
      await page.getByTestId('docs-try-btn').click();
    });

    await test.step('Verify: Default collection request created', async () => {
      const collections = await page.evaluate(() => window.appState.collections);
      expect(collections.length).toBeGreaterThan(0);
      const col = collections[0];
      expect(col.requests.length).toBeGreaterThan(0);
      const req = col.requests[0];
      expect(req.exampleName).toBe('Default');
      expect(req.method).toBe('POST');
      expect(req.endpointKey).toBe('POST /pets');
    });
  });

  test('modifying request in Client tab should update collection', {
    annotation: [
      { type: 'feature', description: 'collections-auto-save' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create collection via Try it', async () => {
      const postEndpoint = page.locator('[data-testid="endpoint-post--pets"]');
      await postEndpoint.click();
      await page.getByTestId('docs-try-btn').click();
    });

    await test.step('Action: Modify the URL in the client tab', async () => {
      await page.locator('[data-testid="url-input"]').fill('https://modified.example.com/pets');
    });

    await test.step('Action: Trigger tab state save by creating a new tab', async () => {
      // saveCurrentTabState is called when switching tabs
      await page.evaluate(() => {
        window.saveCurrentTabState();
      });
    });

    await test.step('Verify: Collection request updated', async () => {
      const collections = await page.evaluate(() => window.appState.collections);
      const req = collections[0].requests[0];
      expect(req.url).toBe('https://modified.example.com/pets');
    });
  });

  test('response should be saved to collection after Send', {
    annotation: [
      { type: 'feature', description: 'collections-auto-save' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create collection via Try it', async () => {
      const postEndpoint = page.locator('[data-testid="endpoint-post--pets"]');
      await postEndpoint.click();
      await page.getByTestId('docs-try-btn').click();
    });

    await test.step('Action: Simulate response save', async () => {
      // Directly call showResponse to simulate a Send completing
      await page.evaluate(() => {
        // Ensure the active tab has a collection link
        const tab = window.appState.tabs.find((t) => t.id === window.appState.activeTabId);
        if (tab && tab.collectionRequestId) {
          window.saveResponseToCollection(tab, 200, '{"id":1}', 42);
        }
      });
    });

    await test.step('Verify: Response saved to collection', async () => {
      const collections = await page.evaluate(() => window.appState.collections);
      const req = collections[0].requests[0];
      expect(req.lastResponse).not.toBeNull();
      expect(req.lastResponse.status).toBe(200);
      expect(req.lastResponse.body).toBe('{"id":1}');
      expect(req.lastResponse.timing).toBe(42);
    });

    await test.step('Verify: Status indicator shown in sidebar after expanding endpoint group', async () => {
      const endpointHeader = page.locator('[data-testid="saved-endpoint-header"]').first();
      await endpointHeader.click();
      const statusBadge = page.locator('.saved-request-status').first();
      await expect(statusBadge).toBeVisible();
      await expect(statusBadge).toHaveText('200');
    });
  });
});
