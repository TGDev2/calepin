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
    ...view,
  };
}

describe("GenerationIndicator", () => {
  it("renders nothing when no generation is in flight", () => {
    const html = renderToStaticMarkup(<GenerationIndicator projectId="project-1" initial={[]} />);

    expect(html).toBe("");
  });

  it("names the mission of every generation still in flight", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator
        projectId="project-1"
        initial={[running(), running({ id: "gen-2", mission: "CHECK_COHERENCE" })]}
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
      />,
    );

    expect(html).toContain("nouvelle tentative");
  });

  it("says nothing of the sort for a generation that has not failed", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator projectId="project-1" initial={[running()]} />,
    );

    expect(html).not.toContain("nouvelle tentative");
  });
});
