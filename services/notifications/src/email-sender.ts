import net from 'node:net';
import tls from 'node:tls';
import { Injectable } from '@nestjs/common';

type Socket = net.Socket | tls.TLSSocket;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function required(value: string | undefined, name: string) { if (!value) throw new Error(`${name} is not configured`); return value; }
function asBool(value: string | undefined) { return value === 'true'; }

@Injectable()
export class EmailSender {
  private readonly provider = process.env['MAIL_PROVIDER'] ?? 'mailpit';
  private readonly host = this.provider === 'mailpit' ? 'mailpit' : required(process.env['KEYCLOAK_SMTP_HOST'], 'KEYCLOAK_SMTP_HOST');
  private readonly port = this.provider === 'mailpit' ? 1025 : Number(process.env['KEYCLOAK_SMTP_PORT'] ?? '587');
  private readonly from = required(process.env['KEYCLOAK_SMTP_FROM'], 'KEYCLOAK_SMTP_FROM');
  private readonly displayName = (process.env['KEYCLOAK_SMTP_FROM_DISPLAY_NAME'] ?? 'InvitaFlow').replace(/[\r\n]/g, '').slice(0, 100);
  private readonly username = process.env['KEYCLOAK_SMTP_USER'];
  private readonly password = process.env['KEYCLOAK_SMTP_PASSWORD'];
  private readonly useSsl = this.provider !== 'mailpit' && asBool(process.env['KEYCLOAK_SMTP_SSL']);
  private readonly useStartTls = this.provider !== 'mailpit' && asBool(process.env['KEYCLOAK_SMTP_STARTTLS']);

  async send(to: string, subject: string, text: string) {
    if (!emailPattern.test(to) || !emailPattern.test(this.from) || !Number.isInteger(this.port) || this.port < 1 || this.port > 65_535) throw new Error('Email delivery configuration is invalid');
    if (this.provider !== 'mailpit' && this.provider !== 'smtp') throw new Error('MAIL_PROVIDER must be mailpit or smtp');
    if (this.useSsl === this.useStartTls && this.provider === 'smtp') throw new Error('SMTP requires exactly one of SSL or STARTTLS');
    const socket = await this.connect();
    try {
      await this.response(socket, [220]);
      await this.command(socket, 'EHLO invitaflow.local', [250]);
      let activeSocket = socket;
      if (this.useStartTls) {
        await this.command(activeSocket, 'STARTTLS', [220]);
        activeSocket = await this.upgrade(activeSocket);
        await this.command(activeSocket, 'EHLO invitaflow.local', [250]);
      }
      if (this.provider === 'smtp') {
        if (!this.username || !this.password) throw new Error('SMTP credentials are not configured');
        await this.command(activeSocket, 'AUTH LOGIN', [334]);
        await this.command(activeSocket, Buffer.from(this.username).toString('base64'), [334]);
        await this.command(activeSocket, Buffer.from(this.password).toString('base64'), [235]);
      }
      await this.command(activeSocket, `MAIL FROM:<${this.from}>`, [250]);
      await this.command(activeSocket, `RCPT TO:<${to}>`, [250, 251]);
      await this.command(activeSocket, 'DATA', [354]);
      const safeSubject = subject.replace(/[\r\n]/g, ' ').slice(0, 180);
      const safeText = text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
      await this.command(activeSocket, `From: ${this.displayName} <${this.from}>\r\nTo: <${to}>\r\nSubject: ${safeSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${safeText}\r\n.`, [250]);
      await this.command(activeSocket, 'QUIT', [221]);
      activeSocket.destroy();
    } catch (error) { socket.destroy(); throw error; }
  }

  private connect(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = this.useSsl ? tls.connect({ host: this.host, port: this.port, servername: this.host }) : net.connect({ host: this.host, port: this.port });
      socket.setTimeout(12_000); socket.once('error', reject); socket.once('timeout', () => reject(new Error('SMTP connection timed out'))); socket.once(this.useSsl ? 'secureConnect' : 'connect', () => resolve(socket));
    });
  }

  private upgrade(socket: Socket): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const secure = tls.connect({ socket, servername: this.host });
      secure.setTimeout(12_000); secure.once('error', reject); secure.once('timeout', () => reject(new Error('SMTP TLS upgrade timed out'))); secure.once('secureConnect', () => resolve(secure));
    });
  }

  private command(socket: Socket, value: string, accepted: number[]) { socket.write(`${value}\r\n`); return this.response(socket, accepted); }
  private response(socket: Socket, accepted: number[]): Promise<void> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\r\n');
        const final = lines.filter((line) => /^\d{3} /.test(line)).at(-1);
        if (!final) return;
        cleanup(); const code = Number(final.slice(0, 3));
        if (accepted.includes(code)) resolve(); else reject(new Error(`SMTP rejected delivery (${code})`));
      };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const onTimeout = () => { cleanup(); reject(new Error('SMTP response timed out')); };
      const cleanup = () => { socket.off('data', onData); socket.off('error', onError); socket.off('timeout', onTimeout); };
      socket.on('data', onData); socket.once('error', onError); socket.once('timeout', onTimeout);
    });
  }
}
