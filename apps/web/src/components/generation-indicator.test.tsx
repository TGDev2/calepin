import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { RunningGenerationView } from "@/lib/generation-events";

import { GenerationIndicator } from "./generation-indicator";

/** One in-flight generation with nothing reported about it yet. */
function running(view: Partial<RunningGenerationView> = {}): RunningGenerationView {
  return {
    id: "gen-1",
    mission: "WRITE_SCENE",
    progressStep: null,
    progressPercent: null,
    failureClass: null,
    queuePosition: null,
    blockedByWriteTarget: false,
    ...view,
  };
}

/** Stands in for the server action; never called by a static render. */
const cancel = async (): Promise<void> => {};

describe("GenerationIndicator", () => {
  it("renders nothing when no generation is in flight", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator projectId="project-1" initial={[]} cancelAction={cancel} />,
    );

    expect(html).toBe("");
  });

  it("names the mission of every generation still in flight", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator
        projectId="project-1"
        initial={[running(), running({ id: "gen-2", mission: "CHECK_COHERENCE" })]}
        cancelAction={cancel}
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("Rédaction d");
    expect(html).toContain("une scène");
    expect(html).toContain("Contrôle de cohérence");
  });

  it("shows the named step and the indicative percentage when they are reported", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator
        projectId="project-1"
        initial={[running({ progressStep: "Composition du contexte", progressPercent: 42 })]}
        cancelAction={cancel}
      />,
    );

    expect(html).toContain("Composition du contexte");
    expect(html).toContain("42");
  });

  /**
   * CAL-063. A generation waiting out a backoff is still `QUEUED`, so it appears
   * here rather than in the failure list — and without this line it would look
   * exactly like a job that has hung, which is the anxiety the automatic retry
   * exists to remove.
   */
  it("says a retry is coming when the last attempt failed transiently", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator
        projectId="project-1"
        initial={[running({ failureClass: "transient" })]}
        cancelAction={cancel}
      />,
    );

    expect(html).toContain("nouvelle tentative");
  });

  it("says nothing of the sort for a generation that has not failed", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator projectId="project-1" initial={[running()]} cancelAction={cancel} />,
    );

    expect(html).not.toContain("nouvelle tentative");
  });

  /**
   * CAL-065. A `QUEUED` row carries its rank among the project's own queued
   * generations, and the banner is the one place it is shown.
   */
  it("shows a queued generation's position in the queue", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator
        projectId="project-1"
        initial={[running({ queuePosition: 3 })]}
        cancelAction={cancel}
      />,
    );

    expect(html).toContain("position 3");
  });

  it("says nothing about a position for a generation that already has a slot", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator
        projectId="project-1"
        initial={[running({ queuePosition: null })]}
        cancelAction={cancel}
      />,
    );

    expect(html).not.toContain("file d’attente");
  });

  /**
   * CAL-067. A concurrent ask on a chapter someone is already writing must be
   * *queued and not silently refused* — and a queue position alone does not
   * say that, because an author cannot tell a position they are advancing
   * through from one they are stuck behind.
   */
  it("says why a generation is waiting when another holds its write target", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator
        projectId="project-1"
        initial={[running({ queuePosition: 2, blockedByWriteTarget: true })]}
        cancelAction={cancel}
      />,
    );

    expect(html).toContain("une autre génération modifie");
    // The specific reason replaces the rank rather than being added to it:
    // "position 2" is noise once the real answer is on screen.
    expect(html).not.toContain("position 2");
  });

  /**
   * CAL-064. The progressive-enhancement half of the cancel button, pinned the
   * way `generation-failure-list.test.tsx` pins the replay's: a real `<form>`
   * carrying both identifiers, so the control works before any JavaScript has
   * run and the server is the only thing that decides whether it is allowed.
   */
  it("offers a real form carrying both identifiers for each generation", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator
        projectId="project-1"
        initial={[running(), running({ id: "gen-2" })]}
        cancelAction={cancel}
      />,
    );

    expect(html).toContain("<form");
    expect(html).toContain('name="projectId" value="project-1"');
    expect(html).toContain('name="generationId" value="gen-1"');
    expect(html).toContain('name="generationId" value="gen-2"');
    expect(html).toContain("Annuler");
  });

  /**
   * A generation waiting out a backoff is in flight and costs the author to
   * leave running, so it is cancellable like any other. Hiding the control for
   * it would leave the one case where waiting is longest with nothing to do.
   */
  it("offers cancellation for a generation waiting out a backoff too", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator
        projectId="project-1"
        initial={[running({ failureClass: "rate_limited" })]}
        cancelAction={cancel}
      />,
    );

    expect(html).toContain("Annuler");
  });

  /** A `<form>` is not phrasing content: a `<p>` around one is closed early. */
  it("does not put the form inside a paragraph", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator projectId="project-1" initial={[running()]} cancelAction={cancel} />,
    );

    expect(html).not.toContain("<p");
  });
});
