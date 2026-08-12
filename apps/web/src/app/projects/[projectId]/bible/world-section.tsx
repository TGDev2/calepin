import { LockBadge } from "@/components/lock-badge";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { BIBLE_PROVENANCE_LABELS } from "@/lib/bible-provenance";
import { placeAnchorId, worldRuleAnchorId } from "@/lib/bible-search";

import styles from "./bible-sections.module.css";
import type { PlaceView, WorldRuleView, WorldView } from "./views";

interface WorldSectionProps {
  readonly world: WorldView | null;
  readonly places: readonly PlaceView[];
  readonly worldRules: readonly WorldRuleView[];
}

export function WorldSection({ world, places, worldRules }: WorldSectionProps) {
  return (
    <section id="world" className={styles.section} aria-labelledby="world-title">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="world-title">
          Monde
        </h2>
        {world === null ? null : (
          <div className={styles.badges}>
            <ProvenanceBadge
              provenance={world.provenance}
              {...BIBLE_PROVENANCE_LABELS[world.provenance]}
            />
            {world.lockedAt === null ? null : <LockBadge variant="locked" />}
          </div>
        )}
      </div>

      {world === null ? (
        <p className={styles.empty}>La section monde n&rsquo;a pas encore été définie.</p>
      ) : (
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>Époque</dt>
            <dd>{world.era}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Contexte social</dt>
            <dd>{world.socialContext}</dd>
          </div>
          {world.politicalContext === null ? null : (
            <div className={styles.fact}>
              <dt>Contexte politique</dt>
              <dd>{world.politicalContext}</dd>
            </div>
          )}
          {world.technologies.length === 0 ? null : (
            <div className={styles.fact}>
              <dt>Technologies</dt>
              <dd>
                <ul className={styles.plainList}>
                  {world.technologies.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {world.institutions.length === 0 ? null : (
            <div className={styles.fact}>
              <dt>Institutions</dt>
              <dd>
                <ul className={styles.plainList}>
                  {world.institutions.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {world.constraints.length === 0 ? null : (
            <div className={styles.fact}>
              <dt>Contraintes</dt>
              <dd>
                <ul className={styles.plainList}>
                  {world.constraints.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}

      {places.length === 0 ? null : (
        <div className={styles.subsection}>
          <h3 className={styles.subsectionTitle}>Lieux</h3>
          <ul className={styles.cardList}>
            {places.map((place) => (
              <li key={place.id} id={placeAnchorId(place.id)} className={styles.card}>
                <p className={styles.cardSummaryTitle}>
                  {place.name}
                  <span className={styles.badges}>
                    <ProvenanceBadge
                      provenance={place.provenance}
                      {...BIBLE_PROVENANCE_LABELS[place.provenance]}
                    />
                    {place.lockedAt === null ? null : <LockBadge variant="locked" />}
                  </span>
                </p>
                {place.description === null ? null : (
                  <p className={styles.cardBody}>{place.description}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {worldRules.length === 0 ? null : (
        <div className={styles.subsection}>
          <h3 className={styles.subsectionTitle}>Règles du monde</h3>
          <ul className={styles.cardList}>
            {worldRules.map((rule) => (
              <li key={rule.id} id={worldRuleAnchorId(rule.id)} className={styles.card}>
                <p className={styles.cardSummaryTitle}>
                  {rule.name}
                  {rule.isSupernatural ? (
                    <span className={styles.cardSummaryMeta}>hors norme</span>
                  ) : null}
                  <span className={styles.badges}>
                    <ProvenanceBadge
                      provenance={rule.provenance}
                      {...BIBLE_PROVENANCE_LABELS[rule.provenance]}
                    />
                    {rule.lockedAt === null ? null : <LockBadge variant="locked" />}
                  </span>
                </p>
                <p className={styles.cardBody}>{rule.statement}</p>
                {rule.bounds.length === 0 ? null : (
                  <ul className={styles.plainList}>
                    {rule.bounds.map((bound, index) => (
                      <li key={index}>{bound}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
