/**
 * Language detection for a source text (CAL-042) — the proposal a visitor
 * sees at project creation, never the value that gets stored: the wizard's
 * own manual choice always overrides it.
 *
 * `franc-min` rather than `franc`: this runs client-side, in the wizard, the
 * same isomorphic-pure-function shape `measureSourceText` already has, and
 * `franc-min` is the variant built for exactly that — a bundle trimmed to
 * the languages that matter, not the full ~400-language dataset.
 */

import { franc } from "franc-min";

/** The five languages the wizard's manual picker offers, ISO 639-1. */
export const SUPPORTED_SOURCE_TEXT_LANGUAGES = ["fr", "en", "es", "de", "it"] as const;

export type SupportedSourceTextLanguage = (typeof SUPPORTED_SOURCE_TEXT_LANGUAGES)[number];

/** `franc`'s ISO 639-3 codes for the same five languages. */
const ISO_639_3_TO_SUPPORTED: Readonly<Record<string, SupportedSourceTextLanguage>> = {
  fra: "fr",
  eng: "en",
  spa: "es",
  deu: "de",
  ita: "it",
};

/**
 * `null` when the text is too short for `franc` to decide (`"und"`) or when
 * it detects a language outside the five the wizard offers — both cases the
 * wizard treats the same way: propose nothing, leave the field to the
 * visitor.
 */
export function detectSourceTextLanguage(text: string): SupportedSourceTextLanguage | null {
  return ISO_639_3_TO_SUPPORTED[franc(text)] ?? null;
}
