import { test, expect } from '@playwright/test';

// Helper: navigate to the Body tab where the JsonEditor lives
async function gotoBodyTab(page) {
  await page.goto('/');
  await page.locator('.tab', { hasText: 'Body' }).click();
  await expect(page.locator('#tab-body')).not.toHaveClass(/hidden/);
  // Switch to JSON mode so the editor is visible (default is None)
  await page.locator('[data-testid="body-type-json"]').click();
}

// Helper: set editor content via the public API
async function setEditorValue(page, text) {
  await page.evaluate((v) => window.bodyEditor.setValue(v), text);
}

// Helper: get editor content via the public API
async function getEditorValue(page) {
  return page.evaluate(() => window.bodyEditor.getValue());
}

test.describe('JsonEditor', () => {

  // ─── Scenario 1: Initial State ────────────────────────────────────────────
  test('should render the editor with correct structure', {
    annotation: [
      { type: 'feature', description: 'json-editor' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate to Body tab', async () => {
      await gotoBodyTab(page);
    });

    await test.step('Verify: Editor structure is correct', async () => {
      const editor = page.getByTestId('body-editor');
      await expect(editor).toBeVisible();
      await expect(editor).toHaveAttribute('contenteditable', 'true');

      const wrapper = page.locator('#body-editor-wrap');
      await expect(wrapper).toHaveClass(/je-editor/);
      await expect(wrapper.locator('.je-gutter')).toBeVisible();
      await expect(wrapper.locator('.je-code')).toBeVisible();
    });
  });

  // ─── Scenario 2: setValue / getValue ──────────────────────────────────────
  test('should set and get editor value correctly', {
    annotation: [
      { type: 'feature', description: 'json-editor' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate to Body tab', async () => {
      await gotoBodyTab(page);
    });

    await test.step('Action: Set editor value', async () => {
      const json = '{"hello": "world"}';
      await setEditorValue(page, json);
      const value = await getEditorValue(page);
      expect(value).toBe(json);
    });

    await test.step('Verify: Content rendered in DOM', async () => {
      const codeArea = page.getByTestId('body-editor');
      const domText = await codeArea.innerText();
      expect(domText.replace(/\s+/g, '')).toContain('hello');
      expect(domText.replace(/\s+/g, '')).toContain('world');
    });
  });

  // ─── Scenario 3: Syntax Highlighting ──────────────────────────────────────
  test('should highlight keys, strings, numbers, booleans, and null', {
    annotation: [
      { type: 'feature', description: 'json-editor' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load JSON with various types', async () => {
      await gotoBodyTab(page);
      const json = [
        '{',
        '  "name": "Alice",',
        '  "age": 30,',
        '  "active": true,',
        '  "score": false,',
        '  "data": null',
        '}',
      ].join('\n');
      await setEditorValue(page, json);
    });

    await test.step('Verify: All token types highlighted', async () => {
      const codeArea = page.getByTestId('body-editor');
      await expect(codeArea.locator('.je-key').first()).toBeVisible();
      await expect(codeArea.locator('.je-str').first()).toBeVisible();
      await expect(codeArea.locator('.je-num').first()).toBeVisible();
      await expect(codeArea.locator('.je-bool').first()).toBeVisible();
      await expect(codeArea.locator('.je-null').first()).toBeVisible();
    });
  });

  // ─── Scenario 4: Line Numbers ──────────────────────────────────────────────
  test('should display correct line numbers in the gutter', {
    annotation: [
      { type: 'feature', description: 'json-editor' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load multi-line JSON', async () => {
      await gotoBodyTab(page);
      const json = '{\n  "a": 1,\n  "b": 2\n}';
      await setEditorValue(page, json);
    });

    await test.step('Verify: Line numbers are correct', async () => {
      const lineNums = page.locator('.je-gutter .je-line-num');
      await expect(lineNums).toHaveCount(4);
      await expect(lineNums.nth(0)).toHaveText('1');
      await expect(lineNums.nth(1)).toHaveText('2');
      await expect(lineNums.nth(2)).toHaveText('3');
      await expect(lineNums.nth(3)).toHaveText('4');
    });
  });

  // ─── Scenario 5: Code Folding - Collapse ──────────────────────────────────
  test('should collapse a block when the fold button is clicked', {
    annotation: [
      { type: 'feature', description: 'json-editor' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load nested JSON', async () => {
      await gotoBodyTab(page);
      const json = [
        '{',
        '  "outer": {',
        '    "inner": 1',
        '  }',
        '}',
      ].join('\n');
      await setEditorValue(page, json);
    });

    await test.step('Action: Click fold button to collapse', async () => {
      const foldBtn = page.locator('.je-fold-btn[data-line="0"]');
      await expect(foldBtn).toBeVisible();
      await foldBtn.click();
    });

    await test.step('Verify: Block is collapsed', async () => {
      const placeholder = page.locator('[data-line="0"] .je-fold-placeholder');
      await expect(placeholder).toBeVisible();
      await expect(placeholder).toContainText('…');
      await expect(page.locator('[data-line="1"]')).toHaveCount(0);
      await expect(page.locator('[data-line="2"]')).toHaveCount(0);
    });
  });

  // ─── Scenario 6: Code Folding - Expand ────────────────────────────────────
  test('should expand a collapsed block when the fold button is clicked again', {
    annotation: [
      { type: 'feature', description: 'json-editor' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load and collapse JSON', async () => {
      await gotoBodyTab(page);
      const json = [
        '{',
        '  "outer": {',
        '    "inner": 1',
        '  }',
        '}',
      ].join('\n');
      await setEditorValue(page, json);
      const foldBtn = page.locator('.je-fold-btn[data-line="0"]');
      await foldBtn.click();
      await expect(page.locator('[data-line="0"] .je-fold-placeholder')).toBeVisible();
    });

    await test.step('Action: Click fold button to expand', async () => {
      const foldBtn = page.locator('.je-fold-btn[data-line="0"]');
      await foldBtn.click();
    });

    await test.step('Verify: Block is expanded', async () => {
      await expect(page.locator('[data-line="0"] .je-fold-placeholder')).toHaveCount(0);
      await expect(page.locator('.je-code [data-line="1"]')).toBeVisible();
      await expect(page.locator('.je-code [data-line="2"]')).toBeVisible();
    });
  });

  // ─── Scenario 7: Tab Key Inserts 2 Spaces ────────────────────────────────
  test('should insert 2 spaces when Tab is pressed', {
    annotation: [
      { type: 'feature', description: 'json-editor' },
      { type: 'severity', description: 'low' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate to empty editor', async () => {
      await gotoBodyTab(page);
      await setEditorValue(page, '');
    });

    await test.step('Action: Press Tab key', async () => {
      const editor = page.getByTestId('body-editor');
      await editor.click();
      await page.keyboard.press('Tab');
    });

    await test.step('Verify: 2 spaces inserted', async () => {
      const value = await getEditorValue(page);
      expect(value).toContain('  ');
    });
  });

  // ─── Scenario 8: Auto-indent on Enter ────────────────────────────────────
  test('should auto-indent after pressing Enter following an opening brace', {
    annotation: [
      { type: 'feature', description: 'json-editor' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Set opening brace', async () => {
      await gotoBodyTab(page);
      await setEditorValue(page, '{');
    });

    await test.step('Action: Press Enter after brace', async () => {
      const editor = page.getByTestId('body-editor');
      await editor.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
    });

    await test.step('Verify: New line is indented', async () => {
      const value = await getEditorValue(page);
      const lines = value.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines[1]).toMatch(/^ {2,}/);
    });
  });

  // ─── Scenario 9: Undo / Redo ──────────────────────────────────────────────
  test('should undo and redo changes with Ctrl+Z / Ctrl+Y', {
    annotation: [
      { type: 'feature', description: 'json-editor' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Set initial value and type extra character', async () => {
      await gotoBodyTab(page);
      await setEditorValue(page, 'hello');
      const editor = page.getByTestId('body-editor');
      await editor.click();
      await page.keyboard.press('End');
      await page.keyboard.type('!');
      const afterType = await getEditorValue(page);
      expect(afterType).toContain('hello!');
    });

    await test.step('Action: Undo change', async () => {
      await page.keyboard.press('Control+z');
      const afterUndo = await getEditorValue(page);
      expect(afterUndo).toBe('hello');
    });

    await test.step('Action: Redo change', async () => {
      await page.keyboard.press('Control+y');
      const afterRedo = await getEditorValue(page);
      expect(afterRedo).toContain('hello!');
    });
  });

  // ─── Scenario 10: JSON Validation - Error Marking ──────────────────────────
  test('should show error underline on invalid JSON line', {
    annotation: [
      { type: 'feature', description: 'json-validation' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Set invalid JSON', async () => {
      await gotoBodyTab(page);
      await setEditorValue(page, '{\n  "name": "test"\n  "age": 30\n}');
    });

    await test.step('Verify: Error markers visible', async () => {
      const errorLine = page.locator('.je-line-error');
      await expect(errorLine).toBeVisible();
      const errorIcon = page.locator('.je-error-icon');
      await expect(errorIcon).toBeVisible();
      await expect(errorIcon).toHaveAttribute('title', /.+/);
    });
  });

  test('should not show error on valid JSON', {
    annotation: [
      { type: 'feature', description: 'json-validation' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await gotoBodyTab(page);
    await setEditorValue(page, '{\n  "name": "test",\n  "age": 30\n}');
    await expect(page.locator('.je-line-error')).toHaveCount(0);
    await expect(page.locator('.je-error-icon')).toHaveCount(0);
  });

  test('should not show error on empty editor', {
    annotation: [
      { type: 'feature', description: 'json-validation' },
      { type: 'severity', description: 'low' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await gotoBodyTab(page);
    await setEditorValue(page, '');
    await expect(page.locator('.je-line-error')).toHaveCount(0);
    await expect(page.locator('.je-error-icon')).toHaveCount(0);
  });

  test('should expose error info via getError API', {
    annotation: [
      { type: 'feature', description: 'json-validation' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate to Body tab', async () => {
      await gotoBodyTab(page);
    });

    await test.step('Verify: No error on valid JSON', async () => {
      await setEditorValue(page, '{"a": 1}');
      const noError = await page.evaluate(() => window.bodyEditor.getError());
      expect(noError).toBeNull();
    });

    await test.step('Verify: Error array on invalid JSON', async () => {
      await setEditorValue(page, '{"a": }');
      const errors = await page.evaluate(() => window.bodyEditor.getError());
      expect(errors).not.toBeNull();
      expect(Array.isArray(errors)).toBe(true);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0].message).toBeTruthy();
      expect(errors[0].line).toBeGreaterThanOrEqual(0);
    });
  });

  test('should detect multiple errors simultaneously', {
    annotation: [
      { type: 'feature', description: 'json-validation' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Set JSON with multiple errors', async () => {
      await gotoBodyTab(page);
      await setEditorValue(page, '{\n  "a": 1\n  "b": 2\n  "c": 3\n}');
    });

    await test.step('Verify: Multiple error lines and errors', async () => {
      const errorLines = page.locator('.je-line-error');
      await expect(errorLines).toHaveCount(2);
      const errors = await page.evaluate(() => window.bodyEditor.getError());
      expect(Array.isArray(errors)).toBe(true);
      expect(errors.length).toBe(2);
      expect(errors[0].line).toBe(1);
      expect(errors[1].line).toBe(2);
    });
  });

  test('should detect trailing comma', {
    annotation: [
      { type: 'feature', description: 'json-validation' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await gotoBodyTab(page);
    await setEditorValue(page, '{"a": 1,}');
    const errorLine = page.locator('.je-line-error');
    await expect(errorLine).toBeVisible();
    const errors = await page.evaluate(() => window.bodyEditor.getError());
    expect(errors).not.toBeNull();
    expect(errors.some(e => e.message.toLowerCase().includes('trailing comma'))).toBe(true);
  });

  test('should detect missing comma', {
    annotation: [
      { type: 'feature', description: 'json-validation' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await gotoBodyTab(page);
    await setEditorValue(page, '{"a": 1 "b": 2}');
    const errorLine = page.locator('.je-line-error');
    await expect(errorLine).toBeVisible();
    const errors = await page.evaluate(() => window.bodyEditor.getError());
    expect(errors).not.toBeNull();
    expect(errors.some(e => e.message.toLowerCase().includes('missing comma'))).toBe(true);
  });

  test('should detect duplicate keys', {
    annotation: [
      { type: 'feature', description: 'json-validation' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await gotoBodyTab(page);
    await setEditorValue(page, '{\n  "a": 1,\n  "a": 2\n}');
    const errorLine = page.locator('.je-line-error');
    await expect(errorLine).toBeVisible();
    const errors = await page.evaluate(() => window.bodyEditor.getError());
    expect(errors.some(e => e.message.includes('Duplicate key'))).toBe(true);
  });

  test('should detect unterminated string', {
    annotation: [
      { type: 'feature', description: 'json-validation' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await gotoBodyTab(page);
    await setEditorValue(page, '{\n  "a": "hello\n  "b": 2\n}');
    const errors = await page.evaluate(() => window.bodyEditor.getError());
    expect(errors).not.toBeNull();
    expect(errors.some(e => e.message.toLowerCase().includes('unterminated string'))).toBe(true);
  });

  test('should detect missing colon after key', {
    annotation: [
      { type: 'feature', description: 'json-validation' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await gotoBodyTab(page);
    await setEditorValue(page, '{\n  "a" 1\n}');
    const errorLine = page.locator('.je-line-error');
    await expect(errorLine).toBeVisible();
    const errors = await page.evaluate(() => window.bodyEditor.getError());
    expect(errors.some(e => e.message.toLowerCase().includes('missing colon'))).toBe(true);
  });

  test('should detect nested object and array errors simultaneously', {
    annotation: [
      { type: 'feature', description: 'json-validation' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await gotoBodyTab(page);
    await setEditorValue(page, '{\n  "x": {\n    "y": 1\n    "z": 2\n  },\n  "arr": [1 2 3]\n}');
    const errorLines = page.locator('.je-line-error');
    const count = await errorLines.count();
    expect(count).toBeGreaterThanOrEqual(2);
    const errors = await page.evaluate(() => window.bodyEditor.getError());
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  test('should detect multiple trailing commas in nested structures', {
    annotation: [
      { type: 'feature', description: 'json-validation' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await gotoBodyTab(page);
    await setEditorValue(page, '{\n  "a": [1, 2,],\n  "b": {"c": 1,}\n}');
    const errorLines = page.locator('.je-line-error');
    const count = await errorLines.count();
    expect(count).toBe(2);
    const errors = await page.evaluate(() => window.bodyEditor.getError());
    expect(errors.filter(e => e.message.includes('Trailing comma')).length).toBe(2);
  });

  // ─── Scenario 11: Paste Handling ──────────────────────────────────────────
  test('should process pasted JSON text correctly', {
    annotation: [
      { type: 'feature', description: 'json-editor' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Navigate and clear editor', async () => {
      await gotoBodyTab(page);
      await setEditorValue(page, '');
      const editor = page.getByTestId('body-editor');
      await editor.click();
    });

    await test.step('Action: Simulate paste', async () => {
      const pastedJson = '{"pasted": true}';
      await page.evaluate((text) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const event = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        document.querySelector('[data-testid="body-editor"]').dispatchEvent(event);
      }, pastedJson);
      await page.waitForTimeout(100);
    });

    await test.step('Verify: Pasted content in editor', async () => {
      const value = await getEditorValue(page);
      expect(value).toContain('pasted');
    });
  });

});
