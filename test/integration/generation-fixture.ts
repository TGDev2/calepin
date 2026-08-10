/**
 * Keys and leases for suites that write generation rows directly.
 *
 * Since CAL-058 a `Generation` carries an idempotency key of a fixed shape and
 * a running `GenerationAttempt` carries a lease — two constraints the database
 * enforces, so a fixture has to satisfy them like anything else. Neither helper
 * derives anything: what a key *means* is `key.test.ts`'s to prove against the
 * real derivation, and `generation-idempotency.integration.test.ts`'s to prove
 * against the real index. These two exist so the other suites can keep writing
 * the rows they were always writing.
 *
 * It lives here rather than beside a domain file for the reason
 * `audited-client.ts` does: it is wiring, and no domain owns it (§4.1).
 */

import { createHash } from "node:crypto";

/**
 * A key of the shape `generations_idempotency_key_check` demands, distinct per
 * label on purpose rather than by luck — two fixture rows meaning two asks say
 * so, and two meaning one ask collide exactly as production rows would.
 */
export function fixtureGenerationKey(label: string): string {
  return createHash("sha256").update(label, "utf8").digest("hex");
}

/**
 * A lease far enough ahead that no claim in the same test run reclaims the row.
 * A fixture's running attempt stands for work in progress, not for a worker
 * that died — that case is written on purpose, with a lease in the past.
 */
export function fixtureLease(): Date {
  return new Date(Date.now() + 60 * 60_000);
}
