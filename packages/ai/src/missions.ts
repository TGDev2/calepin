/**
 * The thirteen mission identifiers (CLAUDE.md §4.2).
 *
 * They are this layer's vocabulary, and — with the port and the error types —
 * the one thing a domain is allowed to import from here (ADR-001). Kebab-case
 * verbs, per the naming rule; the `GenerationMission` Prisma enum spells the
 * same thirteen in SCREAMING_SNAKE because the column follows the schema's
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
 * against a word count, not a diagnosis.
 */

export const MISSION_IDS = [
  "analyze-source-text",
  "detect-cliche-risks",
  "assess-novel-potential",
  "propose-directions",
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
