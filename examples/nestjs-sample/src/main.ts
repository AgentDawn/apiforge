import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // Swagger setup (classic @nestjs/swagger way)
  const config = new DocumentBuilder()
    .setTitle('Petstore API')
    .setDescription('A sample pet store API for APIForge testing')
    .setVersion('1.0.0')
    .addServer('http://localhost:3000', 'Local')
    .addServer('https://api.petstore.example.com', 'Production')
    .addBearerAuth({ scheme: 'bearer', bearerFormat: 'JWT', type: 'http' }, 'JWT')
    .addTag('pets', 'Pet management')
    .addTag('users', 'User management')
    .addTag('Internal', 'Internal endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  // gRPC microservice
  app.connectMicroservice({
    transport: Transport.GRPC,
    options: {
      package: 'petstore.v1',
      protoPath: join(__dirname, '..', 'proto', 'petstore.proto'),
      url: '0.0.0.0:50051',
    },
  });

  await app.startAllMicroservices();
  await app.listen(3002);
  console.log('HTTP server running at http://localhost:3002');
  console.log('Swagger UI at http://localhost:3002/api-docs');
  console.log('gRPC server running at 0.0.0.0:50051');
}
bootstrap();
