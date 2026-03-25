import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

test.describe('Sidebar Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('apiforge-saved-collections');
      localStorage.removeItem('apiforge-examples');
      window.appState.collections = [];
    });
  });

  test('toggle bar is visible with API Docs active by default', {
    annotation: [
      { type: 'feature', description: 'sidebar-toggle' },
      { type: 'severity', description: 'critical' },
    ],
  }, async ({ page }) => {
    const toggle = page.locator('[data-testid="sidebar-toggle"]');
    await expect(toggle).toBeVisible();

    const docsBtn = page.locator('[data-testid="sidebar-toggle-docs"]');
    const collectionsBtn = page.locator('[data-testid="sidebar-toggle-collections"]');
    await expect(docsBtn).toBeVisible();
    await expect(collectionsBtn).toBeVisible();

    // API Docs button is active by default
    await expect(docsBtn).toHaveClass(/active/);
    await expect(collectionsBtn).not.toHaveClass(/active/);
  });

  test('API Docs view shows api-docs-section and import-spec-section, hides collections-section', {
    annotation: [
      { type: 'feature', description: 'sidebar-toggle' },
      { type: 'severity', description: 'critical' },
    ],
  }, async ({ page }) => {
    // Default state is docs view
    await expect(page.locator('#api-docs-section')).toBeVisible();
    await expect(page.locator('#import-spec-section')).toBeVisible();
    await expect(page.locator('#collections-section')).not.toBeVisible();
  });

  test('clicking Collections button switches to collections view', {
    annotation: [
      { type: 'feature', description: 'sidebar-toggle' },
      { type: 'severity', description: 'critical' },
    ],
  }, async ({ page }) => {
    const collectionsBtn = page.locator('[data-testid="sidebar-toggle-collections"]');
    await collectionsBtn.click();

    // Collections button becomes active
    await expect(collectionsBtn).toHaveClass(/active/);
    await expect(page.locator('[data-testid="sidebar-toggle-docs"]')).not.toHaveClass(/active/);

    // Collections section visible, docs sections hidden
    await expect(page.locator('#collections-section')).toBeVisible();
    await expect(page.locator('#api-docs-section')).not.toBeVisible();
    await expect(page.locator('#import-spec-section')).not.toBeVisible();
  });

  test('clicking API Docs button switches back to docs view', {
    annotation: [
      { type: 'feature', description: 'sidebar-toggle' },
      { type: 'severity', description: 'critical' },
    ],
  }, async ({ page }) => {
    // Switch to collections first
    await page.locator('[data-testid="sidebar-toggle-collections"]').click();
    // Switch back to docs
    const docsBtn = page.locator('[data-testid="sidebar-toggle-docs"]');
    await docsBtn.click();

    await expect(docsBtn).toHaveClass(/active/);
    await expect(page.locator('#api-docs-section')).toBeVisible();
    await expect(page.locator('#import-spec-section')).toBeVisible();
    await expect(page.locator('#collections-section')).not.toBeVisible();
  });

  test('loading a spec auto-switches to API Docs view', {
    annotation: [
      { type: 'feature', description: 'sidebar-toggle' },
      { type: 'severity', description: 'high' },
    ],
  }, async ({ page }) => {
    // First switch to collections
    await page.locator('[data-testid="sidebar-toggle-collections"]').click();
    await expect(page.locator('#collections-section')).toBeVisible();

    // Load a spec
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: true });
    }, JSON.stringify(petstoreSpec));

    // Should auto-switch back to docs
    await expect(page.locator('[data-testid="sidebar-toggle-docs"]')).toHaveClass(/active/);
    await expect(page.locator('#api-docs-section')).toBeVisible();
    await expect(page.locator('#collections-section')).not.toBeVisible();
  });

  test('example click auto-switches to Collections view', {
    annotation: [
      { type: 'feature', description: 'sidebar-toggle' },
      { type: 'severity', description: 'critical' },
    ],
  }, async ({ page }) => {
    // Load spec
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: true });
    }, JSON.stringify(petstoreSpec));

    // Expand pets folder and click example
    await page.locator('[data-testid="folder-pets"]').click();
    const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
    await toggle.click();
    const exampleItem = page.locator('[data-testid="example-item"]').first();
    await expect(exampleItem).toBeVisible();
    await exampleItem.click();

    // Should auto-switch to collections
    await expect(page.locator('[data-testid="sidebar-toggle-collections"]')).toHaveClass(/active/);
    await expect(page.locator('#collections-section')).toBeVisible();
    await expect(page.locator('#api-docs-section')).not.toBeVisible();
  });

  test('opening a collection request auto-switches to Collections view', {
    annotation: [
      { type: 'feature', description: 'sidebar-toggle' },
      { type: 'severity', description: 'high' },
    ],
  }, async ({ page }) => {
    // Load spec and create a collection request via example click
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: true });
    }, JSON.stringify(petstoreSpec));

    await page.locator('[data-testid="folder-pets"]').click();
    const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
    await toggle.click();
    const exampleItem = page.locator('[data-testid="example-item"]').first();
    await exampleItem.click();

    // Now switch back to docs view
    await page.locator('[data-testid="sidebar-toggle-docs"]').click();
    await expect(page.locator('#api-docs-section')).toBeVisible();

    // Now open a saved request from collections view programmatically
    await page.evaluate(() => {
      const col = window.appState.collections[0];
      if (col && col.requests[0]) {
        window.openCollectionRequest(col, col.requests[0]);
      }
    });

    // Should auto-switch to collections
    await expect(page.locator('[data-testid="sidebar-toggle-collections"]')).toHaveClass(/active/);
    await expect(page.locator('#collections-section')).toBeVisible();
  });

  test('docs-count updates when spec is loaded', {
    annotation: [
      { type: 'feature', description: 'sidebar-toggle' },
      { type: 'severity', description: 'high' },
    ],
  }, async ({ page }) => {
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: true });
    }, JSON.stringify(petstoreSpec));

    const docsCount = page.locator('#docs-count');
    const countText = await docsCount.textContent();
    expect(parseInt(countText, 10)).toBeGreaterThan(0);
  });
});
