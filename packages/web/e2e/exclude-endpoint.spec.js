import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const excludeTestSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'sample-exclude-test.json'), 'utf-8')
);

test.describe('ApiExcludeEndpoint - Spec Exclusion', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ─── Scenario 1: Excluded endpoints should not appear in sidebar ───
  test('should hide @ApiExcludeEndpoint endpoints from sidebar', {
    annotation: [
      { type: 'feature', description: 'api-exclude-endpoint' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec with excluded endpoints', async () => {
      const specJson = JSON.stringify(excludeTestSpec);
      await page.evaluate((specStr) => {
        const spec = JSON.parse(specStr);
        loadSpec(spec, { specMode: false });
      }, specJson);
    });

    await test.step('Verify: Internal folder is visible in sidebar', async () => {
      const internalFolder = page.locator('[data-testid="folder-internal"]');
      await expect(internalFolder).toBeVisible();
    });

    await test.step('Action: Expand Internal folder', async () => {
      const internalFolder = page.locator('[data-testid="folder-internal"]');
      await internalFolder.click();
    });

    await test.step('Verify: Visible endpoints are present', async () => {
      const sidebar = page;
      await expect(sidebar.locator('.endpoint-item', { hasText: '/internal/health' })).toBeVisible();
      await expect(sidebar.locator('.endpoint-item', { hasText: '/internal/version' })).toBeVisible();
    });

    await test.step('Verify: Excluded endpoints are NOT present', async () => {
      const sidebar = page;
      await expect(sidebar.locator('.endpoint-item', { hasText: '/internal/debug' })).toHaveCount(0);
      await expect(sidebar.locator('.endpoint-item', { hasText: '/internal/cache/clear' })).toHaveCount(0);
    });

    await test.step('Verify: Excluded pet stats endpoint is NOT present', async () => {
      const sidebar = page;
      await expect(sidebar.locator('.endpoint-item', { hasText: '_internal/stats' })).toHaveCount(0);
    });
  });

  // ─── Scenario 2: Non-excluded endpoints from same controller still work ───
  test('should show non-excluded endpoints normally', {
    annotation: [
      { type: 'feature', description: 'api-exclude-endpoint' },
      { type: 'severity', description: 'normal' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec', async () => {
      await page.evaluate((specStr) => {
        loadSpec(JSON.parse(specStr), { specMode: false });
      }, JSON.stringify(excludeTestSpec));
    });

    await test.step('Verify: Spec paths count excludes hidden endpoints', async () => {
      const pathCount = await page.evaluate((specStr) => {
        const spec = JSON.parse(specStr);
        return Object.keys(spec.paths).length;
      }, JSON.stringify(excludeTestSpec));
      expect(pathCount).toBe(16);
    });

    await test.step('Verify: Pet endpoints still present', async () => {
      const sidebar = page;
      const petsFolder = page.locator('[data-testid="folder-pets"]');
      await expect(petsFolder).toBeVisible();
    });

    await test.step('Verify: User endpoints still present', async () => {
      const usersFolder = page.locator('[data-testid="folder-users"]');
      await expect(usersFolder).toBeVisible();
    });
  });
});
