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
 *
 * ---
 *
 * **Reordering (CAL-105).** Three ways in, one operation underneath — every
 * gesture resolves to a `landing`: the part the chapter joins, and the chapter
 * it lands behind (`null` = first of that part). That is what the domain takes,
 * and computing it here rather than a position is what keeps the drag and the
 * keyboard from ever disagreeing.
 *
 *   - **Drag and drop**, native, no library — the app has no drag dependency
 *     and a reorder is not a reason to acquire one. Dropping on the upper half
 *     of a chapter puts the dragged one before it, on the lower half after it,
 *     and dropping on a part's header puts it first in that part, which is also
 *     the only way into a part that has been emptied.
 *   - **`Alt`+`↑` / `Alt`+`↓`**, one landing at a time. The landings are
 *     enumerated across the whole novel — the head of every part, then behind
 *     every chapter of it — so stepping past the last chapter of a part lands
 *     in the next one without a special case, and an empty part is reachable.
 *     A step that only changes the part leaves the number where it was, and the
 *     announcement says so.
 *   - **Visible "Monter" / "Descendre" buttons**, the same two landings. They
 *     carry `tabIndex={-1}`: the APG keeps a tree to a single tab stop, and
 *     fifty chapters would otherwise cost a hundred stops before the next
 *     control on the page.
 *
 * **The screen predicts nothing.** A move calls the action and waits; the plan
 * comes back re-rendered by the server, and only then does the tree announce
 * where the chapter is and put focus back on it. An optimistic reordering would
 * have to re-derive the numbering — the one number this whole design refuses to
 * store twice.
 *
 * **The action arrives as a prop**, bound to the project by `page.tsx`, rather
 * than imported here. `"use server"` is erased into a client reference by the
 * bundler but not by a test runner, so importing `./actions` from this file
 * would pull `lib/auth.ts` and the validated config behind it into
 * `outline-tree.test.tsx` — which then fails naming seventeen missing
 * environment variables and nothing to do with a tree. The same injection §5.3
 * asks for one layer down, for the same reason: what is passed in can be
 * replaced in a test.
 */

import type { ChapterMoveRequest } from "@calepin/outline";
import { useEffect, useRef, useState, useTransition } from "react";

import { LockBadge } from "@/components/lock-badge";
import { chapterMovedAnnouncement, type ChapterMoveState } from "@/lib/outline-move";

import styles from "./outline-tree.module.css";
import type { ChapterThreadActionsView, ChapterView, PartView, ThreadActionView } from "./views";

export interface OutlineTreeProps {
  readonly parts: readonly PartView[];
  /** `moveChapterAction`, already bound to this project. */
  readonly moveChapter: (request: ChapterMoveRequest) => Promise<ChapterMoveState>;
}

type FlatItem =
  | { readonly kind: "part"; readonly id: string; readonly part: PartView }
  | {
      readonly kind: "chapter";
      readonly id: string;
      readonly chapter: ChapterView;
      readonly part: PartView;
    };

/** Where a chapter is asked to go: the part, and the chapter it lands behind. */
interface Landing {
  readonly partId: string;
  readonly afterChapterId: string | null;
}

/** Which edge of which row the pointer is currently offering. */
type DropHint =
  | { readonly kind: "chapter"; readonly chapterId: string; readonly edge: "before" | "after" }
  | { readonly kind: "part"; readonly partId: string };

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

/**
 * Every landing of the novel, in reading order, for a given moving chapter.
 *
 * The moved chapter is left out because it is not a position: `planChapterMove`
 * reads the anchor against the part *as it will be once the chapter has left*,
 * and the keyboard has to step through the same list the domain will resolve.
 */
function landingsExcluding(parts: readonly PartView[], movingId: string): Landing[] {
  const landings: Landing[] = [];

  for (const part of parts) {
    landings.push({ partId: part.id, afterChapterId: null });
    for (const chapter of part.chapters) {
      if (chapter.id === movingId) continue;
      landings.push({ partId: part.id, afterChapterId: chapter.id });
    }
  }

  return landings;
}

/** The landing a chapter occupies today: its part, behind the sibling above it. */
function currentLanding(part: PartView, chapterId: string): Landing {
  const index = part.chapters.findIndex((chapter) => chapter.id === chapterId);

  return {
    partId: part.id,
    afterChapterId: index <= 0 ? null : (part.chapters[index - 1]?.id ?? null),
  };
}

function sameLanding(left: Landing, right: Landing): boolean {
  return left.partId === right.partId && left.afterChapterId === right.afterChapterId;
}

/**
 * Where a chapter stands, as one comparable value: its part and its number.
 *
 * The pair rather than the number alone, because a chapter can move from the end
 * of one part to the head of the next without its number changing — the plan
 * numbers continuously across parts.
 */
function placementKey(partId: string, chapterNumber: number): string {
  return `${partId}|${String(chapterNumber)}`;
}

export function OutlineTree({ parts, moveChapter }: OutlineTreeProps) {
  const [expandedParts, setExpandedParts] = useState<ReadonlySet<string>>(
    () => new Set(parts.map((part) => part.id)),
  );
  const [expandedChapters, setExpandedChapters] = useState<ReadonlySet<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | null>(parts[0]?.id ?? null);
  const [moveState, setMoveState] = useState<ChapterMoveState>({ status: "idle" });
  const [announcement, setAnnouncement] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [pending, startTransition] = useTransition();
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  /**
   * The chapter a move is in flight for, and where it stood when it left —
   * refocused and announced once the server's own plan says it has arrived.
   */
  const movingRef = useRef<{ readonly id: string; readonly from: string } | null>(null);

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

  /**
   * Once the server's own plan has arrived: say where the chapter landed, and
   * give it the focus back.
   *
   * **Keyed on the placement, not on the transition.** The action resolving and
   * the re-rendered plan reaching this component are two moments, and they are
   * not the same one: waiting on `useTransition`'s pending flag announced the
   * chapter's *old* position, because `parts` was still the previous render's.
   * Comparing against where it stood when it left is what makes the wait
   * self-timing — including for a move that changes only the part, which leaves
   * the number alone but not the placement.
   *
   * A move the server refused, or one that turned out to be a no-op, therefore
   * announces nothing at all: the placement never changes, so this never fires,
   * and the tree keeps saying what it already said.
   *
   * Everything is inlined rather than delegated to the helpers below, so the
   * dependency is the one value it reads.
   */
  useEffect(() => {
    const moving = movingRef.current;
    if (moving === null) return;

    for (const part of parts) {
      const chapter = part.chapters.find((row) => row.id === moving.id);
      if (chapter === undefined) continue;
      if (placementKey(part.id, chapter.number) === moving.from) return;

      movingRef.current = null;
      setAnnouncement(chapterMovedAnnouncement(chapter.number, part.number));
      setFocusedId(moving.id);
      itemRefs.current.get(moving.id)?.focus();

      return;
    }
  }, [parts]);

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

  /**
   * The one path every gesture ends in.
   *
   * A move already in flight is ignored rather than queued: the second gesture
   * was aimed at a plan the author could still see, and running it against the
   * one the first is about to produce would land the chapter somewhere nobody
   * pointed. The destination part is expanded first, so the chapter is on screen
   * — and focusable — when it arrives.
   */
  function moveChapterTo(chapterId: string, landing: Landing): void {
    if (pending) return;

    const standing = parts.find((part) =>
      part.chapters.some((chapter) => chapter.id === chapterId),
    );
    const chapter = standing?.chapters.find((row) => row.id === chapterId);
    if (standing === undefined || chapter === undefined) return;

    movingRef.current = { id: chapterId, from: placementKey(standing.id, chapter.number) };
    setMoveState({ status: "idle" });
    setAnnouncement("");
    setExpandedParts((previous) => new Set(previous).add(landing.partId));

    startTransition(async () => {
      const result = await moveChapter({
        chapterId,
        targetPartId: landing.partId,
        afterChapterId: landing.afterChapterId,
      });

      if (result.status === "error") movingRef.current = null;
      setMoveState(result);
    });
  }

  /** One landing up (`-1`) or down (`1`), across the whole novel. */
  function stepChapter(part: PartView, chapterId: string, direction: -1 | 1): void {
    const landings = landingsExcluding(parts, chapterId);
    const index = landings.findIndex((landing) =>
      sameLanding(landing, currentLanding(part, chapterId)),
    );
    if (index === -1) return;

    const next = landings[index + direction];
    // The ends of the novel: nothing above the first landing, nothing below the
    // last. A tree does not wrap, and neither does a plan.
    if (next === undefined) return;

    moveChapterTo(chapterId, next);
  }

  function canStep(part: PartView, chapterId: string, direction: -1 | 1): boolean {
    const landings = landingsExcluding(parts, chapterId);
    const index = landings.findIndex((landing) =>
      sameLanding(landing, currentLanding(part, chapterId)),
    );

    return index !== -1 && landings[index + direction] !== undefined;
  }

  /** The landing a drop on a given row means. */
  function landingForDrop(hint: DropHint, movingId: string): Landing | null {
    if (hint.kind === "part") return { partId: hint.partId, afterChapterId: null };

    for (const part of parts) {
      const index = part.chapters.findIndex((chapter) => chapter.id === hint.chapterId);
      if (index === -1) continue;

      if (hint.edge === "after") return { partId: part.id, afterChapterId: hint.chapterId };

      // Before this chapter is behind whichever sibling precedes it once the
      // dragged one has left — the same list the keyboard steps through.
      const above = part.chapters.slice(0, index).filter((chapter) => chapter.id !== movingId);

      return { partId: part.id, afterChapterId: above[above.length - 1]?.id ?? null };
    }

    return null;
  }

  function handleDrop(hint: DropHint): void {
    const movingId = dragging;
    setDragging(null);
    setDropHint(null);
    if (movingId === null) return;
    if (hint.kind === "chapter" && hint.chapterId === movingId) return;

    const landing = landingForDrop(hint, movingId);
    if (landing !== null) moveChapterTo(movingId, landing);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>, id: string): void {
    if (event.target !== event.currentTarget) return;

    const entry = flatById.get(id);
    if (!entry) return;
    const { item, index } = entry;

    // Reordering sits in front of the navigation switch and never falls into
    // it: `Alt` is what tells "go to the next chapter" from "take this chapter
    // there", and the modifier guard is what keeps a browser shortcut
    // (`Ctrl`/`Cmd`+arrow) out of it.
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (item.kind !== "chapter" || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
        return;
      }

      event.preventDefault();
      stepChapter(item.part, item.id, event.key === "ArrowUp" ? -1 : 1);

      return;
    }

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
        <p className={styles.hint}>
          Glissez un chapitre pour le déplacer, ou utilisez Alt + flèche haut et Alt + flèche bas.
        </p>
      </div>

      <p role="status" aria-live="polite" className={styles.announcement}>
        {pending ? "Déplacement en cours…" : announcement}
      </p>
      {moveState.status === "error" ? (
        <p role="alert" className={styles.error}>
          {moveState.message}
        </p>
      ) : null}

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
                data-drop={
                  dropHint?.kind === "part" && dropHint.partId === part.id ? "head" : undefined
                }
                onClick={() => setExpanded({ kind: "part", id: part.id, part }, !expanded)}
                onDragOver={(event) => {
                  if (dragging === null) return;
                  event.preventDefault();
                  setDropHint({ kind: "part", partId: part.id });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDrop({ kind: "part", partId: part.id });
                }}
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
                      dragging={dragging === chapter.id}
                      dropEdge={
                        dropHint?.kind === "chapter" && dropHint.chapterId === chapter.id
                          ? dropHint.edge
                          : null
                      }
                      pending={pending}
                      canMoveUp={canStep(part, chapter.id, -1)}
                      canMoveDown={canStep(part, chapter.id, 1)}
                      registerRef={registerRef(chapter.id)}
                      onKeyDown={(event) => handleKeyDown(event, chapter.id)}
                      onFocus={() => setFocusedId(chapter.id)}
                      onToggle={() =>
                        setExpanded(
                          { kind: "chapter", id: chapter.id, chapter, part },
                          !expandedChapters.has(chapter.id),
                        )
                      }
                      onMove={(direction) => stepChapter(part, chapter.id, direction)}
                      onDragStart={() => setDragging(chapter.id)}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropHint(null);
                      }}
                      onDragOverEdge={(edge) => {
                        if (dragging === null || dragging === chapter.id) return;
                        setDropHint({ kind: "chapter", chapterId: chapter.id, edge });
                      }}
                      onDropEdge={(edge) => {
                        handleDrop({ kind: "chapter", chapterId: chapter.id, edge });
                      }}
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
  readonly dragging: boolean;
  readonly dropEdge: "before" | "after" | null;
  readonly pending: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly registerRef: (element: HTMLDivElement | null) => void;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  readonly onFocus: () => void;
  readonly onToggle: () => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onDragStart: () => void;
  readonly onDragEnd: () => void;
  readonly onDragOverEdge: (edge: "before" | "after") => void;
  readonly onDropEdge: (edge: "before" | "after") => void;
}

/** Which half of the row the pointer is over — the two positions a drop offers. */
function edgeOf(event: React.DragEvent<HTMLDivElement>): "before" | "after" {
  const box = event.currentTarget.getBoundingClientRect();

  return event.clientY < box.top + box.height / 2 ? "before" : "after";
}

function ChapterRow({
  chapter,
  expanded,
  focused,
  dragging,
  dropEdge,
  pending,
  canMoveUp,
  canMoveDown,
  registerRef,
  onKeyDown,
  onFocus,
  onToggle,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOverEdge,
  onDropEdge,
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
      data-drop={dropEdge ?? undefined}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      // The whole item is the drop target while only its first line is the
      // handle: a collapsed chapter's row is barely taller than its text, and
      // half of that is a five-pixel band nobody can aim at. Grabbing stays on
      // the line, because a draggable paragraph is a paragraph that cannot be
      // selected.
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOverEdge(edgeOf(event));
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropEdge(edgeOf(event));
      }}
    >
      <div
        className={styles.chapterRow}
        draggable
        data-dragging={dragging ? "true" : undefined}
        onClick={onToggle}
        onDragStart={(event) => {
          // Firefox refuses to start a drag without payload; the id is what the
          // drop reads anyway, and it never leaves the page.
          event.dataTransfer.setData("text/plain", chapter.id);
          event.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >
        <span className={styles.disclosureIcon} aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
        <span className={styles.chapterNumber}>{chapter.number}.</span>
        <span className={styles.chapterTitle}>
          {chapter.workingTitle ?? `Chapitre ${chapter.number}`}
        </span>
        <span className={styles.chapterStatus}>{chapter.statusLabel}</span>
        {chapter.lockedAt === null ? null : <LockBadge variant="locked" />}

        <span className={styles.moveButtons}>
          <button
            type="button"
            tabIndex={-1}
            className={styles.moveButton}
            aria-label={`Monter le chapitre ${String(chapter.number)}`}
            disabled={pending || !canMoveUp}
            onClick={(event) => {
              event.stopPropagation();
              onMove(-1);
            }}
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            tabIndex={-1}
            className={styles.moveButton}
            aria-label={`Descendre le chapitre ${String(chapter.number)}`}
            disabled={pending || !canMoveDown}
            onClick={(event) => {
              event.stopPropagation();
              onMove(1);
            }}
          >
            <span aria-hidden="true">↓</span>
          </button>
        </span>
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
