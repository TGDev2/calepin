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

function render(): string {
  return renderToStaticMarkup(<OutlineTree parts={PARTS} />);
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
});
