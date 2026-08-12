/**
 * The canon fact editor of a project's bible (CAL-098).
 *
 * The screen exists to make one thing easy that the data model makes hard: a
 * fact carries three independent dimensions — what is true in the world, when
 * it is true, and what each character holds about it — and the specification's
 * own example, *Nora ignore que son père est encore vivant*, is one row plus
 * one stance rather than one sentence. So the form asks the three questions in
 * the author's language and assembles the row itself, and the list shows each
 * fact the same way round.
 *
 * **The filters live in the URL** and are applied here, on the server. A
 * filtered view is therefore a link, and it narrows with JavaScript off — which
 * the bible screen's own search deliberately does not need to be, because it
 * searches six sections already on the page.
 *
 * **No `<Suspense>` boundary.** The ownership decision must run above any
 * boundary or Next locks the status to 200 before it can know the page 404s —
 * the trap `projects/[projectId]/page.tsx` documents and `tasks/lessons.md`
 * records.
 */

import {
  CANON_FACT_BELIEF_STATE_LABELS,
  CANON_FACT_BELIEF_STATES,
  CANON_FACT_CHAR_CEILINGS,
  CANON_FACT_STATEMENT_DEFECT_LABELS,
  checkCanonFactStatement,
  TIMELINE_PRECISION_LABELS,
  TIMELINE_PRECISIONS,
} from "@calepin/bible";
import {
  type BibleCanonFactRow,
  getBibleOverview,
  getProjectForOwner,
  openProjectScope,
} from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  CANON_FACT_SOURCE_LABELS,
  CANON_FACT_STATUS_LABELS,
  CANON_FACT_VALIDITY_LABELS,
} from "@/lib/bible-labels";
import {
  type CanonFactFilters,
  canonFactsPath,
  describeCanonFactWhen,
  hasCanonFactFilter,
  matchesCanonFactFilters,
  readCanonFactFilters,
} from "@/lib/canon-fact-edit";
import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import {
  deleteCanonFactAction,
  editCanonFactAction,
  lockCanonFactAction,
  setCanonFactStatusAction,
  unlockCanonFactAction,
  writeCanonFactAction,
} from "./actions";
import { CanonFactFilterForm } from "./canon-fact-filters";
import { CanonFactForm, EMPTY_CANON_FACT, type NamedRow } from "./canon-fact-form";
import { type CanonFactCardView,CanonFactList } from "./canon-fact-list";
import styles from "./page.module.css";

const PRECISION_OPTIONS = TIMELINE_PRECISIONS.map((value) => ({
  value,
  label: TIMELINE_PRECISION_LABELS[value],
}));

const STANCE_OPTIONS = CANON_FACT_BELIEF_STATES.map((value) => ({
  value,
  label: CANON_FACT_BELIEF_STATE_LABELS[value],
}));

export default async function CanonFactsPage({
  params,
  searchParams,
}: PageProps<"/projects/[projectId]/bible/facts">) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(canonFactsPath(projectId)));

  const [found, scope] = await Promise.all([
    getProjectForOwner({ ownerId: user.id, projectId }),
    openProjectScope({ ownerId: user.id, projectId }),
  ]);
  if (!found.ok || !scope.ok) notFound();

  const overview = await getBibleOverview(scope.value);
  const filters = readCanonFactFilters(await searchParams);

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href={`/projects/${projectId}/bible`}>← {found.value.title}, bible</Link>
      </p>

      <h1 className={styles.title}>Faits canoniques</h1>

      <p className={styles.intro}>
        Un fait s&rsquo;écrit à l&rsquo;affirmative, et se lit sur trois plans&nbsp;: ce qui est vrai
        dans le roman, à quel moment, et ce que chaque personnage en tient. C&rsquo;est ce qui
        permet à un personnage d&rsquo;ignorer sincèrement quelque chose que le lecteur, lui, sait
        déjà.
      </p>

      {overview === null ? (
        <p className={styles.empty}>
          Ce projet n&rsquo;a pas encore de bible&nbsp;: les faits s&rsquo;écriront une fois la bible
          ouverte.
        </p>
      ) : (
        <CanonFactsWorkspace
          projectId={projectId}
          filters={filters}
          cast={overview.characters.map((character) => ({
            id: character.id,
            name: character.name,
          }))}
          places={overview.places.map((place) => ({ id: place.id, name: place.name }))}
          events={overview.timeline.map((event) => ({ id: event.id, name: event.name }))}
          facts={overview.canonFacts}
        />
      )}
    </main>
  );
}

interface CanonFactsWorkspaceProps {
  readonly projectId: string;
  readonly filters: CanonFactFilters;
  readonly cast: readonly NamedRow[];
  readonly places: readonly NamedRow[];
  readonly events: readonly NamedRow[];
  readonly facts: readonly BibleCanonFactRow[];
}

/**
 * The rows shaped into what a card shows, then filtered.
 *
 * Every French word a fact is displayed with is resolved here rather than in
 * the card: a name for an id, a sentence for a temporal shape, a consequence
 * for a stance. The card renders; it decides nothing.
 */
function CanonFactsWorkspace({
  projectId,
  filters,
  cast,
  places,
  events,
  facts,
}: CanonFactsWorkspaceProps) {
  const nameOf = new Map([...cast, ...places, ...events].map((row) => [row.id, row.name]));

  const cards: readonly CanonFactCardView[] = facts.map((fact) => {
    const stances = fact.beliefs.map((belief) => ({
      characterId: belief.characterId,
      characterName: nameOf.get(belief.characterId) ?? "",
      state: belief.state,
    }));

    const subjectCharacterIds = fact.subjects
      .map((subject) => subject.characterId)
      .filter((id): id is string => id !== null);
    const subjectPlaceIds = fact.subjects
      .map((subject) => subject.placeId)
      .filter((id): id is string => id !== null);

    return {
      id: fact.id,
      statement: fact.statement,
      isTrue: fact.isTrue,
      validity: fact.validity,
      status: fact.status,
      statusLabel: CANON_FACT_STATUS_LABELS[fact.status],
      sourceLabel: CANON_FACT_SOURCE_LABELS[fact.source],
      whenLabel: describeCanonFactWhen(
        fact,
        fact.invalidatedByEventId === null
          ? null
          : (nameOf.get(fact.invalidatedByEventId) ?? null),
      ),
      validityLabel: CANON_FACT_VALIDITY_LABELS[fact.validity],
      lockedAt: fact.lockedAt,
      deletable: fact.source === "USER",
      stances,
      subjectNames: [...subjectCharacterIds, ...subjectPlaceIds].map(
        (id) => nameOf.get(id) ?? "",
      ),
      // Advice, never a refusal: `checkCanonFactStatement` under-fires by
      // design, and a detector that refused a save would be the one that gets
      // turned off (CLAUDE.md's own reading of it for this task).
      atomicityAdvice: [
        ...new Set(
          checkCanonFactStatement(fact.statement).map(
            (defect) => CANON_FACT_STATEMENT_DEFECT_LABELS[defect.kind],
          ),
        ),
      ],
      defaults: {
        statement: fact.statement,
        isTrue: fact.isTrue,
        validity: fact.validity,
        validFrom:
          fact.validFromDay === null && fact.validFromLabel === null
            ? null
            : {
                day: fact.validFromDay,
                precision: fact.validFromPrecision,
                label: fact.validFromLabel,
              },
        validUntil:
          fact.validUntilDay === null && fact.validUntilLabel === null
            ? null
            : {
                day: fact.validUntilDay,
                precision: fact.validUntilPrecision,
                label: fact.validUntilLabel,
              },
        invalidatedByEventId: fact.invalidatedByEventId,
        stances: Object.fromEntries(
          fact.beliefs.map((belief) => [belief.characterId, belief.state]),
        ),
        subjectCharacterIds,
        subjectPlaceIds,
      },
      characterIds: [...new Set([...subjectCharacterIds, ...stances.map((s) => s.characterId)])],
    };
  });

  const shown = cards.filter((card) => matchesCanonFactFilters(card, filters));

  return (
    <>
      <CanonFactFilterForm
        projectId={projectId}
        cast={cast}
        filters={filters}
        shownCount={shown.length}
        totalCount={cards.length}
      />

      <CanonFactList
        projectId={projectId}
        facts={shown}
        filtered={hasCanonFactFilter(filters)}
        cast={cast}
        places={places}
        events={events}
        precisions={PRECISION_OPTIONS}
        stances={STANCE_OPTIONS}
        statementCeiling={CANON_FACT_CHAR_CEILINGS.statement}
        boundLabelCeiling={CANON_FACT_CHAR_CEILINGS.boundLabel}
        editAction={editCanonFactAction}
        statusAction={setCanonFactStatusAction}
        lockAction={lockCanonFactAction}
        unlockAction={unlockCanonFactAction}
        deleteAction={deleteCanonFactAction}
      />

      <section className={styles.add} aria-label="Écrire un fait">
        <h2 className={styles.addTitle}>Écrire un fait</h2>

        <CanonFactForm
          projectId={projectId}
          cast={cast}
          places={places}
          events={events}
          precisions={PRECISION_OPTIONS}
          stances={STANCE_OPTIONS}
          statementCeiling={CANON_FACT_CHAR_CEILINGS.statement}
          boundLabelCeiling={CANON_FACT_CHAR_CEILINGS.boundLabel}
          defaults={EMPTY_CANON_FACT}
          submitLabel="Ajouter ce fait"
          action={writeCanonFactAction}
        />
      </section>
    </>
  );
}
