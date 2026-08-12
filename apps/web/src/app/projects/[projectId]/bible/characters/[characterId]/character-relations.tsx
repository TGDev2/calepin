/**
 * The relations rattachées to this sheet, with direct access to the other
 * character's own editor (CAL-097).
 *
 * Outgoing edges reuse `EditRelationshipForm` and its two actions from the
 * relationship graph screen (CAL-091) rather than a second relationship
 * editor — one write path for one table. Incoming edges are read-only here:
 * an edge is written from its source's side (`Relationship.description`'s
 * own doctrine), so editing one belongs to the other character's page.
 * Adding a new tie reuses the graph page's own form, linked to below, rather
 * than a cast-selection UI duplicated here.
 */

import {
  CHARACTER_LABEL_CHAR_CEILING,
  CHARACTER_RELATIONSHIP_TYPE_LABELS,
  CHARACTER_RELATIONSHIP_TYPES,
  type CharacterRelationshipType,
  RELATIONSHIP_CHAR_CEILINGS,
} from "@calepin/bible";
import Link from "next/link";

import { characterEditorPath } from "@/lib/character-edit";

import { deleteRelationshipAction, editRelationshipAction } from "../../relationships/actions";
import { EditRelationshipForm } from "../../relationships/relationship-editor";
import styles from "./character-detail.module.css";

const TYPE_OPTIONS = CHARACTER_RELATIONSHIP_TYPES.map((value) => ({
  value,
  label: CHARACTER_RELATIONSHIP_TYPE_LABELS[value],
}));

export interface OutgoingRelation {
  readonly id: string;
  readonly toCharacterId: string;
  readonly toName: string;
  readonly type: CharacterRelationshipType;
  readonly typeLabel: string;
  readonly label: string;
  readonly description: string | null;
  readonly lockedAt: Date | null;
}

export interface IncomingRelation {
  readonly id: string;
  readonly fromCharacterId: string;
  readonly fromName: string;
  readonly typeLabel: string;
  readonly label: string;
}

export interface CharacterRelationsProps {
  readonly projectId: string;
  readonly outgoing: readonly OutgoingRelation[];
  readonly incoming: readonly IncomingRelation[];
}

export function CharacterRelations({ projectId, outgoing, incoming }: CharacterRelationsProps) {
  return (
    <section className={styles.editor} aria-labelledby="relations-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="relations-heading">
          Relations
        </h2>
        <Link href={`/projects/${projectId}/bible/relationships`} className={styles.sectionLink}>
          Ajouter un lien, voir le réseau →
        </Link>
      </div>

      <h3 className={styles.subsectionTitle}>Ce que ce personnage tient des autres</h3>
      {outgoing.length === 0 ? (
        <p className={styles.empty}>
          Ce personnage n&rsquo;a pas encore de lien déclaré vers un autre.
        </p>
      ) : (
        <ul className={styles.relationList}>
          {outgoing.map((relation) => (
            <li key={relation.id} className={styles.relationItem}>
              <p className={styles.relationHead}>
                <strong>{relation.typeLabel}</strong>{" "}
                <Link href={characterEditorPath(projectId, relation.toCharacterId)}>
                  {relation.toName}
                </Link>
              </p>
              <p className={styles.relationLabel}>{relation.label}</p>
              {relation.description === null ? null : (
                <p className={styles.relationDescription}>{relation.description}</p>
              )}

              {relation.lockedAt === null ? (
                <EditRelationshipForm
                  projectId={projectId}
                  relationshipId={relation.id}
                  types={TYPE_OPTIONS}
                  defaultType={relation.type}
                  defaultLabel={relation.label}
                  defaultDescription={relation.description ?? ""}
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
      )}

      <h3 className={styles.subsectionTitle}>Ce que les autres tiennent de ce personnage</h3>
      {incoming.length === 0 ? (
        <p className={styles.empty}>
          Aucun autre personnage n&rsquo;a encore déclaré de lien vers celui-ci.
        </p>
      ) : (
        <ul className={styles.relationList}>
          {incoming.map((relation) => (
            <li key={relation.id} className={styles.relationItem}>
              <p className={styles.relationHead}>
                <Link href={characterEditorPath(projectId, relation.fromCharacterId)}>
                  {relation.fromName}
                </Link>{" "}
                <strong>{relation.typeLabel}</strong>
              </p>
              <p className={styles.relationLabel}>{relation.label}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
