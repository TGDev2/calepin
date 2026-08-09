/**
 * The failures this layer can add to a generation, with the French a reader
 * is allowed to see (CLAUDE.md §7). Each has exactly one construction site,
 * so the code, the flag and the message cannot drift apart.
 */

import { ConflictError, InternalError, ProviderError } from "@calepin/shared/errors";

import type { TokenUsage } from "./port";

/**
 * The model attempted the mission's contract and missed it — a missing field, a
 * wrong type, an extra key — and the bounded repair (CAL-052) did not recover
 * it. Also the answer to empty prose, which has no schema to repair against.
 *
 * Non-retryable: a blind replay is not the treatment, the targeted repair
 * already was, and it is not fallback-eligible either (the pipeline returns it
 * before the fallback logic can see it).
 *
 * `usage` is carried because the tokens were genuinely consumed and
 * `GenerationAttempt` is where they must end up (CAL-056, CAL-064) — a
 * failure that hid them would under-count the project's real cost. It is the
 * total across every pass, the repair's own answer included.
 */
export class ModelOutputInvalidError extends ProviderError {
  readonly usage: TokenUsage | undefined;

  constructor(options: { fieldPath?: string | undefined; usage?: TokenUsage } = {}) {
    super({
      code: "MODEL_OUTPUT_INVALID",
      message: "the model answer does not satisfy the mission contract",
      userMessage:
        "La génération a produit une réponse inexploitable. Votre projet est intact : vous pouvez relancer l'opération.",
      retryable: false,
      fieldPath: options.fieldPath,
    });
    this.usage = options.usage;
  }
}

/**
 * The answer is not an answer to this mission (CAL-052) — not of the contract's
 * kind, or an object sharing no field with it. *Erreur de fond*, as against the
 * *erreur de forme* above.
 *
 * A separate class rather than a flag on that one, because the two differ in
 * the only two ways that matter: this one is never repaired — the same question
 * asked the same way returns the same answer, so the pass would only spend
 * budget — and it carries its own code, which is the axis an operations view
 * reads (CAL-067). It is not retryable and not fallback-eligible for the same
 * reason its sibling is not.
 *
 * No `fieldPath`: the failure is the answer as a whole, and naming one field of
 * a contract the answer never attempted would point a reader at the wrong
 * thing.
 */
export class ModelOutputOffTopicError extends ProviderError {
  readonly usage: TokenUsage | undefined;

  constructor(options: { usage?: TokenUsage } = {}) {
    super({
      code: "MODEL_OUTPUT_OFF_TOPIC",
      message: "the model answer does not address the mission at all",
      userMessage:
        "La génération n'a pas répondu à la demande. Votre projet est intact : vous pouvez relancer l'opération.",
      retryable: false,
    });
    this.usage = options.usage;
  }
}

/** Expected, so returned as a value — never thrown (CLAUDE.md §7). */
export function generationCancelled(): ConflictError {
  return new ConflictError({
    code: "GENERATION_CANCELLED",
    message: "the caller cancelled the generation",
    userMessage:
      "La génération a été annulée. Votre projet est intact : vous pouvez la relancer à tout moment.",
  });
}

/** Mis-wiring, so thrown — the composition root forgot an adapter. */
export function modelNotConfigured(): InternalError {
  return new InternalError({
    code: "MODEL_NOT_CONFIGURED",
    message: "no adapter is registered for the routed model's provider",
  });
}

/**
 * The mission was called for the kind of answer it does not produce (CAL-051).
 * A call-site bug, so thrown — and the message names no mission, because
 * `AppError.message` is the first line of a stack and is never interpolated
 * with data (§7). The caller knows which mission it just asked for.
 */
export function missionOutputMismatch(): InternalError {
  return new InternalError({
    code: "MISSION_OUTPUT_MISMATCH",
    message: "the mission's declared output kind is not the one the caller asked for",
  });
}
