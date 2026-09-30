import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { BillingModule } from './billing.module.js';
import { validatedPort } from './env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(BillingModule, new FastifyAdapter({ logger: true, bodyLimit: 128 * 1024 }));
  app.enableShutdownHooks();
  await app.listen(validatedPort(), '0.0.0.0');
}
void bootstrap();
