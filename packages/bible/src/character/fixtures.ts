/**
 * The material the character contract is proven against (CAL-090).
 *
 * Synthetic and short, per CLAUDE.md §8: four passages one ask offers, two
 * established characters, and one complete sheet whose every pair carries its
 * load-bearing half. None of it came from a user — what is under test is the
 * shape of a sheet, which needs sentences, not literature.
 *
 * A module rather than a copy in each test file, `identity/fixtures.ts`'s
 * reason; off `index.ts` — test material, not public surface.
 */

import type {
  CharacterRelationship,
  CharacterSheetInput,
  CharacterSource,
  ConflictedCharacterSheet,
  EstablishedCharacter,
  HeldKnowledgeEntry,
} from "./schema";

const DIRECTION_CAST: CharacterSource = {
  kind: "direction",
  key: "direction.charactersToIntroduce",
  label: "les personnages que la direction introduit",
  text: "Une éclusière qui tient le registre des passages, et dont le silence protège plus d'un trafic.",
};

const IDENTITY_TONE: CharacterSource = {
  kind: "identity",
  key: "identity.tone",
  label: "la tonalité établie par l'identité",
  text: "Sec et retenu, jusqu'à une dernière page qui cède.",
};

const STYLE_REGISTER: CharacterSource = {
  kind: "style",
  key: "style.languageRegister",
  label: "le registre légiféré par la section style",
  text: "Registre courant soutenu ; l'argot n'apparaît que dans les répliques du canal.",
};

const ANALYSIS_CHARACTERS: CharacterSource = {
  kind: "analysis",
  key: "analysis.characters",
  label: "les personnages relevés par l'analyse",
  text: "Blanche Aubry, éclusière, présente à chaque passage mais absente de tout aveu.",
};

/** The four passages one ask offers, one per source kind, in kind order. */
export function characterSources(): CharacterSource[] {
  return [DIRECTION_CAST, IDENTITY_TONE, STYLE_REGISTER, ANALYSIS_CHARACTERS];
}

/** One source, for the cases that need a concrete entry rather than the set. */
export function aSource(): CharacterSource {
  return DIRECTION_CAST;
}

/** The two characters already in the bible, distinct names, one line each. */
export function establishedCharacters(): EstablishedCharacter[] {
  return [
    {
      name: "Corentin Maillard",
      summary: "Le frère de Blanche, marinier, qui croit que le canal nourrit encore son monde.",
    },
    {
      name: "Élise Fougeray",
      summary: "L'ancienne associée du père, créancière patiente de la maison Aubry.",
    },
  ];
}

/** A complete, canonical ask — the name imposed, the brief given. */
export function aSheetInput(): CharacterSheetInput {
  return {
    sourceTextVersionId: "stv_1",
    directionId: "dir_1",
    characterName: "Blanche Aubry",
    importance: "MAIN",
    brief: "L'éclusière du registre : ce que sa loyauté coûte, et à qui.",
    freedomLevel: "BALANCED",
    establishedCharacters: establishedCharacters(),
    sources: characterSources(),
  };
}

/** One knowledge entry, for the cases that need one rather than the list. */
export function aKnowledgeEntry(): HeldKnowledgeEntry {
  return {
    statement: "Le registre des passages de la nuit du 14 a été recopié après coup.",
    stance: "knows",
  };
}

/** One outgoing edge, reaching the first established character. */
export function aRelationship(): CharacterRelationship {
  return {
    characterName: "Corentin Maillard",
    type: "FAMILY",
    label: "sœur aînée de",
    description: "Elle le tient pour le seul innocent du canal, et le protège sans le lui dire.",
  };
}

/** A complete sheet, every pair carrying its load-bearing half. */
export function aSheet(): ConflictedCharacterSheet {
  return {
    name: "Blanche Aubry",
    age: 47,
    role: "gardienne des passages et des silences du canal",
    appearance:
      "Des mains d'amarrage, plus vieilles que son visage ; on la reconnaît de loin à sa veste de toile passée au brou.",
    initialSituation:
      "Éclusière de Pont-Sévrin, elle tient seule le registre depuis la mort du père, et la maison doit encore sur trois campagnes.",
    apparentDesire: "Garder l'écluse et le registre, coûte que coûte, dans la famille Aubry.",
    deepNeed: {
      need: "Être déliée du serment fait au père, et cesser de payer ses dettes de silence.",
      divergence: "Chaque nuit passée à tenir l'écluse recopie le serment qu'il faudrait rompre.",
    },
    fear: "Que le registre parle avant elle, et que Corentin apprenne d'un autre ce qu'elle tait.",
    contradiction: {
      tension:
        "Elle veut protéger Corentin du canal tout en étant celle qui, chaque nuit, fait passer ce qui le condamne.",
      dilemma:
        "Dénoncer le trafic sauve Corentin mais livre la maison ; se taire garde la maison mais l'enfonce.",
    },
    secret:
      "C'est elle qui a recopié le registre la nuit du 14, pour couvrir le dernier passage du père.",
    past: "Fille d'éclusier, promise à l'école des Ponts puis rappelée au premier hiver de la maladie du père ; elle a appris le registre avant l'orthographe, et le silence avant le registre. La dette envers Fougeray date de cet hiver-là.",
    plannedArc:
      "De gardienne du silence à témoin : elle rompra le serment publiquement, au prix de l'écluse, et découvrira que Corentin savait déjà.",
    speechStyle: {
      voice:
        "Phrases courtes, au présent, sans subordonnées ; elle répond par les termes du registre — dates, tonnages, niveaux — et laisse tomber la fin des phrases qui l'engagent.",
      breach: "Une plainte, un aveu spontané, ou plus de deux phrases d'affilée.",
    },
    heldKnowledge: [
      aKnowledgeEntry(),
      {
        statement: "La dette de la maison Aubry envers Élise Fougeray est éteinte depuis deux ans.",
        stance: "unaware",
      },
      {
        statement: "Corentin ignore tout des passages de nuit.",
        stance: "believes-wrongly",
      },
      {
        statement: "Le père est mort en laissant l'écluse en règle.",
        stance: "denies",
      },
    ],
    elementsToPreserve: [
      "Le serment au père reste antérieur au roman et n'est jamais montré.",
      "Blanche ne ment jamais par affirmation, seulement par omission.",
    ],
    relationships: [
      aRelationship(),
      {
        characterName: "Élise Fougeray",
        type: "PROFESSIONAL",
        label: "débitrice de",
        description:
          "Elle la croit patiente par calcul, et la paie en silence autant qu'en argent.",
      },
    ],
  };
}
