/**
 * The fifteen mission identifiers (CLAUDE.md §4.2).
 *
 * They are this layer's vocabulary, and — with the port and the error types —
 * the one thing a domain is allowed to import from here (ADR-001). Kebab-case
 * verbs, per the naming rule; the `GenerationMission` Prisma enum spells the
 * same fifteen in SCREAMING_SNAKE because the column follows the schema's
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
 */

export const MISSION_IDS = [
  "analyze-source-text",
  "detect-cliche-risks",
  "assess-novel-potential",
  "regenerate-analysis-section",
  "propose-directions",
  "replace-direction",
  "evaluate-direction",
  "create-character-sheet",
  "build-chapter-outline",
  "write-scene",
  "extract-facts",
  "check-coherence",
  "fix-issue",
  "summarize-chapter",
  "summarize-part",
] as const;

export type MissionId = (typeof MISSION_IDS)[number];
