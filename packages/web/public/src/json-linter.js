// JsonLinter - Fault-tolerant JSON linter that detects multiple errors in a single pass
(function () {
'use strict';

class JsonLinter {
  /**
   * Lint JSON text and return an array of error objects.
   * Each error: { message: string, line: number (0-based), col: number (0-based) }
   * Returns empty array for valid JSON.
   */
  static lint(text) {
    if (!text || !text.trim()) return [];
    const linter = new JsonLinterImpl(text);
    return linter.lint();
  }
}

class JsonLinterImpl {
  constructor(text) {
    this._text = text;
    this._pos = 0;
    this._line = 0;
    this._col = 0;
    this._errors = [];
    this._len = text.length;
  }

  lint() {
    this._skipWhitespace();
    if (this._pos >= this._len) return [];
    this._parseValue();
    this._skipWhitespace();
    if (this._pos < this._len) {
      this._addError('Unexpected content after JSON value');
    }
    return this._errors;
  }

  // ─── Character helpers ──────────────────────
  _ch() {
    return this._pos < this._len ? this._text[this._pos] : '';
  }

  _advance() {
    if (this._pos < this._len) {
      if (this._text[this._pos] === '\n') {
        this._line++;
        this._col = 0;
      } else {
        this._col++;
      }
      this._pos++;
    }
  }

  _skipWhitespace() {
    while (this._pos < this._len) {
      const c = this._text[this._pos];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        this._advance();
      } else {
        break;
      }
    }
  }

  _addError(message) {
    this._errors.push({ message: message, line: this._line, col: this._col });
  }

  // ─── Value parsing ──────────────────────────
  _parseValue() {
    this._skipWhitespace();
    if (this._pos >= this._len) {
      this._addError('Unexpected end of input');
      return;
    }

    const c = this._ch();
    if (c === '{') {
      this._parseObject();
    } else if (c === '[') {
      this._parseArray();
    } else if (c === '"') {
      this._parseString();
    } else if (c === '-' || (c >= '0' && c <= '9')) {
      this._parseNumber();
    } else if (c === 't' || c === 'f') {
      this._parseBoolean();
    } else if (c === 'n') {
      this._parseNull();
    } else {
      this._addError('Invalid value: unexpected character \'' + c + '\'');
      // Recovery: skip this character
      this._advance();
    }
  }

  // ─── Object parsing ─────────────────────────
  _parseObject() {
    this._advance(); // skip '{'
    this._skipWhitespace();

    const keys = new Set();
    let expectComma = false;
    let prevValueLine = this._line;
    let prevValueCol = this._col;

    while (this._pos < this._len && this._ch() !== '}') {
      this._skipWhitespace();
      if (this._pos >= this._len || this._ch() === '}') break;

      if (expectComma) {
        if (this._ch() === ',') {
          this._advance();
          this._skipWhitespace();
          // Check trailing comma
          if (this._ch() === '}') {
            this._addError('Trailing comma before \'}\'');
            break;
          }
        } else {
          // Report error on the line where the comma should have been
          this._errors.push({ message: 'Missing comma between properties', line: prevValueLine, col: prevValueCol });
          // Recovery: continue without comma
        }
      }

      this._skipWhitespace();
      if (this._pos >= this._len || this._ch() === '}') break;

      // Parse key
      if (this._ch() !== '"') {
        this._addError('Expected property key (string)');
        // Recovery: skip to next structural character
        this._recoverToStructural();
        break;
      }

      const keyLine = this._line;
      const keyCol = this._col;
      const key = this._parseString();

      // Check duplicate key
      if (key !== null && keys.has(key)) {
        this._errors.push({ message: 'Duplicate key: "' + key + '"', line: keyLine, col: keyCol });
      }
      if (key !== null) keys.add(key);

      this._skipWhitespace();

      // Expect colon
      if (this._ch() === ':') {
        this._advance();
      } else {
        this._addError('Missing colon after property key');
        // Recovery: try to parse value anyway
      }

      this._skipWhitespace();
      if (this._pos >= this._len || this._ch() === '}' || this._ch() === ',') {
        this._addError('Missing value for property');
        if (this._ch() === ',') {
          expectComma = false;
          continue;
        }
        break;
      }

      this._parseValue();
      prevValueLine = this._line;
      prevValueCol = this._col;
      expectComma = true;
      this._skipWhitespace();
    }

    if (this._pos < this._len && this._ch() === '}') {
      this._advance();
    } else {
      this._addError('Missing closing \'}\'');
    }
  }

  // ─── Array parsing ──────────────────────────
  _parseArray() {
    this._advance(); // skip '['
    this._skipWhitespace();

    let expectComma = false;
    let prevValueLine = this._line;
    let prevValueCol = this._col;

    while (this._pos < this._len && this._ch() !== ']') {
      this._skipWhitespace();
      if (this._pos >= this._len || this._ch() === ']') break;

      if (expectComma) {
        if (this._ch() === ',') {
          this._advance();
          this._skipWhitespace();
          // Check trailing comma
          if (this._ch() === ']') {
            this._addError('Trailing comma before \']\'');
            break;
          }
        } else {
          // Report error on the line where the comma should have been
          this._errors.push({ message: 'Missing comma between array elements', line: prevValueLine, col: prevValueCol });
          // Recovery: continue without comma
        }
      }

      this._skipWhitespace();
      if (this._pos >= this._len || this._ch() === ']') break;

      this._parseValue();
      prevValueLine = this._line;
      prevValueCol = this._col;
      expectComma = true;
      this._skipWhitespace();
    }

    if (this._pos < this._len && this._ch() === ']') {
      this._advance();
    } else {
      this._addError('Missing closing \']\'');
    }
  }

  // ─── String parsing ─────────────────────────
  _parseString() {
    this._advance(); // skip opening '"'
    let value = '';

    while (this._pos < this._len) {
      const c = this._ch();
      if (c === '\n') {
        this._addError('Unterminated string (newline in string)');
        return value;
      }
      if (c === '\\') {
        this._advance();
        if (this._pos < this._len) {
          value += this._ch();
          this._advance();
        }
        continue;
      }
      if (c === '"') {
        this._advance();
        return value;
      }
      value += c;
      this._advance();
    }

    this._addError('Unterminated string');
    return value;
  }

  // ─── Number parsing ─────────────────────────
  _parseNumber() {
    const start = this._pos;
    if (this._ch() === '-') this._advance();

    if (this._pos >= this._len || this._ch() < '0' || this._ch() > '9') {
      this._addError('Invalid number');
      return;
    }

    // Integer part
    if (this._ch() === '0') {
      this._advance();
    } else {
      while (this._pos < this._len && this._ch() >= '0' && this._ch() <= '9') {
        this._advance();
      }
    }

    // Fractional part
    if (this._pos < this._len && this._ch() === '.') {
      this._advance();
      if (this._pos >= this._len || this._ch() < '0' || this._ch() > '9') {
        this._addError('Invalid number: expected digit after decimal point');
        return;
      }
      while (this._pos < this._len && this._ch() >= '0' && this._ch() <= '9') {
        this._advance();
      }
    }

    // Exponent
    if (this._pos < this._len && (this._ch() === 'e' || this._ch() === 'E')) {
      this._advance();
      if (this._pos < this._len && (this._ch() === '+' || this._ch() === '-')) {
        this._advance();
      }
      if (this._pos >= this._len || this._ch() < '0' || this._ch() > '9') {
        this._addError('Invalid number: expected digit in exponent');
        return;
      }
      while (this._pos < this._len && this._ch() >= '0' && this._ch() <= '9') {
        this._advance();
      }
    }
  }

  // ─── Boolean parsing ────────────────────────
  _parseBoolean() {
    if (this._text.substr(this._pos, 4) === 'true') {
      this._pos += 4; this._col += 4;
    } else if (this._text.substr(this._pos, 5) === 'false') {
      this._pos += 5; this._col += 5;
    } else {
      this._addError('Invalid value');
      this._advance();
    }
  }

  // ─── Null parsing ───────────────────────────
  _parseNull() {
    if (this._text.substr(this._pos, 4) === 'null') {
      this._pos += 4; this._col += 4;
    } else {
      this._addError('Invalid value');
      this._advance();
    }
  }

  // ─── Recovery ───────────────────────────────
  _recoverToStructural() {
    while (this._pos < this._len) {
      const c = this._ch();
      if (c === '{' || c === '}' || c === '[' || c === ']' || c === ',' || c === ':') {
        return;
      }
      this._advance();
    }
  }
}

window.JsonLinter = JsonLinter;
})();
