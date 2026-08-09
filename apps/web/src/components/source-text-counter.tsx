/**
 * The live word counter under the source-text field (CAL-041).
 *
 * Not a `"use client"` module of its own: it holds no state, no effect and no
 * handler — it is a pure function of the text it is handed, and the wizard that
 * renders it is already a client component. Keeping it pure is also what lets
 * it be unit-tested with `renderToStaticMarkup` and no jsdom, the pattern
 * `process-stepper.test.tsx` established.
 *
 * **It counts with `measureSourceText`, exactly like the server does.** That is
 * the whole point of the task: the number below the textarea and the number in
 * `SourceTextVersion.wordCount` come from one function reading one normalized
 * string, so they cannot disagree. The refusal sentence is not written here
 * either — `sourceTextLimitMessage` is the one place it exists, shared with the
 * step validation and with the repository's own `ValidationError`.
 *
 * The warning is progressive rather than binary. A limit that says nothing
 * until it is exceeded makes a visitor discover at 2 100 words that the last
 * hour was wasted; one that warns from the first word is a warning nobody
 * reads. So: the count alone up to 75 %, how much room is left from there, a
 * firmer notice from 90 %, and the refusal itself past 2 000.
 */

import {
  measureSourceText,
  SOURCE_TEXT_MAX_WORDS,
  type SourceTextLimitLevel,
  sourceTextLimitMessage,
} from "@calepin/shared/text";

import styles from "./source-text-counter.module.css";

export interface SourceTextCounterProps {
  readonly text: string;
  /** Ties the counter to its textarea for a screen reader, via `aria-describedby`. */
  readonly id?: string;
}

/** The sentence beside the count, or `null` when the count says enough on its own. */
function noticeFor(
  level: SourceTextLimitLevel,
  remaining: number,
  wordCount: number,
): string | null {
  switch (level) {
    case "over":
      return sourceTextLimitMessage(wordCount);
    case "warning":
      return `Plus que ${remaining} mots avant la limite.`;
    case "caution":
      return `Il vous reste ${remaining} mots.`;
    case "ok":
      return null;
  }
}

export function SourceTextCounter({ text, id }: SourceTextCounterProps) {
  const { wordCount, remaining, level } = measureSourceText(text);
  const notice = noticeFor(level, remaining, wordCount);
  const filled = Math.min(100, Math.round((wordCount / SOURCE_TEXT_MAX_WORDS) * 100));

  return (
    <div
      id={id}
      className={styles.counter}
      data-level={level}
      /*
       * `status`, not `alert`: the count changes on every keystroke, and an
       * assertive live region would interrupt a screen-reader user mid-word,
       * every word. Polite lets it be announced at the next pause instead —
       * the refusal that actually blocks the step is raised separately, as a
       * real `role="alert"`, by the wizard.
       */
      role="status"
      aria-live="polite"
    >
      <p className={styles.count}>
        <strong className={styles.value}>{wordCount}</strong>
        <span className={styles.total}> / {SOURCE_TEXT_MAX_WORDS} mots</span>
      </p>
      {/*
       * Decorative: it repeats the count the line above already states, so a
       * screen reader announcing it twice would only be noise. The one value
       * that cannot come from the stylesheet is the fill itself — it is data,
       * not a design decision — so it travels as a custom property and the
       * module keeps every colour and dimension (CLAUDE.md §12).
       */}
      <span
        className={styles.track}
        aria-hidden="true"
        style={{ "--fill": `${filled}%` } as React.CSSProperties}
      >
        <span className={styles.fill} />
      </span>
      {notice ? <p className={styles.notice}>{notice}</p> : null}
    </div>
  );
}
