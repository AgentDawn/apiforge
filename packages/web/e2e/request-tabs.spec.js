import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

test.describe('Request Tabs', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear localStorage to start fresh
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('[data-testid="request-tab-bar"]');
  });

  test('should show tab bar with default tab on page load', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Verify: Tab bar and default tab visible', async () => {
      const tabBar = page.locator('[data-testid="request-tab-bar"]');
      await expect(tabBar).toBeVisible();
      const tabs = page.locator('[data-testid="request-tab"]');
      await expect(tabs).toHaveCount(1);
      const newBtn = page.locator('[data-testid="tab-new"]');
      await expect(newBtn).toBeVisible();
      await expect(newBtn).toHaveText('+');
    });
  });

  test('should create new tab with + button', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Click + button', async () => {
      await page.locator('[data-testid="tab-new"]').click();
    });

    await test.step('Verify: New tab created and active', async () => {
      const tabs = page.locator('[data-testid="request-tab"]');
      await expect(tabs).toHaveCount(2);
      const activeTabs = page.locator('[data-testid="request-tab"].active');
      await expect(activeTabs).toHaveCount(1);
    });
  });

  test('should switch between tabs preserving state', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Configure first tab', async () => {
      await page.locator('[data-testid="url-input"]').fill('https://api.example.com/users');
      await page.locator('[data-testid="method-select"]').selectOption('POST');
    });

    await test.step('Setup: Create and configure second tab', async () => {
      await page.locator('[data-testid="tab-new"]').click();
      await page.locator('[data-testid="url-input"]').fill('https://api.example.com/pets');
      await page.locator('[data-testid="method-select"]').selectOption('GET');
    });

    await test.step('Verify: First tab state preserved', async () => {
      const tabs = page.locator('[data-testid="request-tab"]');
      await tabs.first().click();
      await expect(page.locator('[data-testid="url-input"]')).toHaveValue('https://api.example.com/users');
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('POST');
    });

    await test.step('Verify: Second tab state preserved', async () => {
      const tabs = page.locator('[data-testid="request-tab"]');
      await tabs.nth(1).click();
      await expect(page.locator('[data-testid="url-input"]')).toHaveValue('https://api.example.com/pets');
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('GET');
    });
  });

  test('should close tab with x button', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create second tab', async () => {
      await page.locator('[data-testid="tab-new"]').click();
      await expect(page.locator('[data-testid="request-tab"]')).toHaveCount(2);
    });

    await test.step('Action: Close active tab', async () => {
      const activeTab = page.locator('[data-testid="request-tab"].active');
      await activeTab.locator('[data-testid="tab-close"]').click();
    });

    await test.step('Verify: Back to 1 tab', async () => {
      await expect(page.locator('[data-testid="request-tab"]')).toHaveCount(1);
    });
  });

  test('should maintain at least one tab', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    const tab = page.locator('[data-testid="request-tab"]').first();
    await tab.locator('[data-testid="tab-close"]').click();
    await expect(page.locator('[data-testid="request-tab"]')).toHaveCount(1);
  });

  test('should create docs tab when clicking sidebar endpoint after spec import', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and click endpoint', async () => {
      await page.evaluate((spec) => window.loadSpec(spec, { specMode: true }), petstoreSpec);
      await page.waitForSelector('[data-testid="collection-tree"]');
      await page.locator('.folder-header').first().click();
      await page.locator('.endpoint-item').first().click();
    });

    await test.step('Verify: Docs tab created', async () => {
      const activeTab = page.locator('[data-testid="request-tab"].active');
      await expect(activeTab).toBeVisible();
      await expect(activeTab).toHaveAttribute('data-tab-type', 'docs');
      await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);
      await expect(page.locator('.request-panel')).toHaveClass(/hidden/);
      const methodBadge = activeTab.locator('.request-tab-method');
      await expect(methodBadge).toBeVisible();
    });
  });

  test('should focus existing tab for same endpoint', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and create tabs', async () => {
      await page.evaluate((spec) => window.loadSpec(spec, { specMode: true }), petstoreSpec);
      await page.waitForSelector('[data-testid="collection-tree"]');
      await page.locator('.folder-header').first().click();
      const firstEndpoint = page.locator('.endpoint-item').first();
      await firstEndpoint.click();
      await page.locator('[data-testid="tab-new"]').click();
    });

    await test.step('Verify: Clicking same endpoint reuses tab', async () => {
      const tabCount = await page.locator('[data-testid="request-tab"]').count();
      const firstEndpoint = page.locator('.endpoint-item').first();
      await firstEndpoint.click();
      await expect(page.locator('[data-testid="request-tab"]')).toHaveCount(tabCount);
    });
  });

  test('should show method and path in tab title', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Configure tab with URL and method', async () => {
      await page.locator('[data-testid="url-input"]').fill('https://api.example.com/pets');
      await page.locator('[data-testid="method-select"]').selectOption('POST');
      await page.locator('[data-testid="tab-new"]').click();
      await page.locator('[data-testid="request-tab"]').first().click();
    });

    await test.step('Verify: Tab shows method and path', async () => {
      const firstTab = page.locator('[data-testid="request-tab"]').first();
      const method = firstTab.locator('.request-tab-method');
      await expect(method).toHaveText('POST');
      const pathEl = firstTab.locator('.request-tab-path');
      await expect(pathEl).toContainText('/pets');
    });
  });

  test('should create new tab with Ctrl+T', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    const initialCount = await page.locator('[data-testid="request-tab"]').count();
    await page.keyboard.press('Control+t');
    await expect(page.locator('[data-testid="request-tab"]')).toHaveCount(initialCount + 1);
  });

  test('should close tab with Ctrl+W', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('[data-testid="tab-new"]').click();
    await expect(page.locator('[data-testid="request-tab"]')).toHaveCount(2);
    await page.keyboard.press('Control+w');
    await expect(page.locator('[data-testid="request-tab"]')).toHaveCount(1);
  });

  test('should create docs tab for endpoint', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and click endpoint', async () => {
      await page.evaluate((spec) => window.loadSpec(spec, { specMode: true }), petstoreSpec);
      await page.waitForSelector('[data-testid="collection-tree"]');
      await page.locator('.folder-header').first().click();
      await page.locator('.endpoint-item').first().click();
    });

    await test.step('Verify: Docs tab and panel visible', async () => {
      const activeTab = page.locator('[data-testid="request-tab"].active');
      await expect(activeTab).toHaveAttribute('data-tab-type', 'docs');
      await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);
      await expect(page.locator('.request-panel')).toHaveClass(/hidden/);
    });
  });

  test('should switch between client and docs tabs', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and open docs tab', async () => {
      await page.evaluate((spec) => window.loadSpec(spec, { specMode: true }), petstoreSpec);
      await page.waitForSelector('[data-testid="collection-tree"]');
      await page.locator('.folder-header').first().click();
      await page.locator('.endpoint-item').first().click();
      await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);
    });

    await test.step('Action: Use Try it to create client tab', async () => {
      await page.getByTestId('docs-try-btn').click();
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      await expect(page.getByTestId('docs-panel')).toHaveClass(/hidden/);
    });

    await test.step('Verify: Can switch back to docs tab', async () => {
      const docsTab = page.locator('[data-testid="request-tab"][data-tab-type="docs"]');
      await docsTab.click();
      await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);
      await expect(page.locator('.request-panel')).toHaveClass(/hidden/);
    });
  });

  test('should restore tabs from localStorage without flash on page load', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Save workspace to localStorage and reload', async () => {
      await page.evaluate(() => {
        const workspace = {
          tabs: [{
            id: 'tab-saved-1',
            type: 'client',
            method: 'POST',
            url: 'https://api.example.com/restored',
            headers: '',
            body: '',
            bodyType: 'json',
            params: [],
            authType: 'bearer',
            authConfig: {},
            endpointKey: '',
            title: 'POST /restored',
          }],
          activeTabId: 'tab-saved-1',
        };
        localStorage.setItem('apiforge-workspace', JSON.stringify(workspace));
      });
      await page.reload();
      await page.waitForSelector('[data-testid="request-tab"]');
    });

    await test.step('Verify: Restored tab visible without default tab flash', async () => {
      const tabs = page.locator('[data-testid="request-tab"]');
      await expect(tabs).toHaveCount(1);
      const tab = tabs.first();
      const method = tab.locator('.request-tab-method');
      await expect(method).toHaveText('POST');
      const pathEl = tab.locator('.request-tab-path');
      await expect(pathEl).toContainText('/restored');
    });
  });

  test('should show skeleton while loading workspace for logged-in user', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Set auth state and intercept slow API', async () => {
      await page.evaluate(() => {
        localStorage.setItem('apiforge-app-auth', JSON.stringify({
          token: 'fake-token-for-test',
          user: { username: 'testuser' },
        }));
      });
      // Intercept workspace API with delayed response
      await page.route('/api/workspace', async (route) => {
        await new Promise((r) => setTimeout(r, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabs: [{
              id: 'tab-server-1',
              type: 'client',
              method: 'PUT',
              url: 'https://api.example.com/from-server',
              headers: '',
              body: '',
              bodyType: 'json',
              params: [],
              authType: 'bearer',
              authConfig: {},
              endpointKey: '',
              title: 'PUT /from-server',
            }],
            activeTabId: 'tab-server-1',
          }),
        });
      });
      await page.reload();
    });

    await test.step('Verify: Skeleton shown while loading', async () => {
      // Skeleton should appear quickly
      const skeleton = page.locator('.tab-skeleton');
      await expect(skeleton).toBeVisible({ timeout: 2000 });
      const skeletonItems = page.locator('.tab-skeleton-item');
      await expect(skeletonItems).toHaveCount(2);
    });

    await test.step('Verify: Server tabs loaded after fetch', async () => {
      // Wait for real tabs to appear
      const tabs = page.locator('[data-testid="request-tab"]');
      await expect(tabs).toHaveCount(1, { timeout: 5000 });
      const tab = tabs.first();
      const method = tab.locator('.request-tab-method');
      await expect(method).toHaveText('PUT');
      // Skeleton should be gone
      await expect(page.locator('.tab-skeleton')).toHaveCount(0);
    });
  });

  test('should create client tab from docs tab via Try it', {
    annotation: [
      { type: 'feature', description: 'request-tabs' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and click POST endpoint', async () => {
      await page.evaluate((spec) => window.loadSpec(spec, { specMode: true }), petstoreSpec);
      await page.waitForSelector('[data-testid="collection-tree"]');
      await page.locator('.folder-header').first().click();
      const postEndpoint = page.locator('.endpoint-item').filter({ hasText: 'POST' }).first();
      await postEndpoint.click();
      await expect(page.getByTestId('docs-content')).not.toHaveClass(/hidden/);
    });

    await test.step('Action: Click Try it', async () => {
      await page.getByTestId('docs-try-btn').click();
    });

    await test.step('Verify: Client tab created with POST', async () => {
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      await expect(page.getByTestId('method-select')).toHaveValue('POST');
    });
  });
});
