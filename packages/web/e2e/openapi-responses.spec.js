import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

test.describe('OpenAPI Response Codes - NestJS Spec Parsing', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: false });
    }, JSON.stringify(petstoreSpec));
    await expect(page.getByTestId('collection-name')).toHaveText('Petstore API');
  });

  test('should show 200 and 401 responses for GET /pets', {
    annotation: [
      { type: 'feature', description: 'openapi-responses' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate to GET /pets', async () => {
      await page.locator('.folder-header', { hasText: 'Pets' }).click();
      await page.getByTestId('endpoint-get--pets').click();
    });

    await test.step('Verify: Response codes displayed', async () => {
      const responses = page.getByTestId('expected-responses');
      await expect(responses).toBeVisible();
      await expect(page.getByTestId('response-code-200')).toBeVisible();
      await expect(page.getByTestId('response-code-200')).toContainText('List of pets');
      await expect(page.getByTestId('response-code-401')).toBeVisible();
      await expect(page.getByTestId('response-code-401')).toContainText('Unauthorized');
    });
  });

  test('should show 201, 400, 401, 409 responses for POST /pets', {
    annotation: [
      { type: 'feature', description: 'openapi-responses' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-post--pets').click();

    await expect(page.getByTestId('response-code-201')).toBeVisible();
    await expect(page.getByTestId('response-code-201')).toContainText('Pet created');
    await expect(page.getByTestId('response-code-400')).toBeVisible();
    await expect(page.getByTestId('response-code-400')).toContainText('name and species are required');
    await expect(page.getByTestId('response-code-401')).toBeVisible();
    await expect(page.getByTestId('response-code-409')).toBeVisible();
    await expect(page.getByTestId('response-code-409')).toContainText('already exists');
  });

  test('should show 200, 400, 401, 404 responses for GET /pets/{id}', {
    annotation: [
      { type: 'feature', description: 'openapi-responses' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets--id-').click();

    await expect(page.getByTestId('response-code-200')).toBeVisible();
    await expect(page.getByTestId('response-code-400')).toBeVisible();
    await expect(page.getByTestId('response-code-400')).toContainText('positive integer');
    await expect(page.getByTestId('response-code-401')).toBeVisible();
    await expect(page.getByTestId('response-code-404')).toBeVisible();
    await expect(page.getByTestId('response-code-404')).toContainText('not found');
  });

  test('should show 204 response for DELETE /pets/{id}', {
    annotation: [
      { type: 'feature', description: 'openapi-responses' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-delete--pets--id-').click();

    await expect(page.getByTestId('response-code-204')).toBeVisible();
    await expect(page.getByTestId('response-code-204')).toContainText('deleted');
  });

  test('should color-code response badges correctly', {
    annotation: [
      { type: 'feature', description: 'openapi-responses' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-post--pets').click();

    const badge201 = page.getByTestId('response-code-201').locator('.response-code-badge');
    await expect(badge201).toHaveClass(/response-code-success/);

    const badge400 = page.getByTestId('response-code-400').locator('.response-code-badge');
    await expect(badge400).toHaveClass(/response-code-client-error/);

    const badge409 = page.getByTestId('response-code-409').locator('.response-code-badge');
    await expect(badge409).toHaveClass(/response-code-client-error/);
  });

  test('should display responses sorted by status code', {
    annotation: [
      { type: 'feature', description: 'openapi-responses' },
      { type: 'severity', description: 'low' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-post--pets').click();

    const badges = page.locator('.response-code-badge');
    const codes = await badges.allTextContents();
    const numbers = codes.map(Number);
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBeGreaterThanOrEqual(numbers[i - 1]);
    }
  });

  test('should show params table alongside response codes', {
    annotation: [
      { type: 'feature', description: 'openapi-responses' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    await expect(page.getByTestId('params-table')).toBeVisible();
    await expect(page.getByTestId('expected-responses')).toBeVisible();
    await expect(page.getByTestId('params-table')).toContainText('species');
    await expect(page.getByTestId('params-table')).toContainText('limit');
  });

  test('should show only responses when no query params exist', {
    annotation: [
      { type: 'feature', description: 'openapi-responses' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Users' }).click();
    await page.getByTestId('endpoint-get--users').click();

    await expect(page.locator('.hint-text')).toContainText('No query parameters');
    await expect(page.getByTestId('expected-responses')).toBeVisible();
    await expect(page.getByTestId('response-code-200')).toBeVisible();
  });
});
