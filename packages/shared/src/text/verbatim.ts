/**
 * Is this quotation really in that text? (CAL-071)
 *
 * A model asked to support a claim with a passage of the author's own text can
 * hand back one that is not there — retyped, paraphrased, half-remembered or
 * simply invented. Nothing downstream can tell the difference by reading it: a
 * fabricated quotation is well-formed prose about the right subject, in the
 * right register. The only thing that separates it from a real one is the text
 * itself, so this is the comparison every "cite what supports it" rule has to
 * end in.
 *
 * It lives in `@calepin/shared` rather than in a domain for the reason
 * `countWords` does: nothing here knows what an analysis *is*. It is arithmetic
 * over text — the analysis asks it of a source text (CAL-071), `extract-facts`
 * will ask it of a chapter (CAL-089) and the coherence audit of a revision
 * (CAL-101) — and a domain may not import a domain (CLAUDE.md §3.2).
 *
 * **The comparison is over words, not over characters.** What separates a real
 * quotation from an invented one is which words are in it, in which order.
 * What separates a copied one from a retyped one is punctuation and the spacing
 * around it: a curly apostrophe, guillemets against straight quotes, the
 * non-breaking space French typography puts before a `?` and inside a `»`, an
 * em dash typed as a hyphen, a line break swallowed into a space, an ellipsis
 * spelled with three dots. Those differences are invisible on screen, every word
 * processor introduces them, and no model reproduces them reliably. So the text
 * and the quotation are both reduced to their sequence of words and one is
 * looked for inside the other.
 *
 * Accents survive that reduction, and so does the letter-by-letter spelling of
 * every word: `ou` is not `où`, and a model that wrote one for the other did
 * not copy the passage. A paraphrase changes a word, and a word is exactly what
 * this compares.
 *
 * Two things fall out of comparing sequences rather than substrings. A match
 * lands on word boundaries, so `pas` is not found inside `passage`. And a
 * quotation with a hole in it — `« il partit […] sans se retourner »` — is
 * refused, because the words either side of the hole are not adjacent in the
 * text. That refusal is deliberate: stitching fragments back together is how a
 * matcher starts finding passages nobody wrote.
 *
 * **A miss is the safe direction.** Every caller reacts to a miss by refusing to
 * present the quotation, so a comparison that is too strict costs a quotation
 * and a comparison that is too loose lets an invented one through.
 *
 * What this does *not* do is rewrite the quotation to the text's own spelling.
 * It answers whether the passage is there; the string a caller keeps is still
 * the one the model produced, punctuation and all.
 */

/**
 * The two character classes are built from `\u` escapes rather than from the
 * characters themselves, for the reason `countWords` gives: several members are
 * indistinguishable on screen from a character that must behave differently,
 * and a class nobody can review is a class nobody notices the loss of.
 */
function classOf(escapes: string): RegExp {
  return new RegExp(`[${escapes}]`, "gu");
}

/**
 * Removed outright rather than treated as a boundary: they are invisible, they
 * are routinely pasted in from a word processor, and they sit *inside* words —
 * a soft hyphen in the middle of `car­net` must not split it. The four
 * `countWords` names, plus the soft hyphen and the byte-order mark.
 */
const INVISIBLE = classOf("\\u00AD\\u200B-\\u200D\\u2060\\uFEFF");

/**
 * Every spelling of the apostrophe folded onto the typewriter one: typographic,
 * reversed, the modifier letter some keyboards produce, the prime, the acute
 * accent and the backtick. The French elision is the single most common
 * character difference between a passage as the author stored it and the same
 * passage as a model retypes it, and the apostrophe is *inside* the word —
 * `l'histoire` is one word — so it has to be folded rather than ignored.
 */
const APOSTROPHES = classOf("\\u2018\\u2019\\u201B\\u02BC\\u2032\\u00B4`");

/**
 * Hyphen, dashes and the minus sign folded onto the hyphen-minus, for the same
 * reason: `rendez-vous` is one word, and the tight incise `hésita—longtemps` is
 * routinely retyped with a plain hyphen. A *spaced* dash — the one that opens a
 * line of French dialogue — is a boundary either way, since nothing joins
 * across a space.
 */
const DASHES = classOf("\\u2010-\\u2015\\u2212");

/**
 * A word: letters and digits, and the two characters that join two of them when
 * nothing separates them. It is the reading `countWords` already takes of
 * French — `l'histoire` and `rendez-vous` are one word each — and everything
 * else in the text, punctuation and whitespace alike, is what falls between two
 * of these.
 */
const WORD = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu;

function wordsOf(text: string): readonly string[] {
  const folded = text
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(APOSTROPHES, "'")
    .replace(DASHES, "-")
    .toLowerCase();

  return folded.match(WORD) ?? [];
}

/**
 * The words as one searchable string, padded either side.
 *
 * The padding is what makes a match land on a word boundary: without it,
 * `pas` would be found inside `passage` and a one-word quotation would be
 * supported by any text that happens to contain it as a prefix.
 */
function sequenceOf(words: readonly string[]): string {
  return ` ${words.join(" ")} `;
}

/** Answers whether one quotation is verbatim in the text the matcher was built on. */
export type VerbatimMatcher = (quotation: string) => boolean;

/**
 * A matcher over one text.
 *
 * A factory rather than a two-argument function because the text is the
 * expensive side and it is asked about many times: a source text runs to
 * 200 000 words and an analysis carries up to seventy elements, so reducing it
 * per element would be seventy passes over a megabyte. Here it is one, and the
 * closure is what makes that impossible to get wrong at a call site.
 *
 * A quotation holding no word at all — empty, or nothing but the marks a model
 * wraps a citation in — supports nothing, and is answered `false` rather than
 * matching every text there is.
 */
export function createVerbatimMatcher(text: string): VerbatimMatcher {
  const haystack = sequenceOf(wordsOf(text));

  return (quotation: string): boolean => {
    const words = wordsOf(quotation);

    return words.length > 0 && haystack.includes(sequenceOf(words));
  };
}
