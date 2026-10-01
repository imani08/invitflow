import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { MediaModule } from './media.module.js';
import { validatedPort } from './env.js';

async function bootstrap() {
  const adapter = new FastifyAdapter({ logger: true, bodyLimit: 16 * 1024 });
  const app = await NestFactory.create<NestFastifyApplication>(MediaModule, adapter);
  app.enableShutdownHooks();
  await app.listen(validatedPort(), '0.0.0.0');
}
void bootstrap();
