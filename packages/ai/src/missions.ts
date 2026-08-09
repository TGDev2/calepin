/**
 * The ten mission identifiers (CLAUDE.md §4.2).
 *
 * They are this layer's vocabulary, and — with the port and the error types —
 * the one thing a domain is allowed to import from here (ADR-001). Kebab-case
 * verbs, per the naming rule; the `GenerationMission` Prisma enum spells the
 * same ten in SCREAMING_SNAKE because the column follows the schema's
 * convention, and `missions.test.ts` pins the two lists together so neither
 * can drift.
 */

export const MISSION_IDS = [
  "analyze-source-text",
  "propose-directions",
  "evaluate-direction",
  "create-character-sheet",
  "build-chapter-outline",
  "write-scene",
  "extract-facts",
  "check-coherence",
  "fix-issue",
  "summarize-chapter",
] as const;

export type MissionId = (typeof MISSION_IDS)[number];
