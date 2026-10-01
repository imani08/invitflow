import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import amqp, { type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { AnalyticsService } from './analytics.service.js';
import { createAmqpRetryPublisher, processAnalyticsDelivery } from './analytics-event-delivery.js';

const queueName = 'analytics.events';
const consumerPrefetch = 10;
const maximumReconnectDelayMs = 30_000;

@Injectable()
export class EventConsumer implements OnModuleInit, OnModuleDestroy {
  private stopped = false;
  private connecting = false;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private connection: ChannelModel | undefined;
  private channel: ConfirmChannel | undefined;
  private consumerTag: string | undefined;
  private readonly retryPublisher = (channel: ConfirmChannel) => createAmqpRetryPublisher(channel);

  constructor(private readonly analytics: AnalyticsService) {}

  async onModuleInit() {
    await this.connectAndConsume();
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const connection = this.connection;
    const channel = this.channel;
    const consumerTag = this.consumerTag;
    this.connection = undefined;
    this.channel = undefined;
    this.consumerTag = undefined;

    if (channel && consumerTag) await channel.cancel(consumerTag).catch(() => undefined);
    if (channel) await channel.close().catch(() => undefined);
    if (connection) await connection.close().catch(() => undefined);
  }

  private async connectAndConsume() {
    if (this.stopped || this.connecting) return;
    this.connecting = true;
    let connection: ChannelModel | undefined;
    let channel: ConfirmChannel | undefined;

    try {
      const port = Number(process.env['RABBITMQ_AMQP_PORT'] ?? 5672);
      if (!Number.isInteger(port) || port < 1 || port > 65_535)
        throw new Error('RABBITMQ_AMQP_PORT must be a valid TCP port');

      connection = await amqp.connect({
        protocol: 'amqp',
        hostname: process.env['RABBITMQ_AMQP_HOST'] ?? 'rabbitmq',
        port,
        username: process.env['RABBITMQ_USER'] ?? 'invitaflow',
        password: process.env['RABBITMQ_PASSWORD'] ?? '',
        vhost: '/',
        heartbeat: 30,
      });
      if (this.stopped) {
        await connection.close();
        return;
      }
      this.connection = connection;
      connection.on('error', () => this.warn('analytics_amqp_connection_error'));

      const activeChannel = await connection.createConfirmChannel();
      channel = activeChannel;
      if (this.stopped) {
        await activeChannel.close();
        await connection.close();
        return;
      }
      this.channel = activeChannel;
      activeChannel.on('error', () => this.warn('analytics_amqp_channel_error'));
      await activeChannel.prefetch(consumerPrefetch);
      const result = await activeChannel.consume(queueName, (message) => {
        if (message) void this.handleMessage(activeChannel, message);
      });

      if (this.stopped) {
        await activeChannel.cancel(result.consumerTag).catch(() => undefined);
        await activeChannel.close().catch(() => undefined);
        await connection.close().catch(() => undefined);
        return;
      }
      this.consumerTag = result.consumerTag;
      connection.on('close', () =>
        this.onTransportClosed(connection as ChannelModel, activeChannel),
      );
      activeChannel.on('close', () =>
        this.onTransportClosed(connection as ChannelModel, activeChannel),
      );
      this.reconnectAttempt = 0;
      console.info(JSON.stringify({ level: 'info', event: 'analytics_amqp_consumer_started' }));
    } catch (error) {
      this.warn('analytics_amqp_connect_failed', error);
      if (channel) await channel.close().catch(() => undefined);
      if (connection) await connection.close().catch(() => undefined);
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private async handleMessage(channel: ConfirmChannel, message: ConsumeMessage) {
    try {
      await processAnalyticsDelivery(
        channel,
        message,
        this.analytics,
        this.retryPublisher(channel),
      );
    } catch (error) {
      this.warn('analytics_event_delivery_failed', error);
      try {
        channel.nack(message, false, true);
      } catch {
        // A closed channel requeues its unacknowledged deliveries automatically.
      }
    }
  }

  private onTransportClosed(connection: ChannelModel, channel: ConfirmChannel) {
    if (this.connection === connection) this.connection = undefined;
    if (this.channel === channel) {
      this.channel = undefined;
      this.consumerTag = undefined;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const attempt = Math.min(this.reconnectAttempt, 5);
    const delay = Math.min(1_000 * 2 ** attempt, maximumReconnectDelayMs);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connectAndConsume();
    }, delay);
    this.reconnectTimer.unref();
  }

  private warn(event: string, error?: unknown) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event,
        ...(error instanceof Error ? { error: error.name } : {}),
      }),
    );
  }
}
