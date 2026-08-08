/**
 * `@calepin/shared/account` — what an account is made of, and how it is
 * destroyed (CAL-031).
 *
 * It lives in `shared` for the reason `auth/` and `repository/` do: an account
 * is not one of the seven narrative domains, and all seven hang off it. Every
 * entry point takes the owner id explicitly, which is the invariant §3.5 asks
 * for — a `ProjectScope` proves one project belongs to a user, and an account
 * spans all of them.
 */

export { matchesDeletionConfirmation } from "./confirmation";
export type { AccountDeletionReport, DeleteAccountInput } from "./deletion";
export { deleteAccount } from "./deletion";
export type { AccountInventory } from "./inventory";
export { collectAccountInventory } from "./inventory";
export type { QueueCancellation, StoragePurge } from "./ports";
export { unavailableQueueCancellation, unavailableStoragePurge } from "./ports";
