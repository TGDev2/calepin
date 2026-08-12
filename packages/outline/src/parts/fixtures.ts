/**
 * The material the part-structure contract is proven against (CAL-101).
 *
 * Synthetic and short, per CLAUDE.md §8: one canonical ask at the STANDARD
 * length and one four-part answer that meets every bar — distinct stakes, a
 * concrete tipping point per part, states that differ, three threads each
 * braided through at least two parts. None of it came from a user — what is
 * under test is the shape of a découpage, which needs sentences, not
 * literature.
 *
 * A module rather than a copy in each test file, `identity/fixtures.ts`'s
 * reason; off `index.ts` — test material, not public surface.
 */

import type { PartStructure, PartStructureInput, PartThread, PlannedPart } from "./schema";

/** The three threads the fixture braids, each concerned by at least two parts. */
export function partThreads(): PartThread[] {
  return [
    {
      label: "La dette de Meida",
      narrativePromise:
        "Ce que Meida doit aux Ferrand finira par se payer, d'une manière ou d'une autre.",
    },
    {
      label: "L'atelier menacé",
      narrativePromise: "L'atelier tiendra ou tombera, et la ville avec lui.",
    },
    {
      label: "Le frère disparu",
      narrativePromise: "On saura ce qu'est devenu Sauveur, et pourquoi il est parti.",
    },
  ];
}

/** A complete, canonical ask — the STANDARD midpoint, so the range is [3, 5]. */
export function aPartStructureInput(): PartStructureInput {
  return {
    directionId: "dir_1",
    bibleVersionNumber: 1,
    targetWordCount: 65_000,
    freedomLevel: "BALANCED",
    sources: [
      {
        kind: "direction",
        key: "direction.developedPremise",
        label: "la prémisse développée de la direction canonique",
        text: "Une restauratrice de fresques revient dans la ville minière de son enfance pour un dernier chantier, et découvre que l'effondrement annoncé de l'atelier familial n'a rien d'un accident.",
      },
      {
        kind: "identity",
        key: "identity.centralQuestion",
        label: "la question centrale de l'identité",
        text: "Que vaut une loyauté qui exige de se taire ?",
      },
    ],
    characters: [
      {
        name: "Meida",
        plannedArc:
          "De l'exécutante loyale à celle qui nomme publiquement ce que la famille a caché.",
      },
      { name: "Horace Ferrand", plannedArc: null },
    ],
    plannedEvents: [
      {
        name: "La vente de l'atelier",
        summary: "La signature qui doit tout clore, prévue au dernier tiers.",
      },
      { name: "Le retour de Sauveur", summary: null },
    ],
  };
}

const PARTS: PlannedPart[] = [
  {
    title: "Le chantier",
    dramaticObjective:
      "Obtenir le chantier de la fresque sans réveiller le contentieux qui oppose Meida aux Ferrand.",
    initialState:
      "Meida revient en ville en étrangère : l'atelier vivote, la famille la tient à distance polie, et personne ne prononce le nom de Sauveur.",
    tippingPoint: {
      event:
        "Sous l'enduit de la fresque, Meida met au jour la signature de Sauveur, datée d'après sa disparition.",
      irreversibility: "Meida ne peut plus croire à l'accident ; le chantier devient une enquête.",
    },
    finalState:
      "Meida reste, non plus pour la fresque mais pour comprendre ; les Ferrand savent désormais qu'elle a vu la signature.",
    threadIndexes: [0, 2],
  },
  {
    title: "Les comptes",
    dramaticObjective:
      "Établir qui a organisé la ruine de l'atelier, et avec quel argent la dette de Meida a été rachetée.",
    initialState:
      "Meida enquête seule ; Horace lui ouvre les archives de l'atelier en croyant l'acheter, et la ville la prend pour une alliée des Ferrand.",
    tippingPoint: {
      event:
        "Meida découvre dans les registres que sa propre dette a servi de garantie à la vente de l'atelier.",
      irreversibility: "Elle est juridiquement complice de la ruine qu'elle voulait comprendre.",
    },
    finalState:
      "Meida ne peut plus se dire spectatrice : rester, c'est couvrir la vente ; parler, c'est se dénoncer elle-même.",
    threadIndexes: [0, 1],
  },
  {
    title: "La rupture",
    dramaticObjective:
      "Choisir entre le silence qui protège la famille et la parole qui condamne l'atelier — et Meida avec lui.",
    initialState:
      "Horace presse la signature ; Sauveur, revenu en secret, demande à Meida de se taire encore, le temps de mettre les ouvriers à l'abri.",
    tippingPoint: {
      event:
        "Devant le notaire assemblé, Meida refuse de signer et lit à voix haute la page des registres.",
      irreversibility:
        "Le pacte de silence de la famille est rompu publiquement ; la vente est nulle.",
    },
    finalState:
      "L'atelier est saisi, la famille éclatée ; Meida, ruinée mais déliée, attend le procès aux côtés des ouvriers.",
    threadIndexes: [0, 1, 2],
  },
  {
    title: "Ce qui se répare",
    dramaticObjective:
      "Décider ce que Meida reconstruit — la fresque, l'atelier ou sa place dans la ville — maintenant que la vérité est publique.",
    initialState:
      "Le procès a rendu l'atelier aux ouvriers mais l'a laissé exsangue ; Sauveur vit au grand jour et la ville se divise sur ce que Meida a fait.",
    tippingPoint: {
      event:
        "Les ouvriers confient à Meida la restauration de la fresque, contre l'avis des Ferrand restants.",
      irreversibility:
        "La ville a choisi : la fresque ne sera plus l'œuvre des Ferrand, mais celle de l'atelier.",
    },
    finalState:
      "La fresque restaurée porte les deux signatures ; Meida repart, quitte envers la ville et envers elle-même.",
    threadIndexes: [1, 2],
  },
];

/** A complete four-part answer meeting every bar — in range for the STANDARD ask. */
export function aPartStructure(): PartStructure {
  return {
    threads: partThreads(),
    parts: PARTS.map((part) => ({
      ...part,
      tippingPoint: { ...part.tippingPoint },
      threadIndexes: [...part.threadIndexes],
    })),
  };
}
