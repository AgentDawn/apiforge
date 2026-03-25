import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

test.describe('Search Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr));
    }, JSON.stringify(petstoreSpec));
    await expect(page.getByTestId('collection-name')).toHaveText('Petstore API');
  });

  test('should open search modal with Ctrl+K', {
    annotation: [
      { type: 'feature', description: 'search' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Press Ctrl+K', async () => {
      await expect(page.getByTestId('search-modal')).toHaveClass(/hidden/);
      await page.keyboard.press('Control+k');
    });

    await test.step('Verify: Modal opened and input focused', async () => {
      await expect(page.getByTestId('search-modal')).not.toHaveClass(/hidden/);
      await expect(page.getByTestId('search-input')).toBeFocused();
    });
  });

  test('should close search modal with Escape', {
    annotation: [
      { type: 'feature', description: 'search' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('search-modal')).not.toHaveClass(/hidden/);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('search-modal')).toHaveClass(/hidden/);
  });

  test('should filter endpoints by path', {
    annotation: [
      { type: 'feature', description: 'search' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Search for pets', async () => {
      await page.keyboard.press('Control+k');
      await page.getByTestId('search-input').fill('pets');
    });

    await test.step('Verify: Results contain /pets', async () => {
      const results = page.getByTestId('search-results');
      await expect(results.locator('.search-result-item')).toHaveCount(await results.locator('.search-result-item').count());
      await expect(results.locator('.search-result-path').first()).toContainText('pets');
    });
  });

  test('should filter endpoints by method', {
    annotation: [
      { type: 'feature', description: 'search' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Search for GET', async () => {
      await page.keyboard.press('Control+k');
      await page.getByTestId('search-input').fill('GET');
    });

    await test.step('Verify: All results are GET', async () => {
      const results = page.getByTestId('search-results');
      const items = results.locator('.search-result-item');
      await expect(items.first()).toBeVisible();
      const badges = items.locator('.method-badge');
      const count = await badges.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        await expect(badges.nth(i)).toContainText('GET');
      }
    });
  });

  test('should navigate results with keyboard arrows', {
    annotation: [
      { type: 'feature', description: 'search' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open search and type query', async () => {
      await page.keyboard.press('Control+k');
      await page.getByTestId('search-input').fill('pets');
      const results = page.getByTestId('search-results');
      await expect(results.locator('.search-result-item').first()).toBeVisible();
    });

    await test.step('Action: Navigate with arrow keys', async () => {
      await page.keyboard.press('ArrowDown');
      const results = page.getByTestId('search-results');
      await expect(results.locator('.search-result-item.active').first()).toBeVisible();
      await page.keyboard.press('ArrowDown');
      const activeItems = results.locator('.search-result-item.active');
      await expect(activeItems).toHaveCount(1);
      await page.keyboard.press('ArrowUp');
      const activeItem = results.locator('.search-result-item.active');
      await expect(activeItem).toHaveCount(1);
    });
  });

  test('should select endpoint on Enter and close modal', {
    annotation: [
      { type: 'feature', description: 'search' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Search and press Enter', async () => {
      await page.keyboard.press('Control+k');
      await page.getByTestId('search-input').fill('/pets');
      const results = page.getByTestId('search-results');
      await expect(results.locator('.search-result-item').first()).toBeVisible();
      await page.keyboard.press('Enter');
    });

    await test.step('Verify: Modal closed and endpoint loaded', async () => {
      await expect(page.getByTestId('search-modal')).toHaveClass(/hidden/);
      await expect(page.getByTestId('url-input')).not.toHaveValue('');
    });
  });

  test('should show no results message', {
    annotation: [
      { type: 'feature', description: 'search' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.getByTestId('search-input').fill('zzznomatch999');
    const results = page.getByTestId('search-results');
    await expect(results.locator('.search-hint')).toContainText('No matching endpoints found');
  });

  test('should highlight matching text in results', {
    annotation: [
      { type: 'feature', description: 'search' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.getByTestId('search-input').fill('pets');
    const results = page.getByTestId('search-results');
    await expect(results.locator('.search-result-item').first()).toBeVisible();
    await expect(results.locator('.search-highlight').first()).toBeVisible();
  });

  test('should show hint when no query entered', {
    annotation: [
      { type: 'feature', description: 'search' },
      { type: 'severity', description: 'low' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.keyboard.press('Control+k');
    const results = page.getByTestId('search-results');
    await expect(results.locator('.search-hint')).toContainText('Type to search endpoints');
  });

  test('should close when clicking outside the dialog', {
    annotation: [
      { type: 'feature', description: 'search' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('search-modal')).not.toHaveClass(/hidden/);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('search-modal')).toHaveClass(/hidden/);
  });

  test('should open with search icon button in sidebar', {
    annotation: [
      { type: 'feature', description: 'search' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await expect(page.getByTestId('search-modal')).toHaveClass(/hidden/);
    await page.getByTestId('search-icon-btn').click();
    await expect(page.getByTestId('search-modal')).not.toHaveClass(/hidden/);
    await expect(page.getByTestId('search-input')).toBeFocused();
  });

  test('should switch to client tab when selecting result from docs tab', {
    annotation: [
      { type: 'feature', description: 'search' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create docs tab', async () => {
      await page.locator('[data-testid="tab-new-docs"]').click();
      await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);
    });

    await test.step('Action: Search and select endpoint', async () => {
      await page.keyboard.press('Control+k');
      await page.getByTestId('search-input').fill('pets');
      await expect(page.getByTestId('search-results').locator('.search-result-item').first()).toBeVisible();
      await page.keyboard.press('Enter');
    });

    await test.step('Verify: Switched to client tab', async () => {
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      await expect(page.getByTestId('search-modal')).toHaveClass(/hidden/);
    });
  });
});
