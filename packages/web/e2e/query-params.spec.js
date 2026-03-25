import { test, expect } from '@playwright/test';

// Minimal OpenAPI spec fixture with varied query parameters
const queryParamsSpec = {
  openapi: '3.0.0',
  info: { title: 'Query Params Test API', version: '1.0.0' },
  paths: {
    '/search': {
      get: {
        tags: ['Search'],
        operationId: 'search',
        summary: 'Search items',
        description: 'Search with multiple query parameters',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Search query string',
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 10 },
            description: 'Max number of results',
          },
          {
            name: 'offset',
            in: 'query',
            required: false,
            schema: { type: 'integer' },
            description: 'Pagination offset',
          },
          {
            name: 'active',
            in: 'query',
            required: false,
            schema: { type: 'boolean' },
            description: 'Filter by active status',
          },
        ],
        responses: {
          200: { description: 'Search results' },
          400: { description: 'Bad request' },
        },
      },
    },
    '/items': {
      get: {
        tags: ['Items'],
        operationId: 'listItems',
        summary: 'List items',
        description: 'Endpoint with no query parameters',
        parameters: [],
        responses: {
          200: { description: 'Item list' },
        },
      },
    },
  },
};

// Petstore spec path for reuse of multi-param tests
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

test.describe('Query Parameter Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((spec) => {
      loadSpec(spec, { specMode: false });
    }, queryParamsSpec);
    await expect(page.getByTestId('collection-name')).toHaveText('Query Params Test API');
  });

  test('should display params table with correct columns for endpoint with query params', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate to Search endpoint', async () => {
      await page.locator('.folder-header', { hasText: 'Search' }).click();
      await page.getByTestId('endpoint-get--search').click();
    });

    await test.step('Verify: Table columns are correct', async () => {
      const table = page.getByTestId('params-table');
      await expect(table).toBeVisible();
      await expect(table).toContainText('Name');
      await expect(table).toContainText('Type');
      await expect(table).toContainText('Required');
      await expect(table).toContainText('Description');
      await expect(table).toContainText('Default');
    });
  });

  test('should display parameter names from the spec', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Search' }).click();
    await page.getByTestId('endpoint-get--search').click();

    const table = page.getByTestId('params-table');
    await expect(table).toContainText('q');
    await expect(table).toContainText('limit');
    await expect(table).toContainText('offset');
    await expect(table).toContainText('active');
  });

  test('should display parameter types from the spec', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Search' }).click();
    await page.getByTestId('endpoint-get--search').click();

    const table = page.getByTestId('params-table');
    await expect(table).toContainText('string');
    await expect(table).toContainText('integer');
    await expect(table).toContainText('boolean');
  });

  test('should display parameter descriptions from the spec', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Search' }).click();
    await page.getByTestId('endpoint-get--search').click();

    const table = page.getByTestId('params-table');
    await expect(table).toContainText('Search query string');
    await expect(table).toContainText('Max number of results');
    await expect(table).toContainText('Pagination offset');
    await expect(table).toContainText('Filter by active status');
  });

  test('should show hint text when endpoint has no query params', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Items' }).click();
    await page.getByTestId('endpoint-get--items').click();

    await expect(page.locator('.hint-text')).toContainText('No query parameters');
    await expect(page.getByTestId('params-table')).not.toBeVisible();
  });
});

test.describe('Required vs Optional Parameters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((spec) => {
      loadSpec(spec, { specMode: false });
    }, queryParamsSpec);
    await expect(page.getByTestId('collection-name')).toHaveText('Query Params Test API');
  });

  test('should mark required params with Required indicator', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Search' }).click();
    await page.getByTestId('endpoint-get--search').click();

    const table = page.getByTestId('params-table');
    const requiredBadges = table.locator('.param-required');
    await expect(requiredBadges).toHaveCount(1);
    await expect(requiredBadges.first()).toContainText('Required');
  });

  test('should mark optional params with Optional indicator', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Search' }).click();
    await page.getByTestId('endpoint-get--search').click();

    const table = page.getByTestId('params-table');
    const optionalBadges = table.locator('.param-optional');
    await expect(optionalBadges).toHaveCount(3);
    await expect(optionalBadges.first()).toContainText('Optional');
  });

  test('should display default value when present', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Search' }).click();
    await page.getByTestId('endpoint-get--search').click();

    const table = page.getByTestId('params-table');
    await expect(table).toContainText('10');
  });

  test('should show dash for params without default value', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'low' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Search' }).click();
    await page.getByTestId('endpoint-get--search').click();

    const defaultCells = page.getByTestId('params-table').locator('.param-default');
    const texts = await defaultCells.allTextContents();
    expect(texts.filter((t) => t === '-').length).toBeGreaterThan(0);
  });
});

test.describe('URL Query Parameter Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((spec) => {
      loadSpec(spec, { specMode: false });
    }, queryParamsSpec);
    await expect(page.getByTestId('collection-name')).toHaveText('Query Params Test API');
  });

  test('should update URL input when user types query param manually', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Search' }).click();
    await page.getByTestId('endpoint-get--search').click();

    const urlInput = page.getByTestId('url-input');
    await urlInput.fill('/search?q=hello');
    await expect(urlInput).toHaveValue('/search?q=hello');
  });

  test('should reflect multiple query params in the URL input', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Search' }).click();
    await page.getByTestId('endpoint-get--search').click();

    const urlInput = page.getByTestId('url-input');
    await urlInput.fill('/search?q=hello&limit=5&offset=0');
    await expect(urlInput).toHaveValue('/search?q=hello&limit=5&offset=0');
  });

  test('should clear query params from URL when user removes them', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Search' }).click();
    await page.getByTestId('endpoint-get--search').click();

    const urlInput = page.getByTestId('url-input');
    await urlInput.fill('/search?q=hello&limit=5');
    await expect(urlInput).toHaveValue('/search?q=hello&limit=5');

    await urlInput.fill('/search');
    await expect(urlInput).toHaveValue('/search');
  });

  test('should preserve query params in URL across tab switches', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate and set URL with params', async () => {
      await page.locator('.folder-header', { hasText: 'Search' }).click();
      await page.getByTestId('endpoint-get--search').click();
      const urlInput = page.getByTestId('url-input');
      await urlInput.fill('/search?q=test&limit=20');
    });

    await test.step('Action: Switch tabs and back', async () => {
      await page.locator('.tab[data-tab="headers"]').click();
      await page.locator('.tab[data-tab="params"]').click();
    });

    await test.step('Verify: URL preserved', async () => {
      const urlInput = page.getByTestId('url-input');
      await expect(urlInput).toHaveValue('/search?q=test&limit=20');
    });
  });
});

test.describe('Query Params with Petstore Spec', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: false });
    }, JSON.stringify(petstoreSpec));
    await expect(page.getByTestId('collection-name')).toHaveText('Petstore API');
  });

  test('should show species and limit params for GET /pets', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const table = page.getByTestId('params-table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('species');
    await expect(table).toContainText('limit');
  });

  test('should show correct types for petstore query params', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const table = page.getByTestId('params-table');
    await expect(table).toContainText('string');
    await expect(table).toContainText('integer');
  });

  test('should show both params as Optional for GET /pets', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const table = page.getByTestId('params-table');
    const optionalBadges = table.locator('.param-optional');
    await expect(optionalBadges).toHaveCount(2);
  });

  test('should show default value 20 for limit param', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'low' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const table = page.getByTestId('params-table');
    await expect(table).toContainText('20');
  });

  test('should show descriptions for petstore query params', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'low' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const table = page.getByTestId('params-table');
    await expect(table).toContainText('Filter by species');
    await expect(table).toContainText('Max results');
  });

  test('should show No query parameters hint for GET /users', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'low' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Users' }).click();
    await page.getByTestId('endpoint-get--users').click();

    await expect(page.locator('.hint-text')).toContainText('No query parameters');
  });

  test('should add single query param to URL via URL input', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const urlInput = page.getByTestId('url-input');
    const baseVal = await urlInput.inputValue();
    await urlInput.fill(baseVal + '?species=cat');
    await expect(urlInput).toHaveValue(baseVal + '?species=cat');
  });

  test('should add multiple query params to URL via URL input', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const urlInput = page.getByTestId('url-input');
    const baseVal = await urlInput.inputValue();
    await urlInput.fill(baseVal + '?species=dog&limit=5');
    await expect(urlInput).toHaveValue(baseVal + '?species=dog&limit=5');
  });

  test('should remove query param by editing URL input', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const urlInput = page.getByTestId('url-input');
    const baseVal = await urlInput.inputValue();

    await urlInput.fill(baseVal + '?species=cat&limit=10');
    await expect(urlInput).toHaveValue(baseVal + '?species=cat&limit=10');

    await urlInput.fill(baseVal);
    await expect(urlInput).toHaveValue(baseVal);
    await expect(urlInput).not.toContainText('species');
  });

  test('should extract query params from URL using app utility', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const urlInput = page.getByTestId('url-input');
    const baseVal = await urlInput.inputValue();
    await urlInput.fill(baseVal + '?species=cat&limit=5');

    const params = await page.evaluate(() => window.getQueryParamsFromUrl());
    expect(params).toMatchObject({ species: 'cat', limit: '5' });
  });

  test('should return empty object when URL has no query params', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'low' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    const params = await page.evaluate(() => window.getQueryParamsFromUrl());
    expect(params).toEqual({});
  });

  test('should set query params on URL using app setQueryParamsOnUrl utility', {
    annotation: [
      { type: 'feature', description: 'query-params' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Pets' }).click();
    await page.getByTestId('endpoint-get--pets').click();

    await page.evaluate(() => window.setQueryParamsOnUrl({ species: 'rabbit', limit: '3' }));

    const urlInput = page.getByTestId('url-input');
    const val = await urlInput.inputValue();
    expect(val).toContain('species=rabbit');
    expect(val).toContain('limit=3');
  });
});

test.describe('Editable Params Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((spec) => {
      loadSpec(spec, { specMode: false });
    }, queryParamsSpec);
    await expect(page.getByTestId('collection-name')).toHaveText('Query Params Test API');
  });

  test('should show editable param inputs for spec parameters', {
    annotation: [
      { type: 'feature', description: 'params-editor' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate to endpoint', async () => {
      await page.locator('.folder-header', { hasText: 'Search' }).click();
      await page.getByTestId('endpoint-get--search').click();
    });

    await test.step('Verify: Editable inputs exist', async () => {
      const editor = page.getByTestId('params-editor');
      await expect(editor).toBeVisible();

      const valueInputs = editor.locator('[data-testid="param-value"]');
      await expect(valueInputs).toHaveCount(4);

      const keyInputs = editor.locator('[data-testid="param-key"]');
      await expect(keyInputs).toHaveCount(4);
      await expect(keyInputs.first()).toHaveAttribute('readonly', '');
    });
  });

  test('should sync param value changes to URL', {
    annotation: [
      { type: 'feature', description: 'params-editor' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate to endpoint', async () => {
      await page.locator('.folder-header', { hasText: 'Search' }).click();
      await page.getByTestId('endpoint-get--search').click();
    });

    await test.step('Action: Enable and fill param value', async () => {
      const editor = page.getByTestId('params-editor');
      const firstRow = editor.locator('tr.param-row').first();
      const checkbox = firstRow.locator('.param-enabled');
      if (!(await checkbox.isChecked())) {
        await checkbox.check();
      }
      const valueInput = firstRow.locator('[data-testid="param-value"]');
      await valueInput.fill('hello');
    });

    await test.step('Verify: URL contains param', async () => {
      const urlInput = page.getByTestId('url-input');
      const val = await urlInput.inputValue();
      expect(val).toContain('q=hello');
    });
  });

  test('should sync URL changes to param table', {
    annotation: [
      { type: 'feature', description: 'params-editor' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate and set URL', async () => {
      await page.locator('.folder-header', { hasText: 'Search' }).click();
      await page.getByTestId('endpoint-get--search').click();
      const urlInput = page.getByTestId('url-input');
      await urlInput.fill('/search?q=world&limit=50');
    });

    await test.step('Verify: Param table updated', async () => {
      const editor = page.getByTestId('params-editor');
      const qRow = editor.locator('tr.param-row').first();
      await expect(qRow.locator('[data-testid="param-value"]')).toHaveValue('world');
      const limitRow = editor.locator('tr.param-row').nth(1);
      await expect(limitRow.locator('[data-testid="param-value"]')).toHaveValue('50');
    });
  });

  test('should add custom param and see it in URL', {
    annotation: [
      { type: 'feature', description: 'params-editor' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate to endpoint', async () => {
      await page.locator('.folder-header', { hasText: 'Search' }).click();
      await page.getByTestId('endpoint-get--search').click();
    });

    await test.step('Action: Add custom param', async () => {
      await page.getByTestId('add-param-btn').click();
      const editor = page.getByTestId('params-editor');
      const newRow = editor.locator('tr.param-row').last();
      await newRow.locator('[data-testid="param-key"]').fill('custom_key');
      await newRow.locator('[data-testid="param-value"]').fill('custom_val');
    });

    await test.step('Verify: URL contains custom param', async () => {
      const urlInput = page.getByTestId('url-input');
      const val = await urlInput.inputValue();
      expect(val).toContain('custom_key=custom_val');
    });
  });

  test('should remove param and see URL updated', {
    annotation: [
      { type: 'feature', description: 'params-editor' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate and add custom param', async () => {
      await page.locator('.folder-header', { hasText: 'Search' }).click();
      await page.getByTestId('endpoint-get--search').click();
      await page.getByTestId('add-param-btn').click();
      const editor = page.getByTestId('params-editor');
      const newRow = editor.locator('tr.param-row').last();
      await newRow.locator('[data-testid="param-key"]').fill('temp');
      await newRow.locator('[data-testid="param-value"]').fill('123');

      const urlInput = page.getByTestId('url-input');
      let val = await urlInput.inputValue();
      expect(val).toContain('temp=123');
    });

    await test.step('Action: Delete the param', async () => {
      const editor = page.getByTestId('params-editor');
      const newRow = editor.locator('tr.param-row').last();
      await newRow.locator('[data-testid="param-delete"]').click();
    });

    await test.step('Verify: URL no longer contains param', async () => {
      const urlInput = page.getByTestId('url-input');
      const val = await urlInput.inputValue();
      expect(val).not.toContain('temp');
    });
  });

  test('should toggle param checkbox to disable/enable in URL', {
    annotation: [
      { type: 'feature', description: 'params-editor' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate and enable param', async () => {
      await page.locator('.folder-header', { hasText: 'Search' }).click();
      await page.getByTestId('endpoint-get--search').click();

      const editor = page.getByTestId('params-editor');
      const firstRow = editor.locator('tr.param-row').first();
      const checkbox = firstRow.locator('.param-enabled');
      const valueInput = firstRow.locator('[data-testid="param-value"]');

      if (!(await checkbox.isChecked())) {
        await checkbox.check();
      }
      await valueInput.fill('test');

      const urlInput = page.getByTestId('url-input');
      let val = await urlInput.inputValue();
      expect(val).toContain('q=test');
    });

    await test.step('Action: Uncheck to disable param', async () => {
      const editor = page.getByTestId('params-editor');
      const firstRow = editor.locator('tr.param-row').first();
      const checkbox = firstRow.locator('.param-enabled');
      await checkbox.uncheck();

      const urlInput = page.getByTestId('url-input');
      const val = await urlInput.inputValue();
      expect(val).not.toContain('q=test');
      await expect(firstRow).toHaveClass(/param-disabled/);
    });

    await test.step('Action: Re-check to enable param', async () => {
      const editor = page.getByTestId('params-editor');
      const firstRow = editor.locator('tr.param-row').first();
      const checkbox = firstRow.locator('.param-enabled');
      await checkbox.check();

      const urlInput = page.getByTestId('url-input');
      const val = await urlInput.inputValue();
      expect(val).toContain('q=test');
    });
  });

  test('should preserve spec param info (type, required, description)', {
    annotation: [
      { type: 'feature', description: 'params-editor' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.locator('.folder-header', { hasText: 'Search' }).click();
    await page.getByTestId('endpoint-get--search').click();

    const table = page.getByTestId('params-table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('q');
    await expect(table).toContainText('string');
    await expect(table).toContainText('Required');
    await expect(table).toContainText('Search query string');

    const editor = page.getByTestId('params-editor');
    const reqBadges = editor.locator('.param-required');
    await expect(reqBadges.first()).toContainText('Required');
  });
});
