import { describe, expect, it } from "vitest";

import { detectSourceTextLanguage } from "./detect-source-text-language";

// Empirically checked against `franc-min` directly, not assumed: each
// paragraph is long enough for the trigram model to decide, and short enough
// to stay a synthetic fixture rather than anything resembling real prose
// (CLAUDE.md §8/§9).
const FRENCH =
  "La lumière du matin traversait les volets clos et venait mourir sur le " +
  "plancher de bois, tandis que le vieil homme se souvenait des étés passés " +
  "dans cette maison silencieuse au bord de la rivière.";
const ENGLISH =
  "The morning light filtered through the closed shutters and settled " +
  "quietly on the wooden floor, while the old man remembered the summers he " +
  "had spent long ago in this silent house beside the river.";
const SPANISH =
  "La luz de la mañana atravesaba las persianas cerradas y se posaba en " +
  "silencio sobre el suelo de madera, mientras el anciano recordaba los " +
  "veranos que había pasado hace mucho tiempo en aquella casa junto al río.";
const GERMAN =
  "Das Morgenlicht drang durch die geschlossenen Fensterläden und legte " +
  "sich still auf den Holzboden, während der alte Mann sich an die Sommer " +
  "erinnerte, die er vor langer Zeit in diesem stillen Haus am Fluss " +
  "verbracht hatte.";
const ITALIAN =
  "La luce del mattino filtrava attraverso le persiane chiuse e si posava " +
  "silenziosa sul pavimento di legno, mentre il vecchio ricordava le estati " +
  "trascorse tanto tempo fa in quella casa silenziosa vicino al fiume.";
// Portuguese: a real language `franc` recognises, but not one of the five
// the wizard offers — the "detected, but unsupported" case.
const PORTUGUESE =
  "A luz da manhã atravessava as persianas fechadas e pousava " +
  "silenciosamente no chão de madeira, enquanto o velho se lembrava dos " +
  "verões que passara há muito tempo naquela casa silenciosa junto ao rio.";

describe("detectSourceTextLanguage", () => {
  it.each([
    ["fr", FRENCH],
    ["en", ENGLISH],
    ["es", SPANISH],
    ["de", GERMAN],
    ["it", ITALIAN],
  ] as const)("detects %s", (expected, text) => {
    expect(detectSourceTextLanguage(text)).toBe(expected);
  });

  it("returns null for a language outside the five the wizard offers", () => {
    expect(detectSourceTextLanguage(PORTUGUESE)).toBeNull();
  });

  it("returns null for a text too short to classify", () => {
    expect(detectSourceTextLanguage("Bonjour")).toBeNull();
  });

  it("returns null for an empty text", () => {
    expect(detectSourceTextLanguage("")).toBeNull();
  });
});
