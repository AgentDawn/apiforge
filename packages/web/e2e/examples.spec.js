import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

// Create a spec with x-apiforge-examples for testing
function createSpecWithExtensionExamples() {
  const spec = JSON.parse(JSON.stringify(petstoreSpec));
  // Add x-apiforge-examples to POST /pets
  spec.paths['/pets'].post['x-apiforge-examples'] = [
    {
      name: 'Create dog (dry run)',
      params: { dryRun: 'true' },
      body: { name: 'Buddy', species: 'dog' },
      expectedResponse: { status: 201, body: { id: 1, name: 'Buddy', species: 'dog' } },
    },
  ];
  // Add x-apiforge-examples to GET /pets (params only, no body)
  spec.paths['/pets'].get['x-apiforge-examples'] = [
    {
      name: 'Get available pets',
      params: { status: 'available', limit: '10' },
    },
  ];
  return spec;
}

test.describe('Request Body Examples', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear localStorage examples before each test
    await page.evaluate(() => localStorage.removeItem('apiforge-examples'));
    // Load spec with spec mode enabled
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: true });
    }, JSON.stringify(petstoreSpec));
    // Expand Pets folder
    await page.locator('[data-testid="folder-pets"]').click();
  });

  test('should show example toggle for POST endpoints after loading spec', {
    annotation: [
      { type: 'feature', description: 'examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
    await expect(toggle).toBeVisible();

    const getItem = page.locator('[data-testid="endpoint-get--pets"]');
    await expect(getItem.locator('.example-toggle-arrow')).toHaveCount(0);
  });

  test('should expand and collapse example list', {
    annotation: [
      { type: 'feature', description: 'examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
    const examples = page.locator('[data-testid="examples-post--pets"]');

    await expect(examples).toHaveClass(/hidden/);
    await toggle.click();
    await expect(examples).not.toHaveClass(/hidden/);
    await toggle.click();
    await expect(examples).toHaveClass(/hidden/);
  });

  test('should load spec example into body editor when clicked (opens client tab)', {
    annotation: [
      { type: 'feature', description: 'examples' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Expand examples and click default', async () => {
      const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
      await toggle.click();
      const exampleItem = page.locator('[data-testid="example-item"]').first();
      await expect(exampleItem).toBeVisible();
      await exampleItem.click();
    });

    await test.step('Verify: Client tab opened with body content', async () => {
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      const bodyValue = await page.locator('[data-testid="body-editor"]').innerText();
      expect(bodyValue.trim().length).toBeGreaterThan(0);
      expect(() => JSON.parse(bodyValue.trim())).not.toThrow();
      const exampleItem = page.locator('[data-testid="example-item"]').first();
      await expect(exampleItem).toHaveClass(/example-active/);
    });
  });

  test('should save current body as new example', {
    annotation: [
      { type: 'feature', description: 'examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open client tab and set body', async () => {
      const postEndpoint = page.locator('[data-testid="endpoint-post--pets"]');
      await postEndpoint.click();
      await page.getByTestId('docs-try-btn').click();

      const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
      await toggle.click();

      await page.evaluate(() => {
        window.bodyEditor.setValue('{"name":"TestPet","species":"fish"}');
      });
    });

    await test.step('Action: Save example', async () => {
      await page.evaluate(() => {
        window._originalPrompt = window.prompt;
        window.prompt = () => 'My Fish Example';
      });
      const addBtn = page.locator('[data-testid="example-add-btn"]').first();
      await addBtn.click();
      await page.evaluate(() => {
        window.prompt = window._originalPrompt;
      });
    });

    await test.step('Verify: Example saved', async () => {
      const examples = page.locator('[data-testid="examples-post--pets"]');
      const userExample = examples.locator('[data-testid="example-item"]').filter({ hasText: 'My Fish Example' });
      await expect(userExample).toBeVisible();
    });
  });

  test('should delete a user-saved example', {
    annotation: [
      { type: 'feature', description: 'examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Pre-save an example', async () => {
      await page.evaluate(() => {
        window.saveExample(
          window.appState.endpoints.find(e => e.method === 'POST' && e.path === '/pets'),
          'To Delete',
          '{"name":"temp"}'
        );
      });
      await page.evaluate((specStr) => {
        loadSpec(JSON.parse(specStr), { specMode: true });
      }, JSON.stringify(petstoreSpec));
      await page.locator('[data-testid="folder-pets"]').click();
    });

    await test.step('Action: Delete the example', async () => {
      const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
      await toggle.click();

      const examples = page.locator('[data-testid="examples-post--pets"]');
      const userExample = examples.locator('[data-testid="example-item"]').filter({ hasText: 'To Delete' });
      await expect(userExample).toBeVisible();

      await userExample.hover();
      const delBtn = userExample.locator('[data-testid="example-delete"]');
      await delBtn.click({ force: true });
    });

    await test.step('Verify: Example removed', async () => {
      const examples = page.locator('[data-testid="examples-post--pets"]');
      const userExample = examples.locator('[data-testid="example-item"]').filter({ hasText: 'To Delete' });
      await expect(userExample).toHaveCount(0);
    });
  });

  test('should persist examples across page reload (localStorage)', {
    annotation: [
      { type: 'feature', description: 'examples' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Save and reload', async () => {
      await page.evaluate(() => {
        window.saveExample(
          window.appState.endpoints.find(e => e.method === 'POST' && e.path === '/pets'),
          'Persistent Example',
          '{"name":"Persisted","species":"parrot"}'
        );
      });
      await page.reload();
      await page.evaluate((specStr) => {
        loadSpec(JSON.parse(specStr), { specMode: true });
      }, JSON.stringify(petstoreSpec));
    });

    await test.step('Verify: Example persists', async () => {
      await page.locator('[data-testid="folder-pets"]').click();
      const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
      await toggle.click();
      const examples = page.locator('[data-testid="examples-post--pets"]');
      const persistedExample = examples.locator('[data-testid="example-item"]').filter({ hasText: 'Persistent Example' });
      await expect(persistedExample).toBeVisible();
    });
  });

  test('should show Add Example button', {
    annotation: [
      { type: 'feature', description: 'examples' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
    await toggle.click();

    const addBtn = page.locator('[data-testid="examples-post--pets"] [data-testid="example-add-btn"]');
    await expect(addBtn).toBeVisible();
    await expect(addBtn).toHaveText('+ Add Example');
  });
});

test.describe('x-apiforge-examples Extension', () => {
  const extSpec = createSpecWithExtensionExamples();

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('apiforge-examples'));
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr), { specMode: true });
    }, JSON.stringify(extSpec));
    await page.locator('[data-testid="folder-pets"]').click();
  });

  test('should load x-apiforge-examples from spec', {
    annotation: [
      { type: 'feature', description: 'x-apiforge-examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
    await toggle.click();

    const examples = page.locator('[data-testid="examples-post--pets"]');
    const extExample = examples.locator('[data-testid="example-item"]').filter({ hasText: 'Create dog (dry run)' });
    await expect(extExample).toBeVisible();
    await expect(extExample).toHaveAttribute('data-source', 'extension');
  });

  test('should populate both body and URL params when clicking an extension example', {
    annotation: [
      { type: 'feature', description: 'x-apiforge-examples' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Click extension example', async () => {
      const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
      await toggle.click();
      const extExample = page.locator('[data-testid="example-item"]').filter({ hasText: 'Create dog (dry run)' });
      await extExample.click();
    });

    await test.step('Verify: Body and URL populated', async () => {
      await expect(page.locator('.request-panel')).not.toHaveClass(/hidden/);
      const bodyValue = await page.locator('[data-testid="body-editor"]').innerText();
      const parsed = JSON.parse(bodyValue.trim());
      expect(parsed.name).toBe('Buddy');
      expect(parsed.species).toBe('dog');
      const urlValue = await page.locator('[data-testid="url-input"]').inputValue();
      expect(urlValue).toContain('dryRun=true');
    });
  });

  test('should save example with current query params', {
    annotation: [
      { type: 'feature', description: 'x-apiforge-examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Open client tab and set URL/body', async () => {
      await page.locator('[data-testid="endpoint-post--pets"]').click();
      await page.getByTestId('docs-try-btn').click();

      await page.evaluate(() => {
        document.querySelector('[data-testid="url-input"]').value = 'https://petstore.example.com/api/v1/pets?myParam=hello';
      });
      await page.evaluate(() => {
        window.bodyEditor.setValue('{"name":"ParamPet","species":"cat"}');
      });
    });

    await test.step('Action: Save example', async () => {
      const toggle = page.locator('[data-testid="example-toggle-post--pets"]');
      await toggle.click();

      await page.evaluate(() => {
        window._originalPrompt = window.prompt;
        window.prompt = () => 'Param Example';
      });
      const addBtn = page.locator('[data-testid="examples-post--pets"] [data-testid="example-add-btn"]');
      await addBtn.click();
      await page.evaluate(() => {
        window.prompt = window._originalPrompt;
      });
    });

    await test.step('Verify: Saved example has params', async () => {
      const stored = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('apiforge-examples') || '{}');
      });
      const key = 'POST /pets';
      expect(stored[key]).toBeDefined();
      const saved = stored[key].find(e => e.name === 'Param Example');
      expect(saved).toBeDefined();
      expect(saved.params).toBeDefined();
      expect(saved.params.myParam).toBe('hello');
    });
  });

  test('should show examples toggle for GET endpoints with x-apiforge-examples', {
    annotation: [
      { type: 'feature', description: 'x-apiforge-examples' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    const toggle = page.locator('[data-testid="example-toggle-get--pets"]');
    await expect(toggle).toBeVisible();

    await toggle.click();
    const examples = page.locator('[data-testid="examples-get--pets"]');
    const getExample = examples.locator('[data-testid="example-item"]').filter({ hasText: 'Get available pets' });
    await expect(getExample).toBeVisible();
  });

  test('should display param hints in example name', {
    annotation: [
      { type: 'feature', description: 'x-apiforge-examples' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    const toggle = page.locator('[data-testid="example-toggle-get--pets"]');
    await toggle.click();

    const examples = page.locator('[data-testid="examples-get--pets"]');
    const getExample = examples.locator('[data-testid="example-item"]').filter({ hasText: 'Get available pets' });
    await expect(getExample).toBeVisible();

    const paramHint = getExample.locator('.example-param-hint');
    await expect(paramHint).toBeVisible();
    const hintText = await paramHint.textContent();
    expect(hintText).toContain('status=available');
    expect(hintText).toContain('limit=10');
  });
});
