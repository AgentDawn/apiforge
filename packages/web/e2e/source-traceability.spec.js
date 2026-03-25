import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

// Build a modified spec for stale detection
function buildModifiedSpec(spec, opts = {}) {
  const modified = JSON.parse(JSON.stringify(spec));
  if (opts.title) modified.info.title = opts.title;
  if (opts.removePath) {
    delete modified.paths[opts.removePath];
  }
  if (opts.marker) modified.info['x-marker'] = opts.marker;
  return modified;
}

const specStr = JSON.stringify(petstoreSpec);

/** Load spec and click first endpoint to get a spec-linked client tab */
async function loadSpecAndClickEndpoint(page) {
  await page.evaluate((s) => {
    loadSpec(JSON.parse(s), { specMode: false });
  }, specStr);

  await expect(page.locator('[data-testid="collection-name"]')).toBeVisible({ timeout: 5000 });

  const folder = page.locator('.folder-header').first();
  await folder.click();
  const endpoint = page.locator('.endpoint-item').first();
  await expect(endpoint).toBeVisible({ timeout: 3000 });
  await endpoint.click();
}

test.describe('Source Traceability', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('[data-testid="request-tab-bar"]');
  });

  test('should show source breadcrumb for spec-created tab', {
    annotation: [
      { type: 'feature', description: 'source-traceability' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and click endpoint', async () => {
      await loadSpecAndClickEndpoint(page);
    });

    await test.step('Verify: Source breadcrumb visible', async () => {
      const breadcrumb = page.locator('[data-testid="source-breadcrumb"]');
      await expect(breadcrumb).toBeVisible({ timeout: 3000 });
      const text = await breadcrumb.textContent();
      expect(text).toContain(petstoreSpec.info.title);
      const docsBtn = page.locator('[data-testid="source-open-docs"]');
      await expect(docsBtn).toBeVisible();
    });
  });

  test('should hide source breadcrumb for manually created tab', {
    annotation: [
      { type: 'feature', description: 'source-traceability' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('[data-testid="tab-new"]').click();
    const breadcrumb = page.locator('[data-testid="source-breadcrumb"]');
    await expect(breadcrumb).toBeHidden();
  });

  test('should open docs tab when clicking View Docs in breadcrumb', {
    annotation: [
      { type: 'feature', description: 'source-traceability' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and verify breadcrumb', async () => {
      await loadSpecAndClickEndpoint(page);
      const breadcrumb = page.locator('[data-testid="source-breadcrumb"]');
      await expect(breadcrumb).toBeVisible({ timeout: 3000 });
    });

    await test.step('Action: Click View Docs', async () => {
      const tabCountBefore = await page.locator('[data-testid="request-tab"]').count();
      await page.locator('[data-testid="source-open-docs"]').click();
      const tabCountAfter = await page.locator('[data-testid="request-tab"]').count();
      expect(tabCountAfter).toBeGreaterThan(tabCountBefore);
    });

    await test.step('Verify: Docs panel visible', async () => {
      await expect(page.locator('[data-testid="docs-panel"]')).toBeVisible();
    });
  });

  test('should show spec title and endpoint path in breadcrumb', {
    annotation: [
      { type: 'feature', description: 'source-traceability' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await loadSpecAndClickEndpoint(page);

    const breadcrumb = page.locator('[data-testid="source-breadcrumb"]');
    await expect(breadcrumb).toBeVisible({ timeout: 3000 });
    const text = await breadcrumb.textContent();
    expect(text).toContain(petstoreSpec.info.title);
    expect(text).toContain('>');
    expect(text).toMatch(/\//);
  });

  test('should mark tabs as stale when spec is re-imported with changes', {
    annotation: [
      { type: 'feature', description: 'source-traceability' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and verify source icon', async () => {
      await loadSpecAndClickEndpoint(page);
      const sourceIcon = page.locator('[data-testid="source-link-icon"]');
      await expect(sourceIcon.first()).toBeVisible({ timeout: 3000 });
    });

    await test.step('Action: Re-import modified spec', async () => {
      const modifiedSpec = buildModifiedSpec(petstoreSpec, { title: 'Modified Petstore', marker: 'changed' });
      await page.evaluate((s) => {
        loadSpec(JSON.parse(s), { specMode: false });
      }, JSON.stringify(modifiedSpec));
    });

    await test.step('Verify: Stale tabs visible', async () => {
      const staleTabs = page.locator('.request-tab.stale');
      await expect(staleTabs.first()).toBeVisible({ timeout: 3000 });
    });
  });

  test('should show stale indicator on tab bar', {
    annotation: [
      { type: 'feature', description: 'source-traceability' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and re-import', async () => {
      await loadSpecAndClickEndpoint(page);
      const modifiedSpec = buildModifiedSpec(petstoreSpec, { title: 'Changed API', marker: 'v2' });
      await page.evaluate((s) => {
        loadSpec(JSON.parse(s), { specMode: false });
      }, JSON.stringify(modifiedSpec));
    });

    await test.step('Verify: Stale tab has warning icon with title', async () => {
      const staleIcon = page.locator('[data-testid="tab-stale-icon"]').first();
      await expect(staleIcon).toBeVisible({ timeout: 3000 });
      const title = await staleIcon.getAttribute('title');
      expect(title).toContain('spec');
    });
  });

  test('should detect removed endpoints after spec change', {
    annotation: [
      { type: 'feature', description: 'source-traceability' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec', async () => {
      await loadSpecAndClickEndpoint(page);
    });

    await test.step('Action: Re-import without first path', async () => {
      const paths = Object.keys(petstoreSpec.paths);
      const removePath = paths[0];
      const modifiedSpec = buildModifiedSpec(petstoreSpec, { removePath, marker: 'removed' });
      await page.evaluate((s) => {
        loadSpec(JSON.parse(s), { specMode: false });
      }, JSON.stringify(modifiedSpec));
    });

    await test.step('Action: Switch to stale tab to show breadcrumb message', async () => {
      const staleTab = page.locator('.request-tab.stale').first();
      await expect(staleTab).toBeVisible({ timeout: 3000 });
      await staleTab.click();
    });

    await test.step('Verify: Tab shows "no longer exists" and breadcrumb reflects removal', async () => {
      const staleIcon = page.locator('[data-testid="tab-stale-icon"]').first();
      await expect(staleIcon).toBeVisible({ timeout: 3000 });
      const title = await staleIcon.getAttribute('title');
      expect(title).toContain('no longer exists');
      const staleMsg = page.locator('[data-testid="source-stale-msg"]');
      await expect(staleMsg).toBeVisible();
      const msgText = await staleMsg.textContent();
      expect(msgText).toContain('no longer exists');
    });
  });

  test('should show stale warning icon before close button in tab', {
    annotation: [
      { type: 'feature', description: 'source-traceability' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and re-import modified', async () => {
      await loadSpecAndClickEndpoint(page);
      const modifiedSpec = buildModifiedSpec(petstoreSpec, { title: 'Updated API', marker: 'v3' });
      await page.evaluate((s) => {
        loadSpec(JSON.parse(s), { specMode: false });
      }, JSON.stringify(modifiedSpec));
    });

    await test.step('Verify: Stale icon visible inside tab before close button', async () => {
      const staleIcon = page.locator('[data-testid="tab-stale-icon"]').first();
      await expect(staleIcon).toBeVisible({ timeout: 3000 });
      // Stale icon should appear before close button (lower DOM position)
      const tab = page.locator('.request-tab.stale').first();
      const iconIdx = await tab.evaluate((el) => {
        const children = [...el.querySelectorAll('span')];
        const stale = children.findIndex(c => c.dataset.testid === 'tab-stale-icon');
        const close = children.findIndex(c => c.dataset.testid === 'tab-close');
        return { stale, close };
      });
      expect(iconIdx.stale).toBeLessThan(iconIdx.close);
    });
  });

  test('should show stale message with warning icon in breadcrumb', {
    annotation: [
      { type: 'feature', description: 'source-traceability' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec, click endpoint, re-import', async () => {
      await loadSpecAndClickEndpoint(page);
      const modifiedSpec = buildModifiedSpec(petstoreSpec, { title: 'Updated API', marker: 'v4' });
      await page.evaluate((s) => {
        loadSpec(JSON.parse(s), { specMode: false });
      }, JSON.stringify(modifiedSpec));
    });

    await test.step('Action: Switch to stale tab', async () => {
      const staleTab = page.locator('.request-tab.stale').first();
      await expect(staleTab).toBeVisible({ timeout: 3000 });
      await staleTab.click();
    });

    await test.step('Verify: Stale message in breadcrumb', async () => {
      const staleMsg = page.locator('[data-testid="source-stale-msg"]');
      await expect(staleMsg).toBeVisible({ timeout: 3000 });
      const text = await staleMsg.textContent();
      expect(text).toContain('Spec has been updated');
    });

    await test.step('Verify: Refresh from Spec button visible', async () => {
      const refreshBtn = page.locator('[data-testid="source-refresh-btn"]');
      await expect(refreshBtn).toBeVisible();
    });
  });

  test('should refresh tab from latest spec when clicking Refresh button', {
    annotation: [
      { type: 'feature', description: 'source-traceability' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and click endpoint', async () => {
      await loadSpecAndClickEndpoint(page);
    });

    await test.step('Action: Re-import modified spec to make tab stale', async () => {
      const modifiedSpec = buildModifiedSpec(petstoreSpec, { title: 'Refreshed API', marker: 'v5' });
      await page.evaluate((s) => {
        loadSpec(JSON.parse(s), { specMode: false });
      }, JSON.stringify(modifiedSpec));
      await expect(page.locator('.request-tab.stale').first()).toBeVisible({ timeout: 3000 });
    });

    await test.step('Action: Switch to stale tab and verify Refresh button', async () => {
      const staleTab = page.locator('.request-tab.stale').first();
      await staleTab.click();
      const refreshBtn = page.locator('[data-testid="source-refresh-btn"]');
      await expect(refreshBtn).toBeVisible({ timeout: 3000 });
      // Capture screenshot showing stale state + Refresh button before clicking
      await expect(page.locator('[data-testid="source-stale-msg"]')).toBeVisible();
    });

    await test.step('Action: Click Refresh from Spec', async () => {
      await page.locator('[data-testid="source-refresh-btn"]').click();
    });

    await test.step('Verify: Tab is no longer stale after refresh', async () => {
      const staleTabs = page.locator('.request-tab.stale');
      await expect(staleTabs).toHaveCount(0, { timeout: 3000 });
      await expect(page.locator('[data-testid="source-stale-msg"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="source-refresh-btn"]')).toHaveCount(0);
    });
  });

  test('should include source in saved examples', {
    annotation: [
      { type: 'feature', description: 'source-traceability' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec and click endpoint', async () => {
      await loadSpecAndClickEndpoint(page);
      await page.evaluate(() => {
        window._origPrompt = window.prompt;
        window.prompt = () => 'Test Example';
      });
    });

    await test.step('Action: Save example', async () => {
      const saveBtn = page.locator('[data-testid="save-example-btn"]');
      await expect(saveBtn).toBeVisible({ timeout: 3000 });
      await saveBtn.click();
    });

    await test.step('Verify: Source included in saved example', async () => {
      const hasSource = await page.evaluate(() => {
        const examples = JSON.parse(localStorage.getItem('apiforge-examples') || '{}');
        for (const key of Object.keys(examples)) {
          for (const ex of examples[key]) {
            if (ex.source && ex.source.specTitle && ex.source.endpointKey) return true;
          }
        }
        return false;
      });
      expect(hasSource).toBeTruthy();

      await page.evaluate(() => {
        if (window._origPrompt) window.prompt = window._origPrompt;
      });
    });
  });
});
