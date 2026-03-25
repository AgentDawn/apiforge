import { test, expect } from '@playwright/test';

test.describe('Response Field Hide/Show', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  /** Helper: inject a JSON response into the response panel */
  async function injectResponse(page, json) {
    await page.evaluate((jsonStr) => {
      document.querySelector('#response-empty').classList.add('hidden');
      document.querySelector('#response-content').classList.remove('hidden');
      document.querySelector('#response-status').textContent = '200 OK';
      const formatted = JSON.stringify(JSON.parse(jsonStr), null, 2);
      window._originalResponseJson = formatted;
      window._hiddenResponseFields && window._hiddenResponseFields.clear();
      window.responseEditor.setValue(formatted);
    }, JSON.stringify(json));
    // Wait for mutation observer to inject hide buttons
    await page.waitForTimeout(200);
  }

  test('should show hide button on hover over response field', {
    annotation: [
      { type: 'feature', description: 'response-field-hide' },
      { type: 'severity', description: 'high' },
    ],
  }, async ({ page }) => {
    await injectResponse(page, { id: 1, name: 'test', email: 'a@b.com' });

    // Find a line with a key
    const line = page.locator('.je-line').filter({ has: page.locator('.je-key') }).first();
    await expect(line).toBeVisible();

    // Hide button should exist but be hidden by CSS (display:none until hover)
    const hideBtn = line.locator('.je-hide-btn');
    await expect(hideBtn).toBeAttached();

    // Hover over the line to show the button
    await line.hover();
    await expect(hideBtn).toBeVisible();
  });

  test('should hide field when clicking hide button', {
    annotation: [
      { type: 'feature', description: 'response-field-hide' },
      { type: 'severity', description: 'high' },
    ],
  }, async ({ page }) => {
    await injectResponse(page, { id: 1, name: 'test', email: 'a@b.com' });

    // The response should contain "id" key
    const codeArea = page.locator('[data-testid="response-body"] .je-code');
    await expect(codeArea).toContainText('"id"');

    // Find the line with "id" key and hover to show the hide button
    const idLine = page.locator('.je-line').filter({ hasText: '"id"' }).first();
    await idLine.hover();

    // Click the hide button
    const hideBtn = idLine.locator('.je-hide-btn');
    await hideBtn.click({ force: true });

    // Wait for re-render
    await page.waitForTimeout(200);

    // The "id" key should no longer appear in the response
    await expect(codeArea).not.toContainText('"id"');
    // Other fields should still be present
    await expect(codeArea).toContainText('"name"');
    await expect(codeArea).toContainText('"email"');
  });

  test('should show hidden field badge', {
    annotation: [
      { type: 'feature', description: 'response-field-hide' },
      { type: 'severity', description: 'high' },
    ],
  }, async ({ page }) => {
    await injectResponse(page, { id: 1, name: 'test', ownerId: 42 });

    // Hide the "ownerId" field
    const ownerLine = page.locator('.je-line').filter({ hasText: '"ownerId"' }).first();
    await ownerLine.hover();
    await ownerLine.locator('.je-hide-btn').click({ force: true });
    await page.waitForTimeout(200);

    // The hidden bar should be visible
    const hiddenBar = page.getByTestId('response-hidden-bar');
    await expect(hiddenBar).toBeVisible();

    // A badge for ownerId should exist
    const badge = page.getByTestId('hidden-badge-ownerId');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('ownerId');
  });

  test('should restore field when clicking badge remove', {
    annotation: [
      { type: 'feature', description: 'response-field-hide' },
      { type: 'severity', description: 'high' },
    ],
  }, async ({ page }) => {
    await injectResponse(page, { id: 1, name: 'test', secret: 'hidden' });

    // Hide "secret"
    const secretLine = page.locator('.je-line').filter({ hasText: '"secret"' }).first();
    await secretLine.hover();
    await secretLine.locator('.je-hide-btn').click({ force: true });
    await page.waitForTimeout(200);

    // Verify it's hidden
    const codeArea = page.locator('[data-testid="response-body"] .je-code');
    await expect(codeArea).not.toContainText('"secret"');

    // Click the remove button on the badge
    const removeBtn = page.getByTestId('hidden-remove-secret');
    await removeBtn.click();
    await page.waitForTimeout(200);

    // The field should be restored
    await expect(codeArea).toContainText('"secret"');

    // The hidden bar should be hidden again
    const hiddenBar = page.getByTestId('response-hidden-bar');
    await expect(hiddenBar).toBeHidden();
  });

  test('should hide nested object fields', {
    annotation: [
      { type: 'feature', description: 'response-field-hide' },
      { type: 'severity', description: 'high' },
    ],
  }, async ({ page }) => {
    await injectResponse(page, {
      id: 1,
      address: { street: '123 Main', city: 'NYC' },
      name: 'test',
    });

    // Hide "address" - should hide the entire object
    const addressLine = page.locator('.je-line').filter({ hasText: '"address"' }).first();
    await addressLine.hover();
    await addressLine.locator('.je-hide-btn').click({ force: true });
    await page.waitForTimeout(200);

    const codeArea = page.locator('[data-testid="response-body"] .je-code');
    // "address", "street", "city" should all be gone
    await expect(codeArea).not.toContainText('"address"');
    await expect(codeArea).not.toContainText('"street"');
    await expect(codeArea).not.toContainText('"city"');
    // Other fields remain
    await expect(codeArea).toContainText('"id"');
    await expect(codeArea).toContainText('"name"');

    // Badge should show
    const badge = page.getByTestId('hidden-badge-address');
    await expect(badge).toBeVisible();
  });
});
