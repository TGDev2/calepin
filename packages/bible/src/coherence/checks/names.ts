/**
 * *Personnage référencé et inexistant, lieu inexistant* (CAL-099).
 *
 * There is nothing structural left to find. Every reference the bible makes
 * through a column — a relationship's two ends, a participation, a fact's
 * subject, a fact's invalidating event — is a composite foreign key into the
 * same bible, so a dangling one is not a defect the data can hold. The only
 * place a name can be undeclared is prose: a fact's statement, a world rule, a
 * sheet field, an event's name.
 *
 * So this reads words, and it does it conservatively, because a detector that
 * cries wolf is turned off — CAL-093's rule, and CAL-094's after it. Four
 * filters, each of which is a way of being quiet:
 *
 * 1. a candidate never starts a sentence. French capitalises the first word of
 *    every sentence for position, not for being a name, and quotation marks and
 *    dashes open sentences too;
 * 2. a candidate is at least two letters and starts with an upper-case letter;
 * 3. a short list of civil titles, days and months is dropped outright;
 * 4. a candidate sharing **any** token with a declared character or place is
 *    declared. *Nora Vallin* is Nora's; matching on the whole phrase would
 *    report a character every time the bible gives her a surname.
 *
 * The residue is real: a country, a ship, an institution the world names in
 * passing. That residue is why the finding is `MAJOR` and never blocks — and
 * why it is bearable at all. A dismissal is written against the finding's
 * fingerprint, so the author ignores a name once and never sees it again, run
 * after run. The arbitration mechanism is what makes a heuristic check
 * acceptable here.
 *
 * One check rather than two: nothing in the data distinguishes an undeclared
 * person from an undeclared place, and inventing the distinction from the field
 * the name was found in would be a guess dressed as an answer. The sentence
 * names both possibilities and the author decides.
 */

import type { CoherenceFinding } from "@calepin/shared/coherence";
import { sameWords } from "@calepin/shared/text";

import { nameAnchor } from "../anchor";
import {
  BIBLE_PROSE_SOURCE_NAMES,
  describeUndeclaredName,
  describeUndeclaredNameFix,
} from "../copy";
import type { BibleCoherenceSubject, BibleProseSource } from "../subject";

const CHECK_ID = "bible-undeclared-name";

/**
 * Where one sentence ends and the next begins, for the purpose of *is this word
 * capitalised because of its position*.
 *
 * Quotation marks, dashes and brackets are boundaries too: a line of dialogue
 * opens with a capital exactly as a sentence does, and treating `«` as ordinary
 * punctuation is the single largest source of false positives this check could
 * have had.
 */
const SEGMENT_BOUNDARY = /[.!?;:\n\r…«»“”„–—()[\]{}]/u;

/** Every spelling of a hyphen a name can be typed with. */
const DASHES = "\\u002D\\u2010-\\u2015\\u2212";

/**
 * Letters and inner hyphens; an apostrophe splits, so *d'Éric* offers `Éric`.
 *
 * The dash class matters: a non-breaking hyphen inside *Sainte-Anne* would
 * otherwise split the name in two, and the two spellings would become two
 * findings the author has to dismiss separately.
 */
const TOKEN = new RegExp(`\\p{L}+(?:[${DASHES}]\\p{L}+)*`, "gu");

const UPPERCASE_INITIAL = /^\p{Lu}/u;

/**
 * The words that join two halves of a name. They are lower case, so they never
 * start a candidate; they only continue one that is already running.
 */
const NAME_PARTICLES = new Set([
  "de",
  "du",
  "des",
  "da",
  "del",
  "della",
  "di",
  "la",
  "le",
  "les",
  "van",
  "von",
  "ter",
  "ben",
  "bin",
  "al",
]);

/**
 * Capitalised words that are never a character and never a place.
 *
 * Short on purpose. Every entry is a word whose capitalisation is grammatical
 * or conventional rather than a name; anything else belongs to the residue the
 * author arbitrates, not to a list this file has to keep guessing at.
 */
const NEVER_A_NAME = new Set([
  "monsieur",
  "madame",
  "mademoiselle",
  "messieurs",
  "mesdames",
  "docteur",
  "docteure",
  "professeur",
  "maitre",
  "maître",
  "capitaine",
  "commandant",
  "lieutenant",
  "sergent",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
  "janvier",
  "fevrier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
  "décembre",
]);

/**
 * The identity of a candidate across occurrences and across runs.
 *
 * Identity only — it decides nothing. Whether a candidate *is* a declared name
 * is `sameWords`'s answer and no other, so there is no second folding rule able
 * to drift from the shared one (the trap CAL-012 recorded about a copied
 * schema, one layer up). This exists so *Nora* found in three sections is one
 * finding, and so its fingerprint survives a retyped apostrophe.
 */
function nameKey(tokens: readonly string[]): string {
  return tokens
    .join(" ")
    .normalize("NFC")
    .toLocaleLowerCase("fr")
    .replaceAll(/[‘’‛ʼ′´'`]/gu, "")
    .replaceAll(new RegExp(`[${DASHES}]`, "gu"), "-");
}

function tokenize(segment: string): readonly string[] {
  return segment.match(TOKEN) ?? [];
}

function declaredTokens(subject: BibleCoherenceSubject): readonly string[] {
  const names = [
    ...subject.characters.map((character) => character.name),
    ...subject.places.map((place) => place.name),
  ];

  const tokens: string[] = [];
  for (const name of names) {
    for (const token of tokenize(name)) {
      if (token.length < 2) continue;
      if (NAME_PARTICLES.has(token.toLocaleLowerCase("fr"))) continue;
      tokens.push(token);
    }
  }

  return tokens;
}

/** Every capitalised proper-noun candidate of one passage, sentence-initials excluded. */
export function extractNameCandidates(text: string): readonly (readonly string[])[] {
  const candidates: (readonly string[])[] = [];

  for (const segment of text.split(SEGMENT_BOUNDARY)) {
    const tokens = tokenize(segment);

    let index = 1;
    while (index < tokens.length) {
      const head = tokens[index];
      if (head === undefined || !UPPERCASE_INITIAL.test(head) || head.length < 2) {
        index += 1;
        continue;
      }

      const parts = [head];
      let cursor = index + 1;

      while (cursor < tokens.length) {
        const next = tokens[cursor];
        if (next === undefined) break;

        if (UPPERCASE_INITIAL.test(next) && next.length >= 2) {
          parts.push(next);
          cursor += 1;
          continue;
        }

        const after = tokens[cursor + 1];
        if (
          NAME_PARTICLES.has(next.toLocaleLowerCase("fr")) &&
          after !== undefined &&
          UPPERCASE_INITIAL.test(after)
        ) {
          parts.push(next, after);
          cursor += 2;
          continue;
        }

        break;
      }

      candidates.push(parts);
      index = cursor;
    }
  }

  return candidates;
}

interface UndeclaredName {
  readonly display: string;
  readonly key: string;
  readonly sources: Set<BibleProseSource>;
}

export function checkUndeclaredNames(subject: BibleCoherenceSubject): readonly CoherenceFinding[] {
  const declared = declaredTokens(subject);
  const isDeclared = (tokens: readonly string[]): boolean =>
    tokens.some((token) => declared.some((known) => sameWords(token, known)));

  const found = new Map<string, UndeclaredName>();

  for (const passage of subject.prose) {
    for (const tokens of extractNameCandidates(passage.text)) {
      const head = tokens[0];
      if (head === undefined) continue;
      if (NEVER_A_NAME.has(head.toLocaleLowerCase("fr"))) continue;
      if (isDeclared(tokens)) continue;

      const key = nameKey(tokens);
      const existing = found.get(key);
      if (existing === undefined) {
        found.set(key, { display: tokens.join(" "), key, sources: new Set([passage.source]) });
      } else {
        existing.sources.add(passage.source);
      }
    }
  }

  return [...found.values()].map((name) => ({
    checkId: CHECK_ID,
    category: "FACTUAL_CONTINUITY" as const,
    severity: "MAJOR" as const,
    anchor: [nameAnchor(name.key)],
    explanation: describeUndeclaredName(
      name.display,
      [...name.sources].map((source) => BIBLE_PROSE_SOURCE_NAMES[source]),
    ),
    proposedFix: describeUndeclaredNameFix(),
  }));
}
