import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

// Build a spec with multiple content types for testing
const multiContentSpec = {
  openapi: '3.0.0',
  info: { title: 'Multi Content API', version: '1.0.0' },
  servers: [{ url: 'http://localhost:3000', description: 'Local' }],
  paths: {
    '/api/login': {
      post: {
        tags: ['auth'],
        summary: 'Login',
        operationId: 'login',
        requestBody: {
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', example: 'user@example.com' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'OK' } },
      },
    },
    '/api/upload': {
      post: {
        tags: ['files'],
        summary: 'Upload file',
        operationId: 'upload',
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'OK' } },
      },
    },
    '/api/data': {
      post: {
        tags: ['data'],
        summary: 'Submit data',
        operationId: 'submitData',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'test' },
                  value: { type: 'integer', example: 42 },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'OK' } },
      },
    },
  },
};

test.describe('Body Types - Multi Content-Type Support', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // 1. Should show content-type selector buttons
  test('should show content-type selector buttons', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Switch to Body tab', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await expect(page.locator('#tab-body')).not.toHaveClass(/hidden/);
    });

    await test.step('Verify: All body type buttons visible', async () => {
      const selector = page.locator('[data-testid="body-type-selector"]');
      await expect(selector).toBeVisible();
      await expect(page.locator('[data-testid="body-type-json"]')).toBeVisible();
      await expect(page.locator('[data-testid="body-type-form-urlencoded"]')).toBeVisible();
      await expect(page.locator('[data-testid="body-type-form-data"]')).toBeVisible();
      await expect(page.locator('[data-testid="body-type-raw"]')).toBeVisible();
    });
  });

  // 2. Should default to None mode
  test('should default to None mode', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Switch to Body tab', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
    });

    await test.step('Verify: None mode is active by default', async () => {
      await expect(page.locator('[data-testid="body-type-none"]')).toHaveClass(/active/);
      await expect(page.locator('[data-testid="body-none"]')).not.toHaveClass(/hidden/);
      await expect(page.locator('#body-editor-wrap')).toHaveClass(/hidden/);
      await expect(page.locator('#body-form-urlencoded')).toHaveClass(/hidden/);
      await expect(page.locator('#body-form-data')).toHaveClass(/hidden/);
      await expect(page.locator('#body-raw-wrap')).toHaveClass(/hidden/);
    });
  });

  // 3. Should switch to form-urlencoded mode and show key-value editor
  test('should switch to form-urlencoded mode and show key-value editor', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Switch to form-urlencoded', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.locator('[data-testid="body-type-form-urlencoded"]').click();
    });

    await test.step('Verify: Form editor visible', async () => {
      await expect(page.locator('[data-testid="body-type-form-urlencoded"]')).toHaveClass(/active/);
      await expect(page.locator('[data-testid="body-type-json"]')).not.toHaveClass(/active/);
      await expect(page.locator('#body-form-urlencoded')).not.toHaveClass(/hidden/);
      await expect(page.locator('#body-editor-wrap')).toHaveClass(/hidden/);
      await expect(page.locator('[data-testid="form-urlencoded-table"]')).toBeVisible();
      await expect(page.locator('[data-testid="form-urlencoded-add"]')).toBeVisible();
    });
  });

  // 4. Should add and remove form fields
  test('should add and remove form fields', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Switch to form-urlencoded', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.locator('[data-testid="body-type-form-urlencoded"]').click();
    });

    await test.step('Action: Add and fill form fields', async () => {
      let rows = page.locator('[data-testid="form-urlencoded-table"] tbody tr');
      await expect(rows).toHaveCount(1);

      await page.locator('[data-testid="form-urlencoded-add"]').click();
      await expect(rows).toHaveCount(2);

      await page.locator('[data-testid="form-urlencoded-add"]').click();
      await expect(rows).toHaveCount(3);

      const keyInputs = page.locator('[data-testid="form-urlencoded-table"] [data-testid="kv-key"]');
      const valueInputs = page.locator('[data-testid="form-urlencoded-table"] [data-testid="kv-value"]');
      await keyInputs.nth(0).fill('username');
      await valueInputs.nth(0).fill('john');
      await keyInputs.nth(1).fill('password');
      await valueInputs.nth(1).fill('secret');
    });

    await test.step('Action: Delete a row', async () => {
      const deleteButtons = page.locator('[data-testid="form-urlencoded-table"] [data-testid="kv-delete"]');
      await deleteButtons.nth(2).click();
      const rows = page.locator('[data-testid="form-urlencoded-table"] tbody tr');
      await expect(rows).toHaveCount(2);
    });
  });

  // 5. Should switch to form-data mode
  test('should switch to form-data mode', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Switch to form-data', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.locator('[data-testid="body-type-form-data"]').click();
    });

    await test.step('Verify: Form-data editor visible', async () => {
      await expect(page.locator('[data-testid="body-type-form-data"]')).toHaveClass(/active/);
      await expect(page.locator('#body-form-data')).not.toHaveClass(/hidden/);
      await expect(page.locator('#body-editor-wrap')).toHaveClass(/hidden/);
      await expect(page.locator('[data-testid="form-data-table"]')).toBeVisible();
      const typeToggle = page.locator('[data-testid="form-data-table"] [data-testid="kv-type-toggle"]');
      await expect(typeToggle.first()).toBeVisible();
    });
  });

  // 6. Should switch to raw mode and show textarea
  test('should switch to raw mode and show textarea', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Switch to raw mode', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.locator('[data-testid="body-type-raw"]').click();
    });

    await test.step('Verify: Raw editor visible', async () => {
      await expect(page.locator('[data-testid="body-type-raw"]')).toHaveClass(/active/);
      await expect(page.locator('#body-raw-wrap')).not.toHaveClass(/hidden/);
      await expect(page.locator('#body-editor-wrap')).toHaveClass(/hidden/);
      await expect(page.locator('[data-testid="body-raw-editor"]')).toBeVisible();
      await expect(page.locator('[data-testid="raw-content-type"]')).toBeVisible();
      await expect(page.locator('[data-testid="raw-content-type"]')).toHaveValue('text/plain');
    });
  });

  // 7. Should preserve values when switching between types
  test('should preserve values when switching between types', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Set JSON value', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.evaluate(() => {
        window.bodyEditor.setValue('{"test": true}');
      });
    });

    await test.step('Action: Switch to raw and type content', async () => {
      await page.locator('[data-testid="body-type-raw"]').click();
      await page.locator('[data-testid="body-raw-editor"]').fill('raw content here');
    });

    await test.step('Verify: JSON value preserved after switching back', async () => {
      await page.locator('[data-testid="body-type-json"]').click();
      const jsonValue = await page.evaluate(() => window.bodyEditor.getValue());
      expect(jsonValue).toBe('{"test": true}');
    });

    await test.step('Verify: Raw value preserved after switching back', async () => {
      await page.locator('[data-testid="body-type-raw"]').click();
      await expect(page.locator('[data-testid="body-raw-editor"]')).toHaveValue('raw content here');
    });
  });

  // 8. Should auto-select content type based on endpoint spec
  test('should auto-select content type based on endpoint spec', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load multi-content spec', async () => {
      await page.evaluate((specStr) => {
        const spec = JSON.parse(specStr);
        loadSpec(spec, { specMode: false });
      }, JSON.stringify(multiContentSpec));

      const folders = page.locator('.folder-header');
      const count = await folders.count();
      for (let i = 0; i < count; i++) {
        await folders.nth(i).click();
      }
      await page.locator('.tab', { hasText: 'Body' }).click();
    });

    await test.step('Verify: Login endpoint auto-selects form-urlencoded', async () => {
      const loginEndpoint = page.locator('[data-testid*="endpoint-post-"][data-testid*="login"]');
      await loginEndpoint.click();
      await expect(page.locator('[data-testid="body-type-form-urlencoded"]')).toHaveClass(/active/);
      await expect(page.locator('#body-form-urlencoded')).not.toHaveClass(/hidden/);
    });

    await test.step('Verify: Upload endpoint auto-selects form-data', async () => {
      const uploadEndpoint = page.locator('[data-testid*="endpoint-post-"][data-testid*="upload"]');
      await uploadEndpoint.click();
      await expect(page.locator('[data-testid="body-type-form-data"]')).toHaveClass(/active/);
      await expect(page.locator('#body-form-data')).not.toHaveClass(/hidden/);
    });

    await test.step('Verify: Data endpoint auto-selects JSON', async () => {
      const dataEndpoint = page.locator('[data-testid*="endpoint-post-"][data-testid*="data"]');
      await dataEndpoint.click();
      await expect(page.locator('[data-testid="body-type-json"]')).toHaveClass(/active/);
      await expect(page.locator('#body-editor-wrap')).not.toHaveClass(/hidden/);
    });
  });

  // 9. Should send form-urlencoded request correctly
  test('should send form-urlencoded request correctly', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Configure POST form-urlencoded request', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.locator('[data-testid="method-select"]').selectOption('POST');
      await page.locator('[data-testid="url-input"]').fill('http://localhost:3000/api/test');
      await page.locator('[data-testid="body-type-form-urlencoded"]').click();

      const keyInputs = page.locator('[data-testid="form-urlencoded-table"] [data-testid="kv-key"]');
      const valueInputs = page.locator('[data-testid="form-urlencoded-table"] [data-testid="kv-value"]');
      await keyInputs.nth(0).fill('username');
      await valueInputs.nth(0).fill('john');
    });

    await test.step('Verify: Body format is correct', async () => {
      const bodyInfo = await page.evaluate(() => {
        const info = window.getBodyForSend();
        return { body: info.body, contentType: info.contentType, isFormData: info.isFormData };
      });
      expect(bodyInfo.body).toBe('username=john');
      expect(bodyInfo.contentType).toBe('application/x-www-form-urlencoded');
      expect(bodyInfo.isFormData).toBe(false);
    });
  });

  // 10. Should encode form-urlencoded body properly
  test('should encode form-urlencoded body properly', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Fill form with special characters', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.locator('[data-testid="body-type-form-urlencoded"]').click();

      const keyInputs = page.locator('[data-testid="form-urlencoded-table"] [data-testid="kv-key"]');
      const valueInputs = page.locator('[data-testid="form-urlencoded-table"] [data-testid="kv-value"]');
      await keyInputs.nth(0).fill('name');
      await valueInputs.nth(0).fill('John Doe');

      await page.locator('[data-testid="form-urlencoded-add"]').click();
      await keyInputs.nth(1).fill('query');
      await valueInputs.nth(1).fill('a=b&c=d');
    });

    await test.step('Verify: Body is URL-encoded', async () => {
      const bodyInfo = await page.evaluate(() => {
        const info = window.getBodyForSend();
        return { body: info.body };
      });
      expect(bodyInfo.body).toBe('name=John%20Doe&query=a%3Db%26c%3Dd');
    });
  });

  // 11. Should switch to XML mode and show textarea
  test('should switch to XML mode and show textarea', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Switch to XML mode', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.locator('[data-testid="body-type-xml"]').click();
    });

    await test.step('Verify: XML editor visible', async () => {
      await expect(page.locator('[data-testid="body-type-xml"]')).toHaveClass(/active/);
      await expect(page.locator('[data-testid="body-type-json"]')).not.toHaveClass(/active/);
      await expect(page.locator('[data-testid="body-xml-wrap"]')).not.toHaveClass(/hidden/);
      await expect(page.locator('#body-editor-wrap')).toHaveClass(/hidden/);
      await expect(page.locator('[data-testid="body-xml-editor"]')).toBeVisible();
    });
  });

  // 12. Should preserve XML value when switching types
  test('should preserve XML value when switching types', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Enter XML content', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.locator('[data-testid="body-type-xml"]').click();
      await page.locator('[data-testid="body-xml-editor"]').fill('<root><item>test</item></root>');
    });

    await test.step('Action: Switch to JSON and back to XML', async () => {
      await page.locator('[data-testid="body-type-json"]').click();
      await expect(page.locator('[data-testid="body-xml-wrap"]')).toHaveClass(/hidden/);
      await page.locator('[data-testid="body-type-xml"]').click();
    });

    await test.step('Verify: XML value preserved', async () => {
      await expect(page.locator('[data-testid="body-xml-editor"]')).toHaveValue('<root><item>test</item></root>');
    });
  });

  // 13. Should detect application/xml from spec
  test('should detect application/xml from spec', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load XML spec', async () => {
      const xmlSpec = {
        openapi: '3.0.0',
        info: { title: 'XML API', version: '1.0.0' },
        servers: [{ url: 'http://localhost:3000', description: 'Local' }],
        paths: {
          '/api/xml-data': {
            post: {
              tags: ['xml'],
              summary: 'Submit XML',
              operationId: 'submitXml',
              requestBody: {
                content: {
                  'application/xml': {
                    schema: { type: 'object' },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      await page.evaluate((specStr) => {
        loadSpec(JSON.parse(specStr), { specMode: false });
      }, JSON.stringify(xmlSpec));

      const folders = page.locator('.folder-header');
      await folders.first().click();
      await page.locator('.tab', { hasText: 'Body' }).click();
    });

    await test.step('Verify: XML mode auto-selected', async () => {
      const xmlEndpoint = page.locator('[data-testid*="endpoint-post-"][data-testid*="xml-data"]');
      await xmlEndpoint.click();
      await expect(page.locator('[data-testid="body-type-xml"]')).toHaveClass(/active/);
      await expect(page.locator('[data-testid="body-xml-wrap"]')).not.toHaveClass(/hidden/);
    });
  });

  // 14a. Should show None button and message by default
  test('should show None button and no-body message by default', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Switch to Body tab', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
    });

    await test.step('Verify: None button is visible and active', async () => {
      await expect(page.locator('[data-testid="body-type-none"]')).toBeVisible();
      await expect(page.locator('[data-testid="body-type-none"]')).toHaveClass(/active/);
      await expect(page.locator('[data-testid="body-none"]')).toBeVisible();
      await expect(page.locator('[data-testid="body-none"] .body-none-text')).toContainText('This request does not have a body');
    });

    await test.step('Verify: All editors hidden', async () => {
      await expect(page.locator('#body-editor-wrap')).toHaveClass(/hidden/);
      await expect(page.locator('#body-form-urlencoded')).toHaveClass(/hidden/);
      await expect(page.locator('#body-form-data')).toHaveClass(/hidden/);
      await expect(page.locator('#body-raw-wrap')).toHaveClass(/hidden/);
      await expect(page.locator('#body-xml-wrap')).toHaveClass(/hidden/);
    });

    await test.step('Verify: getBodyForSend returns no body', async () => {
      const bodyInfo = await page.evaluate(() => {
        const info = window.getBodyForSend();
        return { body: info.body, contentType: info.contentType, isFormData: info.isFormData };
      });
      expect(bodyInfo.body).toBeUndefined();
      expect(bodyInfo.contentType).toBeNull();
      expect(bodyInfo.isFormData).toBe(false);
    });
  });

  // 14b. GET endpoint should default to None body type
  test('GET endpoint should default to None body type', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load spec with GET endpoint', async () => {
      const getSpec = {
        openapi: '3.0.0',
        info: { title: 'Get API', version: '1.0.0' },
        servers: [{ url: 'http://localhost:3000', description: 'Local' }],
        paths: {
          '/api/items': {
            get: {
              tags: ['items'],
              summary: 'List items',
              operationId: 'listItems',
              responses: { '200': { description: 'OK' } },
            },
          },
          '/api/items/create': {
            post: {
              tags: ['items'],
              summary: 'Create item',
              operationId: 'createItem',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { name: { type: 'string' } } },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      await page.evaluate((specStr) => {
        loadSpec(JSON.parse(specStr), { specMode: false });
      }, JSON.stringify(getSpec));

      const folders = page.locator('.folder-header');
      await folders.first().click();
      await page.locator('.tab', { hasText: 'Body' }).click();
    });

    await test.step('Verify: GET endpoint uses None body type', async () => {
      const getEndpoint = page.locator('[data-testid*="endpoint-get-"][data-testid*="items"]').first();
      await getEndpoint.click();
      await expect(page.locator('[data-testid="body-type-none"]')).toHaveClass(/active/);
      await expect(page.locator('[data-testid="body-none"]')).toBeVisible();
      await expect(page.locator('#body-editor-wrap')).toHaveClass(/hidden/);
    });

    await test.step('Verify: POST endpoint uses JSON body type', async () => {
      const postEndpoint = page.locator('[data-testid*="endpoint-post-"][data-testid*="create"]');
      await postEndpoint.click();
      await expect(page.locator('[data-testid="body-type-json"]')).toHaveClass(/active/);
      await expect(page.locator('#body-editor-wrap')).not.toHaveClass(/hidden/);
    });
  });

  // 14. Should return correct body and contentType for XML
  test('should return correct body and contentType for XML', {
    annotation: [
      { type: 'feature', description: 'body-types' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Enter XML body', async () => {
      await page.locator('.tab', { hasText: 'Body' }).click();
      await page.locator('[data-testid="body-type-xml"]').click();
      await page.locator('[data-testid="body-xml-editor"]').fill('<root><name>test</name></root>');
    });

    await test.step('Verify: Body info is correct', async () => {
      const bodyInfo = await page.evaluate(() => {
        const info = window.getBodyForSend();
        return { body: info.body, contentType: info.contentType, isFormData: info.isFormData };
      });
      expect(bodyInfo.body).toBe('<root><name>test</name></root>');
      expect(bodyInfo.contentType).toBe('application/xml');
      expect(bodyInfo.isFormData).toBe(false);
    });
  });
});
