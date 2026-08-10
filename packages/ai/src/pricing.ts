/**
 * The configurable tariff table (CAL-056) — the price of a model's tokens.
 *
 * `capabilities.ts` and `mission-registry.ts` both refuse to hold a price, on
 * purpose: a number copied there would be the copy that drifts. This is the
 * one table it lives in, and `estimateCostUsd` is the one function that reads
 * it — every caller that turns a measured `TokenUsage` into money goes
 * through here, never through its own multiplication.
 *
 * USD per million tokens, the unit providers publish rates in. The result is
 * a decimal string at the schema's own precision
 * (`GenerationAttempt.estimatedCostUsd @db.Decimal(12, 6)`), never a float —
 * money summed in binary floating point stops adding up, the same reasoning
 * that column's own doc-comment gives.
 */

import type { ModelId } from "./capabilities";
import type { TokenUsage } from "./port";

export interface ModelPricing {
  readonly model: ModelId;
  readonly inputUsdPerMillionTokens: number;
  readonly outputUsdPerMillionTokens: number;
}

/**
 * Published list price for each model this layer can call, current at the
 * time this table was declared. A rate change is an edit here — never a
 * reason to touch a caller. The two Bedrock entries are priced the same as
 * their direct-API counterpart: same weights, same published rate.
 */
export const MODEL_PRICING = {
  "claude-opus-5": {
    model: "claude-opus-5",
    inputUsdPerMillionTokens: 15,
    outputUsdPerMillionTokens: 75,
  },
  "claude-sonnet-5": {
    model: "claude-sonnet-5",
    inputUsdPerMillionTokens: 3,
    outputUsdPerMillionTokens: 15,
  },
  "claude-haiku-4-5": {
    model: "claude-haiku-4-5",
    inputUsdPerMillionTokens: 0.8,
    outputUsdPerMillionTokens: 4,
  },
  "anthropic.claude-opus-5": {
    model: "anthropic.claude-opus-5",
    inputUsdPerMillionTokens: 15,
    outputUsdPerMillionTokens: 75,
  },
  "anthropic.claude-sonnet-5": {
    model: "anthropic.claude-sonnet-5",
    inputUsdPerMillionTokens: 3,
    outputUsdPerMillionTokens: 15,
  },
} as const satisfies Record<ModelId, ModelPricing>;

const COST_DECIMAL_PLACES = 6;

/** One dollar, in the integer unit `sumCostUsd` adds in. */
const MICRO_USD_PER_USD = 10 ** COST_DECIMAL_PLACES;

/**
 * The tariff table applied to one call's usage — the only place a
 * `TokenUsage` turns into money.
 */
export function estimateCostUsd(model: ModelId, usage: TokenUsage): string {
  const rate = MODEL_PRICING[model];
  const cost =
    (usage.inputTokens * rate.inputUsdPerMillionTokens +
      usage.outputTokens * rate.outputUsdPerMillionTokens) /
    1_000_000;

  return cost.toFixed(COST_DECIMAL_PLACES);
}

/**
 * Several of this module's own results added up (CAL-057) — the total of an
 * operation whose phases each ran on their own model at their own rate.
 *
 * **Adds in integers, never in floats.** `Number("0.000001") * 3` is not
 * `0.000003`, and an estimate that disagrees with the sum of the lines printed
 * above it is an estimate a reader stops trusting. Every value this function
 * takes came out of `estimateCostUsd` with exactly six decimals, so shifting
 * the point is a string operation and the addition is exact — the same
 * reasoning that makes `estimatedCostUsd` a `Decimal` column rather than a
 * `Float` one.
 *
 * Throws on anything that is not such a value: a caller passing a number it
 * formatted itself is a bug at the call site, not a failure the author can act
 * on (§7).
 */
export function sumCostUsd(values: Iterable<string>): string {
  let microUsd = 0;

  for (const value of values) {
    const match = /^(\d+)\.(\d{6})$/.exec(value);
    if (match === null) {
      throw new TypeError("a cost must be a six-decimal string, as estimateCostUsd returns");
    }

    microUsd += Number(match[1]) * MICRO_USD_PER_USD + Number(match[2]);
  }

  const units = Math.floor(microUsd / MICRO_USD_PER_USD);
  const fraction = microUsd - units * MICRO_USD_PER_USD;

  return `${units}.${String(fraction).padStart(COST_DECIMAL_PLACES, "0")}`;
}
