/**
 * What a source-text edit left behind (CAL-046).
 *
 * Not a `"use client"` module: it holds no state and no handler, so it is a pure
 * function of the report it is handed — the same choice `source-text-counter.tsx`
 * makes, and what lets it be unit-tested with `renderToStaticMarkup` and no
 * jsdom.
 *
 * **`role="status"`, not `role="alert"`.** This is a standing fact about the
 * project, rendered on every visit for as long as it holds, not an interruption
 * announcing something that just happened. An assertive region would cut across
 * whatever a screen-reader user was reading, every time they open the page. It
 * also keeps the panel out of the strict-mode collision with Next's own route
 * announcer that `tasks/lessons.md` records twice.
 *
 * **The panel never offers to fix anything.** No "regenerate", no "discard", not
 * even a checkbox: the backlog is explicit that nothing downstream is deleted or
 * regenerated automatically, and a one-click button here would be the same
 * decision taken with one more step. The screens that regenerate a stage are the
 * stage's own, in E07 to E12, where the author is looking at what they would be
 * replacing.
 */

import type { SourceTextObsolescence } from "@calepin/shared/obsolescence";

import {
  downstreamStageLabel,
  obsolescenceReasonLabel,
  obsolescenceScopeLabel,
} from "@/lib/downstream-stage-label";

import styles from "./obsolescence-notice.module.css";

export interface ObsolescenceNoticeProps {
  readonly report: SourceTextObsolescence;
  /** Ties the panel to the heading level of whatever section renders it. */
  readonly headingId?: string;
}

export function ObsolescenceNotice({
  report,
  headingId = "obsolescence-heading",
}: ObsolescenceNoticeProps) {
  // Nothing at all rather than an empty panel saying everything is fine: a
  // project whose source text has never been edited would otherwise carry a
  // permanent box about a risk that has not arisen.
  if (!report.hasObsoleteStages) return null;

  return (
    <section className={styles.notice} aria-labelledby={headingId} role="status" aria-live="polite">
      <h3 className={styles.title} id={headingId}>
        Étapes à revoir après cette modification
      </h3>

      <p className={styles.lead}>
        Le texte source en est à sa version&nbsp;{report.currentVersionNumber}. Les étapes
        ci-dessous ont été produites avant elle&nbsp;: elles sont <strong>intactes</strong>, rien
        n&apos;a été supprimé et rien ne sera régénéré sans vous. À vous de décider ce qui mérite
        d&apos;être repris.
      </p>

      <ul className={styles.stages}>
        {report.stages
          .filter((entry) => entry.isObsolete)
          .map((entry) => {
            const scope = obsolescenceScopeLabel(entry);

            return (
              <li key={entry.stage} className={styles.stage} data-stage={entry.stage}>
                <strong className={styles.stageLabel}>{downstreamStageLabel(entry.stage)}</strong>
                {scope === null ? null : <span className={styles.scope}> — {scope}</span>}
                <span className={styles.reason}>
                  {" "}
                  — {entry.reason === null ? null : obsolescenceReasonLabel(entry.reason)}
                </span>
              </li>
            );
          })}
      </ul>
    </section>
  );
}
