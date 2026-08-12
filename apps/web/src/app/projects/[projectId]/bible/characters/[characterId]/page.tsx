/**
 * The character sheet editor (CAL-097).
 *
 * `relationships/page.tsx`'s shape, one row deeper: check ownership, read the
 * one character and the bible's relationship graph in parallel, hand
 * everything already-shaped to a client component. Editing sixteen own-row
 * fields with autosave and per-field locking needs client state; reading and
 * shaping the data does not, so every fetch and every French label
 * resolution happens here, server-side.
 *
 * **No `<Suspense>` boundary.** The ownership decision must run above any
 * boundary or Next locks the response to 200 before it can know the page
 * 404s — the trap `relationships/page.tsx` documents and `tasks/lessons.md`
 * records.
 */

import { CHARACTER_IMPORTANCE_LABELS, CHARACTER_RELATIONSHIP_TYPE_LABELS } from "@calepin/bible";
import {
  getCharacterForEdit,
  getProjectForOwner,
  getRelationshipGraph,
  openProjectScope,
} from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { bibleCharactersPath } from "@/lib/character-edit";
import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import {
  lockCharacterElementAction,
  saveCharacterAction,
  unlockCharacterElementAction,
} from "./actions";
import { CharacterEditHistory } from "./character-edit-history";
import { CharacterEditor } from "./character-editor";
import { CharacterRelations } from "./character-relations";
import styles from "./page.module.css";

export default async function CharacterEditorPage({
  params,
}: PageProps<"/projects/[projectId]/bible/characters/[characterId]">) {
  const { projectId, characterId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect(signInDestination(`/projects/${projectId}/bible/characters/${characterId}`));
  }

  const [found, scope] = await Promise.all([
    getProjectForOwner({ ownerId: user.id, projectId }),
    openProjectScope({ ownerId: user.id, projectId }),
  ]);
  if (!found.ok || !scope.ok) notFound();

  const [character, graph] = await Promise.all([
    getCharacterForEdit(scope.value, characterId),
    getRelationshipGraph(scope.value),
  ]);
  if (!character.ok) notFound();

  const nameOf = new Map((graph?.cast ?? []).map((member) => [member.id, member.name]));

  const outgoing = (graph?.relationships ?? [])
    .filter((relationship) => relationship.fromCharacterId === characterId)
    .map((relationship) => ({
      id: relationship.id,
      toCharacterId: relationship.toCharacterId,
      toName: nameOf.get(relationship.toCharacterId) ?? "?",
      typeLabel: CHARACTER_RELATIONSHIP_TYPE_LABELS[relationship.type],
      type: relationship.type,
      label: relationship.label,
      description: relationship.description,
      lockedAt: relationship.lockedAt,
    }));

  const incoming = (graph?.relationships ?? [])
    .filter((relationship) => relationship.toCharacterId === characterId)
    .map((relationship) => ({
      id: relationship.id,
      fromCharacterId: relationship.fromCharacterId,
      fromName: nameOf.get(relationship.fromCharacterId) ?? "?",
      typeLabel: CHARACTER_RELATIONSHIP_TYPE_LABELS[relationship.type],
      label: relationship.label,
    }));

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href={`/projects/${projectId}`}>← {found.value.title}</Link>
        {" · "}
        <Link href={bibleCharactersPath(projectId)}>Bible</Link>
      </p>

      <h1 className={styles.title}>{character.value.name}</h1>
      <p className={styles.subtitle}>{CHARACTER_IMPORTANCE_LABELS[character.value.importance]}</p>

      <CharacterEditor
        projectId={projectId}
        characterId={characterId}
        character={character.value}
        saveAction={saveCharacterAction}
        lockAction={lockCharacterElementAction}
        unlockAction={unlockCharacterElementAction}
      />

      <CharacterRelations projectId={projectId} outgoing={outgoing} incoming={incoming} />

      <CharacterEditHistory entries={character.value.editHistory} />
    </main>
  );
}
