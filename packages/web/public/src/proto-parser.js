// Browser-compatible ProtoParser - loaded as a module, exposes window.ProtoParser
// Mirrors packages/core/src/parser/proto-parser.js

class ProtoParser {
  #raw = '';
  #result = null;

  static parse(input) {
    const parser = new ProtoParser();
    parser.#raw = input;
    parser.#result = parser.#doParse(input);
    return parser;
  }

  getRaw() { return this.#raw; }
  getResult() { return this.#result; }
  getPackage() { return this.#result.package; }
  getSyntax() { return this.#result.syntax; }
  getServices() { return this.#result.services; }
  getMessages() { return this.#result.messages; }
  getEnums() { return this.#result.enums; }

  toEndpoints() {
    const endpoints = [];
    for (const service of this.#result.services) {
      for (const method of service.methods) {
        const inputMsg = this.#result.messages[method.inputType] || null;
        const outputMsg = this.#result.messages[method.outputType] || null;

        endpoints.push({
          method: 'GRPC',
          path: '/' + (this.#result.package ? this.#result.package + '.' : '') + service.name + '/' + method.name,
          summary: method.name,
          description: method.comment || '',
          tags: [service.name],
          operationId: service.name + '.' + method.name,
          parameters: [],
          requestBody: inputMsg ? {
            required: true,
            content: {
              'application/json': {
                schema: this.#messageToSchema(inputMsg),
              },
            },
          } : null,
          responses: {
            '200': {
              description: method.outputType + (method.serverStreaming ? ' (stream)' : ''),
              content: outputMsg ? {
                'application/json': {
                  schema: this.#messageToSchema(outputMsg),
                },
              } : {},
            },
          },
          security: [],
          deprecated: false,
          _grpc: {
            service: service.name,
            method: method.name,
            inputType: method.inputType,
            outputType: method.outputType,
            clientStreaming: method.clientStreaming,
            serverStreaming: method.serverStreaming,
            package: this.#result.package,
            fullService: (this.#result.package ? this.#result.package + '.' : '') + service.name,
          },
        });
      }
    }
    return endpoints;
  }

  toSpec() {
    const endpoints = this.toEndpoints();
    const paths = {};
    for (const ep of endpoints) {
      paths[ep.path] = { grpc: ep };
    }
    return {
      info: {
        title: this.#result.package || 'gRPC Service',
        version: this.#result.syntax || 'proto3',
        description: 'gRPC service' + (this.#result.package ? ' — ' + this.#result.package : ''),
      },
      openapi: 'gRPC',
      _proto: true,
      _protoRaw: this.#raw,
      _protoResult: this.#result,
      paths,
      servers: [],
    };
  }

  // ─── Internal parser ──────────────────────────────────────

  #doParse(input) {
    const result = {
      syntax: 'proto3',
      package: '',
      imports: [],
      options: {},
      services: [],
      messages: {},
      enums: {},
    };
    const cleaned = this.#stripComments(input);
    const tokens = this.#tokenize(cleaned);
    this.#parseTokens(tokens, result);
    return result;
  }

  #stripComments(input) {
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

  #tokenize(input) {
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
      if ('{};=(),<>'.includes(input[i])) {
        tokens.push({ type: 'punct', value: input[i] });
        i++;
        continue;
      }
      let word = '';
      while (i < input.length && !/[\s{};=(),<>"']/.test(input[i])) {
        word += input[i];
        i++;
      }
      if (word) tokens.push({ type: 'word', value: word });
    }
    return tokens;
  }

  #parseTokens(tokens, result) {
    let i = 0;
    const peek = () => tokens[i] || null;
    const next = () => tokens[i++] || null;
    const expect = (value) => { const t = next(); return t; };
    const skipUntil = (value) => {
      while (i < tokens.length && tokens[i].value !== value) i++;
      if (i < tokens.length) i++;
    };

    while (i < tokens.length) {
      const t = next();
      if (!t) break;
      switch (t.value) {
        case 'syntax': {
          expect('=');
          const val = next();
          result.syntax = val.value;
          skipUntil(';');
          break;
        }
        case 'package': {
          let pkg = '';
          while (peek() && peek().value !== ';') pkg += next().value;
          result.package = pkg;
          skipUntil(';');
          break;
        }
        case 'import': {
          const path = next();
          result.imports.push(path.value);
          skipUntil(';');
          break;
        }
        case 'option': {
          const name = next();
          expect('=');
          const val = next();
          result.options[name.value] = val.value;
          skipUntil(';');
          break;
        }
        case 'message': {
          const msg = this.#parseMessage(tokens, i);
          i = msg.nextIndex;
          result.messages[msg.name] = msg.def;
          break;
        }
        case 'enum': {
          const en = this.#parseEnum(tokens, i);
          i = en.nextIndex;
          result.enums[en.name] = en.def;
          break;
        }
        case 'service': {
          const svc = this.#parseService(tokens, i);
          i = svc.nextIndex;
          result.services.push(svc.def);
          break;
        }
        default: break;
      }
    }
  }

  #parseMessage(tokens, startIdx) {
    let i = startIdx;
    const name = tokens[i++].value;
    i++; // skip {
    const fields = [];
    const nested = {};
    const oneofs = {};

    while (i < tokens.length && tokens[i].value !== '}') {
      const t = tokens[i];
      if (t.value === 'message') {
        i++;
        const msg = this.#parseMessage(tokens, i);
        i = msg.nextIndex;
        nested[msg.name] = msg.def;
        continue;
      }
      if (t.value === 'enum') {
        i++;
        const en = this.#parseEnum(tokens, i);
        i = en.nextIndex;
        nested[en.name] = en.def;
        continue;
      }
      if (t.value === 'oneof') {
        i++;
        const oneofName = tokens[i++].value;
        i++; // skip {
        const oneofFields = [];
        while (i < tokens.length && tokens[i].value !== '}') {
          const field = this.#parseField(tokens, i);
          if (field) { i = field.nextIndex; oneofFields.push(field.def); }
          else i++;
        }
        i++;
        oneofs[oneofName] = oneofFields;
        continue;
      }
      if (t.value === 'reserved' || t.value === 'option' || t.value === 'extensions') {
        while (i < tokens.length && tokens[i].value !== ';') i++;
        i++;
        continue;
      }
      const field = this.#parseField(tokens, i);
      if (field) { i = field.nextIndex; fields.push(field.def); }
      else i++;
    }
    if (i < tokens.length) i++;
    return { name, def: { fields, nested, oneofs }, nextIndex: i };
  }

  #parseField(tokens, startIdx) {
    let i = startIdx;
    if (i >= tokens.length) return null;
    let repeated = false;
    let optional = false;
    let mapType = null;

    if (tokens[i].value === 'repeated') { repeated = true; i++; }
    else if (tokens[i].value === 'optional') { optional = true; i++; }
    else if (tokens[i].value === 'map') {
      i++;
      if (tokens[i]?.value === '<') {
        i++;
        const keyType = tokens[i++].value;
        i++; // skip ,
        const valueType = tokens[i++].value;
        i++; // skip >
        mapType = { keyType, valueType };
      }
    }

    if (i >= tokens.length || tokens[i].value === '}') return null;
    const type = mapType ? `map<${mapType.keyType},${mapType.valueType}>` : tokens[i++].value;
    if (i >= tokens.length || tokens[i].type !== 'word') return null;
    const name = tokens[i++].value;
    if (i < tokens.length && tokens[i].value === '=') { i++; i++; }
    if (i < tokens.length && tokens[i].value === '[') {
      while (i < tokens.length && tokens[i].value !== ']') i++;
      i++;
    }
    if (i < tokens.length && tokens[i].value === ';') i++;
    return { def: { name, type, repeated, optional, map: mapType }, nextIndex: i };
  }

  #parseEnum(tokens, startIdx) {
    let i = startIdx;
    const name = tokens[i++].value;
    i++;
    const values = [];
    while (i < tokens.length && tokens[i].value !== '}') {
      if (tokens[i].value === 'option' || tokens[i].value === 'reserved') {
        while (i < tokens.length && tokens[i].value !== ';') i++;
        i++;
        continue;
      }
      const vName = tokens[i++].value;
      if (tokens[i]?.value === '=') {
        i++;
        const vNum = tokens[i++].value;
        values.push({ name: vName, number: parseInt(vNum, 10) });
      }
      if (tokens[i]?.value === ';') i++;
    }
    if (i < tokens.length) i++;
    return { name, def: { values }, nextIndex: i };
  }

  #parseService(tokens, startIdx) {
    let i = startIdx;
    const name = tokens[i++].value;
    i++;
    const methods = [];
    while (i < tokens.length && tokens[i].value !== '}') {
      if (tokens[i].value === 'option') {
        while (i < tokens.length && tokens[i].value !== ';') i++;
        i++;
        continue;
      }
      if (tokens[i].value === 'rpc') {
        i++;
        const methodName = tokens[i++].value;
        i++; // skip (
        let clientStreaming = false;
        if (tokens[i]?.value === 'stream') { clientStreaming = true; i++; }
        const inputType = tokens[i++].value;
        i++; // skip )
        if (tokens[i]?.value === 'returns') i++;
        i++; // skip (
        let serverStreaming = false;
        if (tokens[i]?.value === 'stream') { serverStreaming = true; i++; }
        const outputType = tokens[i++].value;
        i++; // skip )
        if (tokens[i]?.value === '{') {
          let depth = 1;
          i++;
          while (i < tokens.length && depth > 0) {
            if (tokens[i].value === '{') depth++;
            else if (tokens[i].value === '}') depth--;
            i++;
          }
        } else if (tokens[i]?.value === ';') { i++; }
        methods.push({ name: methodName, inputType, outputType, clientStreaming, serverStreaming, comment: '' });
      } else { i++; }
    }
    if (i < tokens.length) i++;
    return { def: { name, methods }, nextIndex: i };
  }

  #messageToSchema(msgDef) {
    const properties = {};
    for (const field of msgDef.fields) {
      if (field.repeated) {
        properties[field.name] = { type: 'array', items: { type: this.#protoTypeToJsonType(field.type) } };
      } else if (field.map) {
        properties[field.name] = { type: 'object', additionalProperties: { type: this.#protoTypeToJsonType(field.map.valueType) } };
      } else {
        properties[field.name] = { type: this.#protoTypeToJsonType(field.type) };
      }
    }
    return { type: 'object', properties };
  }

  #protoTypeToJsonType(protoType) {
    const map = {
      'double': 'number', 'float': 'number',
      'int32': 'integer', 'int64': 'string',
      'uint32': 'integer', 'uint64': 'string',
      'sint32': 'integer', 'sint64': 'string',
      'fixed32': 'integer', 'fixed64': 'string',
      'sfixed32': 'integer', 'sfixed64': 'string',
      'bool': 'boolean', 'string': 'string', 'bytes': 'string',
    };
    return map[protoType] || 'object';
  }
}

window.ProtoParser = ProtoParser;
