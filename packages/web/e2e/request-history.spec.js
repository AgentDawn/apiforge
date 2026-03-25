import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

/**
 * Helper: load spec, expand Pets folder, click POST /pets example toggle, click example item.
 * This creates a collection request linked to the active tab.
 */
async function setupCollectionRequest(page) {
  await page.evaluate((specStr) => {
    loadSpec(JSON.parse(specStr), { specMode: true });
  }, JSON.stringify(petstoreSpec));
  await page.locator('[data-testid="folder-pets"]').click();
  const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
  await toggle.click();
  const exampleItem = page.locator('[data-testid="example-item"]').first();
  await expect(exampleItem).toBeVisible();
  await exampleItem.click();
}

/**
 * Helper: mock a URL route and send a request to it.
 */
async function sendMockedRequest(page) {
  // Intercept the request to return a controlled response
  await page.route('**/api/test-history', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'ok', items: [1, 2, 3] }),
    });
  });
  await page.fill('[data-testid="url-input"]', '/api/test-history');
  await page.click('[data-testid="send-btn"]');
  // Wait for response to appear
  await expect(page.locator('[data-testid="response-status"]')).toBeVisible({ timeout: 10000 });
}

test.describe('Request History', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('apiforge-saved-collections');
      localStorage.removeItem('apiforge-examples');
      window.appState.collections = [];
    });
  });

  test('should show History tab in response panel', {
    annotation: [
      { type: 'feature', description: 'request-history' },
      { type: 'severity', description: 'critical' },
    ],
  }, async ({ page }) => {
    await test.step('Verify: Response tabs are visible', async () => {
      const responseTabs = page.locator('[data-testid="response-tabs"]');
      await expect(responseTabs).toBeVisible();
    });

    await test.step('Verify: Response tab exists', async () => {
      const responseTab = page.locator('[data-testid="response-tab-response"]');
      await expect(responseTab).toBeVisible();
      await expect(responseTab).toHaveText('Response');
    });

    await test.step('Verify: History tab exists', async () => {
      const historyTab = page.locator('[data-testid="response-tab-history"]');
      await expect(historyTab).toBeVisible();
      await expect(historyTab).toContainText('History');
    });
  });

  test('should add history entry after Send', {
    annotation: [
      { type: 'feature', description: 'request-history' },
      { type: 'severity', description: 'critical' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create collection request', async () => {
      await setupCollectionRequest(page);
    });

    await test.step('Action: Send request', async () => {
      await sendMockedRequest(page);
    });

    await test.step('Verify: History entry added to collection request', async () => {
      const history = await page.evaluate(() => {
        const collections = window.appState.collections;
        if (!collections.length) return [];
        for (const col of collections) {
          for (const req of col.requests) {
            if (req.history && req.history.length > 0) return req.history;
          }
        }
        return [];
      });
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('id');
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('request');
      expect(history[0]).toHaveProperty('response');
      expect(history[0].response).toHaveProperty('status');
      expect(history[0].response).toHaveProperty('timing');
    });
  });

  test('should display history with status, timing, relative time', {
    annotation: [
      { type: 'feature', description: 'request-history' },
      { type: 'severity', description: 'critical' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create collection request and send', async () => {
      await setupCollectionRequest(page);
      await sendMockedRequest(page);
    });

    await test.step('Action: Switch to History tab', async () => {
      await page.click('[data-testid="response-tab-history"]');
    });

    await test.step('Verify: History list is visible with items', async () => {
      const historyList = page.locator('[data-testid="history-list"]');
      await expect(historyList).toBeVisible();
      const historyItem = page.locator('[data-testid="history-item"]').first();
      await expect(historyItem).toBeVisible();
    });

    await test.step('Verify: History item has status, timing, time', async () => {
      const item = page.locator('[data-testid="history-item"]').first();
      const status = item.locator('.history-status');
      await expect(status).toBeVisible();
      await expect(status).toHaveText('200');
      const timing = item.locator('.history-timing');
      await expect(timing).toBeVisible();
      const time = item.locator('.history-time');
      await expect(time).toBeVisible();
      await expect(time).toContainText('just now');
    });
  });

  test('should view historical response when clicking history item', {
    annotation: [
      { type: 'feature', description: 'request-history' },
      { type: 'severity', description: 'critical' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create collection request and send', async () => {
      await setupCollectionRequest(page);
      await sendMockedRequest(page);
    });

    await test.step('Action: Switch to History tab and click item', async () => {
      await page.click('[data-testid="response-tab-history"]');
      await expect(page.locator('[data-testid="history-item"]').first()).toBeVisible();
      await page.locator('[data-testid="history-item"]').first().click();
    });

    await test.step('Verify: Switched to Response tab showing historical response', async () => {
      const responseTab = page.locator('[data-testid="response-tab-response"]');
      await expect(responseTab).toHaveClass(/active/);
      const responseContent = page.locator('#response-content');
      await expect(responseContent).toBeVisible();
    });

    await test.step('Verify: Clicked history item is highlighted', async () => {
      await page.click('[data-testid="response-tab-history"]');
      const activeItem = page.locator('[data-testid="history-item"].active');
      await expect(activeItem).toBeVisible();
    });
  });

  test('should show empty state when no history', {
    annotation: [
      { type: 'feature', description: 'request-history' },
      { type: 'severity', description: 'normal' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create collection request without sending', async () => {
      await setupCollectionRequest(page);
    });

    await test.step('Action: Switch to History tab', async () => {
      await page.click('[data-testid="response-tab-history"]');
    });

    await test.step('Verify: Empty state is shown', async () => {
      const emptyState = page.locator('[data-testid="history-empty"]');
      await expect(emptyState).toBeVisible();
      await expect(emptyState).toContainText('No request history yet');
    });
  });

  test('should show history count badge', {
    annotation: [
      { type: 'feature', description: 'request-history' },
      { type: 'severity', description: 'normal' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create collection request and send', async () => {
      await setupCollectionRequest(page);
      await sendMockedRequest(page);
    });

    await test.step('Verify: History count badge shows 1', async () => {
      const badge = page.locator('[data-testid="history-count"]');
      await expect(badge).toHaveText('1');
    });
  });
});
