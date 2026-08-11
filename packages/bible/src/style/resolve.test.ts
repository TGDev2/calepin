import { describe, expect, it } from "vitest";

import { aStyle } from "./fixtures";
import { resolveBibleStyle, STYLE_VIOLATION_CONNECTOR } from "./resolve";
import { STYLE_SCALAR_FIELDS } from "./schema";

describe("resolveBibleStyle", () => {
  it("produces the nine BibleStyle columns, and no more", () => {
    const resolved = resolveBibleStyle(aStyle());

    expect(Object.keys(resolved).sort()).toEqual([
      "descriptiveDensity",
      "dialogueBalance",
      "elementsToAvoid",
      "focalization",
      "languageRegister",
      "pacing",
      "pointOfView",
      "recurringMotifs",
      "tense",
    ]);
  });

  it("flattens each scalar into its rule, the connector and its breach", () => {
    const style = aStyle();
    const resolved = resolveBibleStyle(style);

    for (const field of STYLE_SCALAR_FIELDS) {
      const pair = style[field];

      expect(resolved[field]).toBe(`${pair.rule} ${STYLE_VIOLATION_CONNECTOR} ${pair.violation}`);
    }
  });

  it("maps each list entrywise, preserving order and length", () => {
    const style = aStyle();
    const resolved = resolveBibleStyle(style);

    expect(resolved.recurringMotifs).toHaveLength(style.recurringMotifs.length);
    expect(resolved.elementsToAvoid).toHaveLength(style.elementsToAvoid.length);

    style.recurringMotifs.forEach((pair, index) => {
      expect(resolved.recurringMotifs[index]).toContain(pair.rule);
      expect(resolved.recurringMotifs[index]).toContain(pair.violation);
    });
    style.elementsToAvoid.forEach((pair, index) => {
      expect(resolved.elementsToAvoid[index]).toContain(pair.rule);
      expect(resolved.elementsToAvoid[index]).toContain(pair.violation);
    });
  });

  it("keeps the breach visible in every stored text", () => {
    // The connector is what CAL-107's context and CAL-139's checks will find
    // the violation clause by; a resolution that dropped it would flatten the
    // pair into exactly the free text the contract exists to refuse.
    const resolved = resolveBibleStyle(aStyle());
    const texts = [
      ...STYLE_SCALAR_FIELDS.map((field) => resolved[field]),
      ...resolved.recurringMotifs,
      ...resolved.elementsToAvoid,
    ];

    for (const text of texts) {
      expect(text).toContain(STYLE_VIOLATION_CONNECTOR);
    }
  });
});
