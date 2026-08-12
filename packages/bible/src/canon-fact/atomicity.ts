/**
 * Whether one canonical fact says one thing (CAL-094).
 *
 * The backlog puts atomicity first and says why: *un fait composé rend la
 * détection de contradiction impossible*. Every detector downstream — CAL-099's
 * internal coherence control, CAL-131's continuity checks, CAL-155's conflict
 * detection — compares facts pairwise, and nothing can contradict half of one.
 *
 * Nothing here reads a database, a clock or an environment: this is the rule,
 * and CLAUDE.md §8 asks that a rule be runnable without any of the three. It
 * takes a string and returns findings, so a model's answer, an author's own
 * wording (CAL-098) and a row read back out of `canon_facts` all satisfy it.
 *
 * **It is a report, and the caller chooses the regime.** `./verify` drops a
 * defective fact, because a model can be asked again. CAL-098 may show the same
 * finding to an author instead of refusing their sentence, and that difference
 * is exactly why this function returns findings rather than a `Result` — the
 * doctrine `checkFreedomCompliance` and `checkDirectionDivergence` established.
 *
 * **It under-fires on purpose.** Relative pronouns are deliberately not markers:
 * a restrictive relative identifies a referent rather than asserting a second
 * fact, and so does an apposition set off by commas. CAL-093's rule holds here —
 * *a detector that cries wolf is turned off, and then the requirement is lost
 * rather than met* — and the cost of a false positive is a legitimate fact
 * dropped, which is worse than a composite one surviving to be noticed by a
 * reader. What is banned is what smuggles a **second predication** or a
 * **temporal scope the contract carries in its own fields** into the statement.
 *
 * **CAL-018's warning, and why it does not forbid the negation marker.**
 * `CanonFact`'s doc comment records that *no CHECK can parse French negation,
 * and one that tried would reject valid sentences*. That is about a column
 * constraint over arbitrary author prose, and it is right. Here the statement is
 * a model answer produced under a prompt that demands the affirmative, the
 * marker is the one token written French negation always carries, and the
 * outcome is a finding rather than a refused write.
 */

/**
 * Two assertions welded into one sentence.
 *
 * *et* is the most valuable entry and the one most likely to look harsh: *le
 * manoir est grand et froid* is two facts, *Nora et Paul vivent à Lyon* is two
 * facts, and even *Nora et Paul sont frère et sœur* has an atomic form the
 * contract prefers. A proper name containing *et* would fire here, and that is
 * the price; the prompt names these words so the model avoids them.
 *
 * *or* is deliberately absent — it is also the noun *gold*.
 */
export const CANON_FACT_COORDINATION_MARKERS = [
  "et",
  "ou",
  "mais",
  "ni",
  "car",
  "donc",
  "puis",
  "ensuite",
  "ainsi que",
  "ainsi qu",
  "de plus",
] as const;

/**
 * A temporal scope inside the statement, where the contract carries it in
 * `validFrom`, `validUntil` and `endedByEventName`.
 *
 * This is the family the backlog's own composite example falls into, and the
 * one that does the most work: a fact scoped in its own prose is a fact no
 * detector can place on the day axis.
 *
 * The elided forms are listed beside the full ones because the reduction splits
 * at the apostrophe: *lorsqu'il* reduces to `lorsqu` + `il`, and a table holding
 * only *lorsque* would miss every elision.
 */
export const CANON_FACT_TEMPORAL_MARKERS = [
  "depuis",
  "avant",
  "après",
  "dès",
  "pendant",
  "jusqu",
  "quand",
  "lorsque",
  "lorsqu",
  "tandis que",
  "tandis qu",
  "alors que",
  "alors qu",
  "une fois",
] as const;

/**
 * A link between two facts, which is two facts and a claim about their
 * relation — three things where the canon stores one.
 *
 * Every entry is at most two tokens, so *à cause de* is listed as *à cause*:
 * the third token adds nothing and a three-token marker would need a longer
 * scan for no gain.
 */
export const CANON_FACT_CAUSAL_MARKERS = [
  "parce que",
  "parce qu",
  "puisque",
  "puisqu",
  "à cause",
  "grâce à",
  "afin de",
  "afin d",
  "de sorte",
  "si bien",
  "par conséquent",
] as const;

/**
 * A negation, where `CanonFact.isTrue` is what carries polarity.
 *
 * Short on purpose. *ne* and its elision are what written French negation
 * always carries, and the four quantifiers beside them cover the forms that
 * drop it. *pas* is absent because it is also the noun *step*; *plus* because it
 * is also the comparative; *personne* because it is also the noun *person*.
 * Each of those would report a negation in a sentence that has none.
 */
export const CANON_FACT_NEGATION_MARKERS = [
  "ne",
  "n",
  "aucun",
  "aucune",
  "jamais",
  "rien",
  "nul",
  "nulle",
] as const;

/**
 * What makes a statement carry more than one fact — a closed list, so a finding
 * is safe to log and safe to translate on screen (§9).
 *
 * Length is deliberately not one of them. A long statement is a long statement;
 * the schema's own character ceiling bounds it, and a word count is not evidence
 * that two assertions are present.
 */
export const CANON_FACT_STATEMENT_DEFECTS = [
  /** Two assertions joined: *et*, *ou*, *mais*, *ni*. */
  "coordination",
  /** A scope the contract carries in `validFrom` / `validUntil` / `endedByEventName`. */
  "temporal-clause",
  /** A link between two facts, which is two facts: *parce que*, *à cause de*. */
  "causal-clause",
  /** More than one sentence, or clauses welded by a semicolon or a colon. */
  "sentence-break",
  /** A negation, where the polarity belongs in `isTrue`. */
  "negation",
] as const;

export type CanonFactStatementDefectKind = (typeof CANON_FACT_STATEMENT_DEFECTS)[number];

/**
 * What each defect means, in the French the prompt quotes and the screen shows.
 *
 * Domain-owned copy, as `NARRATIVE_ENGINE_COPY` and
 * `CHARACTER_KNOWLEDGE_STANCE_LABELS` are: the author reads the same clause the
 * model was given, and neither is a restatement of the other.
 */
export const CANON_FACT_STATEMENT_DEFECT_LABELS: Readonly<
  Record<CanonFactStatementDefectKind, string>
> = {
  coordination: "deux affirmations réunies dans une seule phrase",
  "temporal-clause":
    "une portée temporelle énoncée dans la phrase au lieu d'être portée par le fait",
  "causal-clause": "un lien de cause entre deux faits, qui en fait deux faits et une relation",
  "sentence-break": "plus d'une phrase, ou deux propositions soudées par un point-virgule",
  negation: "une négation, alors que la polarité est portée par la valeur de vérité",
};

/**
 * One reason a statement is not atomic.
 *
 * `marker` is a member of one of the four declared tables, never a word lifted
 * out of the statement, which is what makes a finding safe to log — the
 * distinction `TimelineInconsistency` draws by carrying only positions.
 * `sentence-break` has no marker and writes the absence rather than eliding it
 * (CAL-077).
 */
export interface CanonFactStatementDefect {
  readonly kind: CanonFactStatementDefectKind;
  readonly marker: string | null;
  /** Where it sits, in words from the start of the statement. */
  readonly wordIndex: number;
}

/**
 * The reduction this checker reads statements through.
 *
 * It splits elisions where `createVerbatimMatcher` joins them, and that
 * difference is the point rather than an inconsistency: a quotation matcher must
 * treat *l'histoire* as one word, because that is how a reader reads it, while
 * this checker must see the `n'` in *n'est* and the `jusqu'` in *jusqu'à*.
 *
 * Hyphens are **not** split, for the symmetric reason: *après-midi* is one word
 * and splitting it would fire the temporal marker on a noun.
 *
 * Accents stay significant, as they do in `@calepin/shared/text` — and here that
 * is load-bearing rather than a convention inherited. Folding them would make
 * *dès* and the article *des* one token, and every statement in French would
 * report a temporal clause.
 */
const TOKEN = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;

function tokensOf(statement: string): readonly string[] {
  return [...statement.normalize("NFC").toLowerCase().matchAll(TOKEN)].map((match) => match[0]);
}

/**
 * Every marker, mapped to the kind it belongs to.
 *
 * Built once, from the four tables, and `atomicity.test.ts` pins that no marker
 * sits in two of them: a token belonging to two kinds would report one defect
 * twice under different names.
 */
const MARKER_KIND: ReadonlyMap<string, CanonFactStatementDefectKind> = new Map([
  ...CANON_FACT_COORDINATION_MARKERS.map((marker): [string, CanonFactStatementDefectKind] => [
    marker,
    "coordination",
  ]),
  ...CANON_FACT_TEMPORAL_MARKERS.map((marker): [string, CanonFactStatementDefectKind] => [
    marker,
    "temporal-clause",
  ]),
  ...CANON_FACT_CAUSAL_MARKERS.map((marker): [string, CanonFactStatementDefectKind] => [
    marker,
    "causal-clause",
  ]),
  ...CANON_FACT_NEGATION_MARKERS.map((marker): [string, CanonFactStatementDefectKind] => [
    marker,
    "negation",
  ]),
]);

/**
 * A sentence that has restarted: a terminal mark followed by a capital, or a
 * semicolon or colon anywhere.
 *
 * The capital is what keeps an abbreviated month or an initial from firing —
 * *le 12 nov. 1998* continues with a digit, and only a new sentence continues
 * with an upper-case letter.
 */
const SENTENCE_RESTART = /[.!?…]\s+\p{Lu}|[;:]/u;

/**
 * Whether the statement says more than one thing, and why.
 *
 * Findings come back ordered by position, so a caller showing the first one
 * shows the earliest. An atomic statement returns an empty array.
 */
export function checkCanonFactStatement(statement: string): readonly CanonFactStatementDefect[] {
  const tokens = tokensOf(statement);
  const defects: CanonFactStatementDefect[] = [];

  const trimmed = statement.trim().replace(/[.!?…]+$/u, "");

  if (SENTENCE_RESTART.test(trimmed)) {
    defects.push({ kind: "sentence-break", marker: null, wordIndex: 0 });
  }

  let index = 0;

  while (index < tokens.length) {
    const first = tokens[index];

    if (first === undefined) break;

    const second = tokens[index + 1];
    const pair = second === undefined ? null : `${first} ${second}`;

    // Longest match first: *alors que* is a marker where *alors* alone is not,
    // and matching the single token would miss it while matching both would
    // report the wrong kind.
    const pairKind = pair === null ? undefined : MARKER_KIND.get(pair);

    if (pair !== null && pairKind !== undefined) {
      defects.push({ kind: pairKind, marker: pair, wordIndex: index });
      index += 2;
      continue;
    }

    const kind = MARKER_KIND.get(first);

    if (kind !== undefined) {
      defects.push({ kind, marker: first, wordIndex: index });
    }

    index += 1;
  }

  return defects;
}

/** Whether the statement says one thing — the same rule, read as a predicate. */
export function isAtomicCanonFactStatement(statement: string): boolean {
  return checkCanonFactStatement(statement).length === 0;
}
