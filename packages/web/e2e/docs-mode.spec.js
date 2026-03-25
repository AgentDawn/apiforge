import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

test.describe('Docs Mode', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: true });
    }, JSON.stringify(petstoreSpec));
    await expect(page.getByTestId('collection-name')).toHaveText('Petstore API');
  });

  test('should show tab bar with client tab active by default', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    const tabBar = page.locator('[data-testid="request-tab-bar"]');
    await expect(tabBar).toBeVisible();
    await expect(page.locator('.request-panel')).toBeVisible();
    await expect(page.getByTestId('docs-panel')).toHaveClass(/hidden/);
  });

  test('should open docs tab by default when clicking endpoint after spec import', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Click endpoint in spec mode', async () => {
      await page.locator('.folder-header', { hasText: 'Pets' }).click();
      await page.getByTestId('endpoint-get--pets').click();
    });

    await test.step('Verify: Docs tab opened', async () => {
      await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);
      await expect(page.locator('.request-panel')).toHaveClass(/hidden/);
      const activeTab = page.locator('[data-testid="request-tab"].active');
      await expect(activeTab).toHaveAttribute('data-tab-type', 'docs');
    });
  });

  test('should create docs tab and show docs panel', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);
    await expect(page.locator('.request-panel')).toHaveClass(/hidden/);
    await expect(page.locator('.response-panel')).toHaveClass(/hidden/);
  });

  test('should show endpoint documentation when selected in docs tab', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Click endpoint', async () => {
      await page.locator('.folder-header', { hasText: 'Pets' }).click();
      await page.getByTestId('endpoint-get--pets').click();
    });

    await test.step('Verify: Documentation displayed', async () => {
      const content = page.getByTestId('docs-content');
      await expect(content).not.toHaveClass(/hidden/);
      await expect(page.locator('#docs-empty')).toHaveClass(/hidden/);
      await expect(content.locator('.docs-method-badge')).toContainText('GET');
      await expect(content.locator('.docs-path')).toContainText('/pets');
      await expect(page.getByTestId('docs-try-btn')).toBeVisible();
    });
  });

  test('should show responses section in docs view', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const content = page.getByTestId('docs-content');
    await expect(content.locator('.docs-section-title', { hasText: 'Responses' })).toBeVisible();
    await expect(content.locator('.response-code-badge', { hasText: '200' })).toBeVisible();
  });

  test('should show request body and schema for POST endpoint', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-post--pets').click();

    const content = page.getByTestId('docs-content');
    await expect(content.locator('.docs-section-title', { hasText: 'Request Body' })).toBeVisible();
    await expect(content.locator('.docs-example-block').first()).toBeVisible();
    await expect(content.locator('.schema-prop-name').first()).toBeVisible();
  });

  test('should show parameters for endpoint with path params', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets--id-').click();

    const content = page.getByTestId('docs-content');
    await expect(content.locator('.docs-section-title', { hasText: 'Parameters' })).toBeVisible();
    await expect(content.locator('.param-name', { hasText: 'id' })).toBeVisible();
  });

  test('Try it button should create client tab with endpoint loaded', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open docs tab', async () => {
      await page.locator('.folder-header', { hasText: 'Pets' }).click();
      await page.getByTestId('endpoint-post--pets').click();
      await expect(page.getByTestId('docs-content')).not.toHaveClass(/hidden/);
    });

    await test.step('Action: Click Try it', async () => {
      await page.getByTestId('docs-try-btn').click();
    });

    await test.step('Verify: Client tab with endpoint loaded', async () => {
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      await expect(page.getByTestId('docs-panel')).toHaveClass(/hidden/);
      await expect(page.getByTestId('method-select')).toHaveValue('POST');
      await expect(page.getByTestId('url-input')).toHaveValue(/\/pets/);
    });
  });

  test('should switch between endpoints in docs tab', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Click first endpoint', async () => {
      await page.locator('.folder-header', { hasText: 'Pets' }).click();
      await page.getByTestId('endpoint-get--pets').click();
      await expect(page.getByTestId('docs-content').locator('.docs-path')).toContainText('/pets');
      await expect(page.getByTestId('docs-content').locator('.docs-method-badge')).toContainText('GET');
    });

    await test.step('Action: Switch to POST endpoint', async () => {
      await page.getByTestId('endpoint-post--pets').click();
    });

    await test.step('Verify: Docs updated to POST', async () => {
      await expect(page.getByTestId('docs-content').locator('.docs-method-badge')).toContainText('POST');
      await expect(page.getByTestId('docs-content').locator('.docs-section-title', { hasText: 'Request Body' })).toBeVisible();
    });
  });

  test('should show both client and docs tabs for same endpoint', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open docs tab', async () => {
      await page.locator('.folder-header', { hasText: 'Pets' }).click();
      await page.getByTestId('endpoint-get--pets').click();
      await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);
    });

    await test.step('Action: Create client tab via Try it', async () => {
      const tabsBefore = await page.locator('[data-testid="request-tab"]').count();
      await page.getByTestId('docs-try-btn').click();
      await expect(page.locator('[data-testid="request-tab"]')).toHaveCount(tabsBefore + 1);
    });

    await test.step('Verify: Active tab is client type', async () => {
      const activeTab = page.locator('[data-testid="request-tab"].active');
      await expect(activeTab).toHaveAttribute('data-tab-type', 'client');
    });
  });

  test('should show request panel when switching to client tab', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Create docs and client tabs', async () => {
      await page.locator('.folder-header', { hasText: 'Pets' }).click();
      await page.getByTestId('endpoint-get--pets').click();
      await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);
      await page.getByTestId('docs-try-btn').click();
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
    });

    await test.step('Action: Switch between tabs', async () => {
      const docsTab = page.locator('[data-testid="request-tab"][data-tab-type="docs"]');
      await docsTab.click();
      await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);

      const clientTab = page.locator('[data-testid="request-tab"][data-tab-type="client"]').last();
      await clientTab.click();
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      await expect(page.getByTestId('docs-panel')).toHaveClass(/hidden/);
    });
  });

  test('tab bar always visible regardless of tab type', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    const tabBar = page.locator('[data-testid="request-tab-bar"]');
    await expect(tabBar).toBeVisible();

    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();
    await expect(tabBar).toBeVisible();
  });

  test('should show two-column layout in docs tab', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const content = page.getByTestId('docs-content');
    await expect(content).not.toHaveClass(/hidden/);
    await expect(content.locator('.docs-two-col')).toBeVisible();
    await expect(content.locator('.docs-left')).toBeVisible();
    await expect(content.locator('.docs-right')).toBeVisible();
  });

  test('should display request example in right column for POST endpoint', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-post--pets').click();

    await expect(page.getByTestId('docs-request-example')).toBeVisible();
    await expect(page.getByTestId('docs-request-example').locator('.docs-example-block')).toBeVisible();
  });

  test('should show response example tabs with status codes', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const respExamples = page.getByTestId('docs-response-examples');
    await expect(respExamples).toBeVisible();
    await expect(page.getByTestId('docs-resp-tabs')).toBeVisible();
    const firstTab = page.getByTestId('docs-resp-tab-200');
    await expect(firstTab).toBeVisible();
    await expect(firstTab).toContainText('200');
  });

  test('should switch between response tabs', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const tab200 = page.getByTestId('docs-resp-tab-200');
    await expect(tab200).toHaveClass(/active/);
    await expect(page.getByTestId('docs-resp-panel-200')).not.toHaveClass(/hidden/);

    const allTabs = page.getByTestId('docs-resp-tabs').locator('.docs-resp-tab');
    const tabCount = await allTabs.count();
    if (tabCount > 1) {
      const secondTab = allTabs.nth(1);
      const secondCode = await secondTab.getAttribute('data-tab-code');
      await secondTab.click();
      await expect(secondTab).toHaveClass(/active/);
      await expect(tab200).not.toHaveClass(/active/);
      await expect(page.locator('[data-tab-panel="' + secondCode + '"]')).not.toHaveClass(/hidden/);
      await expect(page.getByTestId('docs-resp-panel-200')).toHaveClass(/hidden/);
    }
  });

  test('should have sticky right column', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'low' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    await expect(page.getByTestId('docs-right-sticky')).toBeVisible();
    const isSticky = await page.getByTestId('docs-right-sticky').evaluate((el) => {
      return window.getComputedStyle(el).position === 'sticky';
    });
    expect(isSticky).toBe(true);
  });

  test('should create docs tab for endpoint via endpoint click in spec mode', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    await expect(page.getByTestId('docs-panel')).not.toHaveClass(/hidden/);
    await expect(page.locator('.request-panel')).toHaveClass(/hidden/);
    await expect(page.getByTestId('docs-content').locator('.docs-path')).toContainText('/pets');
  });

  test('should create client tab from docs tab via Try it', {
    annotation: [
      { type: 'feature', description: 'docs-mode' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open docs for POST endpoint', async () => {
      await page.locator('.folder-header', { hasText: 'Pets' }).click();
      await page.getByTestId('endpoint-post--pets').click();
    });

    await test.step('Action: Click Try it', async () => {
      const tabCountBefore = await page.locator('[data-testid="request-tab"]').count();
      await page.getByTestId('docs-try-btn').click();
      const tabCountAfter = await page.locator('[data-testid="request-tab"]').count();
      expect(tabCountAfter).toBeGreaterThanOrEqual(tabCountBefore);
    });

    await test.step('Verify: Client tab with POST method', async () => {
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      await expect(page.getByTestId('method-select')).toHaveValue('POST');
    });
  });
});
