/**
 * One canon whose every fact holds, and the ask it answers.
 *
 * Never exported from the package: it exists so the suites around it can change
 * **one** thing and watch a check fire. Everything is French, short and
 * invented — §9 keeps a real novel out of this repository — and every quotation
 * below is genuinely a run of words in the passage it names, because that is the
 * property `verifyInitialCanonFacts` reads back and a fixture that faked it
 * would prove nothing.
 *
 * The statements are the canon's own wording and the quotations are the
 * corpus's, which is the normal case rather than a contrivance: the source text
 * says *n'a jamais possédé de cave* and the canon stores the affirmative
 * statement with its truth value set to false, exactly as `CanonFact`'s doc
 * comment requires.
 */

import type {
  CanonFactBeliefDeclaration,
  CanonFactBound,
  CanonFactSourceEntry,
  CanonFactSubjectDeclaration,
  EndedFact,
  InitialCanonFacts,
  InitialCanonFactsInput,
  PeriodFact,
  PermanentFact,
} from "./schema";
import { flattenCanonFacts } from "./verify";

const SOURCE_TEXT = [
  "Le manoir se dresse à Lyon, tout près du Rhône.",
  "Il compte douze pièces et n'a jamais possédé de cave.",
  "Madeleine y exerce la médecine depuis trente ans.",
  "Paul, son fils, enseigne au collège.",
  "Nora tient une librairie.",
].join(" ");

const CHARACTER_SECTION = [
  "Nora, fille de Madeleine et sœur de Paul.",
  "Elle vit seule au manoir depuis l'accident.",
  "Elle ignore que son père est encore en vie.",
].join(" ");

const WORLD_SECTION = [
  "Le manoir appartient à Madeleine.",
  "La clé du grenier ne quitte jamais sa poche.",
  "La maison est demeurée inhabitée entre l'accident et la vente.",
].join(" ");

const TIMELINE_SECTION = [
  "L'accident a lieu vingt ans avant l'ouverture du roman ; il coûte la vue à Paul.",
  "Madeleine habite le manoir jusqu'à sa vente.",
].join(" ");

/** The day the accident sits on, and the day the manor is sold. */
const ACCIDENT_DAY = -7_300;
const SALE_DAY = 400;

const ACCIDENT: CanonFactBound = {
  day: ACCIDENT_DAY,
  precision: "YEAR",
  label: "l'accident",
};

const SALE: CanonFactBound = { day: SALE_DAY, precision: "MONTH", label: "la vente" };

export function canonFactSources(): CanonFactSourceEntry[] {
  return [
    {
      kind: "source-text",
      key: "texte-source",
      label: "Texte source, ouverture",
      text: SOURCE_TEXT,
    },
    {
      kind: "character",
      key: "fiche-nora",
      label: "Fiche personnage : Nora",
      text: CHARACTER_SECTION,
    },
    { kind: "world", key: "monde", label: "Bible du monde", text: WORLD_SECTION },
    { kind: "timeline", key: "chronologie", label: "Chronologie", text: TIMELINE_SECTION },
  ];
}

export function anInitialCanonFactsInput(): InitialCanonFactsInput {
  return {
    sourceTextVersionId: "stv_1",
    directionId: "dir_1",
    freedomLevel: "BALANCED",
    cast: [
      { name: "Nora", summary: "Libraire, revenue au manoir après l'accident." },
      { name: "Paul", summary: "Son frère, professeur au collège." },
      { name: "Madeleine", summary: "Leur mère, médecin, propriétaire du manoir." },
    ],
    places: [
      { name: "le manoir", summary: "La maison de famille." },
      { name: "Lyon", summary: null },
    ],
    events: [
      {
        name: "l'accident",
        summary: "La collision qui coûte la vue à Paul.",
        absoluteDay: ACCIDENT_DAY,
        dateLabel: "vingt ans avant l'ouverture",
      },
      {
        name: "la vente du manoir",
        summary: "Madeleine se sépare de la maison de famille.",
        absoluteDay: SALE_DAY,
        dateLabel: "l'été qui suit",
      },
    ],
    knownFacts: [],
    sources: canonFactSources(),
  };
}

function about(...names: readonly string[]): CanonFactSubjectDeclaration[] {
  return names.map((name) => ({
    kind: name === "le manoir" || name === "Lyon" ? "place" : "character",
    name,
  }));
}

interface FactDraft {
  readonly statement: string;
  readonly isTrue?: boolean;
  readonly sourceKey: string;
  readonly quotation: string;
  readonly subjects?: readonly string[];
  readonly knownBy?: readonly CanonFactBeliefDeclaration[];
}

function permanent(draft: FactDraft): PermanentFact {
  return {
    statement: draft.statement,
    isTrue: draft.isTrue ?? true,
    basis: { sourceKey: draft.sourceKey, quotation: draft.quotation },
    subjects: about(...(draft.subjects ?? [])),
    knownBy: [...(draft.knownBy ?? [])],
  };
}

const PERMANENT_FACTS: readonly PermanentFact[] = [
  permanent({
    statement: "Le manoir possède une cave.",
    isTrue: false,
    sourceKey: "texte-source",
    quotation: "n'a jamais possédé de cave",
    subjects: ["le manoir"],
  }),
  permanent({
    statement: "Le manoir se dresse à Lyon.",
    sourceKey: "texte-source",
    quotation: "Le manoir se dresse à Lyon",
    subjects: ["le manoir", "Lyon"],
  }),
  permanent({
    statement: "Le manoir compte douze pièces.",
    sourceKey: "texte-source",
    quotation: "Il compte douze pièces",
    subjects: ["le manoir"],
  }),
  permanent({
    statement: "Lyon borde le Rhône.",
    sourceKey: "texte-source",
    quotation: "tout près du Rhône",
    subjects: ["Lyon"],
  }),
  permanent({
    statement: "Madeleine exerce la médecine.",
    sourceKey: "texte-source",
    quotation: "Madeleine y exerce la médecine",
    subjects: ["Madeleine"],
  }),
  permanent({
    statement: "Paul enseigne au collège.",
    sourceKey: "texte-source",
    quotation: "enseigne au collège",
    subjects: ["Paul"],
  }),
  permanent({
    statement: "Nora exerce le métier de libraire.",
    sourceKey: "texte-source",
    quotation: "Nora tient une librairie",
    subjects: ["Nora"],
  }),
  permanent({
    statement: "Nora est la fille de Madeleine.",
    sourceKey: "fiche-nora",
    quotation: "fille de Madeleine",
    subjects: ["Nora", "Madeleine"],
  }),
  permanent({
    statement: "Paul est le frère de Nora.",
    sourceKey: "fiche-nora",
    quotation: "sœur de Paul",
    subjects: ["Nora", "Paul"],
  }),
  permanent({
    statement: "Nora habite le manoir.",
    sourceKey: "fiche-nora",
    quotation: "Elle vit seule au manoir",
    subjects: ["Nora", "le manoir"],
  }),
  permanent({
    statement: "Le père de Nora reste en vie.",
    sourceKey: "fiche-nora",
    quotation: "son père est encore en vie",
    subjects: ["Nora"],
    knownBy: [
      { characterName: "Nora", state: "UNAWARE" },
      { characterName: "Madeleine", state: "BELIEVES_TRUE" },
    ],
  }),
  permanent({
    statement: "Madeleine possède le manoir.",
    sourceKey: "monde",
    quotation: "Le manoir appartient à Madeleine",
    subjects: ["Madeleine", "le manoir"],
  }),
  permanent({
    statement: "Madeleine garde la clé du grenier sur elle.",
    sourceKey: "monde",
    quotation: "La clé du grenier",
    subjects: ["Madeleine"],
  }),
  permanent({
    statement: "L'accident a coûté la vue à Paul.",
    sourceKey: "chronologie",
    quotation: "il coûte la vue à Paul",
    subjects: ["Paul"],
  }),
];

const PERIOD_FACTS: readonly PeriodFact[] = [
  {
    ...permanent({
      statement: "Nora vit seule.",
      sourceKey: "fiche-nora",
      quotation: "Elle vit seule au manoir",
      subjects: ["Nora"],
    }),
    validFrom: ACCIDENT,
    validUntil: null,
  },
  {
    ...permanent({
      statement: "Le manoir demeure inhabité.",
      sourceKey: "monde",
      quotation: "demeurée inhabitée",
      subjects: ["le manoir"],
    }),
    validFrom: ACCIDENT,
    validUntil: SALE,
  },
];

const ENDED_FACTS: readonly EndedFact[] = [
  {
    ...permanent({
      statement: "Madeleine habite le manoir.",
      sourceKey: "chronologie",
      quotation: "Madeleine habite le manoir",
      subjects: ["Madeleine", "le manoir"],
    }),
    endedByEventName: "la vente du manoir",
  },
];

/**
 * The position of a fact in the flattened order, found by what it says.
 *
 * A number typed in by hand would be right until a fact is inserted above it,
 * and then silently wrong; this throws instead, so a broken fixture reads as a
 * fixture failure rather than as a check that stopped firing.
 */
function factIndexOf(facts: InitialCanonFacts, statement: string): number {
  const at = flattenCanonFacts(facts).findIndex((fact) => fact.statement === statement);

  if (at < 0) throw new Error("the fixture no longer holds the fact a decomposition names");

  return at;
}

/** A canon whose quotations, names and bounds all hold. */
export function aCanonFacts(): InitialCanonFacts {
  const facts: InitialCanonFacts = {
    permanentFacts: PERMANENT_FACTS.map((fact) => ({ ...fact })),
    periodFacts: PERIOD_FACTS.map((fact) => ({ ...fact })),
    endedFacts: ENDED_FACTS.map((fact) => ({ ...fact })),
    decompositions: [],
  };

  return {
    ...facts,
    decompositions: [
      {
        // Composite three ways over: a temporal anchor, a coordination and a
        // second predication. Its parts are two facts of two different lists.
        composite: "Nora vit seule au manoir depuis l'accident.",
        factIndexes: [
          factIndexOf(facts, "Nora habite le manoir."),
          factIndexOf(facts, "Nora vit seule."),
        ],
      },
    ],
  };
}
