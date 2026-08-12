/**
 * The shapes the bible screen renders — each one a repository row plus the
 * display-only facts `page.tsx` derives from it (a label, a provenance
 * state, a resolved name). Kept apart from `@calepin/shared/repository`'s own
 * types because those describe what is stored, not what a screen shows.
 */

import type { ProvenanceState } from "@calepin/shared/provenance";
import type {
  BibleCanonFactRow,
  BibleCharacterRow,
  BibleIdentityRow,
  BiblePlaceRow,
  BibleStyleRow,
  BibleTimelineEventRow,
  BibleWorldRow,
  BibleWorldRuleRow,
} from "@calepin/shared/repository";

export interface IdentityView extends BibleIdentityRow {
  readonly provenance: ProvenanceState;
}

export interface StyleView extends BibleStyleRow {
  readonly provenance: ProvenanceState;
}

export interface WorldView extends BibleWorldRow {
  readonly provenance: ProvenanceState;
}

export interface PlaceView extends BiblePlaceRow {
  readonly provenance: ProvenanceState;
}

export interface WorldRuleView extends BibleWorldRuleRow {
  /** The limit/cost/failure notices only — `describeWorldBounds`'s own
   * "name — statement" heading is dropped, already shown by the card. */
  readonly bounds: readonly string[];
  readonly provenance: ProvenanceState;
}

export interface CharacterRelationshipView {
  readonly id: string;
  readonly toName: string;
  readonly typeLabel: string;
  readonly label: string;
  readonly description: string | null;
  readonly lockedAt: Date | null;
  readonly provenance: ProvenanceState;
}

export interface CharacterView extends BibleCharacterRow {
  readonly importanceLabel: string;
  readonly relationships: readonly CharacterRelationshipView[];
  readonly provenance: ProvenanceState;
}

export interface TimelineParticipantView {
  readonly characterName: string;
  readonly declaredAge: number | null;
}

export interface TimelineEventView extends Omit<BibleTimelineEventRow, "participants"> {
  readonly day: number | null;
  readonly toleranceDays: number;
  readonly categoryLabel: string;
  readonly precedingEventName: string | null;
  readonly participants: readonly TimelineParticipantView[];
  readonly provenance: ProvenanceState;
}

export interface CanonFactBeliefView {
  readonly characterName: string;
  readonly state: BibleCanonFactRow["beliefs"][number]["state"];
}

export interface CanonFactView extends Omit<BibleCanonFactRow, "beliefs"> {
  readonly sourceLabel: string;
  readonly statusLabel: string;
  readonly validityLabel: string;
  readonly subjectNames: readonly string[];
  readonly beliefs: readonly CanonFactBeliefView[];
  readonly provenance: ProvenanceState;
}
