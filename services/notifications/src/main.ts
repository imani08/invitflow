import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { NotificationsModule } from './notifications.module.js';
import { validatedPort } from './env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(NotificationsModule, new FastifyAdapter({ logger: true }));
  app.enableShutdownHooks();
  await app.listen(validatedPort(), '0.0.0.0');
}
void bootstrap();
