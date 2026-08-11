/**
 * The shape one corpus story fixture takes (CAL-078), before the shared
 * mission variables (`../corpus.ts`) are poured in. Kept separate from
 * `../corpus.ts` so a text module never has to import the file that
 * assembles it.
 */

export interface CorpusText {
  /** Kebab-case, unique within the corpus — the bench case's own id. */
  readonly id: string;
  readonly title: string;
  /** Where the text comes from — never a historical claim, see each file's header. */
  readonly provenance: string;
  readonly referenceText: string;
  /** One entry per `ANALYSIS_SECTIONS`, in that order — CAL-078's own ask. */
  readonly expectations: readonly string[];
}
