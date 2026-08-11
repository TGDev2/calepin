/**
 * The reference corpus for `analyze-source-text` (CAL-078).
 *
 * `@calepin/ai/bench`'s `corpus.ts` defines the *shape* of a corpus
 * (`ReferenceCorpus`, `BenchCase`) but never reads the filesystem and holds
 * no story of its own — the bench cannot import `@calepin/analysis` (§3.2:
 * `@calepin/ai` depends on `@calepin/shared` only), so the actual corpus has
 * to live on the domain side of that boundary, where the mission's schema and
 * word-target constants already do.
 *
 * Five stories, five registers, one shared `variables` record built from this
 * package's own constants — the exact set V3 of the `analyze-source-text`
 * prompt declares (`@calepin/ai/prompts/missions/analyze-source-text`):
 * `language`, `targetAudience`, `sourceText`, `summaryWordTarget`,
 * `potentialWordTarget`, `totalWordBudget`, `evidenceWordTarget`.
 *
 * Every story is a synthetic fixture (§8), not a historical work — see each
 * file's own header in `./texts/`.
 */

import type { BenchCase, ReferenceCorpus } from "@calepin/ai";

import { ANALYSIS_TOTAL_WORD_BUDGET, ANALYSIS_WORD_TARGETS } from "../schema";
import { L_ANTICHAMBRE } from "./texts/l-antichambre";
import { L_HORLOGE_DE_LA_RUE_VAUGIRARD } from "./texts/l-horloge-de-la-rue-vaugirard";
import { LA_BERGERE_ET_LE_LOUP_DE_CENDRE } from "./texts/la-bergere-et-le-loup-de-cendre";
import { LE_PERROQUET_DU_NOTAIRE } from "./texts/le-perroquet-du-notaire";
import { LE_SERMENT_DE_PIETRANERA } from "./texts/le-serment-de-pietranera";
import type { CorpusText } from "./texts/types";

const CORPUS_TEXTS: readonly CorpusText[] = [
  L_ANTICHAMBRE,
  L_HORLOGE_DE_LA_RUE_VAUGIRARD,
  LA_BERGERE_ET_LE_LOUP_DE_CENDRE,
  LE_PERROQUET_DU_NOTAIRE,
  LE_SERMENT_DE_PIETRANERA,
];

/** Shared across every case: the exact variables V3 of the prompt declares. */
const SHARED_VARIABLES = {
  language: "français",
  targetAudience: "Lecteurs adultes de littérature générale française.",
  summaryWordTarget: ANALYSIS_WORD_TARGETS.factualSummary,
  potentialWordTarget: ANALYSIS_WORD_TARGETS.developmentPotential,
  totalWordBudget: ANALYSIS_TOTAL_WORD_BUDGET,
  evidenceWordTarget: ANALYSIS_WORD_TARGETS.evidence,
} as const;

function toBenchCase(text: CorpusText): BenchCase {
  return {
    id: text.id,
    title: text.title,
    provenance: text.provenance,
    referenceText: text.referenceText,
    variables: { ...SHARED_VARIABLES, sourceText: text.referenceText },
    expectations: text.expectations,
  };
}

/** CAL-078's answer to `analyze-source-text`: five registers, one bench case each. */
export const ANALYSIS_REFERENCE_CORPUS: ReferenceCorpus = {
  id: "analysis-reference-corpus-v1",
  description:
    "Cinq nouvelles courtes originales, de registres distincts (réalisme ironique, fantastique, conte merveilleux, comique, tragique), chacune annotée d'une attente qualitative par section du diagnostic.",
  cases: CORPUS_TEXTS.map(toBenchCase),
};
