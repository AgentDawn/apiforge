// JsonEditor - Vanilla JS JSON Editor with Syntax Highlighting and Code Folding
(function () {
'use strict';

function esc(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightLine(text) {
  const e = esc(text);
  return e
    .replace(/"([^"\\]*(\\.[^"\\]*)*)"(\s*:)/g, '<span class="je-key">"$1"</span>$3')
    .replace(/:\s*"([^"\\]*(\\.[^"\\]*)*)"/g, ': <span class="je-str">"$1"</span>')
    .replace(/:\s*(-?\d+\.?\d*([eE][+-]?\d+)?)/g, ': <span class="je-num">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="je-bool">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="je-null">$1</span>');
}

class JsonEditor {
  constructor(container, opts = {}) {
    this._el = container;
    this._opts = opts;
    this._value = '';
    this._folds = new Map();
    this._history = [''];
    this._historyIdx = 0;
    this._errors = [];
    this._rendering = false;
    this._build();
    this._bind();
  }

  // ─── Public API ──────────────────────────────
  getValue() { return this._value; }

  setValue(text) {
    let v = text || '';
    if (this._opts.readOnly && v) {
      try { v = JSON.stringify(JSON.parse(v), null, 2); } catch (_) { /* not JSON, keep raw */ }
    }
    this._value = v;
    this._folds.clear();
    this._history = [this._value];
    this._historyIdx = 0;
    this._render();
  }

  focus() { this._code.focus(); }

  // ─── DOM ─────────────────────────────────────
  _build() {
    this._el.classList.add('je-editor');
    this._el.innerHTML = '';

    this._gutter = document.createElement('div');
    this._gutter.className = 'je-gutter';

    this._code = document.createElement('div');
    this._code.className = 'je-code';
    this._code.contentEditable = this._opts.readOnly ? 'false' : 'true';
    this._code.spellcheck = false;
    if (this._opts.readOnly) this._el.classList.add('je-readonly');
    if (this._opts.testId) {
      this._code.setAttribute('data-testid', this._opts.testId);
    }

    this._el.appendChild(this._gutter);
    this._el.appendChild(this._code);
  }

  _bind() {
    if (!this._opts.readOnly) {
      this._code.addEventListener('input', () => this._onInput());
      this._code.addEventListener('keydown', (e) => this._onKeydown(e));
      this._code.addEventListener('paste', (e) => this._onPaste(e));
    }
    this._code.addEventListener('scroll', () => {
      this._gutter.scrollTop = this._code.scrollTop;
    });
    this._gutter.addEventListener('click', (e) => {
      const btn = e.target.closest('.je-fold-btn');
      if (btn) this._toggleFold(parseInt(btn.dataset.line));
    });
  }

  // ─── Public API ── validation ────────────────
  getError() { return this._errors.length ? this._errors : null; }

  // ─── Rendering ───────────────────────────────
  _render() {
    this._rendering = true;
    const lines = this._value.split('\n');
    const regions = this._findFoldRegions(lines);
    const foldedSet = this._getFoldedSet();
    const errorLines = this._validate();

    let gutterHtml = '';
    let codeHtml = '';

    for (let i = 0; i < lines.length; i++) {
      if (foldedSet.has(i)) continue;

      const region = regions.find(r => r.start === i && r.end > i);
      const isFolded = this._folds.has(i);
      const lineError = errorLines.get(i);

      // Gutter
      gutterHtml += '<div class="je-gutter-line' + (lineError ? ' je-gutter-error' : '') + '">';
      if (lineError) {
        gutterHtml += '<span class="je-error-icon" title="' + esc(lineError.message) + '">\u26A0</span>';
      } else if (region) {
        gutterHtml += '<span class="je-fold-btn" data-line="' + i + '">' + (isFolded ? '\u25B6' : '\u25BC') + '</span>';
      } else {
        gutterHtml += '<span class="je-icon-spacer"></span>';
      }
      gutterHtml += '<span class="je-line-num">' + (i + 1) + '</span></div>';

      // Code line
      let lineHtml = highlightLine(lines[i]);
      if (isFolded) {
        const end = this._folds.get(i);
        const close = lines[end] ? lines[end].trim() : '}';
        lineHtml += '<span class="je-fold-placeholder" contenteditable="false"> \u2026 ' + esc(close) + '</span>';
      }
      codeHtml += '<div class="je-line' + (lineError ? ' je-line-error' : '') + '" data-line="' + i + '">' + (lineHtml || '\n') + '</div>';
    }

    if (!codeHtml) codeHtml = '<div class="je-line" data-line="0">\n</div>';

    this._gutter.innerHTML = gutterHtml;
    this._code.innerHTML = codeHtml;
    this._rendering = false;
  }

  // ─── Validation ─────────────────────────────
  _validate() {
    this._errors = [];
    if (this._opts.readOnly) return new Map();
    const text = this._value.trim();
    if (!text) return new Map();

    const errors = window.JsonLinter ? window.JsonLinter.lint(this._value) : [];
    this._errors = errors;

    // Build a map of line -> first error on that line for rendering
    const lineMap = new Map();
    for (const err of errors) {
      if (!lineMap.has(err.line)) {
        lineMap.set(err.line, err);
      }
    }
    return lineMap;
  }

  // ─── Fold Logic ──────────────────────────────
  _findFoldRegions(lines) {
    const regions = [];
    const stack = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip braces inside strings (simple heuristic)
      let inStr = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === '"' && (j === 0 || line[j - 1] !== '\\')) { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{' || ch === '[') stack.push({ start: i, ch });
        else if (ch === '}' || ch === ']') {
          const open = stack.pop();
          if (open && open.start < i) regions.push({ start: open.start, end: i });
        }
      }
    }
    return regions.sort((a, b) => a.start - b.start);
  }

  _toggleFold(lineIdx) {
    if (this._folds.has(lineIdx)) {
      this._folds.delete(lineIdx);
    } else {
      const lines = this._value.split('\n');
      const regions = this._findFoldRegions(lines);
      const region = regions.filter(r => r.start === lineIdx).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
      if (region) this._folds.set(lineIdx, region.end);
    }
    this._render();
    this._code.focus();
  }

  _getFoldedSet() {
    const set = new Set();
    for (const [start, end] of this._folds) {
      for (let i = start + 1; i <= end; i++) set.add(i);
    }
    return set;
  }

  // ─── Input Handling ──────────────────────────
  _onInput() {
    if (this._rendering) return;

    const lineDivs = this._code.querySelectorAll('.je-line');
    if (lineDivs.length === 0 || this._isDomCorrupt()) {
      this._folds.clear();
      this._value = this._code.innerText || '';
    } else {
      const lines = this._value.split('\n');
      for (const div of lineDivs) {
        const idx = parseInt(div.dataset.line);
        if (!isNaN(idx) && idx < lines.length) {
          lines[idx] = this._getLineText(div);
        }
      }
      this._value = lines.join('\n');
    }

    this._pushHistory();
    const offset = this._saveCaret();
    this._render();
    this._restoreCaret(offset);

    if (this._opts.onChange) this._opts.onChange(this._value);
  }

  _onKeydown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const info = this._getCursorInfo();
      if (!info) { document.execCommand('insertLineBreak'); return; }

      const lines = this._value.split('\n');
      const line = lines[info.line] || '';
      const before = line.slice(0, info.col);
      const after = line.slice(info.col);

      const indent = (before.match(/^(\s*)/) || ['', ''])[1];
      const lastCh = before.trim().slice(-1);
      const extra = (lastCh === '{' || lastCh === '[') ? '  ' : '';

      const firstAfterCh = after.trim()[0];
      const autoClose = extra && (firstAfterCh === '}' || firstAfterCh === ']');

      if (autoClose) {
        lines.splice(info.line, 1, before, indent + extra, indent + after.trimStart());
        this._shiftFolds(info.line, 2);
      } else {
        lines.splice(info.line, 1, before, indent + extra + after);
        this._shiftFolds(info.line, 1);
      }

      this._value = lines.join('\n');
      this._pushHistory();
      this._render();
      this._restoreCaretTo(info.line + 1, indent.length + extra.length);
      if (this._opts.onChange) this._opts.onChange(this._value);
      return;
    }

    if (e.key === 'Backspace') {
      const info = this._getCursorInfo();
      if (info && info.col === 0 && info.line > 0) {
        e.preventDefault();
        const foldedSet = this._getFoldedSet();
        let prev = info.line - 1;
        while (prev >= 0 && foldedSet.has(prev)) prev--;
        if (prev < 0) return;

        const lines = this._value.split('\n');
        const prevLen = lines[prev].length;
        lines[prev] += lines[info.line];
        lines.splice(info.line, 1);
        this._shiftFolds(info.line, -1);

        this._value = lines.join('\n');
        this._pushHistory();
        this._render();
        this._restoreCaretTo(prev, prevLen);
        if (this._opts.onChange) this._opts.onChange(this._value);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault(); this._undo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault(); this._redo(); return;
    }
  }

  _onPaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  // ─── Caret ───────────────────────────────────
  _saveCaret() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0).cloneRange();
    const pre = document.createRange();
    pre.selectNodeContents(this._code);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }

  _restoreCaret(offset) {
    const walker = document.createTreeWalker(this._code, NodeFilter.SHOW_TEXT);
    let pos = 0;
    while (walker.nextNode()) {
      const len = walker.currentNode.textContent.length;
      if (pos + len >= offset) {
        try {
          const r = document.createRange();
          r.setStart(walker.currentNode, Math.min(offset - pos, len));
          r.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        } catch (_) { /* ignore */ }
        return;
      }
      pos += len;
    }
  }

  _getCursorInfo() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0);

    let node = range.startContainer;
    let lineDiv = node.nodeType === 3 ? node.parentElement : node;
    while (lineDiv && !lineDiv.classList?.contains('je-line')) lineDiv = lineDiv.parentElement;
    if (!lineDiv || !lineDiv.dataset.line) return null;

    const line = parseInt(lineDiv.dataset.line);
    const pre = document.createRange();
    pre.setStart(lineDiv, 0);
    pre.setEnd(range.startContainer, range.startOffset);
    const col = pre.toString().length;

    return { line, col };
  }

  _restoreCaretTo(line, col) {
    const lineDiv = this._code.querySelector('[data-line="' + line + '"]');
    if (!lineDiv) return;
    const walker = document.createTreeWalker(lineDiv, NodeFilter.SHOW_TEXT);
    let pos = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('.je-fold-placeholder')) continue;
      const len = node.textContent.length;
      if (pos + len >= col) {
        try {
          const r = document.createRange();
          r.setStart(node, Math.min(col - pos, len));
          r.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        } catch (_) { /* ignore */ }
        return;
      }
      pos += len;
    }
  }

  // ─── History ─────────────────────────────────
  _pushHistory() {
    if (this._value === this._history[this._historyIdx]) return;
    this._history = this._history.slice(0, this._historyIdx + 1);
    this._history.push(this._value);
    if (this._history.length > 100) this._history.shift();
    this._historyIdx = this._history.length - 1;
  }

  _undo() {
    if (this._historyIdx > 0) {
      this._historyIdx--;
      this._value = this._history[this._historyIdx];
      this._folds.clear();
      this._render();
      if (this._opts.onChange) this._opts.onChange(this._value);
    }
  }

  _redo() {
    if (this._historyIdx < this._history.length - 1) {
      this._historyIdx++;
      this._value = this._history[this._historyIdx];
      this._folds.clear();
      this._render();
      if (this._opts.onChange) this._opts.onChange(this._value);
    }
  }

  // ─── Utilities ───────────────────────────────
  _getLineText(div) {
    let text = '';
    for (const node of div.childNodes) {
      if (node.classList?.contains('je-fold-placeholder')) continue;
      text += node.textContent;
    }
    return text.replace(/\n$/, '');
  }

  _isDomCorrupt() {
    for (const child of this._code.children) {
      if (!child.classList?.contains('je-line')) return true;
    }
    return false;
  }

  _shiftFolds(afterLine, delta) {
    const nf = new Map();
    for (const [s, e] of this._folds) {
      const ns = s > afterLine ? s + delta : s;
      const ne = e > afterLine ? e + delta : e;
      if (ns < ne && ns >= 0) nf.set(ns, ne);
    }
    this._folds = nf;
  }
}

window.JsonEditor = JsonEditor;
})();
