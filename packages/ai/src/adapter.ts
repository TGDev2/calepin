/**
 * The contract a provider adapter implements (CAL-048).
 *
 * One adapter per provider: CAL-049 supplies the primary, CAL-050 the second
 * one. The pipeline owns everything policy-shaped — retries, backoff,
 * deadlines, fallback, validation — so an adapter is a translation layer and
 * nothing more: compose the provider request, stream if the SDK recommends
 * it, return the text or the raw value with the exact token usage reported.
 *
 * **The error contract.** An adapter throws classified `AppError`s:
 * `RateLimitError` (with `retryAfterMs` when the provider said so),
 * `ProviderError` (`PROVIDER_UNAVAILABLE` for an outage, `PROVIDER_REJECTED`
 * with `retryable: false` for a request the provider will never accept), and
 * lets an abort of `signal` surface however the SDK surfaces it — the
 * pipeline reads the signal, not the exception, to tell a deadline from a
 * cancellation. Anything else thrown is treated as a bug (§7).
 */

import type { EffortLevel, ModelCapability, ProviderId } from "./capabilities";
import type { TokenUsage } from "./port";

export interface ProviderCall {
  /** Resolved capability — the adapter reads the id and the limits from it. */
  readonly model: ModelCapability;
  readonly system: string;
  readonly prompt: string;
  readonly maxOutputTokens: number;
  readonly effort?: EffortLevel;
  /**
   * Aborted on the attempt's deadline or on caller cancellation. The adapter
   * must hand it to the SDK so the network call actually stops.
   */
  readonly signal: AbortSignal;
}

export interface StructuredProviderCall extends ProviderCall {
  /**
   * JSON Schema derived from the mission's Zod schema. Adapters never see
   * Zod: validation belongs to the pipeline, constraint to the provider.
   */
  readonly outputSchema: Readonly<Record<string, unknown>>;
}

export interface ProviderProse {
  readonly text: string;
  /** Exactly as the provider reported it — never estimated (CAL-049). */
  readonly usage: TokenUsage;
}

export interface ProviderValue {
  /** The provider's parsed JSON answer, untrusted until the pipeline validates it. */
  readonly value: unknown;
  readonly usage: TokenUsage;
}

export interface ProviderAdapter {
  readonly provider: ProviderId;
  generateProse(call: ProviderCall): Promise<ProviderProse>;
  generateStructured(call: StructuredProviderCall): Promise<ProviderValue>;
}
