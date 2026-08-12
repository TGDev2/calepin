import { CANON_FACT_BELIEF_STATE_LABELS } from "@calepin/bible";

import { LockBadge } from "@/components/lock-badge";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { BIBLE_PROVENANCE_LABELS } from "@/lib/bible-provenance";
import { canonFactAnchorId } from "@/lib/bible-search";

import styles from "./bible-sections.module.css";
import type { CanonFactView } from "./views";

interface CanonFactsSectionProps {
  readonly facts: readonly CanonFactView[];
}

/**
 * `REJECTED` facts are shown too, dimmed rather than hidden: a rejected fact
 * is kept for deduplication (CLAUDE.md's `CanonFact` glossary entry), and a
 * consultation screen that quietly dropped it would look like the fact had
 * never existed rather than like the author had already ruled on it.
 */
export function CanonFactsSection({ facts }: CanonFactsSectionProps) {
  return (
    <section id="canon-facts" className={styles.section} aria-labelledby="canon-facts-title">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="canon-facts-title">
          Faits canoniques
        </h2>
      </div>

      {facts.length === 0 ? (
        <p className={styles.empty}>Aucun fait canonique n&rsquo;a encore été établi.</p>
      ) : (
        <ul className={styles.cardList}>
          {facts.map((fact) => (
            <li
              key={fact.id}
              id={canonFactAnchorId(fact.id)}
              className={fact.status === "REJECTED" ? styles.cardRejected : styles.card}
            >
              <p className={styles.cardBody}>
                {fact.statement}
                {fact.isTrue ? null : (
                  <span className={styles.cardSummaryMeta}> (faux dans le monde)</span>
                )}
              </p>

              <p className={styles.cardSummaryMeta}>
                {fact.sourceLabel} · {fact.statusLabel} · {fact.validityLabel}
              </p>

              <span className={styles.badges}>
                <ProvenanceBadge
                  provenance={fact.provenance}
                  {...BIBLE_PROVENANCE_LABELS[fact.provenance]}
                />
                {fact.lockedAt === null ? null : <LockBadge variant="locked" />}
              </span>

              {fact.subjectNames.length === 0 ? null : (
                <p className={styles.cardSummaryMeta}>
                  Concerne&nbsp;: {fact.subjectNames.join(", ")}
                </p>
              )}

              {fact.beliefs.length === 0 ? null : (
                <ul className={styles.plainList}>
                  {fact.beliefs.map((belief, index) => (
                    <li key={index}>
                      {belief.characterName} — {CANON_FACT_BELIEF_STATE_LABELS[belief.state]}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
