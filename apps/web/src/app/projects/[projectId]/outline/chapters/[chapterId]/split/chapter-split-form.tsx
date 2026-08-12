"use client";

/**
 * The arbitration itself: where each of a chapter's attributes goes (CAL-106).
 *
 * Three ideas hold the form together.
 *
 * 1. **It opens loss-free.** Every reference starts on both halves and every
 *    prose column starts as a copy of the chapter's own, so the redistribution
 *    is valid before the author has touched anything and stays valid as they
 *    narrow it. The alternative — an empty second half — would make the first
 *    twenty interactions a series of refusals.
 * 2. **The conservation rule runs here too.** `checkChapterSplit` is pure and
 *    row-capable, so the form runs the *same* function the repository will and
 *    shows what is missing while it is being decided. It is a preview, never
 *    the authority: the write re-checks against rows read inside its own
 *    transaction (§6).
 * 3. **An endpoint is a two-way choice, a continuation a three-way one.**
 *    `Thread.openingChapterId` and `closingChapterId` are single columns, so
 *    the control does not offer *les deux* for them at all — the shape says it
 *    before any checker has to.
 *
 * The action arrives as a prop, bound by the server component: a client
 * component that imports a `"use server"` module loads the whole server graph
 * in its own unit test (`tasks/lessons.md`).
 */

import {
  type ChapterSplitArbitration,
  type ChapterSplitHalf,
  type ChapterSplitHalfName,
  checkChapterSplit,
} from "@calepin/outline";
import { useMemo, useState, useTransition } from "react";

import { type ChapterSplitState, splitDefectSentence } from "@/lib/outline-cut";

import styles from "./chapter-split-form.module.css";

/** One thing the author places, with the words they recognise it by. */
export interface SplitElementView {
  readonly id: string;
  readonly label: string;
}

export interface ChapterSplitSourceView {
  readonly chapterId: string;
  readonly number: number;
  readonly workingTitle: string | null;
  readonly targetWordCount: number | null;
  readonly focalCharacterId: string | null;
  readonly placeId: string | null;
  readonly placeName: string | null;
  readonly periodStartDay: number | null;
  readonly periodEndDay: number | null;
  readonly periodPrecision: ChapterSplitHalf["periodPrecision"];
  readonly periodLabel: string | null;
  readonly dramaticFunction: string | null;
  readonly immediateGoal: string | null;
  readonly obstacle: string | null;
  readonly decision: string | null;
  readonly revelation: string | null;
  readonly consequence: string | null;
  readonly detailedSummary: string | null;
  readonly lockedAt: Date | null;
  readonly characters: readonly SplitElementView[];
  readonly facts: readonly SplitElementView[];
  readonly opensThreads: readonly SplitElementView[];
  readonly continuesThreads: readonly SplitElementView[];
  readonly closesThreads: readonly SplitElementView[];
}

/** Where one element sits. `both` is unavailable for a thread endpoint. */
type Placement = "first" | "second" | "both";

const PROSE_FIELDS = [
  { key: "dramaticFunction", label: "Fonction dramatique" },
  { key: "immediateGoal", label: "Objectif immédiat" },
  { key: "obstacle", label: "Obstacle" },
  { key: "decision", label: "Décision" },
  { key: "revelation", label: "Révélation" },
  { key: "consequence", label: "Conséquence" },
  { key: "detailedSummary", label: "Résumé détaillé" },
] as const;

type ProseKey = (typeof PROSE_FIELDS)[number]["key"];

interface HalfDraft {
  readonly workingTitle: string;
  readonly targetWordCount: string;
  readonly focalCharacterId: string;
  readonly periodStartDay: string;
  readonly periodEndDay: string;
  readonly periodLabel: string;
  readonly prose: Readonly<Record<ProseKey, string>>;
}

function seedHalf(source: ChapterSplitSourceView, suffix: string): HalfDraft {
  return {
    workingTitle: source.workingTitle === null ? "" : `${source.workingTitle}${suffix}`,
    targetWordCount:
      source.targetWordCount === null ? "" : String(Math.round(source.targetWordCount / 2)),
    focalCharacterId: source.focalCharacterId ?? "",
    periodStartDay: source.periodStartDay === null ? "" : String(source.periodStartDay),
    periodEndDay: source.periodEndDay === null ? "" : String(source.periodEndDay),
    periodLabel: source.periodLabel ?? "",
    prose: Object.fromEntries(
      PROSE_FIELDS.map((field) => [field.key, source[field.key] ?? ""]),
    ) as Record<ProseKey, string>,
  };
}

function trimmed(value: string): string | null {
  const text = value.trim();

  return text.length === 0 ? null : text;
}

function counted(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10);

  return Number.isFinite(parsed) ? parsed : null;
}

interface ChapterSplitFormProps {
  readonly source: ChapterSplitSourceView;
  readonly outlinePath: string;
  readonly splitChapter: (submitted: unknown) => Promise<ChapterSplitState>;
}

export function ChapterSplitForm({ source, outlinePath, splitChapter }: ChapterSplitFormProps) {
  const [first, setFirst] = useState(() => seedHalf(source, " (1)"));
  const [second, setSecond] = useState(() => seedHalf(source, " (2)"));
  const [placements, setPlacements] = useState<Record<string, Placement>>(() => {
    const seeded: Record<string, Placement> = {};

    for (const element of [...source.characters, ...source.facts, ...source.continuesThreads]) {
      seeded[element.id] = "both";
    }
    // An endpoint is one column on `Thread`: it goes to one half or the other.
    for (const element of [...source.opensThreads, ...source.closesThreads]) {
      seeded[element.id] = "first";
    }

    return seeded;
  });
  const [state, setState] = useState<ChapterSplitState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const arbitration = useMemo<ChapterSplitArbitration>(() => {
    const kept = (elements: readonly SplitElementView[], half: ChapterSplitHalfName): string[] =>
      elements
        .filter((element) => {
          const placement = placements[element.id] ?? "both";

          return placement === "both" || placement === half;
        })
        .map((element) => element.id);

    const build = (draft: HalfDraft, half: ChapterSplitHalfName): ChapterSplitHalf => ({
      workingTitle: trimmed(draft.workingTitle),
      targetWordCount: counted(draft.targetWordCount),
      focalCharacterId: trimmed(draft.focalCharacterId),
      // A split cuts a chapter, it does not relocate it: both halves keep the
      // chapter's own place, so no place can be lost on the way.
      placeId: source.placeId,
      periodStartDay: counted(draft.periodStartDay),
      periodEndDay: counted(draft.periodEndDay),
      periodPrecision: source.periodPrecision,
      periodLabel: trimmed(draft.periodLabel),
      dramaticFunction: trimmed(draft.prose.dramaticFunction),
      immediateGoal: trimmed(draft.prose.immediateGoal),
      obstacle: trimmed(draft.prose.obstacle),
      decision: trimmed(draft.prose.decision),
      revelation: trimmed(draft.prose.revelation),
      consequence: trimmed(draft.prose.consequence),
      detailedSummary: trimmed(draft.prose.detailedSummary),
      characterIds: kept(source.characters, half),
      factIds: kept(source.facts, half),
      opensThreadIds: kept(source.opensThreads, half),
      continuesThreadIds: kept(source.continuesThreads, half),
      closesThreadIds: kept(source.closesThreads, half),
    });

    return {
      chapterId: source.chapterId,
      first: build(first, "first"),
      second: build(second, "second"),
    };
  }, [source, first, second, placements]);

  /**
   * The same check the write will run, over the chapter as this screen read it.
   * A preview, never the authority.
   */
  const preview = useMemo(
    () =>
      checkChapterSplit(
        {
          id: source.chapterId,
          partId: "",
          orderKey: "",
          revisionCount: 0,
          outline: {
            workingTitle: source.workingTitle,
            targetWordCount: source.targetWordCount,
            focalCharacterId: source.focalCharacterId,
            placeId: source.placeId,
            periodStartDay: source.periodStartDay,
            periodEndDay: source.periodEndDay,
            periodPrecision: source.periodPrecision,
            periodLabel: source.periodLabel,
            dramaticFunction: source.dramaticFunction,
            immediateGoal: source.immediateGoal,
            obstacle: source.obstacle,
            decision: source.decision,
            revelation: source.revelation,
            consequence: source.consequence,
            detailedSummary: source.detailedSummary,
            lockedAt: null,
            characterIds: source.characters.map((element) => element.id),
            factIds: source.facts.map((element) => element.id),
          },
          opensThreadIds: source.opensThreads.map((element) => element.id),
          continuesThreadIds: source.continuesThreads.map((element) => element.id),
          closesThreadIds: source.closesThreads.map((element) => element.id),
        },
        arbitration,
      ),
    [source, arbitration],
  );

  const submit = () => {
    startTransition(async () => {
      const answer = await splitChapter(arbitration);

      setState(answer);
      if (answer.status === "idle") window.location.assign(outlinePath);
    });
  };

  const defectSentences = [
    ...new Set(preview.defects.map((defect) => splitDefectSentence(defect.kind))),
  ];

  return (
    <div className={styles.wrapper}>
      <p
        className={preview.acceptable ? styles.conserved : styles.incomplete}
        role="status"
        aria-live="polite"
      >
        {preview.acceptable
          ? "Rien n'est perdu : chaque élément du chapitre est repris."
          : "Cette répartition laisse quelque chose de côté."}
      </p>

      {defectSentences.length > 0 ? (
        <ul className={styles.defects}>
          {defectSentences.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ul>
      ) : null}

      <div className={styles.columns}>
        {(
          [
            ["first", "Première moitié", first, setFirst],
            ["second", "Seconde moitié", second, setSecond],
          ] as const
        ).map(([half, heading, draft, setDraft]) => (
          <section key={half} className={styles.column} aria-label={heading}>
            <h2 className={styles.columnTitle}>{heading}</h2>

            <label className={styles.field}>
              <span>Titre provisoire</span>
              <input
                type="text"
                value={draft.workingTitle}
                onChange={(event) => {
                  setDraft({ ...draft, workingTitle: event.target.value });
                }}
              />
            </label>

            <label className={styles.field}>
              <span>Longueur cible, en mots</span>
              <input
                type="number"
                min={0}
                value={draft.targetWordCount}
                onChange={(event) => {
                  setDraft({ ...draft, targetWordCount: event.target.value });
                }}
              />
            </label>

            <label className={styles.field}>
              <span>Personnage focal</span>
              <select
                value={draft.focalCharacterId}
                onChange={(event) => {
                  setDraft({ ...draft, focalCharacterId: event.target.value });
                }}
              >
                <option value="">aucun</option>
                {source.characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.label}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.period}>
              <label className={styles.field}>
                <span>Premier jour</span>
                <input
                  type="number"
                  value={draft.periodStartDay}
                  onChange={(event) => {
                    setDraft({ ...draft, periodStartDay: event.target.value });
                  }}
                />
              </label>
              <label className={styles.field}>
                <span>Dernier jour</span>
                <input
                  type="number"
                  value={draft.periodEndDay}
                  onChange={(event) => {
                    setDraft({ ...draft, periodEndDay: event.target.value });
                  }}
                />
              </label>
            </div>

            <label className={styles.field}>
              <span>Période, en toutes lettres</span>
              <input
                type="text"
                value={draft.periodLabel}
                onChange={(event) => {
                  setDraft({ ...draft, periodLabel: event.target.value });
                }}
              />
            </label>

            {PROSE_FIELDS.map((field) => (
              <label key={field.key} className={styles.field}>
                <span>{field.label}</span>
                <textarea
                  rows={field.key === "detailedSummary" ? 5 : 2}
                  value={draft.prose[field.key]}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      prose: { ...draft.prose, [field.key]: event.target.value },
                    });
                  }}
                />
              </label>
            ))}
          </section>
        ))}
      </div>

      <section className={styles.elements} aria-label="Répartition des éléments">
        <h2 className={styles.columnTitle}>Répartition</h2>

        {(
          [
            ["Personnages présents", source.characters, true],
            ["Faits canoniques", source.facts, true],
            ["Fils ouverts", source.opensThreads, false],
            ["Fils poursuivis", source.continuesThreads, true],
            ["Fils fermés", source.closesThreads, false],
          ] as const
        ).map(([heading, elements, allowsBoth]) =>
          elements.length === 0 ? null : (
            <fieldset key={heading} className={styles.group}>
              <legend>{heading}</legend>
              {elements.map((element) => (
                <div key={element.id} className={styles.element}>
                  <span className={styles.elementLabel}>{element.label}</span>
                  <span className={styles.choices}>
                    {(
                      [
                        ["first", "première"],
                        ["second", "seconde"],
                        ...(allowsBoth ? ([["both", "les deux"]] as const) : []),
                      ] as const
                    ).map(([value, caption]) => (
                      <label key={value} className={styles.choice}>
                        <input
                          type="radio"
                          name={`placement-${element.id}`}
                          value={value}
                          checked={(placements[element.id] ?? "both") === value}
                          onChange={() => {
                            setPlacements({ ...placements, [element.id]: value });
                          }}
                        />
                        <span>{caption}</span>
                      </label>
                    ))}
                  </span>
                </div>
              ))}
            </fieldset>
          ),
        )}
      </section>

      {state.status === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      <div className={styles.controls}>
        <button type="button" onClick={submit} disabled={pending || !preview.acceptable}>
          Scinder le chapitre
        </button>
        <a href={outlinePath}>Annuler</a>
      </div>
    </div>
  );
}
