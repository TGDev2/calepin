import { describe, expect, it } from "vitest";

import { createFactory } from "./factory.js";

interface Widget {
  id: number;
  label: string;
}

describe("createFactory", () => {
  it("increments the sequence on every build", () => {
    const widgets = createFactory<Widget>((sequence) => ({
      id: sequence,
      label: `widget-${sequence}`,
    }));

    expect(widgets.build()).toEqual({ id: 1, label: "widget-1" });
    expect(widgets.build()).toEqual({ id: 2, label: "widget-2" });
  });

  it("lets overrides win over the generated defaults", () => {
    const widgets = createFactory<Widget>((sequence) => ({
      id: sequence,
      label: `widget-${sequence}`,
    }));

    expect(widgets.build({ label: "custom" })).toEqual({ id: 1, label: "custom" });
  });
});
