/**
 * `bench-synthesize-comparison` — the argued conclusion of a comparison run
 * (CAL-059).
 *
 * This judge never sees an output. It reads what the pairwise passes
 * established — the merged per-criterion verdicts, stable or order-dependent,
 * and the per-case overall arguments with their legends — and returns the one
 * thing counting cannot produce: an argued recommendation. Counting is done in
 * code (`bench/run.ts` tallies verdicts and labels them as counts); deciding
 * what the verdicts *mean* is a judgement, and a deterministic threshold here
 * would be the arbitrary score the specification forbids, wearing a rule's
 * clothes.
 *
 * Keeping the version in place is the stated default: the bench exists to stop
 * a regression before adoption, and a change that did not establish its worth
 * is a change not adopted — not a coin toss.
 */

import type { PromptDefinition } from "../types";

const V1 = {
  id: "bench-synthesize-comparison",
  version: 1,
  scope: { kind: "bench" },
  variables: [
    {
      name: "missionIntent",
      type: "text",
      description: "French statement of what the compared prompt makes the mission produce.",
    },
    {
      name: "caseCount",
      type: "number",
      description: "How many corpus cases the comparison ran on, failures included.",
    },
    {
      name: "criteria",
      type: "list",
      description: "One line per criterion: its id, its French label and the question it asks.",
    },
    {
      name: "caseVerdicts",
      type: "list",
      description:
        "One line per case, built by the bench: the merged verdicts in baseline/candidate terms, instability and technical failures named as such.",
    },
    {
      name: "caseArguments",
      type: "list",
      description:
        "The overall arguments of each blinded pass, prefixed by case id and a legend mapping réponse 1/2 to the versions for that pass.",
    },
  ],
  system: [
    "Tu synthétises une comparaison entre deux versions d'un même prompt : la version en place et une version candidate, évaluées à l'aveugle sur un jeu de textes de référence.",
    "Tu écris en français.",
    "Tu ne produis jamais de note ni de score. Ta recommandation doit être argumentée à partir des jugements rendus, en citant les cas par leur identifiant.",
    "Un jugement instable — rendu différemment selon l'ordre de présentation des réponses — n'est pas un signal : il compte comme une absence de différence établie.",
    "Garder la version en place est la conclusion par défaut : ne recommande l'adoption de la candidate que si les jugements stables l'établissent.",
  ].join("\n"),
  instruction: [
    "Voici la tâche que le prompt comparé fait accomplir :",
    "{{missionIntent}}",
    "",
    "Critères utilisés :",
    "{{criteria}}",
    "",
    "Jugements par cas, sur {{caseCount}} cas — rendus stables, signalés instables, ou échecs techniques :",
    "{{caseVerdicts}}",
    "",
    "Arguments des jugements d'ensemble, par cas et par passe, avec leur légende :",
    "{{caseArguments}}",
    "",
    "Rends une recommandation : adopter la version candidate, garder la version en place, ou constater qu'aucune différence n'est établie.",
    "Argumente-la en citant les cas par leur identifiant et les critères où une différence stable est établie. Quand la version que tu ne recommandes pas fait quelque chose de mieux, nomme-le explicitement.",
    "Liste ensuite les réserves : ce que cette comparaison ne permet pas de conclure — jugements instables, échecs techniques, étroitesse du jeu de textes — sans en inventer.",
    "",
    "Réponds uniquement par l'objet JSON demandé, sans texte avant ni après.",
  ].join("\n"),
} as const satisfies PromptDefinition;

export const BENCH_SYNTHESIZE_COMPARISON_PROMPTS = [V1] as const;
