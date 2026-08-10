/**
 * The seam between the queue and Redis (CAL-060).
 *
 * Same shape, and the same reasoning, as `../database/client.ts`: a process
 * shell composes the connection once — `apps/worker/src/main.ts`, and
 * `apps/web` the day a server action enqueues something — and registers it
 * here; everything downstream reaches it through `getQueueConnection()`. A
 * server action can then enqueue a job without ever being handed a Redis client
 * it could run commands on.
 *
 * **Two roles, because a producer and a consumer want opposite behaviour when
 * Redis blinks.** BullMQ's own production guidance is explicit about it: a
 * `Queue`'s commands should fail quickly so the caller learns and can answer,
 * while anything that *blocks* must wait indefinitely — a blocking read is how
 * it waits for work, and a client that gives up on one stops consuming. Getting
 * that wrong is not a slow worker, it is a worker that throws instead of
 * running, which is why the value is a constant here and not an option a caller
 * passes. BullMQ refuses the construction outright rather than degrade.
 *
 * `consumer` therefore means *anything that blocks*, which is a wider set than
 * "the worker": `QueueEvents` blocks on the event stream and needs the consumer
 * connection too, even though it writes nothing.
 */

import { Redis, type RedisOptions } from "ioredis";

import { InternalError } from "../errors/app-error";

export const QUEUE_CONNECTION_ROLES = ["producer", "consumer"] as const;

export type QueueConnectionRole = (typeof QUEUE_CONNECTION_ROLES)[number];

/**
 * A producer gives up after this many retries of one command, so an enqueue
 * fails as a `QUEUE_UNAVAILABLE` the caller can answer with rather than hanging
 * a request for the length of someone else's outage.
 */
export const PRODUCER_MAX_RETRIES_PER_REQUEST = 3;

/**
 * Pure, and separate from `createQueueConnection` on purpose: constructing an
 * `ioredis` client opens a socket, so a unit test can only assert the policy if
 * the policy is a value rather than a side effect (§8).
 */
export function queueConnectionOptions(role: QueueConnectionRole): RedisOptions {
  return role === "consumer"
    ? { maxRetriesPerRequest: null }
    : { maxRetriesPerRequest: PRODUCER_MAX_RETRIES_PER_REQUEST };
}

export interface CreateQueueConnectionOptions {
  /** `REDIS_URL`, handed over by the shell — never read from here (§4.2). */
  readonly url: string;
  readonly role: QueueConnectionRole;
}

export function createQueueConnection(options: CreateQueueConnectionOptions): Redis {
  return new Redis(options.url, queueConnectionOptions(options.role));
}

/**
 * On `globalThis` under a `Symbol.for` key, for the reason CLAUDE.md §12 gives
 * and `../database/client.ts` learned the hard way: `apps/web` compiles
 * `packages/*` into more than one chunk graph, so a module-level `const` here
 * would be registered in the shell's copy and read as undefined from the server
 * components' copy.
 */
const REGISTERED_CONNECTION: unique symbol = Symbol.for("calepin.registeredQueueConnection");

interface ConnectionRegistry {
  [REGISTERED_CONNECTION]?: Redis;
}

const registry = globalThis as unknown as ConnectionRegistry;

/** Registers the connection every producer will enqueue through. */
export function configureQueueConnection(connection: Redis): Redis {
  registry[REGISTERED_CONNECTION] = connection;

  return connection;
}

/** Forgets the registered connection. For a test's teardown, and nothing else. */
export function resetQueueConnection(): void {
  registry[REGISTERED_CONNECTION] = undefined;
}

export function getQueueConnection(): Redis {
  const connection = registry[REGISTERED_CONNECTION];

  if (connection === undefined) {
    // A throw, not a `Result`: a process reaching an enqueue with no connection
    // registered is mis-wired, which is a programming error rather than a
    // failure a caller could handle (CLAUDE.md §7).
    throw new InternalError({
      code: "QUEUE_NOT_CONFIGURED",
      message: "no queue connection was registered by the process shell",
    });
  }

  return connection;
}
