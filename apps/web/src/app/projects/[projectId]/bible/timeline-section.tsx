import { LockBadge } from "@/components/lock-badge";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { BIBLE_PROVENANCE_LABELS } from "@/lib/bible-provenance";
import { timelineEventAnchorId } from "@/lib/bible-search";

import styles from "./bible-sections.module.css";
import type { TimelineEventView } from "./views";

interface TimelineSectionProps {
  readonly events: readonly TimelineEventView[];
}

export function TimelineSection({ events }: TimelineSectionProps) {
  return (
    <section id="timeline" className={styles.section} aria-labelledby="timeline-title">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="timeline-title">
          Chronologie
        </h2>
      </div>

      {events.length === 0 ? (
        <p className={styles.empty}>
          Aucun événement n&rsquo;a encore été placé sur la chronologie.
        </p>
      ) : (
        <ol className={styles.cardList}>
          {events.map((event) => (
            <li key={event.id} id={timelineEventAnchorId(event.id)} className={styles.card}>
              <p className={styles.cardSummaryTitle}>
                {event.name}
                <span className={styles.cardSummaryMeta}>
                  {event.categoryLabel} · {formatDay(event)}
                </span>
                <span className={styles.badges}>
                  <ProvenanceBadge
                    provenance={event.provenance}
                    {...BIBLE_PROVENANCE_LABELS[event.provenance]}
                  />
                  {event.lockedAt === null ? null : <LockBadge variant="locked" />}
                </span>
              </p>

              {event.dateLabel === null ? null : (
                <p className={styles.cardBody}>{event.dateLabel}</p>
              )}
              {event.summary === null ? null : <p className={styles.cardBody}>{event.summary}</p>}
              {event.precedingEventName === null ? null : (
                <p className={styles.cardBody}>Après « {event.precedingEventName} ».</p>
              )}

              {event.participants.length === 0 ? null : (
                <ul className={styles.plainList}>
                  {event.participants.map((participant, index) => (
                    <li key={index}>
                      {participant.characterName}
                      {participant.declaredAge === null ? "" : ` (${participant.declaredAge} ans)`}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function formatDay(event: TimelineEventView): string {
  if (event.day === null) return "position non datée";

  const sign = event.day >= 0 ? "+" : "";
  const tolerance = event.toleranceDays > 0 ? ` ± ${event.toleranceDays} j` : "";
  return `jour ${sign}${event.day}${tolerance}`;
}
