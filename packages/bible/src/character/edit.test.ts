import { describe, expect, it } from "vitest";

import { CHARACTER_EDIT_LIST_MAX, parseCharacterContent } from "./edit";

/** Synthetic French written for this file (§8). */
function aSubmission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Corentin Maillard",
    age: 34,
    role: "ancien associé",
    importance: "SECONDARY",
    appearance: "une cicatrice à la tempe",
    initialSituation: "revient dans sa ville natale",
    apparentDesire: "récupérer sa maison",
    deepNeed: "être pardonné",
    fear: "être oublié",
    contradiction: "veut réparer et ne sait que fuir",
    secret: "il a menti sur la date de son retour",
    past: "a quitté la ville sans un mot, quinze ans plus tôt",
    plannedArc: "affronte enfin ce qu'il a fui",
    speechStyle: "phrases courtes, jamais un compliment direct",
    heldKnowledge: ["Sait : la maison a été vendue"],
    elementsToPreserve: ["son silence sur le départ"],
    ...overrides,
  };
}

describe("parseCharacterContent (CAL-097)", () => {
  it("accepts a complete submission", () => {
    const result = parseCharacterContent(aSubmission());

    expect(result.ok).toBe(true);
  });

  it("reduces an empty string to null on every nullable field", () => {
    const result = parseCharacterContent(
      aSubmission({ role: "", appearance: "   ", deepNeed: "" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.role).toBeNull();
      expect(result.value.appearance).toBeNull();
      expect(result.value.deepNeed).toBeNull();
    }
  });

  it("drops a blank line from a list rather than refusing it", () => {
    const result = parseCharacterContent(
      aSubmission({ heldKnowledge: ["Sait : la maison a été vendue", "   ", ""] }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.heldKnowledge).toEqual(["Sait : la maison a été vendue"]);
    }
  });

  it("accepts an empty list — every field but the name is optional", () => {
    const result = parseCharacterContent(
      aSubmission({ heldKnowledge: [], elementsToPreserve: [] }),
    );

    expect(result.ok).toBe(true);
  });

  it("refuses an empty name", () => {
    const result = parseCharacterContent(aSubmission({ name: "" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.userMessage).toBe("Le nom du personnage ne peut pas être vide.");
    }
  });

  it("refuses a negative age", () => {
    const result = parseCharacterContent(aSubmission({ age: -1 }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.userMessage).toBe(
        "L'âge doit être un nombre entier positif, ou laissé vide.",
      );
    }
  });

  it("accepts a null age", () => {
    const result = parseCharacterContent(aSubmission({ age: null }));

    expect(result.ok).toBe(true);
  });

  it("refuses an importance outside the enum", () => {
    const result = parseCharacterContent(aSubmission({ importance: "PROTAGONIST" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.userMessage).toBe("Choisissez une importance dans la liste proposée.");
    }
  });

  it("refuses a field past its ceiling", () => {
    const result = parseCharacterContent(aSubmission({ fear: "x".repeat(10_000) }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.userMessage).toBe(
        "Ce texte dépasse la longueur autorisée pour ce champ.",
      );
    }
  });

  it("refuses a list past its ceiling", () => {
    const tooMany = Array.from(
      { length: CHARACTER_EDIT_LIST_MAX.elementsToPreserve + 1 },
      (_, index) => `élément ${String(index)}`,
    );

    const result = parseCharacterContent(aSubmission({ elementsToPreserve: tooMany }));

    expect(result.ok).toBe(false);
  });

  it("refuses an unknown field — the sheet has exactly sixteen", () => {
    const result = parseCharacterContent(aSubmission({ relationships: [] }));

    expect(result.ok).toBe(false);
  });
});
