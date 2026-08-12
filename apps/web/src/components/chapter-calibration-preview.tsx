"use client";

/**
 * The live chapter-count calibration preview (CAL-103), shown under the
 * project-creation wizard's "Longueur" step.
 *
 * `estimateChapterCalibration` (`@calepin/outline/calibration`) already
 * derives a starting chapter count and per-chapter target from the chosen
 * novel length. This component is what lets the author move away from that
 * estimate — two editable numbers — while `chapterWordBudgetGap` recomputes,
 * on every keystroke, how far the resulting total sits from the novel's own
 * target and whether that stays inside CAL-103's ±10% bar.
 *
 * **`@calepin/outline/calibration`** — the pure half of `target-length`, which
 * is all this component needs. The root barrel was impure until CAL-106 moved
 * `getPlanGenerationContext` behind `@calepin/outline/repository`; the narrow
 * entry point stays because it is the honest one, not because the wide one is
 * still a trap.
 *
 * **Indicative only.** No schema field stores a manually adjusted chapter
 * count today, and nothing downstream (CAL-101/102's missions) reads one —
 * they derive their own calibration straight from the novel's target length.
 * This preview is a calibration aid for the author, not a value the form
 * submits; the hint text says so.
 */

import {
  adjustChapterCalibration,
  chapterWordBudgetGap,
  estimateChapterCalibration,
  type NovelLengthChoice,
} from "@calepin/outline/calibration";
import { useState } from "react";

import styles from "./chapter-calibration-preview.module.css";

export interface ChapterCalibrationPreviewProps {
  readonly draftTargetLength: string;
  readonly draftTargetWordCount: string;
}

function isTargetLengthPreset(value: string): value is "SHORT" | "STANDARD" | "LONG" | "CUSTOM" {
  return value === "SHORT" || value === "STANDARD" || value === "LONG" || value === "CUSTOM";
}

/** Mirrors `project-creation.ts`'s own `targetLength` step validation. */
function resolveDraftChoice(
  targetLength: string,
  targetWordCount: string,
): NovelLengthChoice | null {
  if (!isTargetLengthPreset(targetLength)) return null;
  if (targetLength !== "CUSTOM") return { targetLength };

  const wordCount = Number.parseInt(targetWordCount, 10);
  if (!Number.isInteger(wordCount) || wordCount <= 0) return null;

  return { targetLength: "CUSTOM", targetWordCount: wordCount };
}

/** `undefined` for anything that isn't a positive integer — including "". */
function parsePositiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function ChapterCalibrationPreview({
  draftTargetLength,
  draftTargetWordCount,
}: ChapterCalibrationPreviewProps) {
  const choice = resolveDraftChoice(draftTargetLength, draftTargetWordCount);
  const base = choice === null ? null : estimateChapterCalibration(choice);

  const [chapterCountInput, setChapterCountInput] = useState("");
  const [chapterTargetInput, setChapterTargetInput] = useState("");
  const [priorNovelTarget, setPriorNovelTarget] = useState(base?.novelTargetWordCount ?? null);

  // "Adjusting state when a prop changes", `project-creation-wizard.tsx`'s
  // own pattern: a manual adjustment made for one target length says nothing
  // about another, so a new resolved target clears both overrides back to
  // the fresh estimate — synchronously, during render, not in an effect.
  if (base !== null && base.novelTargetWordCount !== priorNovelTarget) {
    setPriorNovelTarget(base.novelTargetWordCount);
    setChapterCountInput("");
    setChapterTargetInput("");
  }

  if (base === null) return null;

  const calibration = adjustChapterCalibration(base, {
    chapterCount: parsePositiveInteger(chapterCountInput),
    chapterTargetWordCount: parsePositiveInteger(chapterTargetInput),
  });
  const total = calibration.chapterCount * calibration.chapterTargetWordCount;
  const gap = chapterWordBudgetGap(total, base.novelTargetWordCount);
  const deviationSign = gap.deviationWordCount > 0 ? "+" : "";
  const deviationPercent = (gap.deviationRatio * 100).toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  });

  return (
    <section className={styles.preview} aria-label="Calibrage du nombre de chapitres">
      <p className={styles.hint}>
        Estimation à partir de la longueur choisie : environ {base.chapterCount} chapitres
        d&apos;environ {base.chapterTargetWordCount.toLocaleString("fr-FR")} mots chacun. Ajustez
        ces deux valeurs si besoin — cet aperçu n&apos;est pas encore enregistré.
      </p>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Nombre de chapitres</span>
          <input
            type="number"
            min={1}
            className={styles.input}
            aria-label="Nombre de chapitres"
            placeholder={String(base.chapterCount)}
            value={chapterCountInput}
            onChange={(event) => setChapterCountInput(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Longueur cible par chapitre (mots)</span>
          <input
            type="number"
            min={1}
            className={styles.input}
            aria-label="Longueur cible par chapitre"
            placeholder={String(base.chapterTargetWordCount)}
            value={chapterTargetInput}
            onChange={(event) => setChapterTargetInput(event.target.value)}
          />
        </label>
      </div>
      <p
        className={styles.gap}
        role="status"
        aria-live="polite"
        data-within-tolerance={gap.withinTolerance}
      >
        Total : {total.toLocaleString("fr-FR")} mots — écart de {deviationSign}
        {gap.deviationWordCount.toLocaleString("fr-FR")} mots ({deviationSign}
        {deviationPercent} %) par rapport à la longueur visée (
        {base.novelTargetWordCount.toLocaleString("fr-FR")} mots).{" "}
        {gap.withinTolerance
          ? "Dans la marge de 10 %."
          : "Hors de la marge de 10 % — ajustez le nombre de chapitres ou leur longueur cible."}
      </p>
    </section>
  );
}
