/**
 * The failures this layer can add to a generation, with the French a reader
 * is allowed to see (CLAUDE.md §7). Each has exactly one construction site,
 * so the code, the flag and the message cannot drift apart.
 */

import { ConflictError, InternalError, ProviderError } from "@calepin/shared/errors";

import type { TokenUsage } from "./port";

/**
 * The model answered and the answer is unusable — schema failed, or empty
 * prose. Non-retryable: a blind replay is not the treatment, CAL-052's
 * targeted repair is, and it is not fallback-eligible either (the pipeline
 * returns it before the fallback logic can see it).
 *
 * `usage` is carried because the tokens were genuinely consumed and
 * `GenerationAttempt` is where they must end up (CAL-056, CAL-064) — a
 * failure that hid them would under-count the project's real cost.
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
