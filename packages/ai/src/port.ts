/**
 * The provider port (CAL-048, ADR-001) — the only surface business code sees.
 *
 * A domain imports this interface, the mission identifiers and the error
 * types, and receives the concrete port from the process shell (`apps/web` or
 * the worker). It never learns which model, which provider or which SDK sat
 * behind an answer — that is the whole point: swapping a model per mission is
 * an edit to `mission-registry.ts`, never to a caller.
 *
 * Both methods return `Result` (CLAUDE.md §7): a provider outage, a deadline,
 * a rate limit, a cancellation and an unusable answer are all expected
 * failures the caller must handle, not bugs.
 */

import type { Result } from "@calepin/shared/errors";
import type { z } from "zod";

import type { ModelId, ProviderId } from "./capabilities";
import type { MissionId } from "./missions";
import type { MissionPrompt, PromptId } from "./prompts";

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * What the caller learns about how the answer was produced — exactly what a
 * `GenerationAttempt` row records: the model that actually served, the exact
 * usage the provider reported, and how hard the layer had to work for it.
 */
export interface ModelCallMeta {
  readonly missionId: MissionId;
  /**
   * Which prompt resource produced the answer, and which version of it
   * (CAL-053). Reported rather than assumed: the caller records this on the
   * attempt, and ADR-001 asks that an output be attributable to exactly what
   * produced it — the model *and* the prompt.
   */
  readonly promptId: PromptId;
  readonly promptVersion: number;
  readonly provider: ProviderId;
  /** The model that served — the backup model's id when it did. */
  readonly model: ModelId;
  readonly usage: TokenUsage;
  /** Wall time of the whole call, retries and fallback included. */
  readonly durationMs: number;
  /** Tries consumed across both models. 1 when the first answer held. */
  readonly attemptCount: number;
  readonly usedFallback: boolean;
}

export interface ModelRequest {
  /**
   * The prompt, rendered from the registry (CAL-053) — never a string.
   *
   * It carries the permanent instructions, the mission's request with its
   * variables filled in, and the identity of the resource both came from. Two
   * consequences, and both are the point: no prompt text can reach a provider
   * from outside the registry (§5.2), and no call can happen without a version
   * to record on the attempt.
   *
   * The mission is read off it rather than passed beside it. A request that
   * named a mission of its own could name a different one from the prompt's,
   * and the pipeline would then route one mission's prompt through another
   * mission's model, budget and deadline.
   */
  readonly prompt: MissionPrompt;
  /**
   * Cooperative cancellation (CAL-064): aborting it stops the attempt, the
   * backoff wait and the network call, and answers `GENERATION_CANCELLED`.
   */
  readonly signal?: AbortSignal;
}

export interface StructuredGenerationRequest<Output> extends ModelRequest {
  /**
   * The domain's output schema (§6, ADR-001) — referenced, never restated.
   * Parametrised by its output so validation needs no cast: what `safeParse`
   * accepts is exactly what the result carries.
   */
  readonly schema: z.ZodType<Output>;
}

export interface ProseGenerationResult extends ModelCallMeta {
  readonly text: string;
}

export interface StructuredGenerationResult<Output> extends ModelCallMeta {
  /** Already validated against the mission's schema — never partial (§6). */
  readonly output: Output;
}

export interface ModelProviderPort {
  generateProse(request: ModelRequest): Promise<Result<ProseGenerationResult>>;
  generateStructured<Output>(
    request: StructuredGenerationRequest<Output>,
  ): Promise<Result<StructuredGenerationResult<Output>>>;
}
