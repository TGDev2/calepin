/**
 * The evaluation criteria (CAL-059) — the questions the judge must answer.
 *
 * Five, deliberately few: a criterion earns its place by naming a way a prompt
 * change actually degrades an output, and a long list dilutes every judgement
 * into checkbox prose. They are **data, not scores**: a criterion has no
 * weight, no scale and no threshold, because the specification forbids an
 * arbitrary score presented as proof of quality — what a criterion produces is
 * an argued, evidence-anchored verdict, and what the bench aggregates is a
 * count of such verdicts, labelled as a count.
 *
 * The French is what the judge reads (rendered into the prompt as a list) and
 * what the report shows its reader; the id is what the contract's enum and the
 * report's structure carry. A run may extend the default set — CAL-078's
 * per-mission wiring, CAL-193's regression harness — but never shrink it below
 * one: a bench with no criteria has no questions to ask.
 */

import { InternalError } from "@calepin/shared/errors";

export interface BenchCriterion {
  /** Kebab-case, unique within a run — the contract's enum member. */
  readonly id: string;
  /** French, what the report's reader sees as the criterion's name. */
  readonly label: string;
  /** French, the question the judge must answer under this criterion. */
  readonly question: string;
}

export const BENCH_CRITERIA: readonly BenchCriterion[] = [
  {
    id: "source-grounding",
    label: "Ancrage dans le texte de référence",
    question:
      "Le résultat travaille-t-il avec ce que ce texte-ci contient — ses personnages, ses événements, ses motifs — ou pourrait-il avoir été produit pour n'importe quel texte ?",
  },
  {
    id: "instruction-compliance",
    label: "Respect de la consigne",
    question:
      "Le résultat fait-il ce que la tâche demandait — structure, cibles, exclusions — sans déborder sur ce qu'elle ne demandait pas ?",
  },
  {
    id: "specificity",
    label: "Précision des affirmations",
    question:
      "Les affirmations sont-elles précises et vérifiables contre le texte, ou générales au point de ne pouvoir être ni confirmées ni contredites ?",
  },
  {
    id: "internal-coherence",
    label: "Cohérence interne",
    question:
      "Le résultat est-il exempt de contradiction avec lui-même et avec le texte de référence ?",
  },
  {
    id: "coverage",
    label: "Couverture",
    question:
      "Le résultat couvre-t-il ce qui compte dans ce texte pour la tâche demandée, et quels sont ses angles morts ?",
  },
];

const CRITERION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Refuses a criteria set the contracts cannot be built from. A throw, not a
 * `Result`: criteria are authored code handed to the bench by its caller, so a
 * bad set is a call-site bug that would fail on every run (§7). The field path
 * names the id or the index, never the French text.
 */
export function assertBenchCriteria(criteria: readonly BenchCriterion[]): void {
  if (criteria.length === 0) {
    throw new InternalError({ message: "a bench run needs at least one criterion" });
  }

  const seen = new Set<string>();

  for (const [index, criterion] of criteria.entries()) {
    if (!CRITERION_ID_PATTERN.test(criterion.id)) {
      throw new InternalError({
        message: "a bench criterion id must be kebab-case",
        fieldPath: `criteria[${index}]`,
      });
    }

    if (seen.has(criterion.id)) {
      throw new InternalError({
        message: "two bench criteria share one id",
        fieldPath: criterion.id,
      });
    }

    seen.add(criterion.id);

    if (criterion.label.trim() === "" || criterion.question.trim() === "") {
      throw new InternalError({
        message: "a bench criterion needs its French label and question",
        fieldPath: criterion.id,
      });
    }
  }
}

/** The list as the judge reads it — one line per criterion, id first. */
export function criteriaLines(criteria: readonly BenchCriterion[]): readonly string[] {
  return criteria.map(
    (criterion) => `${criterion.id} — ${criterion.label} : ${criterion.question}`,
  );
}
