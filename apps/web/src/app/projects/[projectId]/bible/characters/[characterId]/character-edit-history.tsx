/**
 * What changed, when, and what it replaced (CAL-097).
 *
 * A server component: `entries` is already newest-first from
 * `getCharacterForEdit`, and nothing here needs client state — each row is a
 * plain `<details>` revealing the previous text of every field the edit
 * touched, closed by default for the same reason `characters-section.tsx`
 * keeps a sheet closed: a history entry can carry any of sixteen fields, and
 * showing all of them open at once would bury the list a screen reader
 * walks.
 */

import { CHARACTER_IMPORTANCE_LABELS } from "@calepin/bible";
import { CHARACTER_LOCK_FIELD_LABELS, type CharacterLockField } from "@calepin/shared/bible-lock";
import type { CharacterEditHistoryEntry } from "@calepin/shared/repository";

import styles from "./character-detail.module.css";

export interface CharacterEditHistoryProps {
  readonly entries: readonly CharacterEditHistoryEntry[];
}

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
});

function previousValue(entry: CharacterEditHistoryEntry, field: CharacterLockField): string {
  switch (field) {
    case "NAME":
      return entry.name;
    case "AGE":
      return entry.age === null ? "(non renseigné)" : String(entry.age);
    case "ROLE":
      return entry.role ?? "(non renseigné)";
    case "IMPORTANCE":
      return CHARACTER_IMPORTANCE_LABELS[entry.importance];
    case "APPEARANCE":
      return entry.appearance ?? "(non renseigné)";
    case "INITIAL_SITUATION":
      return entry.initialSituation ?? "(non renseigné)";
    case "APPARENT_DESIRE":
      return entry.apparentDesire ?? "(non renseigné)";
    case "DEEP_NEED":
      return entry.deepNeed ?? "(non renseigné)";
    case "FEAR":
      return entry.fear ?? "(non renseigné)";
    case "CONTRADICTION":
      return entry.contradiction ?? "(non renseigné)";
    case "SECRET":
      return entry.secret ?? "(non renseigné)";
    case "PAST":
      return entry.past ?? "(non renseigné)";
    case "PLANNED_ARC":
      return entry.plannedArc ?? "(non renseigné)";
    case "SPEECH_STYLE":
      return entry.speechStyle ?? "(non renseigné)";
    case "HELD_KNOWLEDGE":
      return entry.heldKnowledge.length === 0 ? "(aucune)" : entry.heldKnowledge.join(" · ");
    case "ELEMENTS_TO_PRESERVE":
      return entry.elementsToPreserve.length === 0
        ? "(aucun)"
        : entry.elementsToPreserve.join(" · ");
  }
}

export function CharacterEditHistory({ entries }: CharacterEditHistoryProps) {
  return (
    <section className={styles.editor} aria-labelledby="history-heading">
      <h2 className={styles.sectionTitle} id="history-heading">
        Historique des modifications
      </h2>

      {entries.length === 0 ? (
        <p className={styles.empty}>
          Aucune modification manuelle n&rsquo;a encore été enregistrée.
        </p>
      ) : (
        <ul className={styles.historyList}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <details className={styles.historyEntry}>
                <summary className={styles.historySummary}>
                  <span>{DATE_FORMAT.format(entry.editedAt)}</span>
                  <span className={styles.historyFields}>
                    {entry.changedFields
                      .map((field) => CHARACTER_LOCK_FIELD_LABELS[field])
                      .join(", ")}
                  </span>
                </summary>

                <dl className={styles.historyDiff}>
                  {entry.changedFields.map((field) => (
                    <div key={field}>
                      <dt>{CHARACTER_LOCK_FIELD_LABELS[field]}, avant cette modification</dt>
                      <dd>{previousValue(entry, field)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
