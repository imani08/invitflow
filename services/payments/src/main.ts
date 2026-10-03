import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { PaymentsModule } from './payments.module.js';
import { validatedPort } from './env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    PaymentsModule,
    new FastifyAdapter({
      logger: true,
      bodyLimit: 64 * 1024,
    }),
  );

  app.enableShutdownHooks();
  await app.listen(validatedPort(), '0.0.0.0');
}

void bootstrap();
