import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DesignsModule } from './designs.module.js';
import { validatedPort } from './env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(DesignsModule, new FastifyAdapter({ logger: true, bodyLimit: 1_100_000 }));
  app.enableShutdownHooks();
  await app.listen(validatedPort(), '0.0.0.0');
}
void bootstrap();
