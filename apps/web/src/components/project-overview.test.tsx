import type { ProjectProgress } from "@calepin/shared/project-status";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectOverview } from "./project-overview";

const NOTHING_DONE: ProjectProgress = {
  isArchived: false,
  hasSourceText: false,
  isAnalysisValidated: false,
  hasCanonicalDirection: false,
  isBibleValidated: false,
  plannedChapterCount: 0,
  writtenChapterCount: 0,
  validatedChapterCount: 0,
  isPublished: false,
};

async function noopRenameAction(): Promise<void> {
  /* never called in a static render */
}

describe("ProjectOverview", () => {
  it("renders the real title, status and stats the server computed", () => {
    const html = renderToStaticMarkup(
      <ProjectOverview
        projectId="project-1"
        title="Le Manuscrit"
        titleMaxLength={200}
        statusLabel="Brouillon"
        updatedAtIso="2026-08-01T00:00:00.000Z"
        updatedAtLabel="1 août 2026"
        writtenChapterCountLabel="0"
        totalWordCountLabel="0"
        progress={NOTHING_DONE}
        error={null}
        renameAction={noopRenameAction}
      />,
    );

    expect(html).toContain("Le Manuscrit");
    expect(html).toContain("Brouillon");
    expect(html).toContain('dateTime="2026-08-01T00:00:00.000Z"');
    expect(html).toContain("Renommer");
  });

  // The screen has to work with JavaScript off: the rename form posts
  // straight to the real server action, never to a client-side wrapper.
  it("keeps the rename form a real form posting to the server action", () => {
    const html = renderToStaticMarkup(
      <ProjectOverview
        projectId="project-1"
        title="Le Manuscrit"
        titleMaxLength={200}
        statusLabel="Brouillon"
        updatedAtIso="2026-08-01T00:00:00.000Z"
        updatedAtLabel="1 août 2026"
        writtenChapterCountLabel="0"
        totalWordCountLabel="0"
        progress={NOTHING_DONE}
        error={null}
        renameAction={noopRenameAction}
      />,
    );

    expect(html).toContain('name="title"');
    expect(html).toContain('value="project-1"');
    expect(html).toContain('type="submit"');
  });

  it("shows the error banner only when a refusal reason is passed", () => {
    const withoutError = renderToStaticMarkup(
      <ProjectOverview
        projectId="project-1"
        title="Le Manuscrit"
        titleMaxLength={200}
        statusLabel="Brouillon"
        updatedAtIso="2026-08-01T00:00:00.000Z"
        updatedAtLabel="1 août 2026"
        writtenChapterCountLabel="0"
        totalWordCountLabel="0"
        progress={NOTHING_DONE}
        error={null}
        renameAction={noopRenameAction}
      />,
    );
    const withError = renderToStaticMarkup(
      <ProjectOverview
        projectId="project-1"
        title="Le Manuscrit"
        titleMaxLength={200}
        statusLabel="Brouillon"
        updatedAtIso="2026-08-01T00:00:00.000Z"
        updatedAtLabel="1 août 2026"
        writtenChapterCountLabel="0"
        totalWordCountLabel="0"
        progress={NOTHING_DONE}
        error="Le titre ne peut pas être vide."
        renameAction={noopRenameAction}
      />,
    );

    expect(withoutError).not.toContain('role="alert"');
    expect(withError).toContain('role="alert"');
    expect(withError).toContain("Le titre ne peut pas être vide.");
  });
});
