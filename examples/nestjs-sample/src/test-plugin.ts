/**
 * Test script: demonstrates the @apiforge/nestjs plugin
 * Compiles clean DTO/Controller files and shows the auto-injected decorators
 */
import * as ts from 'typescript';
import * as path from 'path';
import { apiforgeTransformer } from '@apiforge/nestjs/plugin';

const rootDir = path.join(__dirname, 'plugin-demo');
const files = [
  path.join(rootDir, 'pet.dto.ts'),
  path.join(rootDir, 'pet.controller.ts'),
];

// Create a TypeScript program
const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  strict: false,
  noEmit: true,
};

const program = ts.createProgram(files, compilerOptions);

console.log('=== @apiforge/nestjs Plugin Demo ===\n');
console.log('The plugin reads TypeScript types at COMPILE TIME');
console.log('and auto-injects @ApiProperty / @ApiOkResponse decorators.\n');

// Apply transformer and print results
const transformer = apiforgeTransformer(program);
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

for (const filePath of files) {
  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) continue;

  console.log(`--- ${path.basename(filePath)} (BEFORE) ---`);
  console.log(sourceFile.getText().substring(0, 200) + '...\n');

  // Apply transformation
  const result = ts.transform(sourceFile, [transformer]);
  const transformed = result.transformed[0];

  console.log(`--- ${path.basename(filePath)} (AFTER plugin) ---`);
  const output = printer.printFile(transformed as ts.SourceFile);
  console.log(output);
  console.log('');

  result.dispose();
}
