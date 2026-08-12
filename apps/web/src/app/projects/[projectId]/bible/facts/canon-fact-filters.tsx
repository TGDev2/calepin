/**
 * The three filters, as a plain `GET` form (CAL-098).
 *
 * A server component with no client state at all: the browser submits the form,
 * the query string changes, the page re-renders narrowed. That is what makes a
 * filtered view a link the author can keep — and it works with JavaScript off,
 * which a `useState` filter never could.
 *
 * The character filter matches a fact the character is a subject of **and** one
 * that records their stance, because both are ways a fact bears on someone and
 * splitting them would give *les faits de Nora* two answers.
 */

import {
  CANON_FACT_STATUS_LABELS,
  CANON_FACT_VALIDITY_LABELS,
} from "@/lib/bible-labels";
import {
  CANON_FACT_FILTER_KEYS,
  type CanonFactFilters,
  canonFactsPath,
} from "@/lib/canon-fact-edit";

import styles from "./canon-fact-filters.module.css";
import type { NamedRow } from "./canon-fact-form";

const PERIODS = ["PERMANENT", "DURING_PERIOD", "UNTIL_EVENT"] as const;
const STATUSES = ["CONFIRMED", "PROPOSED", "REJECTED"] as const;

export interface CanonFactFilterFormProps {
  readonly projectId: string;
  readonly cast: readonly NamedRow[];
  readonly filters: CanonFactFilters;
  readonly shownCount: number;
  readonly totalCount: number;
}

export function CanonFactFilterForm({
  projectId,
  cast,
  filters,
  shownCount,
  totalCount,
}: CanonFactFilterFormProps) {
  return (
    <search className={styles.panel}>
      <form className={styles.form} method="get" action={canonFactsPath(projectId)}>
        <p className={styles.field}>
          <label htmlFor="filter-character">Personnage</label>
          <select
            id="filter-character"
            name={CANON_FACT_FILTER_KEYS.character}
            defaultValue={filters.characterId ?? ""}
          >
            <option value="">tous</option>
            {cast.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </p>

        <p className={styles.field}>
          <label htmlFor="filter-period">Période</label>
          <select
            id="filter-period"
            name={CANON_FACT_FILTER_KEYS.period}
            defaultValue={filters.validity ?? ""}
          >
            <option value="">toutes</option>
            {PERIODS.map((period) => (
              <option key={period} value={period}>
                {CANON_FACT_VALIDITY_LABELS[period]}
              </option>
            ))}
          </select>
        </p>

        <p className={styles.field}>
          <label htmlFor="filter-status">État</label>
          <select
            id="filter-status"
            name={CANON_FACT_FILTER_KEYS.status}
            defaultValue={filters.status ?? ""}
          >
            <option value="">tous</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {CANON_FACT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </p>

        <p className={styles.actions}>
          <button type="submit">Filtrer</button>
        </p>
      </form>

      <p className={styles.count} aria-live="polite">
        {shownCount === totalCount
          ? `${String(totalCount)} fait${totalCount > 1 ? "s" : ""}.`
          : `${String(shownCount)} fait${shownCount > 1 ? "s" : ""} sur ${String(totalCount)}.`}
      </p>
    </search>
  );
}
