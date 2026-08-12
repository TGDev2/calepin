import { describe, expect, it } from "vitest";

import {
  CANON_FACT_FILTER_KEYS,
  describeCanonFactWhen,
  describeStance,
  hasCanonFactFilter,
  matchesCanonFactFilters,
  readCanonFactFilters,
  readCanonFactSubmission,
} from "./canon-fact-edit";

/** One submission, as the four guided blocks send it. */
function submission(entries: Readonly<Record<string, string | string[]>>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const one of value) formData.append(key, one);
      continue;
    }

    formData.set(key, value);
  }

  return formData;
}

describe("readCanonFactSubmission", () => {
  it("reads the specification's own example off the form", () => {
    const read = readCanonFactSubmission(
      submission({
        statement: "Le père de Nora est vivant.",
        isTrue: "true",
        validity: "PERMANENT",
        "belief:nora": "UNAWARE",
        subjectCharacter: "pere",
      }),
    );

    expect(read).toEqual({
      statement: "Le père de Nora est vivant.",
      isTrue: true,
      validity: "PERMANENT",
      validFrom: null,
      validUntil: null,
      invalidatedByEventId: null,
      beliefs: [{ characterId: "nora", state: "UNAWARE" }],
      subjects: [{ kind: "character", id: "pere" }],
    });
  });

  it("writes no stance for a character left unset", () => {
    const read = readCanonFactSubmission(
      submission({
        statement: "Un fait.",
        isTrue: "true",
        validity: "PERMANENT",
        "belief:nora": "",
        "belief:claire": "BELIEVES_TRUE",
      }),
    ) as { beliefs: unknown[] };

    // An absent row is weaker than an explicit UNAWARE, and the two must not
    // be conflated.
    expect(read.beliefs).toEqual([{ characterId: "claire", state: "BELIEVES_TRUE" }]);
  });

  it("reads a period's bounds only under the shape that uses them", () => {
    const read = readCanonFactSubmission(
      submission({
        statement: "Un fait.",
        isTrue: "true",
        validity: "PERMANENT",
        validFromLabel: "novembre 1998",
        invalidatedByEventId: "event-1",
      }),
    ) as { validFrom: unknown; invalidatedByEventId: unknown };

    expect(read.validFrom).toBeNull();
    expect(read.invalidatedByEventId).toBeNull();
  });

  it("reads a bound stated in words alone", () => {
    const read = readCanonFactSubmission(
      submission({
        statement: "Un fait.",
        isTrue: "true",
        validity: "DURING_PERIOD",
        validFromLabel: "novembre 1998",
        validFromDay: "",
        validFromPrecision: "",
      }),
    ) as { validFrom: unknown };

    expect(read.validFrom).toEqual({ day: null, precision: null, label: "novembre 1998" });
  });

  it("keeps a day with no precision rather than repairing it", () => {
    const read = readCanonFactSubmission(
      submission({
        statement: "Un fait.",
        isTrue: "true",
        validity: "DURING_PERIOD",
        validFromDay: "12",
        validFromPrecision: "",
      }),
    ) as { validFrom: unknown };

    // The schema is what refuses the pair, with a sentence naming the remedy.
    expect(read.validFrom).toEqual({ day: 12, precision: null, label: null });
  });

  it("reads a negative day, since the axis runs before the opening", () => {
    const read = readCanonFactSubmission(
      submission({
        statement: "Un fait.",
        isTrue: "true",
        validity: "DURING_PERIOD",
        validFromDay: "-3650",
        validFromPrecision: "MONTH",
      }),
    ) as { validFrom: { day: unknown } };

    expect(read.validFrom.day).toBe(-3_650);
  });

  it("reads the ending event under its own shape", () => {
    const read = readCanonFactSubmission(
      submission({
        statement: "Un fait.",
        isTrue: "false",
        validity: "UNTIL_EVENT",
        invalidatedByEventId: "event-1",
      }),
    ) as { invalidatedByEventId: unknown; isTrue: unknown };

    expect(read.invalidatedByEventId).toBe("event-1");
    expect(read.isTrue).toBe(false);
  });

  it("reads both kinds of subject under their own kind", () => {
    const read = readCanonFactSubmission(
      submission({
        statement: "Un fait.",
        isTrue: "true",
        validity: "PERMANENT",
        subjectCharacter: ["nora", "claire"],
        subjectPlace: ["maison"],
      }),
    ) as { subjects: unknown[] };

    expect(read.subjects).toEqual([
      { kind: "character", id: "nora" },
      { kind: "character", id: "claire" },
      { kind: "place", id: "maison" },
    ]);
  });
});

describe("describeStance", () => {
  it("reads not knowing apart from being wrong", () => {
    expect(describeStance(true, "UNAWARE")).toBe("l'ignore");
    expect(describeStance(false, "UNAWARE")).toBe("l'ignore");
  });

  it("flips with the fact's own truth", () => {
    expect(describeStance(true, "BELIEVES_TRUE")).toBe("le sait");
    expect(describeStance(false, "BELIEVES_TRUE")).toBe("se trompe");
    expect(describeStance(false, "BELIEVES_FALSE")).toBe("le sait");
    expect(describeStance(true, "BELIEVES_FALSE")).toBe("se trompe");
  });
});

describe("describeCanonFactWhen", () => {
  const permanent = {
    validity: "PERMANENT",
    validFromDay: null,
    validFromLabel: null,
    validUntilDay: null,
    validUntilLabel: null,
  } as const;

  it("says a permanent fact holds throughout", () => {
    expect(describeCanonFactWhen(permanent, null)).toBe("Vrai d'un bout à l'autre du roman.");
  });

  it("names the event that ends a fact", () => {
    expect(
      describeCanonFactWhen({ ...permanent, validity: "UNTIL_EVENT" }, "Le retour du père"),
    ).toBe("Vrai jusqu'à « Le retour du père ».");
  });

  it("prefers the author's own wording to the number", () => {
    expect(
      describeCanonFactWhen(
        {
          validity: "DURING_PERIOD",
          validFromDay: -3_650,
          validFromLabel: "novembre 1998",
          validUntilDay: null,
          validUntilLabel: null,
        },
        null,
      ),
    ).toBe("Vrai à partir de novembre 1998.");
  });

  it("falls back to the day when there is no wording", () => {
    expect(
      describeCanonFactWhen(
        {
          validity: "DURING_PERIOD",
          validFromDay: null,
          validFromLabel: null,
          validUntilDay: 12,
          validUntilLabel: null,
        },
        null,
      ),
    ).toBe("Vrai jusqu'au jour 12.");
  });

  it("contracts the preposition rather than writing « jusqu'à le »", () => {
    expect(
      describeCanonFactWhen(
        {
          validity: "DURING_PERIOD",
          validFromDay: 4,
          validFromLabel: null,
          validUntilDay: 12,
          validUntilLabel: null,
        },
        null,
      ),
    ).toBe("Vrai du jour 4 au jour 12.");
  });

  it("phrases a day before the opening as a distance", () => {
    expect(
      describeCanonFactWhen(
        {
          validity: "DURING_PERIOD",
          validFromDay: -30,
          validFromLabel: null,
          validUntilDay: 30,
          validUntilLabel: null,
        },
        null,
      ),
    ).toBe("Vrai de 30 jours avant l'ouverture au jour 30.");
  });
});

describe("the filters", () => {
  it("reads the three keys off the query string", () => {
    const filters = readCanonFactFilters({
      [CANON_FACT_FILTER_KEYS.character]: "nora",
      [CANON_FACT_FILTER_KEYS.period]: "DURING_PERIOD",
      [CANON_FACT_FILTER_KEYS.status]: "REJECTED",
    });

    expect(filters).toEqual({
      characterId: "nora",
      validity: "DURING_PERIOD",
      status: "REJECTED",
    });
    expect(hasCanonFactFilter(filters)).toBe(true);
  });

  it("reads a value outside its set as no filter at all", () => {
    const filters = readCanonFactFilters({
      [CANON_FACT_FILTER_KEYS.period]: "SOMETIMES",
      [CANON_FACT_FILTER_KEYS.status]: "MAYBE",
    });

    expect(filters.validity).toBeNull();
    expect(filters.status).toBeNull();
    expect(hasCanonFactFilter(filters)).toBe(false);
  });

  it("reads an empty query string as no filter", () => {
    expect(hasCanonFactFilter(readCanonFactFilters({}))).toBe(false);
  });

  it("keeps a fact a character is a subject of, and one that records their stance", () => {
    const filters = readCanonFactFilters({ [CANON_FACT_FILTER_KEYS.character]: "nora" });

    expect(
      matchesCanonFactFilters(
        { validity: "PERMANENT", status: "CONFIRMED", characterIds: ["nora"] },
        filters,
      ),
    ).toBe(true);
    expect(
      matchesCanonFactFilters(
        { validity: "PERMANENT", status: "CONFIRMED", characterIds: ["claire"] },
        filters,
      ),
    ).toBe(false);
  });

  it("applies the three filters together", () => {
    const filters = readCanonFactFilters({
      [CANON_FACT_FILTER_KEYS.character]: "nora",
      [CANON_FACT_FILTER_KEYS.period]: "PERMANENT",
      [CANON_FACT_FILTER_KEYS.status]: "CONFIRMED",
    });

    expect(
      matchesCanonFactFilters(
        { validity: "PERMANENT", status: "CONFIRMED", characterIds: ["nora"] },
        filters,
      ),
    ).toBe(true);
    expect(
      matchesCanonFactFilters(
        { validity: "UNTIL_EVENT", status: "CONFIRMED", characterIds: ["nora"] },
        filters,
      ),
    ).toBe(false);
    expect(
      matchesCanonFactFilters(
        { validity: "PERMANENT", status: "REJECTED", characterIds: ["nora"] },
        filters,
      ),
    ).toBe(false);
  });
});
