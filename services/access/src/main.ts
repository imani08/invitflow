import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AccessModule } from './access.module.js';
import { validatedPort } from './env.js';

const app = await NestFactory.create<NestFastifyApplication>(AccessModule, new FastifyAdapter({ bodyLimit: 32 * 1024 }), { bufferLogs: true });
app.enableShutdownHooks();
app.setGlobalPrefix('v1');
await app.listen(validatedPort(), '0.0.0.0');
