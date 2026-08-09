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
}
