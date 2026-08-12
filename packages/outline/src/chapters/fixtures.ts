/**
 * The material the chapter-batch contract is proven against (CAL-102).
 *
 * Synthetic and short, per CLAUDE.md §8: one canonical ask for the middle
 * part of a three-part plan, one three-chapter answer that meets every bar —
 * function and consequence everywhere, distinct stakes, both revelation
 * anchors exercised, a full thread choreography under the assignment plan —
 * and the same ask moved to the final part, for the closure rules. None of
 * it came from a user — what is under test is the shape of a batch, which
 * needs sentences, not literature.
 *
 * A module rather than a copy in each test file, `parts/fixtures.ts`'s
 * reason; off `index.ts` — test material, not public surface.
 */

import type { ChapterOutlineBatch, ChapterOutlineBatchInput, PlannedChapter } from "./schema";

/**
 * A complete, canonical ask — the middle part (index 1 of 3) of the CAL-101
 * fixture's novel, 10 000 words, so the admissible chapter range is [2, 4].
 * Thread 0 is open and runs the whole novel; thread 1 is this part's to
 * open; thread 2 was opened and closed by part 0 and may not be touched.
 */
export function aChapterOutlineBatchInput(): ChapterOutlineBatchInput {
  return {
    bibleVersionNumber: 1,
    partId: "part_2",
    partIndex: 1,
    partCount: 3,
    partTitle: "Les comptes",
    partDramaticObjective:
      "Établir qui a organisé la ruine de l'atelier, et avec quel argent la dette de Meida a été rachetée.",
    partInitialState:
      "Meida enquête seule ; Horace lui ouvre les archives de l'atelier en croyant l'acheter.",
    partTippingPoint:
      "Meida découvre que sa propre dette a servi de garantie à la vente. Irréversible : elle est juridiquement complice de la ruine qu'elle voulait comprendre.",
    partFinalState:
      "Meida ne peut plus se dire spectatrice : rester, c'est couvrir la vente ; parler, c'est se dénoncer.",
    partTargetWordCount: 10_000,
    freedomLevel: "BALANCED",
    threads: [
      {
        label: "La dette de Meida",
        narrativePromise: "Ce que Meida doit aux Ferrand finira par se payer.",
        state: "open",
        assignedPartIndexes: [0, 1, 2],
      },
      {
        label: "L'atelier menacé",
        narrativePromise: "L'atelier tiendra ou tombera, et la ville avec lui.",
        state: "unopened",
        assignedPartIndexes: [1, 2],
      },
      {
        label: "Le portrait du contremaître",
        narrativePromise: "On saura qui a repeint le portrait, et pourquoi.",
        state: "closed",
        assignedPartIndexes: [0],
      },
    ],
    cast: [
      {
        name: "Meida",
        plannedArc:
          "De l'exécutante loyale à celle qui nomme publiquement ce que la famille a caché.",
      },
      { name: "Horace Ferrand", plannedArc: null },
    ],
    places: [
      {
        name: "L'atelier des Ferrand",
        description: "La grande halle aux verrières, à moitié vidée de ses machines.",
      },
      { name: "La maison du canal", description: null },
    ],
    canonFacts: [
      { factId: "fact_1", statement: "La dette de Meida a été rachetée par Horace Ferrand." },
      { factId: "fact_2", statement: "L'atelier est hypothéqué depuis trois ans." },
      { factId: "fact_3", statement: "Sauveur a signé la fresque après sa disparition." },
    ],
    precedingChapters: [
      {
        workingTitle: "Le retour",
        dramaticFunction: "Installer Meida en étrangère dans la ville qui l'a vue partir.",
        immediateGoal: "Obtenir le chantier de la fresque sans réveiller le contentieux.",
        consequence: "Meida obtient le chantier, mais sous la surveillance d'Horace.",
        summary:
          "Meida revient en ville pour restaurer la fresque ; la famille la tient à distance et personne ne prononce le nom de Sauveur.",
      },
      {
        workingTitle: "La signature",
        dramaticFunction: "Transformer le chantier en enquête par la découverte de la signature.",
        immediateGoal: "Dater la signature trouvée sous l'enduit de la fresque.",
        consequence: "Meida ne peut plus croire à l'accident ; les Ferrand savent qu'elle a vu.",
        summary:
          "Sous l'enduit, Meida met au jour la signature de Sauveur, datée d'après sa disparition ; elle décide de rester.",
      },
    ],
  };
}

/** The same ask moved to the last part — what the closure rules are proven against. */
export function aFinalPartInput(): ChapterOutlineBatchInput {
  const input = aChapterOutlineBatchInput();

  return {
    ...input,
    partId: "part_3",
    partIndex: 2,
    partTitle: "La rupture",
    threads: input.threads.map((thread) =>
      thread.label === "L'atelier menacé" ? { ...thread, state: "open" as const } : thread,
    ),
  };
}

const CHAPTERS: PlannedChapter[] = [
  {
    workingTitle: "Les archives",
    targetWordCount: 3_400,
    focalCharacterName: "Meida",
    presentCharacterNames: ["Meida", "Horace Ferrand"],
    placeName: "L'atelier des Ferrand",
    period: { startDay: 31, endDay: 33, precision: "DAY", label: "Trois jours de la mi-avril" },
    dramaticFunction: "Donner à Meida l'accès aux registres qui feront d'elle une complice.",
    immediateGoal: "Consulter les registres de l'atelier sans éveiller la méfiance d'Horace.",
    obstacle: "Horace n'ouvre les archives qu'en échange d'un rapport favorable sur la fresque.",
    decision: "Meida accepte le marché et signe le rapport qu'Horace attend.",
    revelation: {
      content: "La vente de l'atelier était déjà engagée avant le départ de Sauveur.",
      preparation: "La date portée sous la signature découverte dans « La signature ».",
      preparedByBatchChapterIndex: null,
      preparedByPrecedingChapterIndex: 1,
    },
    consequence: "Meida tient les registres, mais son nom figure désormais au bas d'un faux.",
    detailedSummary:
      "Meida négocie l'accès aux archives de l'atelier. Horace, persuadé de l'acheter, exige un rapport favorable sur l'état de la fresque ; elle le signe en connaissance de cause. Dans les registres, elle découvre que la vente était engagée avant même le départ de Sauveur, ce que la date de la signature laissait déjà entendre. Elle repart avec les livres de comptes, liée aux Ferrand par le faux qu'elle vient de signer.",
    opensThreadIndexes: [],
    continuesThreadIndexes: [0],
    closesThreadIndexes: [],
    factIndexes: [0],
  },
  {
    workingTitle: "L'hypothèque",
    targetWordCount: 3_300,
    focalCharacterName: "Horace Ferrand",
    presentCharacterNames: ["Horace Ferrand", "Meida"],
    placeName: null,
    period: { startDay: 34, endDay: 40, precision: "MONTH", label: "La fin d'avril" },
    dramaticFunction: "Montrer le prix que la famille paie pour tenir l'atelier debout.",
    immediateGoal: "Convaincre les créanciers de repousser l'échéance de l'hypothèque.",
    obstacle: "Le notaire exige une garantie nouvelle que la famille n'a plus.",
    decision: "Horace engage la fresque elle-même comme garantie, sans en parler à Meida.",
    revelation: null,
    consequence:
      "L'atelier gagne trois mois, mais la fresque appartient déjà à moitié aux banques.",
    detailedSummary:
      "Horace affronte les créanciers réunis à la maison du canal. L'hypothèque arrive à échéance et le notaire refuse tout délai sans garantie nouvelle. Horace engage la fresque, seul bien encore libre, et obtient trois mois. La menace sur l'atelier cesse d'être une rumeur pour devenir un compte à rebours daté.",
    opensThreadIndexes: [1],
    continuesThreadIndexes: [],
    closesThreadIndexes: [],
    factIndexes: [1, 2],
  },
  {
    workingTitle: "La garantie",
    targetWordCount: 3_300,
    focalCharacterName: "Meida",
    presentCharacterNames: ["Meida"],
    placeName: "La maison du canal",
    period: { startDay: 41, endDay: 45, precision: "DAY", label: "Les premiers jours de mai" },
    dramaticFunction: "Refermer le piège : l'enquête de Meida devient sa propre mise en cause.",
    immediateGoal: "Retrouver dans les livres de comptes l'origine du rachat de sa dette.",
    obstacle: "Les écritures ont été maquillées et renvoient à un prête-nom.",
    decision: "Meida recoupe les écritures avec le rapport qu'elle a signé, quitte à se dénoncer.",
    revelation: {
      content: "Sa propre dette a servi de garantie à la vente de l'atelier.",
      preparation: "Le rapport favorable signé contre l'accès aux archives dans « Les archives ».",
      preparedByBatchChapterIndex: 0,
      preparedByPrecedingChapterIndex: null,
    },
    consequence: "Meida est juridiquement complice de la ruine qu'elle voulait comprendre.",
    detailedSummary:
      "Seule à la maison du canal, Meida remonte les écritures maquillées des livres de comptes. Le prête-nom la ramène à sa propre dette : le rachat qu'elle croyait une faveur a servi de garantie à la vente de l'atelier, et le rapport qu'elle a signé au chapitre des archives en est la pièce maîtresse. Elle referme les livres en sachant que parler, désormais, c'est se dénoncer.",
    opensThreadIndexes: [],
    continuesThreadIndexes: [0, 1],
    closesThreadIndexes: [],
    factIndexes: [0, 1],
  },
];

/**
 * A complete three-chapter answer meeting every bar — in range for the
 * 10 000-word ask, summing to it exactly, every chapter carrying a function
 * and a consequence, both revelation anchors exercised, one null place.
 */
export function aChapterOutlineBatch(): ChapterOutlineBatch {
  return {
    chapters: CHAPTERS.map((chapter) => ({
      ...chapter,
      presentCharacterNames: [...chapter.presentCharacterNames],
      period: { ...chapter.period },
      revelation: chapter.revelation === null ? null : { ...chapter.revelation },
      opensThreadIndexes: [...chapter.opensThreadIndexes],
      continuesThreadIndexes: [...chapter.continuesThreadIndexes],
      closesThreadIndexes: [...chapter.closesThreadIndexes],
      factIndexes: [...chapter.factIndexes],
    })),
  };
}

/**
 * The final part's answer — the fixture batch reworked for `aFinalPartInput`:
 * thread 1 is already open there, so the middle chapter continues it instead
 * of opening it, and the last chapter closes everything still open, as the
 * closure rules demand of a last part.
 */
export function aClosingChapterOutlineBatch(): ChapterOutlineBatch {
  const batch = aChapterOutlineBatch();
  const middle = batch.chapters[1];
  const last = batch.chapters[batch.chapters.length - 1];

  if (middle === undefined || last === undefined) throw new Error("the fixture holds no chapter");

  middle.opensThreadIndexes = [];
  middle.continuesThreadIndexes = [1];
  last.continuesThreadIndexes = [];
  last.closesThreadIndexes = [0, 1];

  return batch;
}
