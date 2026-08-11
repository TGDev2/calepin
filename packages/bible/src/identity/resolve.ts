/**
 * The eleven fields of *identité du roman*, from the nine a model wrote and the
 * two the author already chose (CAL-088).
 *
 * The specification (§5.6) lists eleven; `tracedNovelIdentitySchema` carries
 * nine. The two missing ones — *public* and *longueur cible* — are
 * `Project.targetAudience` and the word count resolved from
 * `Project.targetLength` / `Project.targetWordCount`, and they are missing from
 * the contract on purpose: they are the author's decisions, `BibleIdentity`
 * holds no column for either, and a model-authored copy would be the second
 * answer able to disagree with the first. This function is where the eleven
 * become eleven again.
 *
 * That is also what makes the acceptance criterion checkable rather than
 * rhetorical: *les onze champs sont produits et cohérents avec la direction
 * canonique* holds because nine were traced to the direction or the analysis
 * and two were copied from the project, with nothing invented anywhere.
 *
 * **The target length arrives resolved.** `resolveNovelTargetWordCount` lives
 * in `@calepin/outline` and a domain may not import a domain (§3.2), so the
 * caller passes the number. Which is the right shape anyway: this function
 * composes an identity, it does not interpret a `TargetLength` enum.
 *
 * **The two projections of `thematicAxes`.** `themes` and `counterThemes` are
 * the `BibleIdentity` columns, and they come out of one list rather than two,
 * so a counter-theme keeps the position of the theme it opposes. Reading the
 * two arrays back in step is how a screen — and CAL-096 — recovers the pairing
 * the columns cannot store.
 */

import type { TracedNovelIdentity } from "./schema";

/** The two facts the project decides and the mission never touches. */
export interface NovelIdentityProjectSettings {
  /** `Project.targetAudience`, as the author declared it. */
  readonly targetAudience: string;
  /** The novel's target length in words, resolved from the project. */
  readonly targetWordCount: number;
}

/**
 * The identity as the author reads it: the specification's eleven fields, in
 * the specification's own order.
 *
 * Nine are the mission's, stripped of their bases — the traceability is a
 * property of the answer that produced this, and it stays on
 * `TracedNovelIdentity` where a screen and a check can still reach it. Two are
 * the project's.
 */
export interface NovelIdentity {
  readonly workingTitle: string;
  readonly genre: string;
  readonly subGenre: string;
  readonly targetAudience: string;
  readonly targetWordCount: number;
  readonly tone: string;
  readonly narrativePromise: string;
  readonly themes: readonly string[];
  readonly counterThemes: readonly string[];
  readonly centralQuestion: string;
  readonly endingNature: string;
}

/** The eleven fields, from the nine that were generated and the two that were not. */
export function resolveNovelIdentity(
  identity: TracedNovelIdentity,
  settings: NovelIdentityProjectSettings,
): NovelIdentity {
  return {
    workingTitle: identity.workingTitle.value,
    genre: identity.genre.value,
    subGenre: identity.subGenre.value,
    targetAudience: settings.targetAudience,
    targetWordCount: settings.targetWordCount,
    tone: identity.tone.value,
    narrativePromise: identity.narrativePromise.value,
    themes: identity.thematicAxes.map((axis) => axis.theme.value),
    counterThemes: identity.thematicAxes.map((axis) => axis.counterTheme.value),
    centralQuestion: identity.centralQuestion.value,
    endingNature: identity.endingNature.value,
  };
}
