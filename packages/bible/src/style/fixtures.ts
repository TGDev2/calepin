/**
 * The material the style contract is proven against (CAL-089).
 *
 * Synthetic and short, per CLAUDE.md §8: three passages one ask offers, and
 * one complete style section whose every element is a rule paired with its
 * observable breach. None of it came from a user — what is under test is the
 * shape of a constraint, which needs sentences, not literature.
 *
 * A module rather than a copy in each test file, `identity/fixtures.ts`'s
 * reason; off `index.ts` — test material, not public surface.
 */

import type { BibleStyleInput, OperationalStyle, StyleConstraint, StyleSource } from "./schema";

const DIRECTION_TONE: StyleSource = {
  kind: "direction",
  key: "direction.narrativeVoice",
  label: "la voix narrative déclarée par la direction",
  text: "Une voix tenue à distance des personnages, qui constate plus qu'elle ne commente.",
};

const IDENTITY_TONE: StyleSource = {
  kind: "identity",
  key: "identity.tone",
  label: "la tonalité établie par l'identité",
  text: "Sec et retenu, jusqu'à une dernière page qui cède.",
};

const ANALYSIS_REGISTER: StyleSource = {
  kind: "analysis",
  key: "analysis.register",
  label: "le registre relevé par l'analyse",
  text: "Un français courant, sans archaïsme, que les dialogues tirent vers l'oral.",
};

/** The three passages one ask offers, direction then identity then analysis. */
export function styleSources(): StyleSource[] {
  return [DIRECTION_TONE, IDENTITY_TONE, ANALYSIS_REGISTER];
}

/** One source, for the cases that need a concrete entry rather than the set. */
export function aSource(): StyleSource {
  return DIRECTION_TONE;
}

/** A complete, canonical ask. */
export function aStyleInput(): BibleStyleInput {
  return {
    sourceTextVersionId: "stv_1",
    directionId: "dir_1",
    targetAudience: "Adultes, lecteurs de récits sombres",
    freedomLevel: "BALANCED",
    sources: styleSources(),
  };
}

/** One constraint, for the cases that need a pair rather than the section. */
export function aConstraint(): StyleConstraint {
  return {
    rule: "La narration reste au passé simple ; le présent n'apparaît que dans le dialogue.",
    violation: "Un verbe de narration au présent hors dialogue.",
  };
}

/** A complete style section, every element a rule paired with its breach. */
export function aStyle(): OperationalStyle {
  return {
    pointOfView: {
      rule: "Récit à la troisième personne, attaché à Anna seule ; aucune scène ne se déroule hors de sa présence.",
      violation: "Une scène où Anna n'est ni présente ni témoin.",
    },
    focalization: {
      rule: "La narration ne rapporte que ce qu'Anna perçoit ou déduit ; les pensées des autres restent des conjectures marquées comme telles.",
      violation: "Une pensée d'un autre personnage rapportée comme un fait.",
    },
    tense: aConstraint(),
    languageRegister: {
      rule: "Registre courant soutenu ; l'argot n'apparaît que dans les répliques du chantier.",
      violation: "Un mot d'argot dans la voix narrative.",
    },
    descriptiveDensity: {
      rule: "Une description ouvre chaque lieu nouveau en trois phrases au plus ; ensuite, le décor ne revient que porté par une action.",
      violation: "Un paragraphe descriptif sans action dans un lieu déjà décrit.",
    },
    pacing: {
      rule: "Les scènes de tension avancent par phrases de moins de quinze mots ; les accalmies peuvent s'étendre.",
      violation: "Une phrase de plus de vingt mots au cœur d'une scène de tension.",
    },
    dialogueBalance: {
      rule: "Le dialogue porte les décisions ; aucune scène n'excède la moitié de sa longueur en répliques.",
      violation: "Une scène dont plus de la moitié des lignes sont des répliques.",
    },
    recurringMotifs: [
      {
        rule: "Les mains abîmées reviennent dans chaque scène où Anna doute.",
        violation: "Une scène de doute sans mention des mains.",
      },
      {
        rule: "Le bruit de la rivière précède chaque décision irréversible.",
        violation: "Une décision irréversible prise sans que la rivière ait été entendue.",
      },
    ],
    elementsToAvoid: [
      {
        rule: "Aucune explication d'un sous-entendu déjà lisible dans la scène.",
        violation: "Une phrase qui reformule ce que le dialogue vient de montrer.",
      },
      {
        rule: "Pas plus d'un adjectif par nom dans la voix narrative.",
        violation: "Un nom flanqué de deux adjectifs ou plus hors dialogue.",
      },
      {
        rule: "Aucune métaphore météorologique pour un état intérieur.",
        violation: "Un sentiment décrit par un orage, une éclaircie ou une saison.",
      },
    ],
  };
}
