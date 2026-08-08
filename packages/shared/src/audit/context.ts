/**
 * The actor scope — who the code is currently writing on behalf of.
 *
 * `AsyncLocalStorage`, for the same reason the correlation id uses one: the
 * author of a write is ambient to a request or a job, and threading it through
 * every function signature between the route and the repository is how one call
 * site ends up passing `undefined` and nobody notices.
 *
 * It is deliberately **not** the logging context (`@calepin/shared/logging`).
 * The two carry different things with different lifetimes: a correlation id
 * exists for anything that is traced, including reads and anonymous requests,
 * while an actor exists only where something is written on someone's behalf.
 * Folding them together would make one of the two nullable everywhere and turn
 * "no actor" into a state the type system stops arguing about.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface AuditContext {
  /** The `User.id` credited with every write made inside the scope. */
  readonly actorId: string;
}

const storage = new AsyncLocalStorage<AuditContext>();

/**
 * Runs `fn` with `actorId` credited for every audited write it performs,
 * however deep. This is the seam `apps/web`'s server actions and the worker
 * (CAL-060) open once, at the top of a request or a job.
 *
 * **`fn` must await its writes.** A Prisma call returns a lazy promise that
 * runs when it is awaited, so `runWithActor(id, () => prisma.x.create(...))`
 * hands the promise out of the scope and executes it outside. The extension
 * then finds no actor and throws `AUDIT_ACTOR_REQUIRED` — loudly, which is the
 * point: the failure mode of getting this wrong is a refused write, never an
 * unattributed one. Write `async () => { await ... }`.
 */
export function runWithActor<T>(actorId: string, fn: () => T): T {
  return storage.run({ actorId }, fn);
}

/** The current actor, or `undefined` outside any scope. */
export function getContextActorId(): string | undefined {
  return storage.getStore()?.actorId;
}

/**
 * The current scope, for a caller that needs to carry it across a boundary
 * `AsyncLocalStorage` does not follow — a queue payload, above all.
 */
export function getAuditContext(): AuditContext | undefined {
  return storage.getStore();
}
