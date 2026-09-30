import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AiDesignModule } from './ai-design.module.js';
import { validatedPort } from './env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AiDesignModule, new FastifyAdapter({ logger: true, bodyLimit: 96 * 1024 }));
  app.enableShutdownHooks();
  await app.listen(validatedPort(), '0.0.0.0');
}
void bootstrap();
