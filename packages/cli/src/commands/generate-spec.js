import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ─── TypeScript Loading ─────────────────────────────────────

let ts = null;

/**
 * Try to load the TypeScript compiler API from the target project's node_modules,
 * or from a globally installed version.
 */
function loadTypeScript(srcDir) {
  // Strategy 1: Look in the source project's node_modules
  let dir = resolve(srcDir);
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'node_modules', 'typescript');
    if (existsSync(candidate)) {
      try {
        const require = createRequire(join(dir, 'package.json'));
        ts = require('typescript');
        return true;
      } catch { /* continue */ }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Strategy 2: Try global typescript
  try {
    const require = createRequire(import.meta.url);
    ts = require('typescript');
    return true;
  } catch { /* continue */ }

  return false;
}

// ─── AST Utilities ──────────────────────────────────────────

function getDecorators(node) {
  // TS 5+: ts.canHaveDecorators / ts.getDecorators
  if (ts.canHaveDecorators && ts.getDecorators) {
    if (ts.canHaveDecorators(node)) {
      return ts.getDecorators(node) || [];
    }
    return [];
  }
  // TS 4.x: node.decorators
  return node.decorators || [];
}

function getModifiers(node) {
  if (ts.canHaveModifiers && ts.getModifiers) {
    if (ts.canHaveModifiers(node)) {
      return ts.getModifiers(node) || [];
    }
    return [];
  }
  return (node.modifiers || []).filter(m => !m.expression);
}

/**
 * Extract a JS value from an AST node (string, number, boolean, object literal, array, identifier)
 */
function extractValue(node, sourceFile) {
  if (!node) return undefined;

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (node.kind === ts.SyntaxKind.UndefinedKeyword) return undefined;

  if (ts.isObjectLiteralExpression(node)) {
    const obj = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = prop.name.getText(sourceFile);
        obj[key] = extractValue(prop.initializer, sourceFile);
      }
      if (ts.isShorthandPropertyAssignment(prop)) {
        const key = prop.name.getText(sourceFile);
        obj[key] = key; // reference name
      }
    }
    return obj;
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(e => extractValue(e, sourceFile));
  }

  // Arrow function: () => SomeType -- extract return type identifier
  if (ts.isArrowFunction(node)) {
    const body = node.body;
    if (ts.isIdentifier(body)) {
      return body.getText(sourceFile);
    }
    return body.getText(sourceFile);
  }

  if (ts.isIdentifier(node)) {
    return node.getText(sourceFile);
  }

  if (ts.isPropertyAccessExpression(node)) {
    return node.getText(sourceFile);
  }

  // Prefix unary: -1, +2, etc.
  if (ts.isPrefixUnaryExpression(node)) {
    return node.getText(sourceFile);
  }

  return node.getText(sourceFile);
}

/**
 * Parse decorators from an AST node, returning [{name, args}]
 */
function parseDecorators(node, sourceFile) {
  const decorators = getDecorators(node);
  const results = [];

  for (const dec of decorators) {
    const expr = dec.expression;
    if (ts.isCallExpression(expr)) {
      const name = expr.expression.getText(sourceFile);
      const args = expr.arguments.map(a => extractValue(a, sourceFile));
      results.push({ name, args });
    } else if (ts.isIdentifier(expr)) {
      results.push({ name: expr.getText(sourceFile), args: [] });
    }
  }

  return results;
}

/**
 * Find a decorator by name, return its args or null
 */
function findDecorator(decorators, name) {
  return decorators.find(d => d.name === name) || null;
}

function findAllDecorators(decorators, name) {
  return decorators.filter(d => d.name === name);
}

// ─── Type Mapping ───────────────────────────────────────────

const TS_TYPE_MAP = {
  'string': { type: 'string' },
  'number': { type: 'number' },
  'boolean': { type: 'boolean' },
  'Date': { type: 'string', format: 'date-time' },
  'any': {},
  'object': { type: 'object' },
  'void': {},
  'undefined': {},
  'null': {},
  'never': {},
};

function tsTypeToSchema(typeNode, sourceFile) {
  if (!typeNode) return { type: 'object' };

  const typeText = typeNode.getText(sourceFile);

  // Literal types
  if (TS_TYPE_MAP[typeText]) return { ...TS_TYPE_MAP[typeText] };

  // Array types: string[], number[]
  if (ts.isArrayTypeNode(typeNode)) {
    return {
      type: 'array',
      items: tsTypeToSchema(typeNode.elementType, sourceFile),
    };
  }

  // Array<T>
  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText(sourceFile);

    if (typeName === 'Array' && typeNode.typeArguments?.[0]) {
      return {
        type: 'array',
        items: tsTypeToSchema(typeNode.typeArguments[0], sourceFile),
      };
    }

    // Promise<T>, Observable<T> → unwrap
    if ((typeName === 'Promise' || typeName === 'Observable') && typeNode.typeArguments?.[0]) {
      return tsTypeToSchema(typeNode.typeArguments[0], sourceFile);
    }

    if (TS_TYPE_MAP[typeName]) return { ...TS_TYPE_MAP[typeName] };

    // DTO reference
    return { '$ref': `#/components/schemas/${typeName}` };
  }

  // Union types: string | number
  if (ts.isUnionTypeNode(typeNode)) {
    // Filter out null/undefined from union
    const types = typeNode.types.filter(t =>
      t.kind !== ts.SyntaxKind.NullKeyword &&
      t.kind !== ts.SyntaxKind.UndefinedKeyword
    );
    if (types.length === 1) return tsTypeToSchema(types[0], sourceFile);
    // Check if all are literal string types (enum-like)
    const allStringLiterals = types.every(t => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal));
    if (allStringLiterals) {
      return {
        type: 'string',
        enum: types.map(t => t.literal.text),
      };
    }
    return tsTypeToSchema(types[0], sourceFile); // fallback: first type
  }

  // Literal type node: 'admin' | 'user'
  if (ts.isLiteralTypeNode(typeNode)) {
    if (ts.isStringLiteral(typeNode.literal)) return { type: 'string', enum: [typeNode.literal.text] };
    if (ts.isNumericLiteral(typeNode.literal)) return { type: 'number' };
    if (typeNode.literal.kind === ts.SyntaxKind.TrueKeyword || typeNode.literal.kind === ts.SyntaxKind.FalseKeyword) {
      return { type: 'boolean' };
    }
  }

  return { type: 'object' };
}

function typeNameToSchema(typeName) {
  if (!typeName) return { type: 'object' };
  const lower = typeName.toLowerCase();
  if (lower === 'string') return { type: 'string' };
  if (lower === 'number' || lower === 'int' || lower === 'integer' || lower === 'float') return { type: 'number' };
  if (lower === 'boolean' || lower === 'bool') return { type: 'boolean' };
  if (lower === 'date') return { type: 'string', format: 'date-time' };
  // DTO reference
  return { '$ref': `#/components/schemas/${typeName}` };
}

// ─── HTTP Method Status Codes ───────────────────────────────

const RESPONSE_DECORATOR_STATUS = {
  'ApiOkResponse': '200',
  'ApiCreatedResponse': '201',
  'ApiAcceptedResponse': '202',
  'ApiNoContentResponse': '204',
  'ApiMovedPermanentlyResponse': '301',
  'ApiFoundResponse': '302',
  'ApiBadRequestResponse': '400',
  'ApiUnauthorizedResponse': '401',
  'ApiForbiddenResponse': '403',
  'ApiNotFoundResponse': '404',
  'ApiMethodNotAllowedResponse': '405',
  'ApiNotAcceptableResponse': '406',
  'ApiRequestTimeoutResponse': '408',
  'ApiConflictResponse': '409',
  'ApiPreconditionFailedResponse': '412',
  'ApiPayloadTooLargeResponse': '413',
  'ApiUnprocessableEntityResponse': '422',
  'ApiTooManyRequestsResponse': '429',
  'ApiInternalServerErrorResponse': '500',
  'ApiServiceUnavailableResponse': '503',
  'ApiGatewayTimeoutResponse': '504',
  'ApiDefaultResponse': 'default',
};

const HTTP_METHOD_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All']);

function getDefaultSuccessCode(method) {
  switch (method.toLowerCase()) {
    case 'post': return '201';
    case 'delete': return '204';
    default: return '200';
  }
}

// ─── DTO Registry ───────────────────────────────────────────

/**
 * First pass: scan all files to build a registry of class names → file info
 */
function buildDtoRegistry(tsFiles) {
  const registry = new Map(); // className → { filePath, node, sourceFile, extendsClass }

  // If TypeScript compiler is not available, return empty registry (regex fallback)
  if (!ts) return registry;

  for (const filePath of tsFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    ts.forEachChild(sourceFile, function visit(node) {
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.getText(sourceFile);
        let extendsClass = null;

        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            if (clause.token === ts.SyntaxKind.ExtendsKeyword && clause.types.length > 0) {
              extendsClass = clause.types[0].expression.getText(sourceFile);
            }
          }
        }

        registry.set(className, { filePath, node, sourceFile, extendsClass });
      }

      // Also scan for enum declarations
      if (ts.isEnumDeclaration(node) && node.name) {
        const enumName = node.name.getText(sourceFile);
        const values = [];
        for (const member of node.members) {
          if (member.initializer) {
            values.push(extractValue(member.initializer, sourceFile));
          } else {
            values.push(member.name.getText(sourceFile));
          }
        }
        registry.set(enumName, { filePath, isEnum: true, values, sourceFile });
      }
    });
  }

  return registry;
}

/**
 * Extract schema from a class node using @ApiProperty decorators and TS type annotations
 */
function extractClassSchema(className, registry, schemasCache, visiting = new Set()) {
  // Prevent circular references
  if (visiting.has(className)) {
    return { '$ref': `#/components/schemas/${className}` };
  }

  if (schemasCache.has(className)) return schemasCache.get(className);

  const entry = registry.get(className);
  if (!entry) return null;

  // Handle enums
  if (entry.isEnum) {
    const schema = { type: 'string', enum: entry.values };
    schemasCache.set(className, schema);
    return schema;
  }

  visiting.add(className);

  const { node, sourceFile, extendsClass } = entry;
  const properties = {};
  const required = [];

  // If extends another class, merge parent properties first
  let parentSchema = null;
  if (extendsClass && registry.has(extendsClass)) {
    parentSchema = extractClassSchema(extendsClass, registry, schemasCache, new Set(visiting));
    if (parentSchema && parentSchema.properties) {
      Object.assign(properties, parentSchema.properties);
      if (parentSchema.required) required.push(...parentSchema.required);
    }
  }

  // Walk class members
  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member)) continue;

    const memberName = member.name?.getText(sourceFile);
    if (!memberName) continue;

    const decorators = parseDecorators(member, sourceFile);
    const apiProp = findDecorator(decorators, 'ApiProperty');
    const apiPropOptional = findDecorator(decorators, 'ApiPropertyOptional');
    const activeProp = apiProp || apiPropOptional;

    // Skip properties without @ApiProperty (unless we want to capture all)
    // For comprehensive extraction, we still capture typed properties
    const isOptional = !!apiPropOptional ||
      !!member.questionToken ||
      (activeProp?.args[0]?.required === false);

    const propSchema = {};

    // Get type from TS type annotation
    let tsSchema = {};
    if (member.type) {
      tsSchema = tsTypeToSchema(member.type, sourceFile);
    }

    if (activeProp && activeProp.args[0]) {
      const opts = activeProp.args[0];

      // type from decorator overrides TS type
      if (opts.type) {
        const typeVal = opts.type;
        if (typeof typeVal === 'string') {
          const refSchema = typeNameToSchema(typeVal);
          Object.assign(propSchema, refSchema);
        }
      }

      // isArray
      if (opts.isArray) {
        const innerSchema = Object.keys(propSchema).length > 0 ? { ...propSchema } : { ...tsSchema };
        Object.keys(propSchema).forEach(k => delete propSchema[k]);
        Object.keys(tsSchema).forEach(k => delete tsSchema[k]);
        propSchema.type = 'array';
        propSchema.items = innerSchema;
      }

      // enum
      if (opts.enum) {
        if (Array.isArray(opts.enum)) {
          propSchema.enum = opts.enum;
          if (!propSchema.type) propSchema.type = 'string';
        } else if (typeof opts.enum === 'string') {
          // Reference to an enum type
          const enumEntry = registry.get(opts.enum);
          if (enumEntry?.isEnum) {
            propSchema.enum = enumEntry.values;
            if (!propSchema.type) propSchema.type = 'string';
          }
        }
      }

      if (opts.description) propSchema.description = opts.description;
      if (opts.example !== undefined) propSchema.example = opts.example;
      if (opts.default !== undefined) propSchema.default = opts.default;
      if (opts.minimum !== undefined) propSchema.minimum = opts.minimum;
      if (opts.maximum !== undefined) propSchema.maximum = opts.maximum;
      if (opts.minLength !== undefined) propSchema.minLength = opts.minLength;
      if (opts.maxLength !== undefined) propSchema.maxLength = opts.maxLength;
      if (opts.format) propSchema.format = opts.format;
      if (opts.nullable) propSchema.nullable = true;
    }

    // Merge TS type info as fallback
    const finalSchema = { ...tsSchema, ...propSchema };

    // If we have a $ref to another DTO, try to resolve it
    if (finalSchema.$ref) {
      const refName = finalSchema.$ref.replace('#/components/schemas/', '');
      if (registry.has(refName) && !schemasCache.has(refName)) {
        extractClassSchema(refName, registry, schemasCache, new Set(visiting));
      }
    }

    // If items has a $ref, resolve that too
    if (finalSchema.items?.$ref) {
      const refName = finalSchema.items.$ref.replace('#/components/schemas/', '');
      if (registry.has(refName) && !schemasCache.has(refName)) {
        extractClassSchema(refName, registry, schemasCache, new Set(visiting));
      }
    }

    properties[memberName] = finalSchema;

    if (!isOptional && activeProp) {
      required.push(memberName);
    }
  }

  visiting.delete(className);

  const schema = { type: 'object', properties };
  if (required.length > 0) schema.required = [...new Set(required)];

  schemasCache.set(className, schema);
  return schema;
}

// ─── Controller Parsing ─────────────────────────────────────

function parseControllerFile(filePath, content, registry, schemasCache) {
  if (!ts) return []; // TypeScript compiler not available
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const controllers = [];

  ts.forEachChild(sourceFile, function visit(node) {
    if (ts.isClassDeclaration(node)) {
      const classDecorators = parseDecorators(node, sourceFile);
      const controllerDec = findDecorator(classDecorators, 'Controller');
      if (!controllerDec) return;

      const basePath = typeof controllerDec.args[0] === 'string'
        ? '/' + controllerDec.args[0].replace(/^\//, '')
        : (typeof controllerDec.args[0] === 'object' && controllerDec.args[0]?.path
          ? '/' + controllerDec.args[0].path.replace(/^\//, '')
          : '/');

      // Class-level decorators
      const classTagsDecs = findAllDecorators(classDecorators, 'ApiTags');
      const classTags = classTagsDecs.flatMap(d => d.args.filter(a => typeof a === 'string'));

      const bearerAuthDec = findDecorator(classDecorators, 'ApiBearerAuth');
      const classSecurity = bearerAuthDec
        ? [{ [typeof bearerAuthDec.args[0] === 'string' ? bearerAuthDec.args[0] : 'bearer']: [] }]
        : null;

      // Parse methods
      const operations = [];

      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;

        const methodDecorators = parseDecorators(member, sourceFile);

        // Check for ApiExcludeEndpoint
        if (findDecorator(methodDecorators, 'ApiExcludeEndpoint')) continue;

        // Find HTTP method decorator
        let httpMethod = null;
        let routePath = '';

        for (const dec of methodDecorators) {
          if (HTTP_METHOD_DECORATORS.has(dec.name)) {
            httpMethod = dec.name.toLowerCase();
            routePath = typeof dec.args[0] === 'string' ? dec.args[0] : '';
            break;
          }
        }

        if (!httpMethod) continue;

        // Build full path
        let fullPath = normalizePath(basePath + '/' + routePath);
        // Convert :param to {param}
        fullPath = fullPath.replace(/:(\w+)/g, '{$1}');

        // ApiOperation
        const apiOpDec = findDecorator(methodDecorators, 'ApiOperation');
        const apiOpOpts = apiOpDec?.args[0] || {};

        // ApiTags (method-level override or append)
        const methodTagsDecs = findAllDecorators(methodDecorators, 'ApiTags');
        const methodTags = methodTagsDecs.flatMap(d => d.args.filter(a => typeof a === 'string'));
        const tags = methodTags.length > 0 ? methodTags : (classTags.length > 0 ? classTags : [basePath.replace(/^\//, '') || 'default']);

        // ApiBearerAuth on method
        const methodBearerDec = findDecorator(methodDecorators, 'ApiBearerAuth');
        const security = methodBearerDec
          ? [{ [typeof methodBearerDec.args[0] === 'string' ? methodBearerDec.args[0] : 'bearer']: [] }]
          : classSecurity;

        // ApiResponse decorators
        const responses = {};
        let hasSuccessResponse = false;

        for (const dec of methodDecorators) {
          const statusCode = RESPONSE_DECORATOR_STATUS[dec.name];
          if (!statusCode) continue;

          const opts = dec.args[0] || {};
          const resp = {};

          if (typeof opts === 'object') {
            if (opts.description) resp.description = opts.description;

            // Extract type reference
            let typeRef = null;
            if (typeof opts.type === 'string') {
              typeRef = opts.type;
            }

            if (typeRef) {
              // Resolve schema
              if (registry.has(typeRef)) {
                extractClassSchema(typeRef, registry, schemasCache);
              }
              let schema = typeRef.toLowerCase() === 'number' ? { type: 'number' }
                : typeRef.toLowerCase() === 'string' ? { type: 'string' }
                : typeRef.toLowerCase() === 'boolean' ? { type: 'boolean' }
                : { '$ref': `#/components/schemas/${typeRef}` };

              if (opts.isArray) {
                schema = { type: 'array', items: schema };
              }

              resp.content = {
                'application/json': { schema },
              };
            }
          } else if (typeof opts === 'string') {
            resp.description = opts;
          }

          if (!resp.description) {
            resp.description = statusCode >= '400' ? 'Error' : 'Success';
          }

          responses[statusCode] = resp;
          if (parseInt(statusCode) >= 200 && parseInt(statusCode) < 300) {
            hasSuccessResponse = true;
          }
        }

        // HttpCode decorator for custom status
        const httpCodeDec = findDecorator(methodDecorators, 'HttpCode');
        let customStatusCode = null;
        if (httpCodeDec && typeof httpCodeDec.args[0] === 'number') {
          customStatusCode = String(httpCodeDec.args[0]);
        }

        // If no success response decorator, add default
        if (!hasSuccessResponse) {
          const defaultCode = customStatusCode || getDefaultSuccessCode(httpMethod);
          if (!responses[defaultCode]) {
            responses[defaultCode] = { description: 'Success' };
          }

          // Try to infer response type from method return type
          if (member.type) {
            const returnSchema = tsTypeToSchema(member.type, sourceFile);
            if (returnSchema.$ref || returnSchema.type === 'array') {
              // Resolve nested DTO
              const refName = returnSchema.$ref?.replace('#/components/schemas/', '') ||
                returnSchema.items?.$ref?.replace('#/components/schemas/', '');
              if (refName && registry.has(refName)) {
                extractClassSchema(refName, registry, schemasCache);
              }
              responses[defaultCode].content = {
                'application/json': { schema: returnSchema },
              };
            }
          }
        }

        // ApiParam decorators
        const parameters = [];

        for (const dec of findAllDecorators(methodDecorators, 'ApiParam')) {
          const opts = dec.args[0] || {};
          if (typeof opts === 'object' && opts.name) {
            const param = {
              name: opts.name,
              in: 'path',
              required: opts.required !== false,
              schema: opts.type ? typeNameToSchema(opts.type) : { type: 'string' },
            };
            if (opts.description) param.description = opts.description;
            if (opts.enum) param.schema.enum = opts.enum;
            if (opts.example !== undefined) param.schema.example = opts.example;
            parameters.push(param);
          }
        }

        // ApiQuery decorators
        for (const dec of findAllDecorators(methodDecorators, 'ApiQuery')) {
          const opts = dec.args[0] || {};
          if (typeof opts === 'object' && opts.name) {
            const param = {
              name: opts.name,
              in: 'query',
              required: opts.required !== false,
              schema: opts.type ? typeNameToSchema(opts.type) : { type: 'string' },
            };
            if (opts.description) param.description = opts.description;
            if (opts.enum) {
              if (Array.isArray(opts.enum)) param.schema.enum = opts.enum;
            }
            if (opts.example !== undefined) param.example = opts.example;
            parameters.push(param);
          }
        }

        // Extract path params from route pattern that aren't already declared
        const pathParamNames = new Set(parameters.filter(p => p.in === 'path').map(p => p.name));
        const pathParamMatches = fullPath.matchAll(/\{(\w+)\}/g);
        for (const m of pathParamMatches) {
          if (!pathParamNames.has(m[1])) {
            // Try to infer type from method parameters
            let paramType = { type: 'string' };
            if (member.parameters) {
              for (const p of member.parameters) {
                const pDecorators = parseDecorators(p, sourceFile);
                const paramDec = findDecorator(pDecorators, 'Param');
                if (paramDec && paramDec.args[0] === m[1] && p.type) {
                  paramType = tsTypeToSchema(p.type, sourceFile);
                  break;
                }
              }
            }
            parameters.push({
              name: m[1],
              in: 'path',
              required: true,
              schema: paramType,
            });
          }
        }

        // Extract query params from method parameters (not already declared via @ApiQuery)
        const queryParamNames = new Set(parameters.filter(p => p.in === 'query').map(p => p.name));
        if (member.parameters) {
          for (const p of member.parameters) {
            const pDecorators = parseDecorators(p, sourceFile);
            const queryDec = findDecorator(pDecorators, 'Query');
            if (queryDec) {
              const queryName = typeof queryDec.args[0] === 'string' ? queryDec.args[0] : null;
              if (queryName && !queryParamNames.has(queryName)) {
                let paramType = { type: 'string' };
                if (p.type) paramType = tsTypeToSchema(p.type, sourceFile);
                parameters.push({
                  name: queryName,
                  in: 'query',
                  required: !p.questionToken,
                  schema: paramType,
                });
              }
              // If @Query() without name, it's a DTO query — try to expand
              if (!queryName && p.type) {
                const typeName = p.type.getText(sourceFile);
                if (registry.has(typeName)) {
                  extractClassSchema(typeName, registry, schemasCache);
                  const dtoSchema = schemasCache.get(typeName);
                  if (dtoSchema?.properties) {
                    for (const [propName, propSchema] of Object.entries(dtoSchema.properties)) {
                      if (!queryParamNames.has(propName)) {
                        const qp = {
                          name: propName,
                          in: 'query',
                          required: dtoSchema.required?.includes(propName) || false,
                          schema: { ...propSchema },
                        };
                        // Remove description from schema, put on param
                        if (qp.schema.description) {
                          qp.description = qp.schema.description;
                          delete qp.schema.description;
                        }
                        parameters.push(qp);
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // ApiBody
        const apiBodyDec = findDecorator(methodDecorators, 'ApiBody');
        let requestBody = null;

        if (apiBodyDec) {
          const opts = apiBodyDec.args[0] || {};
          let bodySchema = { type: 'object' };

          if (typeof opts === 'object' && opts.type) {
            const typeRef = typeof opts.type === 'string' ? opts.type : null;
            if (typeRef) {
              if (registry.has(typeRef)) extractClassSchema(typeRef, registry, schemasCache);
              bodySchema = typeNameToSchema(typeRef);
            }
            if (opts.isArray) {
              bodySchema = { type: 'array', items: bodySchema };
            }
          }

          requestBody = {
            required: true,
            content: { 'application/json': { schema: bodySchema } },
          };
          if (typeof opts === 'object' && opts.description) {
            requestBody.description = opts.description;
          }
        }

        // Infer request body from @Body() parameter if no @ApiBody
        if (!requestBody && ['post', 'put', 'patch'].includes(httpMethod)) {
          if (member.parameters) {
            for (const p of member.parameters) {
              const pDecorators = parseDecorators(p, sourceFile);
              const bodyDec = findDecorator(pDecorators, 'Body');
              if (bodyDec && typeof bodyDec.args[0] !== 'string' && p.type) {
                const typeName = p.type.getText(sourceFile);
                // Check if it's an array type like SomeDto[]
                let bodySchema;
                if (typeName.endsWith('[]')) {
                  const innerType = typeName.slice(0, -2);
                  if (registry.has(innerType)) extractClassSchema(innerType, registry, schemasCache);
                  bodySchema = {
                    type: 'array',
                    items: typeNameToSchema(innerType),
                  };
                } else {
                  if (registry.has(typeName)) extractClassSchema(typeName, registry, schemasCache);
                  bodySchema = typeNameToSchema(typeName);
                }
                requestBody = {
                  required: !p.questionToken,
                  content: { 'application/json': { schema: bodySchema } },
                };
                break;
              }
            }
          }

          // Fallback: generic body
          if (!requestBody) {
            requestBody = {
              required: true,
              content: { 'application/json': { schema: { type: 'object' } } },
            };
          }
        }

        // Build operation
        const operation = {
          tags,
          responses,
        };

        if (apiOpOpts.summary) operation.summary = apiOpOpts.summary;
        else operation.summary = `${httpMethod.toUpperCase()} ${fullPath}`;

        if (apiOpOpts.description) operation.description = apiOpOpts.description;
        if (apiOpOpts.operationId) operation.operationId = apiOpOpts.operationId;
        if (apiOpOpts.deprecated) operation.deprecated = true;

        if (parameters.length > 0) operation.parameters = parameters;
        if (requestBody) operation.requestBody = requestBody;
        if (security) operation.security = security;

        operations.push({ fullPath, httpMethod, operation });
      }

      controllers.push({ basePath, operations });
    }
  });

  return controllers;
}

// ─── File Discovery ─────────────────────────────────────────

function findTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === 'test' || entry === 'tests') continue;
      files.push(...findTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

function normalizePath(p) {
  return ('/' + p).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

// ─── Spec Builder ───────────────────────────────────────────

function buildSpec(sourceDir, tsFiles, options = {}) {
  const { title = 'API', version = '1.0.0', description, servers } = options;

  // Ensure TypeScript is loaded
  if (!ts) loadTypeScript(sourceDir);

  // Build DTO registry
  const registry = buildDtoRegistry(tsFiles);
  const schemasCache = new Map();

  const spec = {
    openapi: '3.0.0',
    info: {
      title,
      version,
    },
    paths: {},
  };

  if (description) spec.info.description = description;
  if (servers && servers.length > 0) {
    spec.servers = servers.map(url => ({ url }));
  }

  // Track security schemes used
  const securitySchemes = {};

  // Parse all controller files
  for (const filePath of tsFiles) {
    const content = readFileSync(filePath, 'utf-8');
    // Quick check: skip files that don't contain @Controller
    if (!content.includes('@Controller')) continue;

    const controllers = parseControllerFile(filePath, content, registry, schemasCache);

    for (const controller of controllers) {
      for (const { fullPath, httpMethod, operation } of controller.operations) {
        if (!spec.paths[fullPath]) spec.paths[fullPath] = {};
        spec.paths[fullPath][httpMethod] = operation;

        // Track security schemes
        if (operation.security) {
          for (const sec of operation.security) {
            for (const name of Object.keys(sec)) {
              if (!securitySchemes[name]) {
                securitySchemes[name] = {
                  type: 'http',
                  scheme: 'bearer',
                  bearerFormat: 'JWT',
                };
              }
            }
          }
        }
      }
    }
  }

  // Build components
  const components = {};

  // Add schemas from cache
  if (schemasCache.size > 0) {
    components.schemas = {};
    for (const [name, schema] of schemasCache) {
      // Only include schemas that are actually referenced or are DTOs
      components.schemas[name] = schema;
    }
  }

  // Add security schemes
  if (Object.keys(securitySchemes).length > 0) {
    components.securitySchemes = securitySchemes;
  }

  if (Object.keys(components).length > 0) {
    spec.components = components;
  }

  // Sort paths for consistent output
  const sortedPaths = {};
  for (const key of Object.keys(spec.paths).sort()) {
    sortedPaths[key] = spec.paths[key];
  }
  spec.paths = sortedPaths;

  return spec;
}

// ─── CLI Command ────────────────────────────────────────────

// ─── Rust Binary Fast Path ───────────────────────────────────

function findRustBinary() {
  const __filename = fileURLToPath(import.meta.url);
  const cliDir = dirname(dirname(dirname(__filename)));
  const packagesDir = dirname(cliDir);

  // Check sibling spec-generator package
  const candidates = [
    join(packagesDir, 'spec-generator', 'target', 'release', 'apiforge-spec-generator.exe'),
    join(packagesDir, 'spec-generator', 'target', 'release', 'apiforge-spec-generator'),
    join(packagesDir, '..', 'target', 'release', 'apiforge-spec-generator.exe'),
    join(packagesDir, '..', 'target', 'release', 'apiforge-spec-generator'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function tryRustBinary(values) {
  const rustBinary = findRustBinary();
  if (!rustBinary) return false;

  const rustArgs = ['--src', resolve(values.src), '--output', resolve(values.output)];
  if (values.title) rustArgs.push('--title', values.title);
  if (values.version) rustArgs.push('--version', values.version);
  if (values.description) rustArgs.push('--description', values.description);
  if (values.server) {
    for (const s of Array.isArray(values.server) ? values.server : [values.server]) {
      rustArgs.push('--server', s);
    }
  }
  if (values.verbose) rustArgs.push('--verbose');

  try {
    console.log(`Using Rust spec-generator: ${rustBinary}`);
    execFileSync(rustBinary, rustArgs, { stdio: 'inherit' });
    return true;
  } catch (e) {
    console.warn(`Rust binary failed (${e.message}), falling back to JS implementation`);
    return false;
  }
}

export async function generateSpecCommand(args, dataDir) {
  const { values } = parseArgs({
    args,
    options: {
      src: { type: 'string' },
      output: { type: 'string', short: 'o', default: 'openapi.json' },
      title: { type: 'string', short: 't', default: 'API' },
      version: { type: 'string', default: '1.0.0' },
      description: { type: 'string', short: 'd' },
      server: { type: 'string', multiple: true },
      verbose: { type: 'boolean', short: 'v', default: false },
      'js-only': { type: 'boolean', default: false },
    },
  });

  if (!values.src) {
    console.error('Error: --src <dir> is required (NestJS source directory)');
    console.error('Usage: apiforge generate-spec --src ./src --output openapi.json');
    process.exit(1);
  }

  const sourceDir = resolve(values.src);
  const outputFile = resolve(values.output);

  if (!existsSync(sourceDir)) {
    console.error(`Error: Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  // Try Rust binary first (fast path) unless --js-only is specified
  if (!values['js-only'] && tryRustBinary(values)) {
    // Read and return the generated spec
    try {
      return JSON.parse(readFileSync(outputFile, 'utf-8'));
    } catch {
      return {};
    }
  }

  // Fall back to JS implementation
  // Load TypeScript
  if (!loadTypeScript(sourceDir)) {
    console.error('Error: TypeScript compiler not found.');
    console.error('Install it in your project: npm install typescript');
    process.exit(1);
  }

  console.log(`TypeScript ${ts.version} loaded`);
  console.log(`Scanning: ${sourceDir}`);

  // Find all TypeScript files
  const tsFiles = findTsFiles(sourceDir);
  console.log(`Found ${tsFiles.length} TypeScript files`);

  // Build the spec
  const spec = buildSpec(sourceDir, tsFiles, {
    title: values.title,
    version: values.version,
    description: values.description,
    servers: values.server,
  });

  // Stats
  const pathCount = Object.keys(spec.paths).length;
  const opCount = Object.values(spec.paths).reduce((sum, p) => sum + Object.keys(p).length, 0);
  const schemaCount = spec.components?.schemas ? Object.keys(spec.components.schemas).length : 0;

  console.log(`\nGenerated OpenAPI 3.0 spec:`);
  console.log(`  Paths:      ${pathCount}`);
  console.log(`  Operations: ${opCount}`);
  console.log(`  Schemas:    ${schemaCount}`);

  if (values.verbose) {
    console.log('\nPaths:');
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const summary = op.summary || '';
        console.log(`  ${method.toUpperCase().padEnd(7)} ${path}  ${summary}`);
      }
    }
    if (spec.components?.schemas) {
      console.log('\nSchemas:');
      for (const name of Object.keys(spec.components.schemas).sort()) {
        const s = spec.components.schemas[name];
        const propCount = s.properties ? Object.keys(s.properties).length : 0;
        console.log(`  ${name} (${propCount} properties)`);
      }
    }
  }

  // Write output (ensure directory exists)
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, JSON.stringify(spec, null, 2) + '\n');
  console.log(`\nSpec written to: ${outputFile}`);

  return spec;
}

// Export internals for testing
export { buildSpec, buildDtoRegistry, extractClassSchema, parseControllerFile, findTsFiles, loadTypeScript };
