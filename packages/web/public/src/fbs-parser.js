// Browser-compatible FbsParser - loaded as a module, exposes window.FbsParser
// Parses FlatBuffers .fbs schema files

class FbsParser {
  static parse(input) {
    const parser = new FbsParser();
    parser._raw = input;
    parser._result = parser._doParse(input);
    return parser._result;
  }

  static generateExample(parsed, tableName) {
    const table = parsed.tables.find((t) => t.name === tableName);
    if (!table) return {};
    return FbsParser._tableToExample(table, parsed);
  }

  static _tableToExample(table, parsed, depth) {
    if ((depth || 0) > 8) return {};
    const d = (depth || 0) + 1;
    const obj = {};
    for (const field of table.fields) {
      obj[field.name] = FbsParser._fieldDefault(field, parsed, d);
    }
    return obj;
  }

  static _fieldDefault(field, parsed, depth) {
    if (field.defaultValue !== null && field.defaultValue !== undefined) {
      // Check if default is an enum value name
      const enumDef = parsed.enums.find((e) => e.name === field.type);
      if (enumDef) {
        return field.defaultValue;
      }
      // Try to parse numeric defaults
      if (field.defaultValue === 'true') return true;
      if (field.defaultValue === 'false') return false;
      const num = Number(field.defaultValue);
      if (!isNaN(num) && field.defaultValue !== '') return num;
      return field.defaultValue;
    }

    if (field.isArray) {
      return [];
    }

    const enumDef = parsed.enums.find((e) => e.name === field.type);
    if (enumDef && enumDef.values.length > 0) {
      return enumDef.values[0].name;
    }

    const refTable = parsed.tables.find((t) => t.name === field.type);
    if (refTable) {
      return FbsParser._tableToExample(refTable, parsed, depth);
    }

    return FbsParser._scalarDefault(field.type);
  }

  static _scalarDefault(type) {
    switch (type) {
      case 'bool': return false;
      case 'byte': case 'ubyte': case 'short': case 'ushort':
      case 'int': case 'uint': case 'long': case 'ulong':
      case 'int8': case 'uint8': case 'int16': case 'uint16':
      case 'int32': case 'uint32': case 'int64': case 'uint64':
        return 0;
      case 'float': case 'float32': case 'double': case 'float64':
        return 0.0;
      case 'string':
        return 'string';
      default:
        return null;
    }
  }

  // ─── Internal parser ──────────────────────────────────────

  _doParse(input) {
    const result = {
      namespace: '',
      tables: [],
      enums: [],
      unions: [],
      rootType: '',
    };
    const cleaned = this._stripComments(input);
    const tokens = this._tokenize(cleaned);
    this._parseTokens(tokens, result);
    return result;
  }

  _stripComments(input) {
    let result = '';
    let i = 0;
    while (i < input.length) {
      if (input[i] === '/' && input[i + 1] === '/') {
        while (i < input.length && input[i] !== '\n') i++;
      } else if (input[i] === '/' && input[i + 1] === '*') {
        i += 2;
        while (i < input.length - 1 && !(input[i] === '*' && input[i + 1] === '/')) i++;
        i += 2;
      } else {
        result += input[i];
        i++;
      }
    }
    return result;
  }

  _tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      if (/\s/.test(input[i])) { i++; continue; }
      if (input[i] === '"' || input[i] === "'") {
        const quote = input[i];
        let str = '';
        i++;
        while (i < input.length && input[i] !== quote) {
          if (input[i] === '\\') { str += input[i + 1]; i += 2; }
          else { str += input[i]; i++; }
        }
        i++;
        tokens.push({ type: 'string', value: str });
        continue;
      }
      if ('{}[];=(),:'.includes(input[i])) {
        tokens.push({ type: 'punct', value: input[i] });
        i++;
        continue;
      }
      let word = '';
      while (i < input.length && !/[\s{}[\];=(),:\"']/.test(input[i])) {
        word += input[i];
        i++;
      }
      if (word) tokens.push({ type: 'word', value: word });
    }
    return tokens;
  }

  _parseTokens(tokens, result) {
    let i = 0;
    const peek = () => tokens[i] || null;
    const next = () => tokens[i++] || null;
    const skipUntil = (value) => {
      while (i < tokens.length && tokens[i].value !== value) i++;
      if (i < tokens.length) i++;
    };

    while (i < tokens.length) {
      const t = next();
      if (!t) break;
      switch (t.value) {
        case 'namespace': {
          let ns = '';
          while (peek() && peek().value !== ';') ns += next().value;
          result.namespace = ns;
          skipUntil(';');
          break;
        }
        case 'table':
        case 'struct': {
          const parsed = this._parseTable(tokens, i);
          i = parsed.nextIndex;
          result.tables.push(parsed.def);
          break;
        }
        case 'enum': {
          const parsed = this._parseEnum(tokens, i);
          i = parsed.nextIndex;
          result.enums.push(parsed.def);
          break;
        }
        case 'union': {
          const parsed = this._parseUnion(tokens, i);
          i = parsed.nextIndex;
          result.unions.push(parsed.def);
          break;
        }
        case 'root_type': {
          const name = next();
          if (name) result.rootType = name.value;
          skipUntil(';');
          break;
        }
        case 'include':
        case 'attribute':
        case 'file_identifier':
        case 'file_extension': {
          skipUntil(';');
          break;
        }
        default: break;
      }
    }
  }

  _parseTable(tokens, startIdx) {
    let i = startIdx;
    const name = tokens[i++].value;
    // skip optional metadata in parentheses before {
    if (i < tokens.length && tokens[i].value === '(') {
      while (i < tokens.length && tokens[i].value !== ')') i++;
      i++; // skip )
    }
    i++; // skip {
    const fields = [];

    while (i < tokens.length && tokens[i].value !== '}') {
      const fieldResult = this._parseField(tokens, i);
      if (fieldResult) {
        i = fieldResult.nextIndex;
        fields.push(fieldResult.def);
      } else {
        i++;
      }
    }
    if (i < tokens.length) i++; // skip }
    return { def: { name, fields }, nextIndex: i };
  }

  _parseField(tokens, startIdx) {
    let i = startIdx;
    if (i >= tokens.length || tokens[i].value === '}') return null;

    // field name
    const name = tokens[i++].value;
    // skip :
    if (i < tokens.length && tokens[i].value === ':') i++;
    else return null;

    // type - could be [type] for arrays
    let type = '';
    let isArray = false;
    if (i < tokens.length && tokens[i].value === '[') {
      isArray = true;
      i++; // skip [
      type = tokens[i++].value;
      if (i < tokens.length && tokens[i].value === ']') i++; // skip ]
    } else {
      type = tokens[i++].value;
    }

    // optional default value
    let defaultValue = null;
    if (i < tokens.length && tokens[i].value === '=') {
      i++; // skip =
      if (i < tokens.length) {
        defaultValue = tokens[i++].value;
      }
    }

    // optional metadata (required), (deprecated), etc.
    let required = false;
    let deprecated = false;
    if (i < tokens.length && tokens[i].value === '(') {
      while (i < tokens.length && tokens[i].value !== ')') {
        if (tokens[i].value === 'required') required = true;
        if (tokens[i].value === 'deprecated') deprecated = true;
        i++;
      }
      if (i < tokens.length) i++; // skip )
    }

    // skip ;
    if (i < tokens.length && tokens[i].value === ';') i++;

    return {
      def: { name, type, isArray, defaultValue, required, deprecated },
      nextIndex: i,
    };
  }

  _parseEnum(tokens, startIdx) {
    let i = startIdx;
    const name = tokens[i++].value;
    // skip optional : type
    let underlyingType = 'int';
    if (i < tokens.length && tokens[i].value === ':') {
      i++; // skip :
      underlyingType = tokens[i++].value;
    }
    // skip optional metadata
    if (i < tokens.length && tokens[i].value === '(') {
      while (i < tokens.length && tokens[i].value !== ')') i++;
      i++;
    }
    i++; // skip {
    const values = [];
    let autoValue = 0;

    while (i < tokens.length && tokens[i].value !== '}') {
      const vName = tokens[i++].value;
      let vNum = autoValue;
      if (i < tokens.length && tokens[i].value === '=') {
        i++; // skip =
        vNum = parseInt(tokens[i++].value, 10);
      }
      values.push({ name: vName, value: vNum });
      autoValue = vNum + 1;
      // skip comma
      if (i < tokens.length && tokens[i].value === ',') i++;
    }
    if (i < tokens.length) i++; // skip }
    return { def: { name, underlyingType, values }, nextIndex: i };
  }

  _parseUnion(tokens, startIdx) {
    let i = startIdx;
    const name = tokens[i++].value;
    i++; // skip {
    const types = [];

    while (i < tokens.length && tokens[i].value !== '}') {
      const typeName = tokens[i++].value;
      types.push(typeName);
      if (i < tokens.length && tokens[i].value === ',') i++;
    }
    if (i < tokens.length) i++; // skip }
    return { def: { name, types }, nextIndex: i };
  }
}

window.FbsParser = FbsParser;
