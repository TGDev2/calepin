import type { FreedomLevel } from "../freedom-level";

/**
 * The narrative settings a generation must see, regardless of mission
 * (CAL-042). `@calepin/ai`'s real context composer (CAL-054, CLAUDE.md §5.8)
 * doesn't exist yet — this is the minimal shape it will fold in once it does,
 * and the one guarantee that has to hold before then: a resolved project
 * setting reaches every generation call.
 */
export interface GenerationContext {
  /** `Project.language` — the visitor's manual choice always wins over any
   * detected proposal (CAL-042), and nothing downstream re-decides it. */
  readonly language: string;
  /**
   * `Project.freedomLevel` — how far the novel may travel from its source text
   * (CAL-044).
   *
   * The level travels, not the clauses it resolves to. A context is
   * mission-agnostic while a constraint set belongs to one stage, so the
   * mission asks `freedomConstraints(context.freedomLevel, "direction")` for
   * its own slice rather than carrying all four stages' worth of a table it is
   * three quarters uninterested in.
   */
  readonly freedomLevel: FreedomLevel;
  /**
   * `Project.targetAudience` — the short-list-or-free-text readership choice
   * made at creation (CAL-040), propagated the same way (CAL-045). The bible's
   * style section (`BibleStyle.languageRegister`, CAL-089) is meant to read it
   * from here rather than restate it, the same rule `prisma/schema.test.ts`
   * already pins for `BibleIdentity`: the project holds it once.
   */
  readonly targetAudience: string;
}
