/**
 * Token estimation for the context composer (CAL-054).
 *
 * An exact count exists only behind a provider's own counting endpoint and is
 * model-specific — a call this layer must not make at composition time (§5.1,
 * and §8 for the tests). So the composer gates on a heuristic, and the *exact*
 * check stays where CAL-051 put it: the pipeline compares the input count the
 * provider actually reports against the mission's budget and logs
 * `ai.context-budget-exceeded` after the fact.
 *
 * The heuristic is **conservative on purpose**. French prose measures around
 * 3.5–4 characters per token on this model family; dividing by 3 overestimates
 * by roughly a quarter. The two failure directions are not symmetric: an
 * overestimate degrades the context a little more than strictly needed, an
 * underestimate ships an over-budget call the pipeline can only observe once
 * the tokens are already spent.
 */

export const ESTIMATED_CHARS_PER_TOKEN = 3;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / ESTIMATED_CHARS_PER_TOKEN);
}
