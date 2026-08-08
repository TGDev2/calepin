import { describe, expect, it } from "vitest";

import { openThreadsQuery } from "./open-threads";

describe("openThreadsQuery", () => {
  it("scopes to the given plan and excludes CLOSED threads", () => {
    const query = openThreadsQuery("outline-fixture");

    expect(query.where).toEqual({ outlineId: "outline-fixture", status: { not: "CLOSED" } });
  });

  it("includes the opening chapter", () => {
    expect(openThreadsQuery("outline-fixture").include).toEqual({ openingChapter: true });
  });
});
