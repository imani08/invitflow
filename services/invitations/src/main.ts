import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { InvitationsModule } from './invitations.module.js';
import { validatedPort } from './env.js';
async function bootstrap() { const app = await NestFactory.create<NestFastifyApplication>(InvitationsModule, new FastifyAdapter({ logger: true, bodyLimit: 128 * 1024 })); app.enableShutdownHooks(); await app.listen(validatedPort(), '0.0.0.0'); }
void bootstrap();
