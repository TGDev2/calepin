import { isCharacterPartlyLocked } from "@calepin/shared/bible-lock";
import Link from "next/link";

import { LockBadge } from "@/components/lock-badge";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { BIBLE_PROVENANCE_LABELS } from "@/lib/bible-provenance";
import { characterAnchorId } from "@/lib/bible-search";

import styles from "./bible-sections.module.css";
import type { CharacterView } from "./views";

interface CharactersSectionProps {
  readonly characters: readonly CharacterView[];
  readonly projectId: string;
}

/**
 * One `<details>` per character, closed by default: a full sheet is
 * seventeen fields, and showing every one of them for every character at
 * once would bury the roster the section title promises. The anchor id sits
 * on the `<details>` element itself rather than on a field inside it, so a
 * search result or a sidebar jump lands on — and reveals — the right
 * character regardless of whether it was open.
 */
export function CharactersSection({ characters, projectId }: CharactersSectionProps) {
  return (
    <section id="characters" className={styles.section} aria-labelledby="characters-title">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="characters-title">
          Personnages
        </h2>
        <Link href={`/projects/${projectId}/bible/relationships`} className={styles.sectionLink}>
          Voir le réseau des relations →
        </Link>
      </div>

      {characters.length === 0 ? (
        <p className={styles.empty}>Aucun personnage n&rsquo;a encore été établi.</p>
      ) : (
        <ul className={styles.cardList}>
          {characters.map((character) => (
            <li key={character.id}>
              <details id={characterAnchorId(character.id)} className={styles.card}>
                <summary className={styles.cardSummary}>
                  <span className={styles.cardSummaryTitle}>
                    {character.name}
                    <span className={styles.cardSummaryMeta}>
                      {character.importanceLabel}
                      {character.role === null ? "" : ` · ${character.role}`}
                    </span>
                  </span>
                  <span className={styles.badges}>
                    <ProvenanceBadge
                      provenance={character.provenance}
                      {...BIBLE_PROVENANCE_LABELS[character.provenance]}
                    />
                    {character.lockedAt !== null ? (
                      <LockBadge variant="locked" />
                    ) : isCharacterPartlyLocked(character) ? (
                      <LockBadge variant="partial" />
                    ) : null}
                  </span>
                </summary>

                <dl className={styles.facts}>
                  {character.age === null ? null : (
                    <div className={styles.fact}>
                      <dt>Âge</dt>
                      <dd>{character.age}</dd>
                    </div>
                  )}
                  {character.appearance === null ? null : (
                    <div className={styles.fact}>
                      <dt>Apparence</dt>
                      <dd>{character.appearance}</dd>
                    </div>
                  )}
                  {character.initialSituation === null ? null : (
                    <div className={styles.fact}>
                      <dt>Situation initiale</dt>
                      <dd>{character.initialSituation}</dd>
                    </div>
                  )}
                  {character.apparentDesire === null ? null : (
                    <div className={styles.fact}>
                      <dt>Désir apparent</dt>
                      <dd>{character.apparentDesire}</dd>
                    </div>
                  )}
                  {character.deepNeed === null ? null : (
                    <div className={styles.fact}>
                      <dt>Besoin profond</dt>
                      <dd>{character.deepNeed}</dd>
                    </div>
                  )}
                  {character.fear === null ? null : (
                    <div className={styles.fact}>
                      <dt>Peur</dt>
                      <dd>{character.fear}</dd>
                    </div>
                  )}
                  {character.contradiction === null ? null : (
                    <div className={styles.fact}>
                      <dt>Contradiction</dt>
                      <dd>{character.contradiction}</dd>
                    </div>
                  )}
                  {character.secret === null ? null : (
                    <div className={styles.fact}>
                      <dt>Secret</dt>
                      <dd>{character.secret}</dd>
                    </div>
                  )}
                  {character.past === null ? null : (
                    <div className={styles.fact}>
                      <dt>Passé</dt>
                      <dd>{character.past}</dd>
                    </div>
                  )}
                  {character.plannedArc === null ? null : (
                    <div className={styles.fact}>
                      <dt>Évolution prévue</dt>
                      <dd>{character.plannedArc}</dd>
                    </div>
                  )}
                  {character.speechStyle === null ? null : (
                    <div className={styles.fact}>
                      <dt>Manière de parler</dt>
                      <dd>{character.speechStyle}</dd>
                    </div>
                  )}
                  {character.heldKnowledge.length === 0 ? null : (
                    <div className={styles.fact}>
                      <dt>Connaissances détenues</dt>
                      <dd>
                        <ul className={styles.plainList}>
                          {character.heldKnowledge.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}
                  {character.elementsToPreserve.length === 0 ? null : (
                    <div className={styles.fact}>
                      <dt>Éléments à ne pas modifier</dt>
                      <dd>
                        <ul className={styles.plainList}>
                          {character.elementsToPreserve.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}
                </dl>

                {character.relationships.length === 0 ? null : (
                  <div className={styles.subsection}>
                    <h3 className={styles.subsectionTitle}>Liens</h3>
                    <ul className={styles.plainList}>
                      {character.relationships.map((relationship) => (
                        <li key={relationship.id}>
                          <strong>{relationship.typeLabel}</strong> {relationship.label}{" "}
                          <span className={styles.cardSummaryMeta}>→ {relationship.toName}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className={styles.subsection}>
                  <Link href={`/projects/${projectId}/bible/characters/${character.id}`}>
                    Modifier cette fiche →
                  </Link>
                </p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
