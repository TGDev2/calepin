/**
 * What a change left behind — a source-text edit (CAL-046), or the direction
 * the project retains (CAL-086).
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
 *
 * **Two notices, one list.** The stage list is identical for both changes —
 * `@calepin/shared/obsolescence` walks one chain for both — so only the lead
 * paragraph differs, and it is the lead that says *which* change put the stages
 * in doubt. Sharing the list is what keeps the two screens from drifting into
 * two vocabularies for one report.
 */

import type { SourceTextObsolescence, StageChainAssessment } from "@calepin/shared/obsolescence";

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

      <ObsolescenceStageList report={report} />
    </section>
  );
}

export interface DirectionObsolescenceNoticeProps {
  readonly report: StageChainAssessment;
  readonly headingId?: string;
}

/**
 * The same panel for the direction the project retains (CAL-086) — what was
 * built on a direction that has since been replaced or rewritten.
 *
 * The lead is the only thing that changes, and it says the two things this
 * product promises about a change of direction: nothing was deleted, and
 * nothing will be regenerated without the author asking for it.
 */
export function DirectionObsolescenceNotice({
  report,
  headingId = "direction-obsolescence-heading",
}: DirectionObsolescenceNoticeProps) {
  if (!report.hasObsoleteStages) return null;

  return (
    <section className={styles.notice} aria-labelledby={headingId} role="status" aria-live="polite">
      <h3 className={styles.title} id={headingId}>
        Étapes à revoir après ce changement de direction
      </h3>

      <p className={styles.lead}>
        Les étapes ci-dessous ont été construites sur une autre direction romanesque&nbsp;: elles
        sont <strong>intactes</strong>, rien n&apos;a été supprimé et rien ne sera régénéré sans
        vous. À vous de décider ce qui mérite d&apos;être repris.
      </p>

      <ObsolescenceStageList report={report} />
    </section>
  );
}

export interface DirectionChangeWarningProps {
  readonly report: StageChainAssessment;
}

/**
 * The same stages, before the change rather than after it (CAL-086) — what the
 * *Retenir cette direction* form shows above the confirmation it requires.
 *
 * **No heading and no `id`.** It is rendered once per direction card, and an
 * `aria-labelledby` pointing at a heading that exists three times over would be
 * invalid markup pretending to be an accessibility feature. The `<summary>` the
 * form already sits under names it; what this adds is the list.
 *
 * The tense is the whole difference from the notice above: that one says what
 * *was* built on another direction, this one says what *would be* — and both
 * read the same assessment, so the sentence shown before a change and the
 * report shown after it cannot disagree.
 */
export function DirectionChangeWarning({ report }: DirectionChangeWarningProps) {
  if (!report.hasObsoleteStages) return null;

  return (
    <div className={styles.notice}>
      <p className={styles.lead}>
        Ce projet contient déjà du travail construit sur la direction retenue. En changer ne
        supprimera <strong>rien</strong> et ne régénérera <strong>rien</strong>&nbsp;: ce qui suit
        restera en place, à revoir si vous le jugez utile.
      </p>

      <ObsolescenceStageList report={report} />
    </div>
  );
}

/**
 * The stages in doubt, one line each — shared by both notices, and by the
 * warning the comparison screen shows before a change is confirmed.
 */
export function ObsolescenceStageList({ report }: { readonly report: StageChainAssessment }) {
  return (
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
  );
}
