/**
 * Turning untyped failures into typed ones.
 *
 * `catch (error: unknown)` is mandatory (CLAUDE.md §7), which means every catch
 * block needs the same two lines to make sense of what it caught. They live
 * here instead.
 */

import { AppError, InternalError, isAppError, ValidationError } from "./app-error";
import type { ErrorCode } from "./codes";

/**
 * Wraps anything thrown into an `AppError`, preserving it as the `cause`.
 *
 * An already-typed error passes through untouched — re-wrapping would bury the
 * category the thrower chose deliberately. Everything else becomes an
 * `InternalError`: a throw is a bug (§7), and a bug is neither retryable nor
 * something the reader can act on.
 */
export function toAppError(value: unknown): AppError {
  return isAppError(value) ? value : new InternalError({ cause: value });
}

/**
 * The shape of one validation issue — structurally typed on purpose.
 *
 * A real `ZodError` satisfies it, but this module imports no zod and this type
 * declares **no `message` field**, so the bridge CAL-052 will need cannot be
 * written in a way that copies a validator's message into an error. That
 * message routinely quotes the value that failed, which is exactly the leak
 * CLAUDE.md §6 and §9 rule out: log the field path, never the field value.
 */
export interface ValidationIssueLike {
  readonly path: readonly PropertyKey[];
}

/**
 * Builds a `ValidationError` from a validator's issue list, keeping only the
 * path of the first issue.
 *
 * The first issue rather than all of them: `fieldPath` is a single allowlisted
 * log field, and a list of paths is a list, which `pickLogFields` drops anyway.
 * Form-level, field-by-field feedback is a different problem, and it needs a
 * form to exist first.
 */
export function fromValidationIssues(
  source: { readonly issues: readonly ValidationIssueLike[] },
  options: { code?: ErrorCode; userMessage?: string; cause?: unknown } = {},
): ValidationError {
  const first = source.issues[0];

  return new ValidationError({
    code: options.code ?? "VALIDATION_FAILED",
    userMessage: options.userMessage,
    cause: options.cause,
    fieldPath: first ? toFieldPath(first.path) : undefined,
  });
}

/** `["chapters", 2, "title"]` → `"chapters.2.title"`. Keys only, never values. */
export function toFieldPath(path: readonly PropertyKey[]): string | undefined {
  const segments = path.map((segment) => String(segment)).filter((segment) => segment.length > 0);

  return segments.length > 0 ? segments.join(".") : undefined;
}
