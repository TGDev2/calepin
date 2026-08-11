/**
 * The eighteen mission identifiers (CLAUDE.md §4.2).
 *
 * They are this layer's vocabulary, and — with the port and the error types —
 * the one thing a domain is allowed to import from here (ADR-001). Kebab-case
 * verbs, per the naming rule; the `GenerationMission` Prisma enum spells the
 * same eighteen in SCREAMING_SNAKE because the column follows the schema's
 * convention, and `missions.test.ts` pins the two lists together so neither
 * can drift.
 *
 * `summarize-part` is the one CAL-055 added, and it is a separate mission
 * rather than a second use of `summarize-chapter` because §5.4 admits no
 * general-purpose prompt: compressing a part's arc out of its chapters'
 * summaries is a different instruction, a different input and a different
 * budget from summarising one chapter's prose. `detect-cliche-risks`
 * (CAL-075) is separate from `analyze-source-text` for the same reason: the
 * diagnostic names the slopes of the déjà-lu among seventeen concerns, while
 * the dedicated pass hunts them across four fronts with a passage and a
 * double argument per finding. `assess-novel-potential` (CAL-076) is the
 * third analysis-stage mission: it reads the validated analysis and appraises
 * what the text can sustain at the target length — a per-element judgement
 * against a word count, not a diagnosis. `regenerate-analysis-section`
 * (CAL-077) is the fourth, and the clearest case §5.4 has: it redoes **one**
 * section the author was not satisfied with, reading what that section
 * currently says and the word they added about what to do differently — an
 * instruction the seventeen-section diagnostic has no hole for and no reason
 * to grow one. `replace-direction` (CAL-083) is the same case in the direction
 * stage: `propose-directions` argues three directions against **each other**
 * and answers with exactly three, while a replacement answers with one and
 * argues it against three engines it may not reproduce — the discarded one's
 * and the two kept ones' — with the author's reason for the refusal in hand.
 * One prompt serving both would be the general-purpose prompt §5.4 refuses,
 * and would carry the wrong output cap and the wrong cost for either ask.
 * `combine-directions` (CAL-084) is separate again, and for a sharper reason
 * than count: its answer is a different *kind* — one merged direction under a
 * dominant source engine, **or** the argued declaration that the selected
 * elements exclude each other — an either/or no proposing prompt has a hole
 * for, judged by gates (`checkDirectionCombinationSelection`,
 * `checkDirectionCombinationAnswer`) that no other mission's answer meets.
 * `define-novel-identity` (CAL-088) opens the bible stage, and it is not a
 * first use of `create-character-sheet` for the reason that separates every
 * pair above: a character sheet invents a person the source text does not
 * fully contain, while the identity **transposes** — every field it writes
 * owes a passage of the canonical direction or of the validated analysis, and
 * its contract carries that basis on each one. One prompt serving both would
 * be asking for invention and for restraint in the same breath. `define-style`
 * (CAL-089) is the bible's second mission, and it is neither a second
 * rendering of `define-novel-identity` nor an early `write-scene`: the
 * identity transposes what the novel *is* under a citation obligation, while
 * the style section legislates how its prose *behaves* — every element a rule
 * paired with the observable breach of it, an instruction the identity prompt
 * has no hole for — and `write-scene` will be *held to* those constraints,
 * not asked to author them. `relate-characters` (CAL-091) is the bible's
 * fourth, and the separation from `create-character-sheet` is not a matter of
 * taste but of what the ask can *see*: a sheet is asked of one character, so
 * its answer declares that character's outgoing edges and nothing else, and no
 * amount of prompt could make it state that **A holds something about B that B
 * does not** — the asymmetry is a property of the pair, and one side of a pair
 * is not a place to put it. This mission is asked of the whole cast and
 * answers with the graph, which is also why its answer is judged by gates the
 * sheet's has no use for (`verifyCharacterRelations`,
 * `resolveRelationshipGraph`). Running the sheet prompt once per character and
 * unioning the results would produce a graph in which every edge was written
 * without its counterpart in view — precisely the graph the acceptance
 * criterion asks not to have.
 */

export const MISSION_IDS = [
  "analyze-source-text",
  "detect-cliche-risks",
  "assess-novel-potential",
  "regenerate-analysis-section",
  "propose-directions",
  "replace-direction",
  "evaluate-direction",
  "combine-directions",
  "define-novel-identity",
  "define-style",
  "create-character-sheet",
  "relate-characters",
  "build-chapter-outline",
  "write-scene",
  "extract-facts",
  "check-coherence",
  "fix-issue",
  "summarize-chapter",
  "summarize-part",
] as const;

export type MissionId = (typeof MISSION_IDS)[number];
