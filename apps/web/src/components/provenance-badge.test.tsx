import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProvenanceBadge } from "./provenance-badge";

describe("ProvenanceBadge", () => {
  it("shows the caller's label, never a fixed one of its own", () => {
    const html = renderToStaticMarkup(
      <ProvenanceBadge
        provenance="proposed"
        label="Proposition du modèle"
        explanation="Écrit par la génération. Vous ne l'avez pas encore relu."
      />,
    );

    expect(html).toContain("Proposition du modèle");
    expect(html).toContain("Écrit par la génération");
  });

  it("carries the explanation in a title and in hidden text, not in color alone", () => {
    const html = renderToStaticMarkup(
      <ProvenanceBadge
        provenance="accepted"
        label="Élément validé"
        explanation="Conservé tel quel."
      />,
    );

    expect(html).toContain('title="Conservé tel quel."');
    expect(html).toContain("Conservé tel quel.");
  });

  it("gives each of the four states its own icon path, so shape carries the distinction", () => {
    const paths = (["proposed", "accepted", "edited", "user-written"] as const).map(
      (provenance) => {
        const html = renderToStaticMarkup(
          <ProvenanceBadge provenance={provenance} label={provenance} explanation={provenance} />,
        );
        const match = /<path fill="currentColor" d="([^"]+)"/.exec(html);
        return match?.[1];
      },
    );

    expect(new Set(paths).size).toBe(4);
  });
});
