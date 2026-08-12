import { LockBadge } from "@/components/lock-badge";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { BIBLE_PROVENANCE_LABELS } from "@/lib/bible-provenance";

import styles from "./bible-sections.module.css";
import type { StyleView } from "./views";

interface StyleSectionProps {
  readonly style: StyleView | null;
}

export function StyleSection({ style }: StyleSectionProps) {
  return (
    <section id="style" className={styles.section} aria-labelledby="style-title">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="style-title">
          Style
        </h2>
        {style === null ? null : (
          <div className={styles.badges}>
            <ProvenanceBadge
              provenance={style.provenance}
              {...BIBLE_PROVENANCE_LABELS[style.provenance]}
            />
            {style.lockedAt === null ? null : <LockBadge variant="locked" />}
          </div>
        )}
      </div>

      {style === null ? (
        <p className={styles.empty}>La section style n&rsquo;a pas encore été définie.</p>
      ) : (
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>Point de vue</dt>
            <dd>
              {style.pointOfView} — {style.focalization}
            </dd>
          </div>
          <div className={styles.fact}>
            <dt>Temps verbal</dt>
            <dd>{style.tense}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Niveau de langue</dt>
            <dd>{style.languageRegister}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Densité descriptive</dt>
            <dd>{style.descriptiveDensity}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Rythme</dt>
            <dd>{style.pacing}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Place du dialogue</dt>
            <dd>{style.dialogueBalance}</dd>
          </div>
          {style.recurringMotifs.length === 0 ? null : (
            <div className={styles.fact}>
              <dt>Motifs récurrents</dt>
              <dd>
                <ul className={styles.plainList}>
                  {style.recurringMotifs.map((motif, index) => (
                    <li key={index}>{motif}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {style.elementsToAvoid.length === 0 ? null : (
            <div className={styles.fact}>
              <dt>Éléments à éviter</dt>
              <dd>
                <ul className={styles.plainList}>
                  {style.elementsToAvoid.map((element, index) => (
                    <li key={index}>{element}</li>
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
