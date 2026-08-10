import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GenerationIndicator } from "./generation-indicator";

describe("GenerationIndicator", () => {
  it("renders nothing when no generation is in flight", () => {
    const html = renderToStaticMarkup(<GenerationIndicator projectId="project-1" initial={[]} />);

    expect(html).toBe("");
  });

  it("names the mission of every generation still in flight", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator
        projectId="project-1"
        initial={[
          { id: "gen-1", mission: "WRITE_SCENE", progressStep: null, progressPercent: null },
          {
            id: "gen-2",
            mission: "CHECK_COHERENCE",
            progressStep: null,
            progressPercent: null,
          },
        ]}
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
        initial={[
          {
            id: "gen-1",
            mission: "WRITE_SCENE",
            progressStep: "Composition du contexte",
            progressPercent: 42,
          },
        ]}
      />,
    );

    expect(html).toContain("Composition du contexte");
    expect(html).toContain("42");
  });
});
