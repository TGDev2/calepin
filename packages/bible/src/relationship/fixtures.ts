/**
 * Synthetic material for the relationship suites (CAL-091).
 *
 * Original and short, never a real author's text (§8). The cast is the
 * character section's own, imported rather than restated, so a name that moves
 * moves in one place — and so the two sections' fixtures describe one bible
 * rather than two.
 *
 * The default graph is deliberately not tidy: it carries one `mutual` pair,
 * one `one-sided` pair and one `divergent` pair, which is what makes the
 * classification testable without each test building its own world.
 */

import { characterSources, establishedCharacters } from "../character/fixtures";
import type { CharacterSource, EstablishedCharacter } from "../character/schema";
import type {
  CharacterRelations,
  CharacterRelationsInput,
  DirectedRelationship,
  RelationshipAsymmetry,
} from "./schema";

/** The three characters the graph fixtures relate. */
export function aCast(): EstablishedCharacter[] {
  return [
    ...establishedCharacters(),
    { name: "Nadia Berthelot", summary: "L'archiviste qui a classé le dossier sans le lire." },
  ];
}

export function relationSources(): CharacterSource[] {
  return characterSources();
}

export function aRelationsInput(): CharacterRelationsInput {
  return {
    sourceTextVersionId: "stv_1",
    directionId: "dir_1",
    freedomLevel: "BALANCED",
    cast: aCast(),
    sources: relationSources(),
  };
}

/** The canonical asymmetry: the holder knows, the subject does not. */
export function anAsymmetry(): RelationshipAsymmetry {
  return {
    statement: "Le dossier classé nomme la mère de Nadia Berthelot.",
    holderStance: "knows",
    subjectStance: "unaware",
  };
}

export function aRelation(): DirectedRelationship {
  return {
    fromCharacterName: "Corentin Maillard",
    toCharacterName: "Élise Fougeray",
    type: "PROFESSIONAL",
    label: "ancien associé de",
    description: "Il lui doit la moitié de ce qu'il n'a jamais remboursé.",
    asymmetries: [],
  };
}

/**
 * One graph over `aCast()`:
 *
 * - Corentin ↔ Élise, both `PROFESSIONAL` — `mutual`;
 * - Corentin → Nadia, carrying the asymmetry, with nothing back — `one-sided`;
 * - Élise → Nadia `ALLIANCE` against Nadia → Élise `RIVALRY` — `divergent`.
 */
export function aGraph(): CharacterRelations {
  return {
    relations: [
      aRelation(),
      {
        fromCharacterName: "Élise Fougeray",
        toCharacterName: "Corentin Maillard",
        type: "PROFESSIONAL",
        label: "ancienne associée de",
        description: null,
        asymmetries: [],
      },
      {
        fromCharacterName: "Corentin Maillard",
        toCharacterName: "Nadia Berthelot",
        type: "FAMILY",
        label: "demi-frère de",
        description: "Il l'a reconnue sur une photographie, et n'en a rien dit.",
        asymmetries: [anAsymmetry()],
      },
      {
        fromCharacterName: "Élise Fougeray",
        toCharacterName: "Nadia Berthelot",
        type: "ALLIANCE",
        label: "alliée de",
        description: null,
        asymmetries: [],
      },
      {
        fromCharacterName: "Nadia Berthelot",
        toCharacterName: "Élise Fougeray",
        type: "RIVALRY",
        label: "rivale de",
        description: null,
        asymmetries: [],
      },
    ],
  };
}
