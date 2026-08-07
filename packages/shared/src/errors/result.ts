/**
 * `Result` — the shape of an expected failure.
 *
 * CLAUDE.md §7 splits failures in two. A domain function returns
 * `Result<T, AppError>` for a failure the caller must handle — not found, not
 * allowed, invalid state, provider unavailable — and throws only for
 * programming errors and unrecoverable infrastructure faults. Choosing
 * per-function is how a codebase ends up with three error styles, so the choice
 * is made once, here.
 *
 * Write `Result<T>` everywhere. The second parameter defaults to `AppError` and
 * exists for the rare case that is genuinely not one; two spellings of the same
 * type in one codebase is a paper cut nobody needs.
 */

import type { AppError } from "./app-error";

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export function succeed(): Result<void, never>;
export function succeed<T>(value: T): Result<T, never>;
export function succeed<T>(value?: T): Result<T | void, never> {
  return { ok: true, value: value as T };
}

export function fail<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/** Transforms the value of a success; leaves a failure exactly as it is. */
export function mapResult<T, U, E>(result: Result<T, E>, transform: (value: T) => U): Result<U, E> {
  return result.ok ? { ok: true, value: transform(result.value) } : result;
}

/** Chains a second fallible step onto a success. The first failure wins. */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  next: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? next(result.value) : result;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
