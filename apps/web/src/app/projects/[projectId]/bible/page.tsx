/**
 * The narrative bible, consulted whole (CAL-096).
 *
 * Lateral navigation across six sections, cross-cutting search and two
 * non-color indicators (lock, origin) — consultation only. Editing a
 * character sheet is CAL-097's, editing a canon fact is CAL-098's, the
 * coherence check is CAL-099's and validating the bible is CAL-100's; this
 * screen reads what `getBibleOverview` returns and nothing writes through
 * it, which is why there is no `actions.ts` beside it.
 *
 * **No `<Suspense>` boundary.** The ownership check must resolve before
 * anything renders or Next locks the response to 200 before it can know the
 * page 404s — the trap `relationships/page.tsx` already documents and
 * `tasks/lessons.md` records.
 *
 * All the narrative reading of the raw rows happens here, server-side,
 * because `@calepin/shared` may not import a domain (CLAUDE.md §3.2):
 * `orderTimelineEvents` (`@/lib/bible-timeline`, itself built on
 * `@calepin/bible`'s `resolveTimeline`), `describeWorldBounds`,
 * `bibleElementProvenanceState` / `canonFactProvenanceState`
 * (`@/lib/bible-provenance`) and the search index (`@/lib/bible-search`) all
 * run before the client component ever sees the data.
 */

import {
  CHARACTER_IMPORTANCE_LABELS,
  CHARACTER_RELATIONSHIP_TYPE_LABELS,
  describeWorldBounds,
} from "@calepin/bible";
import { getBibleOverview, getProjectForOwner, openProjectScope } from "@calepin/shared/repository";
import { notFound, redirect } from "next/navigation";

import {
  CANON_FACT_SOURCE_LABELS,
  CANON_FACT_STATUS_LABELS,
  CANON_FACT_VALIDITY_LABELS,
  TIMELINE_EVENT_CATEGORY_LABELS,
} from "@/lib/bible-labels";
import { bibleElementProvenanceState, canonFactProvenanceState } from "@/lib/bible-provenance";
import { buildBibleSearchIndex } from "@/lib/bible-search";
import { orderTimelineEvents } from "@/lib/bible-timeline";
import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import { BibleWorkspace } from "./bible-workspace";
import styles from "./page.module.css";
import type {
  CanonFactView,
  CharacterRelationshipView,
  CharacterView,
  PlaceView,
  TimelineEventView,
  WorldRuleView,
} from "./views";

export default async function BiblePage({ params }: PageProps<"/projects/[projectId]/bible">) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(`/projects/${projectId}/bible`));

  const [found, scope] = await Promise.all([
    getProjectForOwner({ ownerId: user.id, projectId }),
    openProjectScope({ ownerId: user.id, projectId }),
  ]);
  if (!found.ok || !scope.ok) notFound();

  const overview = await getBibleOverview(scope.value);

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <a href={`/projects/${projectId}`}>← {found.value.title}</a>
      </p>

      <h1 className={styles.title}>Bible narrative</h1>

      {overview === null ? (
        <p className={styles.empty}>
          Ce projet n&rsquo;a pas encore de bible : elle s&rsquo;écrira une fois l&rsquo;identité du
          roman définie.
        </p>
      ) : (
        <BibleWorkspaceData projectId={projectId} overview={overview} />
      )}
    </main>
  );
}

interface BibleWorkspaceDataProps {
  readonly projectId: string;
  readonly overview: NonNullable<Awaited<ReturnType<typeof getBibleOverview>>>;
}

/**
 * Splits the read from the shaping: everything above this line is a fetch,
 * everything below turns raw rows into what the client component renders —
 * kept in its own function so `BiblePage` stays a plain "check, fetch, hand
 * off" shell, `relationships/page.tsx`'s own division.
 */
function BibleWorkspaceData({ projectId, overview }: BibleWorkspaceDataProps) {
  const reviewedByAuthor = overview.validatedAt !== null;
  const characterNameOf = new Map(overview.characters.map((c) => [c.id, c.name]));
  const placeNameOf = new Map(overview.places.map((p) => [p.id, p.name]));
  const eventNameOf = new Map(overview.timeline.map((e) => [e.id, e.name]));

  const places: readonly PlaceView[] = overview.places.map((place) => ({
    ...place,
    provenance: bibleElementProvenanceState({
      origin: place.origin,
      bibleValidatedAt: overview.validatedAt,
    }),
  }));

  const worldRules: readonly WorldRuleView[] = overview.worldRules.map((rule) => ({
    ...rule,
    // describeWorldBounds's first line is "name — statement", already shown
    // by the card's own title and body; only the limit/cost/failure notices
    // that follow it are worth a second line.
    bounds: describeWorldBounds([{ ...rule }]).slice(1),
    provenance: bibleElementProvenanceState({
      origin: rule.origin,
      bibleValidatedAt: overview.validatedAt,
    }),
  }));

  const relationshipsByCharacter = new Map<string, CharacterRelationshipView[]>();
  for (const relationship of overview.relationships) {
    const list = relationshipsByCharacter.get(relationship.fromCharacterId) ?? [];
    list.push({
      id: relationship.id,
      toName: characterNameOf.get(relationship.toCharacterId) ?? "?",
      typeLabel: CHARACTER_RELATIONSHIP_TYPE_LABELS[relationship.type],
      label: relationship.label,
      description: relationship.description,
      lockedAt: relationship.lockedAt,
      provenance: bibleElementProvenanceState({
        origin: relationship.origin,
        bibleValidatedAt: overview.validatedAt,
      }),
    });
    relationshipsByCharacter.set(relationship.fromCharacterId, list);
  }

  const characters: readonly CharacterView[] = overview.characters.map((character) => ({
    ...character,
    importanceLabel: CHARACTER_IMPORTANCE_LABELS[character.importance],
    relationships: relationshipsByCharacter.get(character.id) ?? [],
    provenance: bibleElementProvenanceState({
      origin: character.origin,
      bibleValidatedAt: overview.validatedAt,
    }),
  }));

  const timeline: readonly TimelineEventView[] = orderTimelineEvents(overview.timeline).map(
    ({ event, day, toleranceDays }) => ({
      ...event,
      day,
      toleranceDays,
      categoryLabel: TIMELINE_EVENT_CATEGORY_LABELS[event.category],
      precedingEventName:
        event.precedingEventId === null ? null : (eventNameOf.get(event.precedingEventId) ?? null),
      participants: event.participants.map((participant) => ({
        characterName: characterNameOf.get(participant.characterId) ?? "?",
        declaredAge: participant.declaredAge,
      })),
      provenance: bibleElementProvenanceState({
        origin: event.origin,
        bibleValidatedAt: overview.validatedAt,
      }),
    }),
  );

  const canonFacts: readonly CanonFactView[] = overview.canonFacts.map((fact) => ({
    ...fact,
    sourceLabel: CANON_FACT_SOURCE_LABELS[fact.source],
    statusLabel: CANON_FACT_STATUS_LABELS[fact.status],
    validityLabel: CANON_FACT_VALIDITY_LABELS[fact.validity],
    subjectNames: fact.subjects.map((subject) =>
      subject.characterId !== null
        ? (characterNameOf.get(subject.characterId) ?? "?")
        : (placeNameOf.get(subject.placeId ?? "") ?? "?"),
    ),
    beliefs: fact.beliefs.map((belief) => ({
      characterName: characterNameOf.get(belief.characterId) ?? "?",
      state: belief.state,
    })),
    provenance: canonFactProvenanceState(fact),
  }));

  const searchIndex = buildBibleSearchIndex(overview, characterNameOf);

  return (
    <BibleWorkspace
      projectId={projectId}
      identity={
        overview.identity === null
          ? null
          : {
              ...overview.identity,
              provenance: bibleElementProvenanceState({
                origin: overview.identity.origin,
                bibleValidatedAt: overview.validatedAt,
              }),
            }
      }
      style={
        overview.style === null
          ? null
          : {
              ...overview.style,
              provenance: bibleElementProvenanceState({
                origin: overview.style.origin,
                bibleValidatedAt: overview.validatedAt,
              }),
            }
      }
      world={
        overview.world === null
          ? null
          : {
              ...overview.world,
              provenance: bibleElementProvenanceState({
                origin: overview.world.origin,
                bibleValidatedAt: overview.validatedAt,
              }),
            }
      }
      places={places}
      worldRules={worldRules}
      characters={characters}
      timeline={timeline}
      canonFacts={canonFacts}
      searchIndex={searchIndex}
      reviewedByAuthor={reviewedByAuthor}
    />
  );
}
