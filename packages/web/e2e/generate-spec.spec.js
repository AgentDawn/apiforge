import { test, expect } from '@playwright/test';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { readFileSync, unlinkSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '..', '..', '..', 'examples', 'nestjs-sample', 'src');
const rustBinary = resolve(__dirname, '..', '..', '..', 'packages', 'spec-generator', 'target', 'release', 'apiforge-spec-generator.exe');
const outputFile = resolve(__dirname, '..', 'test-results', 'generate-spec-test.json');

test.describe('Generate Spec → Web UI E2E', () => {
  let spec;

  test.beforeAll(() => {
    if (!existsSync(rustBinary)) {
      throw new Error('Rust binary not found. Run: cd packages/spec-generator && cargo build --release');
    }
    execSync(`"${rustBinary}" --src "${srcDir}" --output "${outputFile}" --title "API"`, { stdio: 'pipe' });
    spec = JSON.parse(readFileSync(outputFile, 'utf8'));
  });

  test.afterAll(() => {
    if (existsSync(outputFile)) unlinkSync(outputFile);
  });

  test('should generate a valid OpenAPI 3.0 spec file', {
    annotation: [{ type: 'feature', description: 'generate-spec' }, { type: 'severity', description: 'critical' }],
  }, async ({ page }) => {
    expect(spec.openapi).toBe('3.0.0');
    expect(spec.info).toBeDefined();
    expect(spec.paths).toBeDefined();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);

    await page.goto('/');
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: false });
    }, JSON.stringify(spec));
    await expect(page.getByTestId('collection-name')).toHaveText('API');
  });

  test('should include both success and error responses (enriched)', {
    annotation: [{ type: 'feature', description: 'generate-spec' }, { type: 'severity', description: 'high' }],
  }, async ({ page }) => {
    // Find pet paths (may be /pets or /api/v1/pets depending on controller prefix)
    const petPostPath = Object.keys(spec.paths).find(p => p.endsWith('/pets') && spec.paths[p].post);
    const petGetByIdPath = Object.keys(spec.paths).find(p => p.match(/\/pets\/\{/) && spec.paths[p].get);

    expect(petPostPath).toBeTruthy();
    expect(petGetByIdPath).toBeTruthy();

    const postResponses = spec.paths[petPostPath].post.responses;
    expect(postResponses['201']).toBeDefined();
    // Enriched error responses from throw statements
    expect(postResponses['400']).toBeDefined();
    expect(postResponses['409']).toBeDefined();

    const getResponses = spec.paths[petGetByIdPath].get.responses;
    expect(getResponses['200']).toBeDefined();
    expect(getResponses['400']).toBeDefined();
    expect(getResponses['404']).toBeDefined();
  });

  test('should import spec and show collection tree', {
    annotation: [{ type: 'feature', description: 'generate-spec' }, { type: 'severity', description: 'high' }],
  }, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: false });
    }, JSON.stringify(spec));

    await expect(page.getByTestId('collection-name')).toHaveText('API');
    // Should have at least one folder
    const folders = page.locator('.folder-header');
    await expect(folders.first()).toBeVisible();
  });

  test('should show pet controller endpoints', {
    annotation: [{ type: 'feature', description: 'generate-spec' }, { type: 'severity', description: 'high' }],
  }, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: false });
    }, JSON.stringify(spec));

    // Expand folders and find pet endpoints
    const folders = page.locator('.folder-header');
    const count = await folders.count();
    for (let i = 0; i < count; i++) {
      await folders.nth(i).click();
    }

    // Should have GET and POST pet endpoints
    const endpoints = page.locator('.endpoint-item');
    const endpointCount = await endpoints.count();
    expect(endpointCount).toBeGreaterThan(0);

    // Find pet-related endpoints
    const petEndpoints = page.locator('.endpoint-item', { hasText: /pets/ });
    await expect(petEndpoints.first()).toBeVisible();
  });

  test('POST pets endpoint should show enriched error response codes', {
    annotation: [{ type: 'feature', description: 'generate-spec' }, { type: 'severity', description: 'high' }],
  }, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: false });
    }, JSON.stringify(spec));

    // Expand all folders
    const folders = page.locator('.folder-header');
    const count = await folders.count();
    for (let i = 0; i < count; i++) {
      await folders.nth(i).click();
    }

    // Click POST pets endpoint
    const postPets = page.locator('.endpoint-item').filter({ hasText: 'POST' }).filter({ hasText: /pets$/ }).first();
    await postPets.click();

    // Should show expected responses including enriched ones
    await expect(page.getByTestId('expected-responses')).toBeVisible();
    await expect(page.getByTestId('response-code-201')).toBeVisible();
    await expect(page.getByTestId('response-code-400')).toBeVisible();
    await expect(page.getByTestId('response-code-409')).toBeVisible();
  });

  test('GET pets/{id} should show enriched 404 response', {
    annotation: [{ type: 'feature', description: 'generate-spec' }, { type: 'severity', description: 'high' }],
  }, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: false });
    }, JSON.stringify(spec));

    const folders = page.locator('.folder-header');
    const count = await folders.count();
    for (let i = 0; i < count; i++) {
      await folders.nth(i).click();
    }

    const getById = page.locator('.endpoint-item').filter({ hasText: 'GET' }).filter({ hasText: /{id}/ }).first();
    await getById.click();

    await expect(page.getByTestId('expected-responses')).toBeVisible();
    await expect(page.getByTestId('response-code-200')).toBeVisible();
    await expect(page.getByTestId('response-code-404')).toBeVisible();
  });

  test('excluded endpoints should not appear', {
    annotation: [{ type: 'feature', description: 'generate-spec' }, { type: 'severity', description: 'high' }],
  }, async ({ page }) => {
    // @ApiExcludeEndpoint endpoints should not be in spec
    const paths = Object.keys(spec.paths);
    expect(paths.some(p => p.includes('/debug'))).toBeFalsy();
    expect(paths.some(p => p.includes('/cache/clear'))).toBeFalsy();
    expect(paths.some(p => p.includes('_internal/stats'))).toBeFalsy();

    // But visible internal endpoints should exist
    expect(paths.some(p => p.includes('/health'))).toBeTruthy();
    expect(paths.some(p => p.includes('/version'))).toBeTruthy();
  });

  test('response badges should have correct color classes', {
    annotation: [{ type: 'feature', description: 'generate-spec' }, { type: 'severity', description: 'medium' }],
  }, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: false });
    }, JSON.stringify(spec));

    const folders = page.locator('.folder-header');
    const count = await folders.count();
    for (let i = 0; i < count; i++) {
      await folders.nth(i).click();
    }

    const postPets = page.locator('.endpoint-item').filter({ hasText: 'POST' }).filter({ hasText: /pets$/ }).first();
    await postPets.click();

    const badge201 = page.getByTestId('response-code-201').locator('.response-code-badge');
    await expect(badge201).toHaveClass(/response-code-success/);

    const badge400 = page.getByTestId('response-code-400').locator('.response-code-badge');
    await expect(badge400).toHaveClass(/response-code-client-error/);
  });
});
