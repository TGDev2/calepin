/**
 * French labels for the four bible enums `@calepin/bible` does not already
 * export a table for — `CanonFactSource`, `CanonFactStatus`,
 * `CanonFactValidity` and `TimelineEventCategory`. The domain owns the ones
 * it has (`CHARACTER_IMPORTANCE_LABELS`, `TIMELINE_PRECISION_LABELS`,
 * `CANON_FACT_BELIEF_STATE_LABELS`...); these four are read-only display
 * words the consultation screen (CAL-096) needs today and the canon fact
 * editor (CAL-098) is the one to promote into the domain if it needs the
 * same words for a decision rather than a label.
 */

import type { BibleCanonFactRow, BibleTimelineEventRow } from "@calepin/shared/repository";

export const CANON_FACT_SOURCE_LABELS: Record<BibleCanonFactRow["source"], string> = {
  SOURCE_TEXT: "extrait du texte source",
  BIBLE: "dérivé de la bible",
  CHAPTER: "extrait d'un chapitre",
  USER: "saisi par vous",
};

export const CANON_FACT_STATUS_LABELS: Record<BibleCanonFactRow["status"], string> = {
  PROPOSED: "proposé",
  CONFIRMED: "confirmé",
  REJECTED: "écarté",
};

export const CANON_FACT_VALIDITY_LABELS: Record<BibleCanonFactRow["validity"], string> = {
  PERMANENT: "permanent",
  DURING_PERIOD: "vrai pendant une période",
  UNTIL_EVENT: "faux après un événement",
};

export const TIMELINE_EVENT_CATEGORY_LABELS: Record<BibleTimelineEventRow["category"], string> = {
  BACKSTORY: "antérieur au roman",
  NARRATED: "raconté",
  PLANNED: "prévu",
};
