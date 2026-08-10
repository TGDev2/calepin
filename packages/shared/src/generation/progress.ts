/**
 * What one call to `reportProgress` inside a mission's `produce` states
 * (CAL-062) — a named step and an indicative percentage, sibling to
 * `AttemptUsage`'s `report`.
 *
 * **Display-only.** Nothing in `runGenerationAttempt` reads this back, and
 * nothing that decides the generation's fate ever will: it exists purely so a
 * screen watching the generation has something to show. Stated, never
 * accumulated — the same discipline `AttemptUsage`'s doc comment states for
 * usage, and for the same reason: a second call replaces the first, it does
 * not add to it.
 */
export interface GenerationProgress {
  readonly step: string;
  /** 0–100. Out-of-range values are clamped by the persistence layer. */
  readonly percent?: number;
}
