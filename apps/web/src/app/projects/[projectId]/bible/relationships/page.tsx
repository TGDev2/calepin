/**
 * The relationship network of a project's bible (CAL-091).
 *
 * The screen exists to make one thing visible that a list of relationships
 * cannot: a tie is **directed**, and the interesting state is the one where
 * the two directions disagree — or where only one of them exists. So the page
 * is organised by *pair* rather than by relationship, each pair carrying its
 * classification, and each direction shown on its own line with its own
 * side-specific text.
 *
 * The classification is `@calepin/bible`'s (`resolveRelationshipGraph`), not
 * this file's: it is a narrative reading of the rows, and the interface layer
 * holds no business rule (§3.3). The French sentences it produces are the
 * domain's too, and they are the same ones the writing prompt quotes.
 *
 * **No `<Suspense>` boundary.** The ownership decision must run above any
 * boundary or Next locks the status to 200 before it can know the page 404s —
 * the trap `projects/[projectId]/page.tsx` documents and `tasks/lessons.md`
 * records.
 */

import {
  CHARACTER_LABEL_CHAR_CEILING,
  CHARACTER_RELATIONSHIP_TYPE_LABELS,
  CHARACTER_RELATIONSHIP_TYPES,
  describeSymmetry,
  RELATIONSHIP_CHAR_CEILINGS,
  RELATIONSHIP_SYMMETRY_LABELS,
  resolveRelationshipGraph,
} from "@calepin/bible";
import {
  type BibleCastMember,
  type BibleRelationship,
  getProjectForOwner,
  getRelationshipGraph,
  openProjectScope,
} from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import {
  deleteRelationshipAction,
  editRelationshipAction,
  writeRelationshipAction,
} from "./actions";
import styles from "./page.module.css";
import { AddRelationshipForm, EditRelationshipForm } from "./relationship-editor";
import { RelationshipNetwork } from "./relationship-network";

const TYPE_OPTIONS = CHARACTER_RELATIONSHIP_TYPES.map((value) => ({
  value,
  label: CHARACTER_RELATIONSHIP_TYPE_LABELS[value],
}));

export default async function RelationshipsPage({
  params,
}: PageProps<"/projects/[projectId]/bible/relationships">) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(`/projects/${projectId}/bible/relationships`));

  const [found, scope] = await Promise.all([
    getProjectForOwner({ ownerId: user.id, projectId }),
    openProjectScope({ ownerId: user.id, projectId }),
  ]);
  if (!found.ok || !scope.ok) notFound();

  const graph = await getRelationshipGraph(scope.value);

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href={`/projects/${projectId}`}>← {found.value.title}</Link>
      </p>

      <h1 className={styles.title}>Réseau des personnages</h1>

      <p className={styles.intro}>
        Chaque lien est écrit d&rsquo;un seul côté. Quand un personnage tient quelque chose de
        l&rsquo;autre sans que l&rsquo;autre le tienne de lui, le lien reste à sens unique :
        c&rsquo;est une asymétrie, pas un oubli, et c&rsquo;est ce que la rédaction et le contrôle
        de cohérence liront.
      </p>

      {graph === null ? (
        <p className={styles.empty}>
          Ce projet n&rsquo;a pas encore de bible : le réseau des personnages s&rsquo;écrira une
          fois les fiches établies.
        </p>
      ) : graph.cast.length < 2 ? (
        <p className={styles.empty}>
          Il faut au moins deux personnages pour qu&rsquo;un lien existe. Cette bible en compte{" "}
          {graph.cast.length}.
        </p>
      ) : (
        <RelationshipGraphView
          projectId={projectId}
          cast={graph.cast}
          relationships={graph.relationships}
        />
      )}
    </main>
  );
}

interface RelationshipGraphViewProps {
  readonly projectId: string;
  readonly cast: readonly BibleCastMember[];
  readonly relationships: readonly BibleRelationship[];
}

function RelationshipGraphView({ projectId, cast, relationships }: RelationshipGraphViewProps) {
  const nameOf = new Map(cast.map((member) => [member.id, member.name]));

  // The classification is computed over names, which is the domain's own
  // vocabulary (§6: ids are business code's). The ids are carried alongside so
  // the diagram and the forms can address a row.
  const named = relationships.map((relationship) => ({
    ...relationship,
    fromCharacterName: nameOf.get(relationship.fromCharacterId) ?? "",
    toCharacterName: nameOf.get(relationship.toCharacterId) ?? "",
  }));

  const graph = resolveRelationshipGraph(named);
  const symmetryOf = new Map(
    graph.pairs.flatMap((pair) =>
      [...pair.forward, ...pair.backward].map((edge) => [edge.id, pair.symmetry] as const),
    ),
  );

  return (
    <>
      <RelationshipNetwork
        nodes={cast.map((member) => ({ id: member.id, name: member.name }))}
        edges={named.map((relationship) => ({
          id: relationship.id,
          fromCharacterId: relationship.fromCharacterId,
          toCharacterId: relationship.toCharacterId,
          symmetry: symmetryOf.get(relationship.id) ?? "one-sided",
        }))}
      />

      {graph.pairs.length === 0 ? (
        <p className={styles.empty}>Aucun lien n&rsquo;est encore déclaré entre ces personnages.</p>
      ) : (
        <ol className={styles.pairs}>
          {graph.pairs.map((pair) => {
            const notice = describeSymmetry(pair);

            return (
              <li key={`${pair.first} ${pair.second}`} className={styles.pair}>
                <h2 className={styles.pairTitle}>
                  {pair.first} &amp; {pair.second}
                </h2>

                <p
                  className={pair.symmetry === "mutual" ? styles.badge : styles.badgeAsymmetric}
                  data-symmetry={pair.symmetry}
                >
                  {RELATIONSHIP_SYMMETRY_LABELS[pair.symmetry]}
                </p>

                {notice === null ? null : <p className={styles.notice}>{notice}</p>}

                <ul className={styles.edges}>
                  {[...pair.forward, ...pair.backward].map((edge) => (
                    <li key={edge.id} className={styles.edge}>
                      <p className={styles.edgeHead}>
                        <strong>
                          {edge.fromCharacterName} → {edge.toCharacterName}
                        </strong>{" "}
                        <span className={styles.edgeType}>
                          {CHARACTER_RELATIONSHIP_TYPE_LABELS[edge.type]}
                        </span>
                      </p>
                      <p className={styles.edgeLabel}>{edge.label}</p>
                      {edge.description === null ? null : (
                        <p className={styles.edgeDescription}>{edge.description}</p>
                      )}

                      {edge.lockedAt === null ? (
                        <EditRelationshipForm
                          projectId={projectId}
                          relationshipId={edge.id}
                          types={TYPE_OPTIONS}
                          defaultType={edge.type}
                          defaultLabel={edge.label}
                          defaultDescription={edge.description ?? ""}
                          labelCeiling={CHARACTER_LABEL_CHAR_CEILING}
                          descriptionCeiling={RELATIONSHIP_CHAR_CEILINGS.description}
                          editAction={editRelationshipAction}
                          deleteAction={deleteRelationshipAction}
                        />
                      ) : (
                        <p className={styles.locked}>Lien verrouillé.</p>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}

      <section className={styles.add} aria-label="Ajouter un lien">
        <h2 className={styles.addTitle}>Ajouter un lien</h2>
        <p className={styles.addIntro}>
          Le lien s&rsquo;écrit dans un sens. Pour que les deux personnages se reconnaissent, il en
          faut deux.
        </p>

        <AddRelationshipForm
          projectId={projectId}
          cast={cast.map((member) => ({ id: member.id, name: member.name }))}
          types={TYPE_OPTIONS}
          labelCeiling={CHARACTER_LABEL_CHAR_CEILING}
          descriptionCeiling={RELATIONSHIP_CHAR_CEILINGS.description}
          action={writeRelationshipAction}
        />
      </section>
    </>
  );
}
