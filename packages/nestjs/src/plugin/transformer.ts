import * as ts from 'typescript';

const APIFORGE_MODULE = '@apiforge/nestjs';

// Decorators we auto-inject
const PROPERTY_DECORATORS = ['ApiProperty', 'ApiPropertyOptional'];
const RESPONSE_DECORATORS = ['ApiOkResponse', 'ApiCreatedResponse', 'ApiResponse'];

interface PluginOptions {
  dtoFileNameSuffix?: string[];
  controllerFileNameSuffix?: string[];
  classValidatorShim?: boolean;
}

const DEFAULT_OPTIONS: PluginOptions = {
  dtoFileNameSuffix: ['.dto.ts', '.entity.ts', '.model.ts'],
  controllerFileNameSuffix: ['.controller.ts'],
};

/**
 * TypeScript AST transformer for @apiforge/nestjs.
 * Auto-injects @ApiProperty on DTO properties and @ApiOkResponse on controller methods.
 *
 * Usage with NestJS CLI:
 *   // nest-cli.json
 *   { "compilerOptions": { "plugins": ["@apiforge/nestjs/plugin"] } }
 *
 * Usage programmatic:
 *   const result = ts.emit(program, undefined, undefined, false, {
 *     before: [apiforgeTransformer(program)]
 *   });
 */
export function apiforgeTransformer(program: ts.Program, opts?: PluginOptions) {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const typeChecker = program.getTypeChecker();

  return (ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> => {
    return (sf: ts.SourceFile) => {
      const fileName = sf.fileName;

      const isDtoFile = options.dtoFileNameSuffix!.some(s => fileName.endsWith(s));
      const isControllerFile = options.controllerFileNameSuffix!.some(s => fileName.endsWith(s));

      if (!isDtoFile && !isControllerFile) return sf;

      let importsToAdd: Set<string> = new Set();

      const visitor = (node: ts.Node): ts.Node => {
        if (ts.isClassDeclaration(node)) {
          if (isDtoFile) {
            return transformDtoClass(node, typeChecker, ctx, importsToAdd);
          }
          if (isControllerFile && hasDecoratorNamed(node, 'Controller')) {
            return transformControllerClass(node, typeChecker, ctx, importsToAdd);
          }
        }
        return ts.visitEachChild(node, visitor, ctx);
      };

      let result = ts.visitNode(sf, visitor) as ts.SourceFile;

      // Add missing imports
      if (importsToAdd.size > 0) {
        result = addImports(result, importsToAdd);
      }

      return result;
    };
  };
}

// ============================================================
// DTO Class Transformer
// ============================================================

function transformDtoClass(
  node: ts.ClassDeclaration,
  typeChecker: ts.TypeChecker,
  ctx: ts.TransformationContext,
  importsToAdd: Set<string>,
): ts.ClassDeclaration {
  const newMembers = node.members.map(member => {
    if (!ts.isPropertyDeclaration(member)) return member;

    // Skip if already has @ApiProperty or @ApiPropertyOptional
    if (hasDecoratorNamed(member, ...PROPERTY_DECORATORS)) return member;

    const isOptional = !!member.questionToken;
    const decoratorName = isOptional ? 'ApiPropertyOptional' : 'ApiProperty';
    importsToAdd.add(decoratorName);

    const decoratorArgs = buildPropertyDecoratorArgs(member, typeChecker, importsToAdd);
    const decorator = createDecoratorCall(decoratorName, decoratorArgs);

    return ts.factory.updatePropertyDeclaration(
      member,
      [decorator, ...(member.modifiers || [])],
      member.name,
      member.questionToken,
      member.type,
      member.initializer,
    );
  });

  return ts.factory.updateClassDeclaration(
    node,
    node.modifiers,
    node.name,
    node.typeParameters,
    node.heritageClauses,
    newMembers,
  );
}

function buildPropertyDecoratorArgs(
  prop: ts.PropertyDeclaration,
  typeChecker: ts.TypeChecker,
  importsToAdd: Set<string>,
): ts.ObjectLiteralExpression | undefined {
  const properties: ts.PropertyAssignment[] = [];
  const type = prop.type ? typeChecker.getTypeFromTypeNode(prop.type) : undefined;

  if (prop.type) {
    const typeExpr = typeToExpression(prop.type, typeChecker, importsToAdd);
    if (typeExpr) {
      properties.push(ts.factory.createPropertyAssignment('type', typeExpr));
    }
  }

  // Extract property name as description hint
  const name = (prop.name as ts.Identifier).text;
  if (name) {
    properties.push(ts.factory.createPropertyAssignment(
      'description', ts.factory.createStringLiteral(name),
    ));
  }

  if (properties.length === 0) return undefined;
  return ts.factory.createObjectLiteralExpression(properties, false);
}

/**
 * Convert a TypeScript type node to a runtime expression for the `type` field.
 * e.g., `string` -> `String`, `number` -> `Number`, `Foo[]` -> `[Foo]`
 */
function typeToExpression(
  typeNode: ts.TypeNode,
  typeChecker: ts.TypeChecker,
  importsToAdd: Set<string>,
): ts.Expression | undefined {
  // string -> String
  if (ts.isTypeReferenceNode(typeNode) && !typeNode.typeArguments) {
    const typeName = typeNode.typeName.getText();
    return ts.factory.createIdentifier(typeName);
  }

  // Keyword types: string, number, boolean
  if (typeNode.kind === ts.SyntaxKind.StringKeyword) {
    return ts.factory.createIdentifier('String');
  }
  if (typeNode.kind === ts.SyntaxKind.NumberKeyword) {
    return ts.factory.createIdentifier('Number');
  }
  if (typeNode.kind === ts.SyntaxKind.BooleanKeyword) {
    return ts.factory.createIdentifier('Boolean');
  }

  // Array type: Foo[] -> [Foo]
  if (ts.isArrayTypeNode(typeNode)) {
    const elementExpr = typeToExpression(typeNode.elementType, typeChecker, importsToAdd);
    if (elementExpr) {
      return ts.factory.createArrayLiteralExpression([elementExpr]);
    }
  }

  return undefined;
}

// ============================================================
// Controller Class Transformer
// ============================================================

function transformControllerClass(
  node: ts.ClassDeclaration,
  typeChecker: ts.TypeChecker,
  ctx: ts.TransformationContext,
  importsToAdd: Set<string>,
): ts.ClassDeclaration {
  const newMembers = node.members.map(member => {
    if (!ts.isMethodDeclaration(member)) return member;

    // Skip if already has response decorator
    if (hasDecoratorNamed(member, ...RESPONSE_DECORATORS)) return member;

    // Get return type
    const returnTypeNode = member.type;
    if (!returnTypeNode) return member;

    // Unwrap Promise<T> to get T
    const innerTypeNode = unwrapPromiseType(returnTypeNode);
    if (!innerTypeNode) return member;

    // Only add response decorator if the inner type is a class reference (DTO)
    if (!ts.isTypeReferenceNode(innerTypeNode)) return member;

    const typeName = innerTypeNode.typeName.getText();

    // Determine decorator: @Post -> ApiCreatedResponse(201), others -> ApiOkResponse(200)
    const isPost = hasDecoratorNamed(member, 'Post');
    const decoratorName = isPost ? 'ApiCreatedResponse' : 'ApiOkResponse';
    importsToAdd.add(decoratorName);

    const decorator = createDecoratorCall(decoratorName, ts.factory.createObjectLiteralExpression([
      ts.factory.createPropertyAssignment('type', ts.factory.createIdentifier(typeName)),
    ], false));

    return ts.factory.updateMethodDeclaration(
      member,
      [decorator, ...(member.modifiers || [])],
      member.asteriskToken,
      member.name,
      member.questionToken,
      member.typeParameters,
      member.parameters,
      member.type,
      member.body,
    );
  });

  return ts.factory.updateClassDeclaration(
    node,
    node.modifiers,
    node.name,
    node.typeParameters,
    node.heritageClauses,
    newMembers,
  );
}

/**
 * Unwrap Promise<T> type node to get T.
 * If not a Promise, returns the node itself.
 */
function unwrapPromiseType(typeNode: ts.TypeNode): ts.TypeNode | undefined {
  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText();
    if (typeName === 'Promise' && typeNode.typeArguments && typeNode.typeArguments.length === 1) {
      return typeNode.typeArguments[0];
    }
    // Not a Promise, return as-is (could be a direct DTO reference)
    return typeNode;
  }
  return undefined;
}

// ============================================================
// Utility Functions
// ============================================================

function hasDecoratorNamed(node: ts.Node, ...names: string[]): boolean {
  const decorators = getDecorators(node);
  if (!decorators) return false;
  return decorators.some(d => {
    const expr = d.expression;
    if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
      return names.includes(expr.expression.text);
    }
    if (ts.isIdentifier(expr)) {
      return names.includes(expr.text);
    }
    return false;
  });
}

function getDecorators(node: ts.Node): readonly ts.Decorator[] | undefined {
  // TS 4.8+ compatible
  if (ts.canHaveDecorators && ts.canHaveDecorators(node) && ts.getDecorators) {
    return ts.getDecorators(node as ts.HasDecorators);
  }
  // Fallback for older TS
  return (node as any).decorators;
}

function createDecoratorCall(name: string, arg?: ts.Expression): ts.Decorator {
  const callArgs = arg ? [arg] : [];
  return ts.factory.createDecorator(
    ts.factory.createCallExpression(
      ts.factory.createIdentifier(name),
      undefined,
      callArgs,
    ),
  );
}

/**
 * Add import { X, Y } from '@apiforge/nestjs' to the source file,
 * merging with existing imports if present.
 */
function addImports(sf: ts.SourceFile, names: Set<string>): ts.SourceFile {
  // Check if there is already an @apiforge/nestjs import
  let existingImportIndex = -1;
  for (let i = 0; i < sf.statements.length; i++) {
    const stmt = sf.statements[i];
    if (ts.isImportDeclaration(stmt) && stmt.moduleSpecifier) {
      const mod = (stmt.moduleSpecifier as ts.StringLiteral).text;
      if (mod === APIFORGE_MODULE) {
        existingImportIndex = i;
        // Collect already imported names
        if (stmt.importClause && stmt.importClause.namedBindings &&
            ts.isNamedImports(stmt.importClause.namedBindings)) {
          for (const el of stmt.importClause.namedBindings.elements) {
            names.delete(el.name.text); // Already imported
          }
        }
        break;
      }
    }
  }

  if (names.size === 0) return sf; // Nothing new to import

  if (existingImportIndex >= 0) {
    // Merge into existing import
    const existingImport = sf.statements[existingImportIndex] as ts.ImportDeclaration;
    const existingNames = existingImport.importClause?.namedBindings &&
      ts.isNamedImports(existingImport.importClause.namedBindings)
        ? existingImport.importClause.namedBindings.elements.map(e => e.name.text)
        : [];
    const allNames = [...existingNames, ...names];
    const newImport = createNamedImport(allNames, APIFORGE_MODULE);
    const newStatements = [...sf.statements];
    newStatements[existingImportIndex] = newImport;
    return ts.factory.updateSourceFile(sf, newStatements);
  }

  // Add new import at top (after existing imports)
  const newImport = createNamedImport([...names], APIFORGE_MODULE);
  let insertIndex = 0;
  for (let i = 0; i < sf.statements.length; i++) {
    if (ts.isImportDeclaration(sf.statements[i])) insertIndex = i + 1;
    else break;
  }
  const newStatements = [...sf.statements];
  newStatements.splice(insertIndex, 0, newImport);
  return ts.factory.updateSourceFile(sf, newStatements);
}

function createNamedImport(names: string[], module: string): ts.ImportDeclaration {
  const sortedNames = [...new Set(names)].sort();
  return ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamedImports(
        sortedNames.map(n =>
          ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(n))
        ),
      ),
    ),
    ts.factory.createStringLiteral(module),
  );
}
