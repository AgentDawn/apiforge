/**
 * Classic @nestjs/swagger JSON generation script
 * This is the existing approach (existing NestJS projects use this pattern)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('Petstore API')
    .setDescription('A sample pet store API for APIForge testing')
    .setVersion('1.0.0')
    .addServer('http://localhost:3000', 'Local')
    .addServer('https://api.petstore.example.com', 'Production')
    .addBearerAuth({ scheme: 'bearer', bearerFormat: 'JWT', type: 'http' }, 'JWT')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outDir = join(__dirname, '..', 'swagger-docs');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'openapi.json'), JSON.stringify(document, null, 2));

  console.log('Generated swagger-docs/openapi.json');
  console.log(`  Paths: ${Object.keys(document.paths || {}).length}`);
  console.log(`  Schemas: ${Object.keys(document.components?.schemas || {}).length}`);

  await app.close();
}

generate().catch(console.error);
