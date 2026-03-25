import { test, expect } from '@playwright/test';

test.describe('Response Insights', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('should detect unsorted IDs in response', {
    annotation: [
      { type: 'feature', description: 'response-insights' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Inject mock response with unsorted IDs', async () => {
      await page.evaluate(() => {
        const body = JSON.stringify([
          { id: 5, name: 'e' },
          { id: 2, name: 'b' },
          { id: 8, name: 'h' },
          { id: 1, name: 'a' },
        ]);
        document.querySelector('#response-empty').classList.add('hidden');
        document.querySelector('#response-content').classList.remove('hidden');
        document.querySelector('#response-status').textContent = '200 OK';
        window.responseEditor.setValue(body);
        window.responseInsights.runInsights(body, { timing: 100, status: 200 });
      });
    });

    await test.step('Verify: Unsorted IDs insight detected', async () => {
      const insights = page.getByTestId('response-insights');
      await expect(insights).toBeVisible();
      await expect(page.getByTestId('insight-unsorted-ids')).toBeVisible();
      await expect(page.getByTestId('insight-unsorted-ids')).toContainText('not sorted');
    });
  });

  test('should detect missing pagination for large arrays', {
    annotation: [
      { type: 'feature', description: 'response-insights' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.evaluate(() => {
      const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `item_${i}` }));
      const body = JSON.stringify(items);
      document.querySelector('#response-empty').classList.add('hidden');
      document.querySelector('#response-content').classList.remove('hidden');
      document.querySelector('#response-status').textContent = '200 OK';
      window.responseEditor.setValue(body);
      window.responseInsights.runInsights(body, { timing: 100, status: 200 });
    });

    await expect(page.getByTestId('insight-no-pagination')).toBeVisible();
    await expect(page.getByTestId('insight-no-pagination')).toContainText('pagination');
  });

  test('should not show pagination warning when metadata present', {
    annotation: [
      { type: 'feature', description: 'response-insights' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.evaluate(() => {
      const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `item_${i}` }));
      const body = JSON.stringify({ data: items, total: 100, page: 1, per_page: 25 });
      document.querySelector('#response-empty').classList.add('hidden');
      document.querySelector('#response-content').classList.remove('hidden');
      document.querySelector('#response-status').textContent = '200 OK';
      window.responseEditor.setValue(body);
      window.responseInsights.runInsights(body, { timing: 100, status: 200 });
    });

    await expect(page.getByTestId('insight-no-pagination')).not.toBeVisible();
  });

  test('should detect duplicate IDs', {
    annotation: [
      { type: 'feature', description: 'response-insights' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.evaluate(() => {
      const body = JSON.stringify([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 1, name: 'c' },
      ]);
      document.querySelector('#response-empty').classList.add('hidden');
      document.querySelector('#response-content').classList.remove('hidden');
      document.querySelector('#response-status').textContent = '200 OK';
      window.responseEditor.setValue(body);
      window.responseInsights.runInsights(body, { timing: 100, status: 200 });
    });

    await expect(page.getByTestId('insight-duplicate-ids')).toBeVisible();
    await expect(page.getByTestId('insight-duplicate-ids')).toContainText('Duplicate');
  });

  test('should detect always-null fields', {
    annotation: [
      { type: 'feature', description: 'response-insights' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.evaluate(() => {
      const body = JSON.stringify([
        { id: 1, name: 'a', avatar: null, bio: null },
        { id: 2, name: 'b', avatar: null, bio: null },
        { id: 3, name: 'c', avatar: null, bio: null },
      ]);
      document.querySelector('#response-empty').classList.add('hidden');
      document.querySelector('#response-content').classList.remove('hidden');
      document.querySelector('#response-status').textContent = '200 OK';
      window.responseEditor.setValue(body);
      window.responseInsights.runInsights(body, { timing: 100, status: 200 });
    });

    await expect(page.getByTestId('insight-null-fields')).toBeVisible();
    await expect(page.getByTestId('insight-null-fields')).toContainText('avatar');
    await expect(page.getByTestId('insight-null-fields')).toContainText('bio');
  });

  test('should detect empty array response', {
    annotation: [
      { type: 'feature', description: 'response-insights' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.evaluate(() => {
      const body = JSON.stringify([]);
      document.querySelector('#response-empty').classList.add('hidden');
      document.querySelector('#response-content').classList.remove('hidden');
      document.querySelector('#response-status').textContent = '200 OK';
      window.responseEditor.setValue(body);
      window.responseInsights.runInsights(body, { timing: 100, status: 200 });
    });

    await expect(page.getByTestId('insight-empty-array')).toBeVisible();
    await expect(page.getByTestId('insight-empty-array')).toContainText('empty array');
  });

  test('should detect slow response', {
    annotation: [
      { type: 'feature', description: 'response-insights' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.evaluate(() => {
      const body = JSON.stringify({ status: 'ok' });
      document.querySelector('#response-empty').classList.add('hidden');
      document.querySelector('#response-content').classList.remove('hidden');
      document.querySelector('#response-status').textContent = '200 OK';
      window.responseEditor.setValue(body);
      window.responseInsights.runInsights(body, { timing: 5000, status: 200 });
    });

    await expect(page.getByTestId('insight-slow-response')).toBeVisible();
    await expect(page.getByTestId('insight-slow-response')).toContainText('Slow');
  });

  test('should detect limit mismatch when response exceeds requested limit', {
    annotation: [
      { type: 'feature', description: 'response-insights' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.evaluate(() => {
      const items = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `item_${i}` }));
      const body = JSON.stringify(items);
      document.querySelector('#response-empty').classList.add('hidden');
      document.querySelector('#response-content').classList.remove('hidden');
      document.querySelector('#response-status').textContent = '200 OK';
      window.responseEditor.setValue(body);
      window.responseInsights.runInsights(body, { timing: 100, status: 200, url: 'http://localhost:3000/api/users?limit=10' });
    });

    await expect(page.getByTestId('insight-limit-mismatch')).toBeVisible();
    await expect(page.getByTestId('insight-limit-mismatch')).toContainText('limit=10');
    await expect(page.getByTestId('insight-limit-mismatch')).toContainText('15 items');
  });

  test('should not show limit mismatch when response is within limit', {
    annotation: [
      { type: 'feature', description: 'response-insights' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.evaluate(() => {
      const items = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `item_${i}` }));
      const body = JSON.stringify(items);
      document.querySelector('#response-empty').classList.add('hidden');
      document.querySelector('#response-content').classList.remove('hidden');
      document.querySelector('#response-status').textContent = '200 OK';
      window.responseEditor.setValue(body);
      window.responseInsights.runInsights(body, { timing: 100, status: 200, url: 'http://localhost:3000/api/users?limit=10' });
    });

    await expect(page.getByTestId('insight-limit-mismatch')).not.toBeVisible();
  });

  test('should detect limit mismatch with per_page parameter', {
    annotation: [
      { type: 'feature', description: 'response-insights' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.evaluate(() => {
      const items = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `item_${i}` }));
      const body = JSON.stringify(items);
      document.querySelector('#response-empty').classList.add('hidden');
      document.querySelector('#response-content').classList.remove('hidden');
      document.querySelector('#response-status').textContent = '200 OK';
      window.responseEditor.setValue(body);
      window.responseInsights.runInsights(body, { timing: 100, status: 200, url: 'http://localhost:3000/api/users?per_page=20&page=1' });
    });

    await expect(page.getByTestId('insight-limit-mismatch')).toBeVisible();
    await expect(page.getByTestId('insight-limit-mismatch')).toContainText('not be respecting');
  });

  test('should show no insights for clean response', {
    annotation: [
      { type: 'feature', description: 'response-insights' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.evaluate(() => {
      const body = JSON.stringify([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 3, name: 'c' },
      ]);
      document.querySelector('#response-empty').classList.add('hidden');
      document.querySelector('#response-content').classList.remove('hidden');
      document.querySelector('#response-status').textContent = '200 OK';
      window.responseEditor.setValue(body);
      window.responseInsights.runInsights(body, { timing: 100, status: 200 });
    });

    const insights = page.getByTestId('response-insights');
    await expect(insights).toHaveClass(/hidden/);
  });

});
