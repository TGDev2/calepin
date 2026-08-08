/**
 * What account deletion needs outside PostgreSQL (CAL-031).
 *
 * Deleting an account reaches three systems: the database, the private bucket
 * and the queue. Only the first exists today, and the other two are injected
 * rather than imported for the reason `GenerationPersistence` is (CLAUDE.md
 * §5.3) — the deletion is business logic, the S3 client and the BullMQ
 * connection are infrastructure a process shell composes.
 *
 * Both are called **after** the transaction has committed. A network call
 * inside a transaction holds database locks for the length of someone else's
 * outage, and neither of these is part of the atomic core: an object no row
 * points at is unreachable, and a job whose generation row is gone fails on its
 * next write. What they are not allowed to do is keep a deleted account alive,
 * so a failure here is counted and logged, never propagated as a refusal.
 */

/**
 * Removes objects from the private bucket — the export files of
 * `Export.storageKey` and the covers of `Publication.coverStorageKey`.
 *
 * Returns how many objects it removed. Idempotent by contract: an object that
 * is already gone is a success, not an error, because a retried deletion must
 * not fail on the work the first attempt finished.
 */
export interface StoragePurge {
  purgeObjects(keys: readonly string[]): Promise<number>;
}

/**
 * Cancels the queued work of generations that are still `QUEUED` or `RUNNING`.
 *
 * Keyed by generation id, not by a job id: no column stores one, deliberately —
 * `GenerationAttempt`'s `(generationId, attempt)` uniqueness is the idempotency
 * key CAL-060 builds its jobs on, so the generation id is the name the queue
 * already knows a job by.
 */
export interface QueueCancellation {
  cancelGenerations(generationIds: readonly string[]): Promise<number>;
}

/**
 * The message both stand-ins refuse with. English, developer-facing, built from
 * no data — it is the first line of a stack (§7).
 */
const UNAVAILABLE = "this process composed no implementation for an account deletion side effect";

/**
 * The two implementations a process has when the real adapter does not exist
 * yet — which is every process today: no S3 client and no BullMQ connection are
 * in the repository (CLAUDE.md §13).
 *
 * **They succeed on an empty list and refuse a non-empty one.** Nothing writes
 * a storage key or enqueues a job at the moment, so the list is empty and a
 * deletion runs clean. The day CAL-165 writes its first `storageKey` or CAL-060
 * enqueues its first job, a shell that forgot to wire the adapter fails loudly
 * with the count in the log, instead of reporting a purge it never performed.
 * A silent no-op here would be a compliance defect that no test could see.
 */
function refuseWhenAsked(items: readonly string[]): Promise<number> {
  return items.length === 0 ? Promise.resolve(0) : Promise.reject(new Error(UNAVAILABLE));
}

export const unavailableStoragePurge: StoragePurge = {
  purgeObjects: (keys) => refuseWhenAsked(keys),
};

export const unavailableQueueCancellation: QueueCancellation = {
  cancelGenerations: (generationIds) => refuseWhenAsked(generationIds),
};
