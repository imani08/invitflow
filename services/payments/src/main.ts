import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyRequest } from 'fastify';
import { PaymentsModule } from './payments.module.js';
import { validatedPort } from './env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(PaymentsModule, new FastifyAdapter({ logger: true, bodyLimit: 64 * 1024 }));
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (request, body, done) => {
    (request as FastifyRequest & { rawBody?: Buffer }).rawBody = Buffer.from(body);
    done(null, body);
  });
  app.enableShutdownHooks();
  await app.listen(validatedPort(), '0.0.0.0');
}
void bootstrap();
