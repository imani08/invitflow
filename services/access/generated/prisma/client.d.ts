import * as runtime from "@prisma/client/runtime/client";
import * as $Class from "./internal/class";
import * as Prisma from "./internal/prismaNamespace";
export * as $Enums from './enums';
export * from "./enums";
/**
 * ## Prisma Client
 *
 * Type-safe database client for TypeScript
 * @example
 * ```
 * const prisma = new PrismaClient({
 *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
 * })
 * // Fetch zero or more CheckInAgents
 * const checkInAgents = await prisma.checkInAgent.findMany()
 * ```
 *
 * Read more in our [docs](https://pris.ly/d/client).
 */
export declare const PrismaClient: $Class.PrismaClientConstructor;
export type PrismaClient<LogOpts extends Prisma.LogLevel = never, OmitOpts extends Prisma.PrismaClientOptions["omit"] = Prisma.PrismaClientOptions["omit"], ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = $Class.PrismaClient<LogOpts, OmitOpts, ExtArgs>;
export { Prisma };
/**
 * Model CheckInAgent
 *
 */
export type CheckInAgent = Prisma.CheckInAgentModel;
/**
 * Model AgentCeremonyGrant
 *
 */
export type AgentCeremonyGrant = Prisma.AgentCeremonyGrantModel;
/**
 * Model AccessScanAttempt
 *
 */
export type AccessScanAttempt = Prisma.AccessScanAttemptModel;
/**
 * Model OutboxMessage
 *
 */
export type OutboxMessage = Prisma.OutboxMessageModel;
