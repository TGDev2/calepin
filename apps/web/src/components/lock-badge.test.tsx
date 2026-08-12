import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LockBadge } from "./lock-badge";

describe("LockBadge", () => {
  it("labels a full lock and a partial one differently", () => {
    const locked = renderToStaticMarkup(<LockBadge variant="locked" />);
    const partial = renderToStaticMarkup(<LockBadge variant="partial" />);

    expect(locked).toContain("Verrouillé");
    expect(locked).not.toContain("Partiellement");
    expect(partial).toContain("Partiellement verrouillé");
  });

  it("gives the two states distinct icon shapes, not only distinct text", () => {
    const locked = renderToStaticMarkup(<LockBadge variant="locked" />);
    const partial = renderToStaticMarkup(<LockBadge variant="partial" />);

    const lockedPath = /<path fill="currentColor" d="([^"]+)"/.exec(locked)?.[1];
    const partialPath = /<path fill="currentColor" d="([^"]+)"/.exec(partial)?.[1];

    expect(lockedPath).not.toBe(partialPath);
  });

  it("carries the explanation both in a title and in hidden text", () => {
    const html = renderToStaticMarkup(<LockBadge variant="locked" />);

    expect(html).toContain("title=");
    expect(html).toContain("bloquée avant de s&#x27;exécuter");
  });
});
