import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OutlineTree } from "./outline-tree";
import type { PartView } from "./views";

/** `Intl.NumberFormat("fr-FR")` groups thousands with U+202F, not a plain space. */
function frGrouped(value: number): string {
  return value.toLocaleString("fr-FR");
}

const THREAD = { id: "thread-1", label: "Le secret d'Ana" };

const CHAPTER_PLANNED = {
  id: "chapter-1",
  number: 1,
  status: "PLANNED" as const,
  statusLabel: "Planifié",
  workingTitle: "Le seuil",
  targetWordCount: 2_500,
  focalCharacterName: "Ana",
  placeName: "La gare",
  periodLabel: "jour 1",
  dramaticFunction: "Lancer l'intrigue",
  immediateGoal: "Partir avant l'aube",
  obstacle: "Le dernier train est déjà passé",
  decision: "Ana marche",
  revelation: null,
  consequence: "Ana quitte la ville",
  detailedSummary: "Ana part à pied.",
  lockedAt: null,
  presentCharacterNames: ["Ana", "Marc"],
  factStatements: ["Ana connaît Marc"],
  threadActions: { opens: [THREAD], continues: [], closes: [] },
};

const CHAPTER_UNPLANNED = {
  id: "chapter-2",
  number: 2,
  status: "TO_WRITE" as const,
  statusLabel: "À rédiger",
  workingTitle: null,
  targetWordCount: null,
  focalCharacterName: null,
  placeName: null,
  periodLabel: null,
  dramaticFunction: null,
  immediateGoal: null,
  obstacle: null,
  decision: null,
  revelation: null,
  consequence: null,
  detailedSummary: null,
  lockedAt: null,
  presentCharacterNames: [],
  factStatements: [],
  threadActions: { opens: [], continues: [], closes: [] },
};

const CHAPTER_LOCKED = {
  id: "chapter-3",
  number: 3,
  status: "LOCKED" as const,
  statusLabel: "Verrouillé",
  workingTitle: "La rupture",
  targetWordCount: 3_000,
  focalCharacterName: "Marc",
  placeName: null,
  periodLabel: null,
  dramaticFunction: "Affronter la vérité",
  immediateGoal: null,
  obstacle: null,
  decision: null,
  revelation: null,
  consequence: "Le fil se referme",
  detailedSummary: null,
  lockedAt: new Date("2026-01-01"),
  presentCharacterNames: ["Marc"],
  factStatements: [],
  threadActions: { opens: [], continues: [THREAD], closes: [THREAD] },
};

const PARTS: readonly PartView[] = [
  {
    id: "part-1",
    number: 1,
    title: "Le Départ",
    dramaticObjective: "Faire quitter Ana la ville",
    initialState: null,
    tippingPoint: "Ana rate le dernier train et part à pied",
    finalState: null,
    chapters: [CHAPTER_PLANNED, CHAPTER_UNPLANNED],
    plannedWordCount: 2_500,
    unplannedChapterCount: 1,
    cumulativeWordCount: 2_500,
  },
  {
    id: "part-2",
    number: 2,
    title: "Le Conflit",
    dramaticObjective: null,
    initialState: null,
    tippingPoint: null,
    finalState: null,
    chapters: [CHAPTER_LOCKED],
    plannedWordCount: 3_000,
    unplannedChapterCount: 0,
    cumulativeWordCount: 5_500,
  },
];

/**
 * The move never runs here: `renderToStaticMarkup` produces markup and fires no
 * event, and what a keystroke or a drop *does* is proved end-to-end
 * (`outline-reorder.spec.ts`). The stub is what lets this file stay a markup
 * test — the whole reason the action is a prop rather than an import.
 */
const NO_MOVE = () => Promise.resolve({ status: "idle" as const });

function render(): string {
  return renderToStaticMarkup(<OutlineTree parts={PARTS} moveChapter={NO_MOVE} />);
}

describe("OutlineTree", () => {
  it("renders every part heading and its running cumulative total", () => {
    const html = render();

    expect(html).toContain("Partie 1 — Le Départ");
    expect(html).toContain("Partie 2 — Le Conflit");
    expect(html).toContain(`cumul ${frGrouped(2_500)} mots`);
    expect(html).toContain(`cumul ${frGrouped(5_500)} mots`);
  });

  it("renders a part with no dramatic-objective/tipping-point/final-state as having no subtitle", () => {
    // part-2 leaves all three null — its own subtitle paragraph must not
    // render at all. Sliced up to the chapter group so the chapter's own
    // (unrelated) preview paragraphs are not mistaken for it.
    const html = render();
    const afterTitle = html.slice(html.indexOf("Le Conflit"));
    const beforeChapterGroup = afterTitle.slice(0, afterTitle.indexOf('role="group"'));

    expect(beforeChapterGroup).not.toContain("<p");
  });

  it("shows every chapter's compact row by default, collapsed", () => {
    const html = render();

    expect(html).toContain("Le seuil");
    expect(html).toContain("Chapitre 2");
    expect(html).toContain("La rupture");
    // The detail block only renders once a chapter is expanded — collapsed
    // by default, so its own-only fields must not appear on first render.
    expect(html).not.toContain("Objectif immédiat");
    expect(html).not.toContain(CHAPTER_PLANNED.immediateGoal);
  });

  it("previews the dramatic function and the consequence without expanding", () => {
    const html = render();

    expect(html).toContain("Lancer l&#x27;intrigue");
    expect(html).toContain("Ana quitte la ville");
  });

  it("marks an unplanned chapter's function, consequence and length as such", () => {
    const html = render();
    const secondChapter = html.slice(html.indexOf("Chapitre 2"), html.indexOf("La rupture"));

    expect(secondChapter).toContain("non planifié");
  });

  it("counts each chapter's thread actions", () => {
    const html = render();

    expect(html).toContain("Ouvre 1");
    expect(html).toContain("Poursuit 1");
    expect(html).toContain("Ferme 1");
  });

  it("shows a lock badge only for a locked chapter", () => {
    const html = render();
    const firstChapter = html.slice(html.indexOf("Le seuil"), html.indexOf("Chapitre 2"));
    const thirdChapter = html.slice(html.indexOf("La rupture"));

    expect(firstChapter).not.toContain("Verrouillé");
    expect(thirdChapter).toContain("Verrouillé");
  });

  it("exposes a proper two-level ARIA tree, expanded by default at the part level", () => {
    const html = render();

    expect(html).toContain('role="tree"');
    expect(html).toContain('aria-level="1"');
    expect(html).toContain('aria-level="2"');
    expect(html).toContain('role="group"');
    // Parts start expanded, chapters start collapsed.
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(2);
  });

  it("offers expand-all and collapse-all controls", () => {
    const html = render();

    expect(html).toContain("Tout déplier");
    expect(html).toContain("Tout replier");
  });

  // --- reordering (CAL-105) ------------------------------------------------
  //
  // There is no jsdom in this repository, so what a keystroke or a drop does is
  // proved end-to-end (`outline-reorder.spec.ts`). What is provable here is the
  // markup the two gestures need: the handles, their names, and the region the
  // result is announced in.

  it("gives every chapter a named pair of move controls", () => {
    const html = render();

    for (const number of [1, 2, 3]) {
      expect(html).toContain(`aria-label="Monter le chapitre ${String(number)}"`);
      expect(html).toContain(`aria-label="Descendre le chapitre ${String(number)}"`);
    }
  });

  it("disables the move that would leave the plan, and only that one", () => {
    // Chapter 1 is at the head of the novel and chapter 3 at its tail; a plan
    // does not wrap, so exactly one direction is unavailable at each end. The
    // middle chapter has both.
    expect(moveButton("Monter le chapitre 1")).toContain("disabled");
    expect(moveButton("Descendre le chapitre 1")).not.toContain("disabled");
    expect(moveButton("Monter le chapitre 2")).not.toContain("disabled");
    expect(moveButton("Descendre le chapitre 2")).not.toContain("disabled");
    expect(moveButton("Descendre le chapitre 3")).toContain("disabled");
  });

  it("makes a locked chapter movable like any other", () => {
    // The lock stops automatic modification (CAL-107); a move is the author's
    // own decision, so the locked chapter's controls are ordinary ones.
    expect(moveButton("Monter le chapitre 3")).not.toContain("disabled");
  });

  it("makes every chapter row draggable and keeps a region to report the move in", () => {
    const html = render();

    expect(html.match(/draggable="true"/g)).toHaveLength(3);
    expect(html).toContain('role="status"');
    expect(html).toContain("Alt + flèche haut");
  });

  it("keeps the tree to a single tab stop, move controls included", () => {
    const html = render();

    // The roving tabindex is the APG's own: one `0`, everything else `-1` —
    // and six move buttons are exactly why that has to be re-checked here.
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    // Four treeitems out of five, plus two move buttons on each of the three
    // chapters. Nothing else in the tree is reachable by Tab.
    expect(html.match(/tabindex="-1"/g)).toHaveLength(4 + 3 * 2);
  });
});

/** One move control's own markup, from its accessible name to its closing tag. */
function moveButton(label: string): string {
  const html = render();
  const start = html.indexOf(`aria-label="${label}"`);

  expect(start).toBeGreaterThan(-1);

  return html.slice(start, html.indexOf("</button>", start));
}
