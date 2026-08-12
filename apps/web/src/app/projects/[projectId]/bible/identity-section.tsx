import { LockBadge } from "@/components/lock-badge";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { BIBLE_PROVENANCE_LABELS } from "@/lib/bible-provenance";

import styles from "./bible-sections.module.css";
import type { IdentityView } from "./views";

interface IdentitySectionProps {
  readonly identity: IdentityView | null;
}

export function IdentitySection({ identity }: IdentitySectionProps) {
  return (
    <section id="identity" className={styles.section} aria-labelledby="identity-title">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="identity-title">
          Identité du roman
        </h2>
        {identity === null ? null : (
          <div className={styles.badges}>
            <ProvenanceBadge
              provenance={identity.provenance}
              {...BIBLE_PROVENANCE_LABELS[identity.provenance]}
            />
            {identity.lockedAt === null ? null : <LockBadge variant="locked" />}
          </div>
        )}
      </div>

      {identity === null ? (
        <p className={styles.empty}>L&rsquo;identité du roman n&rsquo;a pas encore été définie.</p>
      ) : (
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>Titre de travail</dt>
            <dd>{identity.workingTitle}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Genre</dt>
            <dd>
              {identity.genre} — {identity.subGenre}
            </dd>
          </div>
          <div className={styles.fact}>
            <dt>Tonalité</dt>
            <dd>{identity.tone}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Promesse narrative</dt>
            <dd>{identity.narrativePromise}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Question centrale</dt>
            <dd>{identity.centralQuestion}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Type de fin</dt>
            <dd>{identity.endingNature}</dd>
          </div>
          {identity.themes.length === 0 ? null : (
            <div className={styles.fact}>
              <dt>Thèmes</dt>
              <dd>
                <ul className={styles.plainList}>
                  {identity.themes.map((theme, index) => (
                    <li key={index}>{theme}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {identity.counterThemes.length === 0 ? null : (
            <div className={styles.fact}>
              <dt>Contre-thèmes</dt>
              <dd>
                <ul className={styles.plainList}>
                  {identity.counterThemes.map((theme, index) => (
                    <li key={index}>{theme}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
