import type { FailedGeneration } from "@calepin/shared/repository";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GenerationFailureList } from "./generation-failure-list";

/**
 * What the screen offering a replay must do, and must not do (CAL-063).
 *
 * The replay itself is proved against the real database (`generation-retry`) and
 * the real browser (`generation-replay.spec.ts`). What is worth asserting here is
 * everything that is a property of the *markup*: that a failed generation always
 * carries a form naming it, that the sentence is French rather than a code, and
 * that §9 holds — no fragment of what was being written, and no identifier a
 * reader has no use for.
 */
const REPLAY_ACTION = async (): Promise<void> => {};

function failed(failure: Partial<FailedGeneration> = {}): FailedGeneration {
  return {
    id: "gen-1",
    mission: "WRITE_SCENE",
    targetId: null,
    errorCode: "PROVIDER_UNAVAILABLE",
    errorCategory: "provider",
    failureClass: "permanent",
    attemptCount: 5,
    completedAt: new Date("2026-08-10T12:00:00.000Z"),
    ...failure,
  };
}

function render(failures: readonly FailedGeneration[]): string {
  return renderToStaticMarkup(
    <GenerationFailureList
      projectId="project-1"
      failures={failures}
      replayAction={REPLAY_ACTION}
    />,
  );
}

describe("GenerationFailureList", () => {
  it("renders nothing when nothing has failed", () => {
    expect(render([])).toBe("");
  });

  it("names the mission, the attempt count and the reason", () => {
    const html = render([failed()]);

    expect(html).toContain("Rédaction d");
    expect(html).toContain("5 tentatives");
    expect(html).toContain("indisponible");
  });

  // The whole point of the component: a failed generation is replayable from the
  // interface, and the form carries the two identifiers the action needs.
  it("offers a replay form naming the generation and its project", () => {
    const html = render([failed({ id: "gen-42" })]);

    expect(html).toContain('name="generationId"');
    expect(html).toContain('value="gen-42"');
    expect(html).toContain('name="projectId"');
    expect(html).toContain('value="project-1"');
    expect(html).toContain("Relancer");
  });

  /**
   * Offered for a permanent failure too. The message says whether another try is
   * likely to help; hiding the control on a classification the code got wrong
   * would leave the author with a dead generation and no way to act on it.
   */
  it.each(["transient", "rate_limited", "permanent"] as const)(
    "offers a replay whatever the class (%s)",
    (failureClass) => {
      expect(render([failed({ failureClass })])).toContain("Relancer");
    },
  );

  it("tells the author the last valid version is still there", () => {
    expect(render([failed()])).toMatch(/derni.re version/);
  });

  it("agrees with itself on the plural", () => {
    expect(render([failed()])).toContain("Génération en échec");
    expect(render([failed(), failed({ id: "gen-2" })])).toContain("Générations en échec");
  });

  // §7 and §9. The reader gets French; the code stays in the log, and the target
  // id — which names a chapter — has no business on a banner.
  it("shows no error code and no target identifier", () => {
    const html = render([failed({ errorCode: "MODEL_OUTPUT_OFF_TOPIC", targetId: "chapter-7" })]);

    expect(html).not.toContain("MODEL_OUTPUT_OFF_TOPIC");
    expect(html).not.toContain("chapter-7");
  });

  // A row the sweep closed before anything was tried: the mission had no
  // executor. "0 tentatives" would read as a bug rather than as a fact.
  it("says nothing about attempts when there were none", () => {
    expect(render([failed({ attemptCount: 0 })])).not.toContain("tentative");
  });
});
