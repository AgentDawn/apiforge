import { test, expect } from '@playwright/test';

test.describe('cURL & Share Features', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ─── Feature 1: Copy as cURL ────────────────────────────

  test('should show Copy cURL button', {
    annotation: [
      { type: 'feature', description: 'curl-share' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await expect(page.locator('[data-testid="copy-curl-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="copy-curl-btn"]')).toHaveText('cURL');
  });

  test('should copy valid cURL command to clipboard', {
    annotation: [
      { type: 'feature', description: 'curl-share' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page, context }) => {
    await test.step('Setup: Set URL and grant permissions', async () => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.locator('[data-testid="url-input"]').fill('https://api.example.com/pets');
    });

    await test.step('Action: Copy cURL', async () => {
      await page.locator('[data-testid="copy-curl-btn"]').click();
    });

    await test.step('Verify: Clipboard contains valid cURL', async () => {
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('curl');
      expect(clipboardText).toContain('https://api.example.com/pets');
    });
  });

  test('should include method, URL, headers in cURL', {
    annotation: [
      { type: 'feature', description: 'curl-share' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page, context }) => {
    await test.step('Setup: Configure POST request with headers', async () => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.locator('[data-testid="method-select"]').selectOption('POST');
      await page.locator('[data-testid="url-input"]').fill('https://api.example.com/pets');
      await page.locator('.tab', { hasText: 'Headers' }).click();
      await page.locator('[data-testid="add-header-btn"]').click();
      await page.locator('[data-testid="header-key"]').first().fill('X-Custom');
      await page.locator('[data-testid="header-value"]').first().fill('test123');
    });

    await test.step('Action: Copy cURL', async () => {
      await page.locator('[data-testid="copy-curl-btn"]').click();
    });

    await test.step('Verify: cURL contains method and headers', async () => {
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('-X POST');
      expect(clipboardText).toContain('https://api.example.com/pets');
      expect(clipboardText).toContain('X-Custom');
      expect(clipboardText).toContain('test123');
    });
  });

  test('should include body in cURL for POST requests', {
    annotation: [
      { type: 'feature', description: 'curl-share' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page, context }) => {
    await test.step('Setup: Configure POST with body', async () => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.locator('[data-testid="method-select"]').selectOption('POST');
      await page.locator('[data-testid="url-input"]').fill('https://api.example.com/pets');
      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.locator('[data-testid="body-type-json"]').click();
      await page.evaluate(() => {
        window.bodyEditor.setValue('{"name": "Buddy"}');
      });
    });

    await test.step('Verify: cURL contains body', async () => {
      await page.locator('[data-testid="copy-curl-btn"]').click();
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('-X POST');
      expect(clipboardText).toContain('-d');
      expect(clipboardText).toContain('Buddy');
    });
  });

  // ─── Feature 2: Import from cURL ───────────────────────

  test('should show Import cURL modal', {
    annotation: [
      { type: 'feature', description: 'curl-share' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await expect(page.locator('[data-testid="curl-import-modal"]')).toHaveClass(/hidden/);
    await page.locator('[data-testid="import-curl-btn"]').click();
    await expect(page.locator('[data-testid="curl-import-modal"]')).not.toHaveClass(/hidden/);
    await page.locator('#curl-import-cancel').click();
    await expect(page.locator('[data-testid="curl-import-modal"]')).toHaveClass(/hidden/);
  });

  test('should parse and import a cURL command', {
    annotation: [
      { type: 'feature', description: 'curl-share' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Import cURL', async () => {
      await page.locator('[data-testid="import-curl-btn"]').click();
      await page.locator('[data-testid="curl-import-input"]').fill(
        "curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' -d '{\"name\": \"Alice\"}'"
      );
      await page.locator('[data-testid="curl-import-submit"]').click();
    });

    await test.step('Verify: Modal closed', async () => {
      await expect(page.locator('[data-testid="curl-import-modal"]')).toHaveClass(/hidden/);
    });
  });

  test('should populate method and URL from imported cURL', {
    annotation: [
      { type: 'feature', description: 'curl-share' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Import cURL with PUT method', async () => {
      await page.locator('[data-testid="import-curl-btn"]').click();
      await page.locator('[data-testid="curl-import-input"]').fill(
        "curl -X PUT 'https://api.example.com/users/1'"
      );
      await page.locator('[data-testid="curl-import-submit"]').click();
    });

    await test.step('Verify: Method and URL populated', async () => {
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('PUT');
      await expect(page.locator('[data-testid="url-input"]')).toHaveValue('https://api.example.com/users/1');
    });
  });

  test('should populate headers from imported cURL', {
    annotation: [
      { type: 'feature', description: 'curl-share' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Import cURL with headers', async () => {
      await page.locator('[data-testid="import-curl-btn"]').click();
      await page.locator('[data-testid="curl-import-input"]').fill(
        "curl 'https://api.example.com/data' -H 'X-API-Key: secret123' -H 'Accept: application/json'"
      );
      await page.locator('[data-testid="curl-import-submit"]').click();
    });

    await test.step('Verify: URL and headers populated', async () => {
      await expect(page.locator('[data-testid="url-input"]')).toHaveValue('https://api.example.com/data');
      // Verify headers are in key-value table rows
      const headers = await page.evaluate(() => readHeaders());
      expect(headers).toHaveProperty('X-API-Key', 'secret123');
      expect(headers).toHaveProperty('Accept', 'application/json');
    });
  });

  // ─── Feature 3: Share Link ──────────────────────────────

  test('should show Share button', {
    annotation: [
      { type: 'feature', description: 'curl-share' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await expect(page.locator('[data-testid="share-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="share-btn"]')).toHaveText('Share');
  });

  test('should load shared request from URL hash', {
    annotation: [
      { type: 'feature', description: 'curl-share' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate and prepare', async () => {
      await page.goto('/');
      await expect(page.locator('[data-testid="send-btn"]')).toBeVisible();
    });

    await test.step('Action: Load shared request from hash', async () => {
      const shareData = {
        method: 'POST',
        url: 'https://api.example.com/shared',
        headers: { 'Content-Type': 'application/json' },
        body: '{"shared": true}',
        bodyType: 'json',
      };

      await page.evaluate((data) => {
        const json = JSON.stringify(data);
        const encoded = btoa(unescape(encodeURIComponent(json)));
        window.location.hash = '#/share/' + encoded;
        window.loadSharedRequest();
      }, shareData);
    });

    await test.step('Verify: Shared request loaded', async () => {
      await expect(page.locator('[data-testid="method-select"]')).toHaveValue('POST');
      await expect(page.locator('[data-testid="url-input"]')).toHaveValue('https://api.example.com/shared');
      const bodyContent = await page.evaluate(() => window.bodyEditor.getValue());
      expect(bodyContent).toContain('shared');
    });
  });

});
