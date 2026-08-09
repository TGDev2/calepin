/**
 * The closed set of error codes.
 *
 * CLAUDE.md §7 asks for a *stable* `code`. A free string is not stable: every
 * call site invents one, they drift, and CAL-067's operations views inherit an
 * open set nobody can enumerate. A code is always authored by a developer at
 * the `new SomeError(...)` site — it never comes from data — so there is no
 * untrusted source to normalise at runtime, and a closed union catches a typo
 * at compile time instead of shipping it.
 *
 * Adding a code is a one-line diff in this file. That is deliberate: it makes
 * the set reviewable.
 */

import type { ErrorCategory } from "./categories";

export const ERROR_CODES = [
  // validation
  "VALIDATION_FAILED",
  "SCHEMA_MISMATCH",
  /** An uploaded source-text file's extension is not `.txt`, `.md` or `.docx`. */
  "SOURCE_TEXT_IMPORT_UNSUPPORTED_FORMAT",
  /** A `.txt`/`.md`/`.docx` file could not be read — corrupt, or not decodable. */
  "SOURCE_TEXT_IMPORT_UNREADABLE",

  // not_found
  "NOT_FOUND",

  // forbidden
  "FORBIDDEN",
  /** Not signed in, as opposed to signed in without the right. Maps to 401. */
  "UNAUTHENTICATED",

  // conflict
  "CONFLICT",
  "STALE_REVISION",
  /**
   * The caller cancelled a generation in flight (CAL-048). Expected, so it is
   * returned as a value, never thrown; `conflict` because completing the work
   * would contradict a decision already taken about it — and a cancellation
   * must never be blindly retried, which `conflict`'s default already says.
   */
  "GENERATION_CANCELLED",
  /**
   * A project's status was recomputed from its rows and the answer is not
   * reachable from the status stored on the row (CAL-034). It is `conflict`
   * rather than `internal`: nothing about the request is malformed and no call
   * site is mis-wired — the graph and the column disagree by more than one step,
   * which is a state the caller can repair, not a bug it can only report.
   */
  "ILLEGAL_STATUS_TRANSITION",

  // rate_limit
  "RATE_LIMITED",

  // provider
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_REJECTED",
  /**
   * The model answered, but the answer is unusable — it fails the mission's
   * schema, or the prose is empty (CAL-048). Marked non-retryable at its one
   * construction site: a blind replay is not the treatment for a malformed
   * output, CAL-052's targeted repair is — and this code is what a generation
   * carries once that repair has been attempted and did not hold.
   */
  "MODEL_OUTPUT_INVALID",
  /**
   * The answer is not an answer to the mission at all (CAL-052): not of the
   * contract's kind, or an object sharing no field with it. A second code
   * rather than a flag beside the first, because the code is the axis an
   * operations view reads and the two have different remedies — an off-topic
   * answer is a prompt to fix, a malformed one a schema or a format. It is
   * never repaired: re-asking the same question in the same way returns the
   * same answer, so the attempt would only spend budget.
   */
  "MODEL_OUTPUT_OFF_TOPIC",

  // timeout
  "TIMEOUT",

  // internal
  "INTERNAL_ERROR",
  /**
   * A write reached an audited model with no actor in scope (CAL-022). It is a
   * programming error — a call site that forgot to open an actor scope — so it
   * throws rather than being returned as a value, and it is `internal` rather
   * than `forbidden`: the writer is not being refused a right, the code failed
   * to say on whose behalf it was writing.
   */
  "AUDIT_ACTOR_REQUIRED",
  /**
   * A repository was reached without a proven `ProjectScope` (CAL-023) — the
   * ownership parallel of `AUDIT_ACTOR_REQUIRED`. It is a programming error for
   * the same reason: the caller is not being refused a right, the code failed
   * to say whose data it was reading.
   */
  "PROJECT_SCOPE_REQUIRED",
  /** No process shell registered a database client (CAL-023). Mis-wiring. */
  "DATABASE_NOT_CONFIGURED",
  /**
   * A mission routes to a model whose provider has no registered adapter
   * (CAL-048) — the AI-layer parallel of `DATABASE_NOT_CONFIGURED`, and a
   * mis-wiring for the same reason: the composition root failed to hand the
   * port an adapter, no request could ever succeed, so it throws.
   */
  "MODEL_NOT_CONFIGURED",
  /**
   * A mission declared as producing prose was called for a structured answer,
   * or the reverse (CAL-051). The registry states one treatment per mission;
   * a call site asking for the other one has misread the mission, which no
   * retry and no other provider can fix — so it throws, at the boundary, on
   * every call rather than on the unlucky one.
   */
  "MISSION_OUTPUT_MISMATCH",
  /**
   * A row being copied into a duplicated project references a row the copy does
   * not hold (CAL-035). Either the duplication plan is missing a model, or the
   * graph reaches outside the project it is supposed to be confined to — both
   * are defects, and both would otherwise ship a copy pointing at the original.
   * The copy is one transaction, so this rolls all of it back.
   */
  "PROJECT_DUPLICATION_INCOMPLETE",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * A code belongs to exactly one category, so the category is looked up rather
 * than passed alongside. Handing both to a constructor would let them
 * disagree — `new AppError("NOT_FOUND", "conflict")` would compile — and the
 * disagreement would surface as a wrong HTTP status in production.
 */
export const CATEGORY_BY_CODE = {
  VALIDATION_FAILED: "validation",
  SCHEMA_MISMATCH: "validation",
  SOURCE_TEXT_IMPORT_UNSUPPORTED_FORMAT: "validation",
  SOURCE_TEXT_IMPORT_UNREADABLE: "validation",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  UNAUTHENTICATED: "forbidden",
  CONFLICT: "conflict",
  STALE_REVISION: "conflict",
  GENERATION_CANCELLED: "conflict",
  ILLEGAL_STATUS_TRANSITION: "conflict",
  RATE_LIMITED: "rate_limit",
  PROVIDER_UNAVAILABLE: "provider",
  PROVIDER_REJECTED: "provider",
  MODEL_OUTPUT_INVALID: "provider",
  MODEL_OUTPUT_OFF_TOPIC: "provider",
  TIMEOUT: "timeout",
  INTERNAL_ERROR: "internal",
  AUDIT_ACTOR_REQUIRED: "internal",
  PROJECT_SCOPE_REQUIRED: "internal",
  DATABASE_NOT_CONFIGURED: "internal",
  MODEL_NOT_CONFIGURED: "internal",
  MISSION_OUTPUT_MISMATCH: "internal",
  PROJECT_DUPLICATION_INCOMPLETE: "internal",
} as const satisfies Record<ErrorCode, ErrorCategory>;
