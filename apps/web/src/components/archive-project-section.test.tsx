import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArchiveProjectSection } from "./archive-project-section";

async function noopAction(): Promise<void> {
  /* never called in a static render */
}

describe("ArchiveProjectSection", () => {
  it("offers to archive an active project", () => {
    const html = renderToStaticMarkup(
      <ArchiveProjectSection
        projectId="project-1"
        isArchived={false}
        archiveAction={noopAction}
        restoreAction={noopAction}
      />,
    );

    expect(html).toContain(">Archiver<");
    expect(html).toContain("Archiver ce projet");
    expect(html).not.toContain("Restaurer ce projet");
  });

  it("offers to restore an archived project", () => {
    const html = renderToStaticMarkup(
      <ArchiveProjectSection
        projectId="project-1"
        isArchived={true}
        archiveAction={noopAction}
        restoreAction={noopAction}
      />,
    );

    expect(html).toContain(">Restaurer<");
    expect(html).toContain("Restaurer ce projet");
    expect(html).not.toContain("Archiver ce projet");
  });

  it("keeps the form a real form carrying the project id", () => {
    const html = renderToStaticMarkup(
      <ArchiveProjectSection
        projectId="project-42"
        isArchived={false}
        archiveAction={noopAction}
        restoreAction={noopAction}
      />,
    );

    expect(html).toContain('name="projectId"');
    expect(html).toContain('value="project-42"');
    expect(html).toContain('type="submit"');
  });
});
