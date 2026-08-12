import { describe, expect, it } from "vitest";

import { CANON_FACT_CHAR_CEILINGS } from "./schema";
import {
  type CanonFactContent,
  canonFactContentSchema,
  parseCanonFactContent,
} from "./edit";

/**
 * A fact as the form submits it. Every field is spelled out rather than
 * spread from a base, so a test reads as the submission it stands for.
 */
function permanent(overrides: Partial<CanonFactContent> = {}): unknown {
  return {
    statement: "Le père de Nora est vivant.",
    isTrue: true,
    validity: "PERMANENT",
    validFrom: null,
    validUntil: null,
    invalidatedByEventId: null,
    beliefs: [],
    subjects: [],
    ...overrides,
  };
}

describe("parseCanonFactContent", () => {
  it("accepts an affirmative permanent fact with no bound", () => {
    const parsed = parseCanonFactContent(permanent());

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.validity).toBe("PERMANENT");
    expect(parsed.value.isTrue).toBe(true);
  });

  it("refuses an empty statement with a sentence naming the remedy", () => {
    const parsed = parseCanonFactContent(permanent({ statement: "   " }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.category).toBe("validation");
    expect(parsed.error.userMessage).toContain("ne peut pas être vide");
  });

  it("refuses a statement past its ceiling and says to split it", () => {
    const parsed = parseCanonFactContent(
      permanent({ statement: "a".repeat(CANON_FACT_CHAR_CEILINGS.statement + 1) }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.userMessage).toContain("plusieurs faits");
  });

  it("never quotes what was typed in the message it shows", () => {
    const parsed = parseCanonFactContent(permanent({ statement: "a".repeat(400) }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.userMessage).not.toContain("aaa");
    expect(parsed.error.message).not.toContain("aaa");
  });
});

describe("the three temporal shapes", () => {
  it("refuses a bound on a permanent fact", () => {
    const parsed = parseCanonFactContent(
      permanent({ validFrom: { day: 0, precision: "DAY", label: "l'ouverture" } }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.userMessage).toContain("Quand");
  });

  it("refuses an ending event on a permanent fact", () => {
    const parsed = parseCanonFactContent(permanent({ invalidatedByEventId: "event-1" }));

    expect(parsed.ok).toBe(false);
  });

  it("accepts a period placed by one bound only", () => {
    const parsed = parseCanonFactContent(
      permanent({
        validity: "DURING_PERIOD",
        validFrom: { day: -3_650, precision: "MONTH", label: "novembre 1998" },
      }),
    );

    expect(parsed.ok).toBe(true);
  });

  it("accepts a bound stated in the author's own words alone", () => {
    const parsed = parseCanonFactContent(
      permanent({
        validity: "DURING_PERIOD",
        validFrom: { day: null, precision: null, label: "l'hiver de l'accident" },
      }),
    );

    expect(parsed.ok).toBe(true);
  });

  it("refuses a period placed by nothing at all", () => {
    const parsed = parseCanonFactContent(permanent({ validity: "DURING_PERIOD" }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.userMessage).toContain("au moins un repère");
  });

  it("refuses a period that ends before it begins", () => {
    const parsed = parseCanonFactContent(
      permanent({
        validity: "DURING_PERIOD",
        validFrom: { day: 10, precision: "DAY", label: "le dixième jour" },
        validUntil: { day: 2, precision: "DAY", label: "le deuxième jour" },
      }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.userMessage).toContain("avant son début");
  });

  it("accepts a period that opens and closes on the same day", () => {
    const parsed = parseCanonFactContent(
      permanent({
        validity: "DURING_PERIOD",
        validFrom: { day: 4, precision: "DAY", label: "ce jour-là" },
        validUntil: { day: 4, precision: "DAY", label: "ce jour-là" },
      }),
    );

    expect(parsed.ok).toBe(true);
  });

  it("refuses an ending event on a period", () => {
    const parsed = parseCanonFactContent(
      permanent({
        validity: "DURING_PERIOD",
        validFrom: { day: null, precision: null, label: "le printemps" },
        invalidatedByEventId: "event-1",
      }),
    );

    expect(parsed.ok).toBe(false);
  });

  it("accepts a fact ended by an event", () => {
    const parsed = parseCanonFactContent(
      permanent({ validity: "UNTIL_EVENT", invalidatedByEventId: "event-1" }),
    );

    expect(parsed.ok).toBe(true);
  });

  it("refuses an ended fact that names no event", () => {
    const parsed = parseCanonFactContent(permanent({ validity: "UNTIL_EVENT" }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.userMessage).toContain("événement");
  });

  it("refuses an ended fact carrying a bound of its own", () => {
    const parsed = parseCanonFactContent(
      permanent({
        validity: "UNTIL_EVENT",
        invalidatedByEventId: "event-1",
        validUntil: { day: null, precision: null, label: "plus tard" },
      }),
    );

    expect(parsed.ok).toBe(false);
  });
});

describe("a bound's own pairing rule", () => {
  it("refuses a day with no precision", () => {
    const parsed = parseCanonFactContent(
      permanent({
        validity: "DURING_PERIOD",
        validFrom: { day: 12, precision: null, label: null },
      }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.userMessage).toContain("à quel point il est connu");
  });

  it("refuses a precision with no day", () => {
    const parsed = parseCanonFactContent(
      permanent({
        validity: "DURING_PERIOD",
        validFrom: { day: null, precision: "YEAR", label: "1998" },
      }),
    );

    expect(parsed.ok).toBe(false);
  });

  it("refuses a bound that states nothing", () => {
    const parsed = parseCanonFactContent(
      permanent({
        validity: "DURING_PERIOD",
        validFrom: { day: null, precision: null, label: null },
      }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.userMessage).toContain("doit dire quelque chose");
  });

  it("refuses a day further from the opening than the axis reaches", () => {
    const parsed = parseCanonFactContent(
      permanent({
        validity: "DURING_PERIOD",
        validFrom: { day: 4_000_000, precision: "YEAR", label: "très loin" },
      }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.userMessage).toContain("trop loin");
  });
});

describe("the third dimension — who holds what", () => {
  it("carries one stance per character", () => {
    const parsed = parseCanonFactContent(
      permanent({
        beliefs: [
          { characterId: "nora", state: "UNAWARE" },
          { characterId: "claire", state: "BELIEVES_TRUE" },
        ],
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.beliefs).toHaveLength(2);
  });

  it("refuses two stances from one character on one fact", () => {
    const parsed = parseCanonFactContent(
      permanent({
        beliefs: [
          { characterId: "nora", state: "UNAWARE" },
          { characterId: "nora", state: "BELIEVES_TRUE" },
        ],
      }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.userMessage).toContain("une seule position");
  });

  it("accepts a fact nobody holds a stance on — an absent row is not an UNAWARE", () => {
    const parsed = parseCanonFactContent(permanent({ beliefs: [] }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.beliefs).toEqual([]);
  });

  it("refuses a state outside the three the column holds", () => {
    // `KNOWS` is the member the schema deliberately does not have: knowing is
    // derived from a stance and the world, never stored beside `isTrue`.
    const parsed = parseCanonFactContent({
      ...(permanent() as Record<string, unknown>),
      beliefs: [{ characterId: "nora", state: "KNOWS" }],
    });

    expect(parsed.ok).toBe(false);
  });
});

describe("what a fact is about", () => {
  it("carries characters and places under their own kind", () => {
    const parsed = parseCanonFactContent(
      permanent({
        subjects: [
          { kind: "character", id: "nora" },
          { kind: "place", id: "maison" },
        ],
      }),
    );

    expect(parsed.ok).toBe(true);
  });

  it("accepts one character and one place sharing an identifier", () => {
    const parsed = parseCanonFactContent(
      permanent({
        subjects: [
          { kind: "character", id: "shared" },
          { kind: "place", id: "shared" },
        ],
      }),
    );

    expect(parsed.ok).toBe(true);
  });

  it("refuses the same subject named twice", () => {
    const parsed = parseCanonFactContent(
      permanent({
        subjects: [
          { kind: "character", id: "nora" },
          { kind: "character", id: "nora" },
        ],
      }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.userMessage).toContain("deux fois");
  });
});

describe("the contract's own shape", () => {
  it("is strict — an unexpected key is refused rather than dropped", () => {
    const parsed = parseCanonFactContent({
      ...(permanent() as Record<string, unknown>),
      source: "USER",
    });

    expect(parsed.ok).toBe(false);
  });

  it("refuses a status or a source chosen by the caller", () => {
    expect(canonFactContentSchema.safeParse({ ...(permanent() as object), status: "CONFIRMED" }).success).toBe(
      false,
    );
  });

  it("trims the statement rather than storing the whitespace around it", () => {
    const parsed = parseCanonFactContent(permanent({ statement: "  Nora a une sœur.  " }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.statement).toBe("Nora a une sœur.");
  });
});

/**
 * The specification's own three examples, written the way the screen asks for
 * them — the acceptance criterion CAL-018 was designed against and CAL-098 is
 * measured by.
 */
describe("the specification's three examples", () => {
  it("represents a negative fact about a place, affirmatively", () => {
    // « La maison ne possède pas de cave. » — affirmative statement, isTrue false.
    const parsed = parseCanonFactContent(
      permanent({
        statement: "La maison possède une cave.",
        isTrue: false,
        subjects: [{ kind: "place", id: "maison" }],
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.isTrue).toBe(false);
  });

  it("represents a fact one character is unaware of", () => {
    // « Nora ignore que son père est encore vivant. »
    const parsed = parseCanonFactContent(
      permanent({
        statement: "Le père de Nora est vivant.",
        isTrue: true,
        beliefs: [{ characterId: "nora", state: "UNAWARE" }],
        subjects: [{ kind: "character", id: "pere" }],
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.isTrue).toBe(true);
    expect(parsed.value.beliefs).toEqual([{ characterId: "nora", state: "UNAWARE" }]);
  });

  it("represents a dated fact placed by the author's own words", () => {
    // « L'accident s'est produit en novembre 1998. »
    const parsed = parseCanonFactContent(
      permanent({
        statement: "L'accident se produit en novembre 1998.",
        validity: "DURING_PERIOD",
        validFrom: { day: null, precision: null, label: "novembre 1998" },
      }),
    );

    expect(parsed.ok).toBe(true);
  });
});
