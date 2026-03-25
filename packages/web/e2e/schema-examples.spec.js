import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

const formatTestSpec = {
  openapi: '3.0.0',
  info: { title: 'Format Test', version: '1.0' },
  paths: {
    '/test': {
      post: {
        tags: ['test'],
        summary: 'Test all formats',
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AllFormatsDto' }
            }
          }
        },
        responses: { '201': { description: 'Created' } }
      }
    },
    '/test/{id}': {
      get: {
        tags: ['test'],
        summary: 'Get test',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TestResponse' }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      AllFormatsDto: {
        type: 'object',
        required: ['email', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          createdAt: { type: 'string', format: 'date-time' },
          id: { type: 'string', format: 'uuid' },
          website: { type: 'string', format: 'uri' },
          ip: { type: 'string', format: 'ipv4' },
          password: { type: 'string', format: 'password' },
          name: { type: 'string', example: 'John Doe' },
          role: { type: 'string', enum: ['admin', 'user', 'viewer'], default: 'user' },
          age: { type: 'integer', minimum: 0 },
          score: { type: 'number', format: 'float' },
          active: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
          address: { $ref: '#/components/schemas/Address' },
        }
      },
      Address: {
        type: 'object',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
        }
      },
      TestResponse: {
        type: 'object',
        properties: {
          data: { $ref: '#/components/schemas/AllFormatsDto' },
          meta: { type: 'object', properties: { total: { type: 'integer' } } }
        }
      }
    }
  }
};

/**
 * E2E tests that verify generateExample() output is correctly rendered
 * in the docs view through real user interactions.
 */
test.describe('Schema Examples in Docs View', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: true });
    }, JSON.stringify(petstoreSpec));
    await expect(page.getByTestId('collection-name')).toHaveText('Petstore API');
  });

  test('should show example values with correct types in POST docs request example', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open POST /pets docs', async () => {
      await page.locator('.folder-header', { hasText: 'Pets' }).click();
      await page.getByTestId('endpoint-post--pets').click();
    });

    await test.step('Verify: Docs panel shows request example with generated values', async () => {
      const content = page.getByTestId('docs-content');
      await expect(content).not.toHaveClass(/hidden/);
      const exampleBlock = page.getByTestId('docs-request-example');
      await expect(exampleBlock).toBeVisible();
      // The CreatePetDto has example: "Buddy" for name and "dog" for species
      const exampleText = await exampleBlock.locator('.docs-example-block').innerText();
      expect(exampleText).toContain('Buddy');
      expect(exampleText).toContain('dog');
    });
  });

  test('should show schema property names in POST docs schema section', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open POST /pets docs', async () => {
      await page.locator('.folder-header', { hasText: 'Pets' }).click();
      await page.getByTestId('endpoint-post--pets').click();
    });

    await test.step('Verify: Schema property names visible in docs', async () => {
      const content = page.getByTestId('docs-content');
      await expect(content.locator('.schema-prop-name').first()).toBeVisible();
      const propNames = await content.locator('.schema-prop-name').allTextContents();
      expect(propNames.some(p => p.includes('name'))).toBe(true);
      expect(propNames.some(p => p.includes('species'))).toBe(true);
    });
  });

  test('should populate body editor with generated example when using Try it', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open POST /pets docs and click Try it', async () => {
      await page.locator('.folder-header', { hasText: 'Pets' }).click();
      await page.getByTestId('endpoint-post--pets').click();
      await page.getByTestId('docs-try-btn').click();
    });

    await test.step('Verify: Body editor has valid JSON with example values', async () => {
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      const bodyValue = await page.locator('[data-testid="body-editor"]').innerText();
      const parsed = JSON.parse(bodyValue.trim());
      expect(parsed).toHaveProperty('name');
      expect(parsed).toHaveProperty('species');
      // The petstore spec has example: "Buddy" for name
      expect(parsed.name).toBe('Buddy');
      expect(parsed.species).toBe('dog');
    });
  });

  test('should show response example with generated object in docs view', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open GET /pets docs', async () => {
      await page.locator('.folder-header', { hasText: 'Pets' }).click();
      await page.getByTestId('endpoint-get--pets').click();
    });

    await test.step('Verify: Response example visible in docs right column', async () => {
      const respExamples = page.getByTestId('docs-response-examples');
      await expect(respExamples).toBeVisible();
      const respPanel = page.getByTestId('docs-resp-panel-200');
      await expect(respPanel).not.toHaveClass(/hidden/);
      const respText = await respPanel.innerText();
      // GET /pets returns array of Pet objects, so example should contain pet fields
      expect(respText).toContain('Buddy');
    });
  });
});

/**
 * E2E tests that verify format-specific generateExample() output through the
 * actual Docs view using a dedicated format-test spec.
 */
test.describe('Schema Examples - Format Variations in Docs View', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: true });
    }, JSON.stringify(formatTestSpec));
    await expect(page.getByTestId('collection-name')).toHaveText('Format Test');
    await page.locator('.folder-header', { hasText: 'test' }).click();
  });

  test('should show string format examples in POST /test request example block', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open POST /test docs', async () => {
      await page.getByTestId('endpoint-post--test').click();
    });

    await test.step('Verify: Request example block contains expected format values', async () => {
      const exampleBlock = page.getByTestId('docs-request-example');
      await expect(exampleBlock).toBeVisible();
      const exampleText = await exampleBlock.locator('.docs-example-block').innerText();
      expect(exampleText).toContain('user@example.com');
      expect(exampleText).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\s*\d{2}:\s*\d{2}/);
      expect(exampleText).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(exampleText).toContain('https://example.com');
      expect(exampleText).toContain('192.168.1.1');
      expect(exampleText).toContain('********');
    });
  });

  test('should use explicit example value for name field in request example', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open POST /test docs', async () => {
      await page.getByTestId('endpoint-post--test').click();
    });

    await test.step('Verify: name field uses explicit example value "John Doe"', async () => {
      const exampleBlock = page.getByTestId('docs-request-example');
      await expect(exampleBlock).toBeVisible();
      await expect(exampleBlock.locator('.docs-example-block')).toContainText('John Doe');
    });
  });

  test('should show enum or default value for role field in request example', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open POST /test docs', async () => {
      await page.getByTestId('endpoint-post--test').click();
    });

    await test.step('Verify: role field shows enum value (admin or user)', async () => {
      const exampleBlock = page.getByTestId('docs-request-example');
      await expect(exampleBlock).toBeVisible();
      const exampleText = await exampleBlock.locator('.docs-example-block').innerText();
      expect(exampleText).toMatch(/admin|user/);
    });
  });

  test('should show integer and float number type examples in request example', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open POST /test docs', async () => {
      await page.getByTestId('endpoint-post--test').click();
    });

    await test.step('Verify: integer age and float score values present', async () => {
      const exampleBlock = page.getByTestId('docs-request-example');
      await expect(exampleBlock).toBeVisible();
      const exampleText = await exampleBlock.locator('.docs-example-block').innerText();
      // age: integer with minimum: 0
      expect(exampleText).toMatch(/"age"\s*:\s*\d+/);
      // score: float number
      expect(exampleText).toMatch(/"score"\s*:\s*[\d.]+/);
    });
  });

  test('should show boolean true example in request example', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'low' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open POST /test docs', async () => {
      await page.getByTestId('endpoint-post--test').click();
    });

    await test.step('Verify: active boolean field shows true', async () => {
      const exampleBlock = page.getByTestId('docs-request-example');
      await expect(exampleBlock).toBeVisible();
      await expect(exampleBlock.locator('.docs-example-block')).toContainText('true');
    });
  });

  test('should show array example for tags field with minItems in request example', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open POST /test docs', async () => {
      await page.getByTestId('endpoint-post--test').click();
    });

    await test.step('Verify: tags array with at least one item present', async () => {
      const exampleBlock = page.getByTestId('docs-request-example');
      await expect(exampleBlock).toBeVisible();
      const exampleText = await exampleBlock.locator('.docs-example-block').innerText();
      expect(exampleText).toMatch(/"tags"\s*:\s*\[/);
    });
  });

  test('should show nested $ref object with address street and city in request example', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open POST /test docs', async () => {
      await page.getByTestId('endpoint-post--test').click();
    });

    await test.step('Verify: address nested object with street and city present', async () => {
      const exampleBlock = page.getByTestId('docs-request-example');
      await expect(exampleBlock).toBeVisible();
      const exampleText = await exampleBlock.locator('.docs-example-block').innerText();
      expect(exampleText).toContain('address');
      expect(exampleText).toContain('street');
      expect(exampleText).toContain('city');
    });
  });

  test('should show nested response example for GET /test/{id}', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open GET /test/{id} docs', async () => {
      await page.getByTestId('endpoint-get--test--id-').click();
    });

    await test.step('Verify: Response example shows nested data and meta structure', async () => {
      const respExamples = page.getByTestId('docs-response-examples');
      await expect(respExamples).toBeVisible();
      const respPanel = page.getByTestId('docs-resp-panel-200');
      await expect(respPanel).not.toHaveClass(/hidden/);
      const respText = await respPanel.innerText();
      expect(respText).toContain('data');
      expect(respText).toContain('meta');
      expect(respText).toContain('total');
    });
  });

  test('should load example into body editor when clicking Try it on POST /test', {
    annotation: [
      { type: 'feature', description: 'schema-examples' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open POST /test docs and click Try it', async () => {
      await page.getByTestId('endpoint-post--test').click();
      await page.getByTestId('docs-try-btn').click();
    });

    await test.step('Verify: Body editor contains example JSON with format values', async () => {
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      const bodyValue = await page.locator('[data-testid="body-editor"]').innerText();
      const parsed = JSON.parse(bodyValue.trim());
      expect(parsed).toHaveProperty('email');
      expect(parsed.email).toBe('user@example.com');
      expect(parsed).toHaveProperty('name');
      expect(parsed.name).toBe('John Doe');
      expect(parsed).toHaveProperty('password');
      expect(parsed.password).toBe('********');
    });
  });
});
