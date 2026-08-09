/**
 * The French-typography corpus the word count is proven against (CAL-041).
 *
 * It is a shipped module rather than a test file on purpose: the unit parity
 * suite and the end-to-end spec must exercise the *same* strings. A corpus
 * copied into the browser test is a corpus that drifts, and the one assertion
 * this task exists to make — that the number a visitor watches equals the
 * number the server stores — is worthless if the two sides are fed different
 * text.
 *
 * Every entry is synthetic and technical (CLAUDE.md §9). None of it is prose,
 * none of it came from a user, and the tokens are deliberately meaningless:
 * what is under test is where a word boundary falls, which needs typography,
 * not literature.
 *
 * The characters the cases are actually about are named, never typed — four
 * are invisible and three more are indistinguishable from a character that
 * must behave differently. See `word-count.test.ts` for the same convention.
 */

const NBSP = String.fromCodePoint(0x00a0);
const NARROW_NBSP = String.fromCodePoint(0x202f);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const EN_DASH = String.fromCodePoint(0x2013);
const EM_DASH = String.fromCodePoint(0x2014);
const NON_BREAKING_HYPHEN = String.fromCodePoint(0x2011);
const TYPOGRAPHIC_APOSTROPHE = String.fromCodePoint(0x2019);
const ELLIPSIS = String.fromCodePoint(0x2026);

export interface WordCountFixture {
  /** What the case is about, in English — it reaches test names (CLAUDE.md §9). */
  readonly label: string;
  readonly text: string;
  readonly wordCount: number;
}

export const FRENCH_WORD_COUNT_FIXTURES: readonly WordCountFixture[] = [
  {
    label: "elisions and hyphenated compounds stay whole",
    text: `l${TYPOGRAPHIC_APOSTROPHE}alpha qu${TYPOGRAPHIC_APOSTROPHE}un rendez-vous arriere-grand-pere`,
    wordCount: 4,
  },
  {
    label: "a spaced dialogue dash is punctuation, not a word",
    // Three words: the dashes and the spaced `?` are standalone punctuation.
    text: `${EM_DASH} Alpha ?\n${EM_DASH} Beta, gamma.`,
    wordCount: 3,
  },
  {
    label: "a tight incise dash separates two words",
    text: `alpha${EM_DASH}beta gamma${EN_DASH}delta`,
    wordCount: 4,
  },
  {
    label: "guillemets with non-breaking spaces enclose the words they hold",
    text: `«${NBSP}alpha beta${NARROW_NBSP}» gamma${NARROW_NBSP}!`,
    wordCount: 3,
  },
  {
    label: "suspension points separate, in both spellings",
    text: `alpha${ELLIPSIS}beta gamma...delta epsilon${ELLIPSIS}`,
    wordCount: 5,
  },
  {
    label: "a zero-width space separates where whitespace does not",
    text: `alpha${ZERO_WIDTH_SPACE}beta gamma`,
    wordCount: 3,
  },
  {
    label: "a non-breaking hyphen joins, exactly like a hyphen",
    text: `rendez${NON_BREAKING_HYPHEN}vous alpha`,
    wordCount: 2,
  },
  {
    label: "decimals and years are one word each",
    text: "1789 3.14 1,5 alpha",
    wordCount: 4,
  },
  {
    label: "accented tokens count like any other",
    text: "elephant à côté déjà-vu",
    wordCount: 4,
  },
  {
    label: "a scene break made of punctuation counts nothing",
    text: `* * *\n${EM_DASH}\n${ELLIPSIS}\nalpha`,
    wordCount: 1,
  },
  {
    label: "a paragraph mixing every rule at once",
    // Seven: Alpha, s’exclama-t-il, Beta, gamma, repondit, l’autre, delta.
    // The dash, the spaced `!`, the guillemets and the lone comma are not.
    text: [
      `${EM_DASH} Alpha${NARROW_NBSP}! s${TYPOGRAPHIC_APOSTROPHE}exclama-t-il.`,
      `«${NBSP}Beta gamma${NBSP}», repondit l${TYPOGRAPHIC_APOSTROPHE}autre${ELLIPSIS}delta.`,
    ].join("\n"),
    wordCount: 7,
  },
];

/** The corpus as one text — the shape a textarea actually holds. */
export const FRENCH_WORD_COUNT_CORPUS = FRENCH_WORD_COUNT_FIXTURES.map(
  (fixture) => fixture.text,
).join("\n\n");

/** What `countWords` must answer for `FRENCH_WORD_COUNT_CORPUS`. */
export const FRENCH_WORD_COUNT_CORPUS_WORDS = FRENCH_WORD_COUNT_FIXTURES.reduce(
  (total, fixture) => total + fixture.wordCount,
  0,
);
