import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GenerationIndicator } from "./generation-indicator";

async function noopGetRunningGenerations() {
  return [];
}

describe("GenerationIndicator", () => {
  it("renders nothing when no generation is in flight", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator
        projectId="project-1"
        initial={[]}
        getRunningGenerations={noopGetRunningGenerations}
      />,
    );

    expect(html).toBe("");
  });

  it("names the mission of every generation still in flight", () => {
    const html = renderToStaticMarkup(
      <GenerationIndicator
        projectId="project-1"
        initial={[
          { id: "gen-1", mission: "WRITE_SCENE" },
          { id: "gen-2", mission: "CHECK_COHERENCE" },
        ]}
        getRunningGenerations={noopGetRunningGenerations}
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("Rédaction d");
    expect(html).toContain("une scène");
    expect(html).toContain("Contrôle de cohérence");
  });
});
