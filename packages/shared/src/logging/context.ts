import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { type LogFields, pickLogFields } from "./fields";

/**
 * The ambient log context.
 *
 * Correlation is worthless if every function has to be handed the identifier
 * by its caller: the one place it gets dropped is the one place the trace
 * breaks. `AsyncLocalStorage` carries it across awaits instead, so a log call
 * ten frames deep in a domain function emits the same `correlationId` as the
 * request that started it without knowing the request exists.
 *
 * Node only. This module is server-side (`apps/web` server code, the CAL-060
 * worker) and must never be imported from a client component or from Edge
 * middleware.
 */
const storage = new AsyncLocalStorage<LogFields>();

export function newCorrelationId(): string {
  return randomUUID();
}

export function currentLogContext(): LogFields {
  return storage.getStore() ?? {};
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/**
 * Runs `fn` with `fields` merged into the ambient context. Fields go through
 * the same allowlist as a log call — the context is emitted on every line, so
 * it is the last place a stray field should be able to hide.
 */
export function runWithLogContext<T>(fields: LogFields, fn: () => T): T {
  return storage.run({ ...currentLogContext(), ...pickLogFields(fields) }, fn);
}

export interface RequestContext {
  /** Reuse the caller's identifier when there is one; mint one otherwise. */
  correlationId?: string;
  requestId?: string;
  userId?: string;
  httpMethod?: string;
  httpPath?: string;
}

/** One of the two correlation entry points: an inbound HTTP request. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return runWithLogContext(
    { ...context, correlationId: context.correlationId ?? newCorrelationId() },
    fn,
  );
}

export interface GenerationContext {
  generationId: string;
  projectId?: string;
  missionId?: string;
  jobId?: string;
  attempt?: number;
  /** Omit to inherit the request's identifier, or to mint one off-request. */
  correlationId?: string;
}

/**
 * The other entry point: an AI generation. A generation started by a request
 * inherits that request's `correlationId`, so the trace survives the hop into
 * the queue; one started by the worker alone gets its own.
 */
export function runWithGenerationContext<T>(context: GenerationContext, fn: () => T): T {
  return runWithLogContext(
    {
      ...context,
      correlationId: context.correlationId ?? currentCorrelationId() ?? newCorrelationId(),
    },
    fn,
  );
}
