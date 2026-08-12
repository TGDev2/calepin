"use client";

/**
 * The parts-and-chapters tree (CAL-104) — the first two-level tree widget in
 * this app; no local precedent, so it follows the W3C APG Tree View pattern
 * directly, the way `process-stepper.tsx`'s doc comment already records for
 * the roving-tabindex mechanics it extends here to two levels.
 *
 * **Two independent expand states, one mechanism.** A part's `aria-expanded`
 * shows or hides its `role="group"` of chapter treeitems — the canonical use
 * of the attribute. A chapter has no children to reveal; its own
 * `aria-expanded` instead shows or hides a plain detail block *inside* the
 * same treeitem (immediate goal, obstacle, decision, revelation, full thread
 * labels…) — what keeps fifty chapters legible at once: a collapsed chapter
 * is one line carrying a preview of its dramatic function and consequence
 * (already the "aperçu" the backlog asks for), and only a chapter the reader
 * opens costs the full paragraph. Same `Enter`/`Space`/arrow-key vocabulary
 * either way, because from the keyboard both are "reveal more of this item".
 *
 * **Nesting, not siblings.** A part's chapter `group` is a DOM child of the
 * part's own `treeitem` element (the APG's own structure), which is what
 * makes `event.target !== event.currentTarget` in `handleKeyDown` meaningful
 * rather than decorative: a key pressed on a chapter bubbles through its
 * parent part's listener too, and the guard is what keeps the part from
 * acting on a key its child already handled — `direction-comparison-grid.tsx`'s
 * guard, needed here for a nested treeitem instead of a nested form field.
 *
 * **Arrow keys do not wrap.** `Home`/`End` already reach the ends; a tree,
 * unlike the flat cyclic list `process-stepper.tsx` rove over, is the APG
 * pattern that stops at the first and last visible item instead.
 */

import { useRef, useState } from "react";

import { LockBadge } from "@/components/lock-badge";

import styles from "./outline-tree.module.css";
import type { ChapterThreadActionsView, ChapterView, PartView, ThreadActionView } from "./views";

export interface OutlineTreeProps {
  readonly parts: readonly PartView[];
}

type FlatItem =
  | { readonly kind: "part"; readonly id: string; readonly part: PartView }
  | {
      readonly kind: "chapter";
      readonly id: string;
      readonly chapter: ChapterView;
      readonly part: PartView;
    };

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

export function OutlineTree({ parts }: OutlineTreeProps) {
  const [expandedParts, setExpandedParts] = useState<ReadonlySet<string>>(
    () => new Set(parts.map((part) => part.id)),
  );
  const [expandedChapters, setExpandedChapters] = useState<ReadonlySet<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | null>(parts[0]?.id ?? null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  const visibleItems: FlatItem[] = [];
  for (const part of parts) {
    visibleItems.push({ kind: "part", id: part.id, part });
    if (expandedParts.has(part.id)) {
      for (const chapter of part.chapters) {
        visibleItems.push({ kind: "chapter", id: chapter.id, chapter, part });
      }
    }
  }

  const flatById = new Map<string, { item: FlatItem; index: number }>();
  visibleItems.forEach((item, index) => flatById.set(item.id, { item, index }));

  function registerRef(id: string) {
    return (element: HTMLDivElement | null) => {
      if (element) itemRefs.current.set(id, element);
      else itemRefs.current.delete(id);
    };
  }

  function focusItem(id: string): void {
    setFocusedId(id);
    itemRefs.current.get(id)?.focus();
  }

  function isExpanded(item: FlatItem): boolean {
    return item.kind === "part" ? expandedParts.has(item.id) : expandedChapters.has(item.id);
  }

  function setExpanded(item: FlatItem, value: boolean): void {
    const setter = item.kind === "part" ? setExpandedParts : setExpandedChapters;
    setter((previous) => {
      const next = new Set(previous);
      if (value) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
  }

  function handleExpandAll(): void {
    setExpandedParts(new Set(parts.map((part) => part.id)));
    setExpandedChapters(
      new Set(parts.flatMap((part) => part.chapters.map((chapter) => chapter.id))),
    );
  }

  function handleCollapseAll(): void {
    setExpandedParts(new Set());
    setExpandedChapters(new Set());
    if (parts[0]) focusItem(parts[0].id);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>, id: string): void {
    if (event.target !== event.currentTarget) return;

    const entry = flatById.get(id);
    if (!entry) return;
    const { item, index } = entry;

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = visibleItems[index + 1];
        if (next) focusItem(next.id);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const previous = visibleItems[index - 1];
        if (previous) focusItem(previous.id);
        break;
      }
      case "ArrowRight": {
        event.preventDefault();
        if (!isExpanded(item)) {
          setExpanded(item, true);
        } else if (item.kind === "part") {
          const firstChild = visibleItems[index + 1];
          if (firstChild?.kind === "chapter" && firstChild.part.id === item.id) {
            focusItem(firstChild.id);
          }
        }
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        if (isExpanded(item)) {
          setExpanded(item, false);
        } else if (item.kind === "chapter") {
          focusItem(item.part.id);
        }
        break;
      }
      case "Home": {
        event.preventDefault();
        const first = visibleItems[0];
        if (first) focusItem(first.id);
        break;
      }
      case "End": {
        event.preventDefault();
        const last = visibleItems[visibleItems.length - 1];
        if (last) focusItem(last.id);
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        setExpanded(item, !isExpanded(item));
        break;
      }
      default:
        break;
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <button type="button" className={styles.controlButton} onClick={handleExpandAll}>
          Tout déplier
        </button>
        <button type="button" className={styles.controlButton} onClick={handleCollapseAll}>
          Tout replier
        </button>
      </div>

      <div role="tree" aria-label="Plan du roman, par parties et chapitres" className={styles.tree}>
        {parts.map((part) => {
          const expanded = expandedParts.has(part.id);
          const partSubtitle = part.tippingPoint ?? part.dramaticObjective ?? part.finalState;

          return (
            <div
              key={part.id}
              ref={registerRef(part.id)}
              role="treeitem"
              aria-level={1}
              aria-expanded={expanded}
              aria-selected={false}
              tabIndex={focusedId === part.id ? 0 : -1}
              className={styles.partItem}
              onKeyDown={(event) => handleKeyDown(event, part.id)}
              onFocus={() => setFocusedId(part.id)}
            >
              <div
                className={styles.partRow}
                onClick={() => setExpanded({ kind: "part", id: part.id, part }, !expanded)}
              >
                <span className={styles.disclosureIcon} aria-hidden="true">
                  {expanded ? "▾" : "▸"}
                </span>
                <span className={styles.partTitle}>
                  Partie {part.number} — {part.title}
                </span>
                <span className={styles.partMeta}>
                  {part.chapters.length} chapitre{part.chapters.length > 1 ? "s" : ""} ·{" "}
                  {NUMBER_FORMAT.format(part.plannedWordCount)} mots · cumul{" "}
                  {NUMBER_FORMAT.format(part.cumulativeWordCount)} mots
                </span>
              </div>

              {partSubtitle === null ? null : <p className={styles.partSubtitle}>{partSubtitle}</p>}

              {expanded ? (
                <div role="group" className={styles.chapterGroup}>
                  {part.chapters.map((chapter) => (
                    <ChapterRow
                      key={chapter.id}
                      chapter={chapter}
                      expanded={expandedChapters.has(chapter.id)}
                      focused={focusedId === chapter.id}
                      registerRef={registerRef(chapter.id)}
                      onKeyDown={(event) => handleKeyDown(event, chapter.id)}
                      onFocus={() => setFocusedId(chapter.id)}
                      onToggle={() =>
                        setExpanded(
                          { kind: "chapter", id: chapter.id, chapter, part },
                          !expandedChapters.has(chapter.id),
                        )
                      }
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ChapterRowProps {
  readonly chapter: ChapterView;
  readonly expanded: boolean;
  readonly focused: boolean;
  readonly registerRef: (element: HTMLDivElement | null) => void;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  readonly onFocus: () => void;
  readonly onToggle: () => void;
}

function ChapterRow({
  chapter,
  expanded,
  focused,
  registerRef,
  onKeyDown,
  onFocus,
  onToggle,
}: ChapterRowProps) {
  return (
    <div
      ref={registerRef}
      role="treeitem"
      aria-level={2}
      aria-expanded={expanded}
      aria-selected={false}
      tabIndex={focused ? 0 : -1}
      className={styles.chapterItem}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      <div className={styles.chapterRow} onClick={onToggle}>
        <span className={styles.disclosureIcon} aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
        <span className={styles.chapterNumber}>{chapter.number}.</span>
        <span className={styles.chapterTitle}>
          {chapter.workingTitle ?? `Chapitre ${chapter.number}`}
        </span>
        <span className={styles.chapterStatus}>{chapter.statusLabel}</span>
        {chapter.lockedAt === null ? null : <LockBadge variant="locked" />}
      </div>

      <p className={styles.chapterPreview}>
        <span className={styles.previewLabel}>Fonction dramatique&nbsp;: </span>
        {chapter.dramaticFunction ?? "— non planifiée —"}
      </p>
      <p className={styles.chapterPreview}>
        <span className={styles.previewLabel}>Conséquence&nbsp;: </span>
        {chapter.consequence ?? "— non planifiée —"}
      </p>

      <div className={styles.chapterMeta}>
        <span>
          {chapter.targetWordCount === null
            ? "— non planifié —"
            : `${NUMBER_FORMAT.format(chapter.targetWordCount)} mots`}
        </span>
        <ThreadActionCounts actions={chapter.threadActions} />
      </div>

      {expanded ? <ChapterDetail chapter={chapter} /> : null}
    </div>
  );
}

interface ThreadActionCountsProps {
  readonly actions: ChapterThreadActionsView;
}

function ThreadActionCounts({ actions }: ThreadActionCountsProps) {
  if (actions.opens.length === 0 && actions.continues.length === 0 && actions.closes.length === 0) {
    return null;
  }

  return (
    <span className={styles.threadCounts}>
      {actions.opens.length > 0 ? (
        <span className={styles.threadBadge}>Ouvre {actions.opens.length}</span>
      ) : null}
      {actions.continues.length > 0 ? (
        <span className={styles.threadBadge}>Poursuit {actions.continues.length}</span>
      ) : null}
      {actions.closes.length > 0 ? (
        <span className={styles.threadBadge}>Ferme {actions.closes.length}</span>
      ) : null}
    </span>
  );
}

interface ChapterDetailProps {
  readonly chapter: ChapterView;
}

function ChapterDetail({ chapter }: ChapterDetailProps) {
  return (
    <dl className={styles.detail}>
      {chapter.immediateGoal === null ? null : (
        <Fact term="Objectif immédiat" value={chapter.immediateGoal} />
      )}
      {chapter.obstacle === null ? null : <Fact term="Obstacle" value={chapter.obstacle} />}
      {chapter.decision === null ? null : <Fact term="Décision" value={chapter.decision} />}
      {chapter.revelation === null ? null : <Fact term="Révélation" value={chapter.revelation} />}
      {chapter.detailedSummary === null ? null : (
        <Fact term="Résumé détaillé" value={chapter.detailedSummary} />
      )}
      {chapter.focalCharacterName === null ? null : (
        <Fact term="Personnage focal" value={chapter.focalCharacterName} />
      )}
      {chapter.placeName === null ? null : <Fact term="Lieu" value={chapter.placeName} />}
      {chapter.periodLabel === null ? null : <Fact term="Période" value={chapter.periodLabel} />}
      {chapter.presentCharacterNames.length === 0 ? null : (
        <Fact term="Personnages présents" value={chapter.presentCharacterNames.join(", ")} />
      )}
      {chapter.factStatements.length === 0 ? null : (
        <Fact term="Faits canoniques concernés" value={chapter.factStatements.join(" · ")} />
      )}

      <ThreadActionList label="Ouvre" actions={chapter.threadActions.opens} />
      <ThreadActionList label="Poursuit" actions={chapter.threadActions.continues} />
      <ThreadActionList label="Ferme" actions={chapter.threadActions.closes} />
    </dl>
  );
}

interface FactProps {
  readonly term: string;
  readonly value: string;
}

function Fact({ term, value }: FactProps) {
  return (
    <div className={styles.fact}>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface ThreadActionListProps {
  readonly label: string;
  readonly actions: readonly ThreadActionView[];
}

function ThreadActionList({ label, actions }: ThreadActionListProps) {
  if (actions.length === 0) return null;

  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{actions.map((action) => action.label).join(", ")}</dd>
    </div>
  );
}
