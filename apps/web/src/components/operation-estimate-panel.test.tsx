import { estimateOperation, type OperationEstimate } from "@calepin/ai";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OperationEstimatePanel } from "./operation-estimate-panel";

async function noopAction(): Promise<void> {
  /* never called in a static render */
}

function estimateOf(operation: "write-chapter" | "audit-manuscript", unitCount: number) {
  const result = estimateOperation({ operation, unitCount });

  if (!result.ok) throw new Error("the fixture estimate was refused");

  return result.value;
}

function render(estimate: OperationEstimate): string {
  return renderToStaticMarkup(
    <OperationEstimatePanel
      estimate={estimate}
      confirmAction={noopAction}
      cancelHref="/projects/project-1"
      confirmLabel="Lancer la rédaction"
      pendingLabel="Lancement…"
    />,
  );
}

describe("OperationEstimatePanel", () => {
  it("shows an estimated duration and an estimated cost", () => {
    const html = render(estimateOf("write-chapter", 1));

    expect(html).toContain("Durée estimée");
    expect(html).toContain("Coût estimé");
    expect(html).toContain("min");
    expect(html).toContain("$US");
  });

  /**
   * The acceptance criterion of CAL-057 on screen: the analysis and the
   * control are lines of their own, so an author can see that the price of a
   * chapter is not the price of its prose.
   */
  it("breaks the price down into production, analysis and control", () => {
    const html = render(estimateOf("write-chapter", 1));

    expect(html).toContain("Production");
    expect(html).toContain("Analyse");
    expect(html).toContain("Contrôle");
    expect(html).toContain("Rédaction d&#x27;une scène");
    expect(html).toContain("Extraction des faits");
    expect(html).toContain("Contrôle de cohérence");
    expect(html).toContain("Résumé d&#x27;un chapitre");
  });

  it("says the estimate rests on reference values when the project has no history", () => {
    const html = render(estimateOf("write-chapter", 1));

    expect(html).toContain("Estimation de référence");
  });

  it("says what the operation covers, in agreement", () => {
    expect(render(estimateOf("audit-manuscript", 1))).toContain("1 chapitre et");
    expect(render(estimateOf("audit-manuscript", 7))).toContain("7 chapitres et");
  });

  /**
   * Confirming is accepting a price, so the price goes back with the
   * confirmation — the server checks it against an estimate it recomputes
   * rather than trusting the form.
   */
  it("posts the estimate it displayed back with the confirmation", () => {
    const estimate = estimateOf("write-chapter", 2);
    const html = render(estimate);

    expect(html).toContain('name="operation"');
    expect(html).toContain('value="write-chapter"');
    expect(html).toContain('name="unitCount"');
    expect(html).toContain('value="2"');
    expect(html).toContain(`value="${estimate.costUsd}"`);
    expect(html).toContain(`value="${String(estimate.durationMs)}"`);
    expect(html).toContain('type="submit"');
    expect(html).toContain("Lancer la rédaction");
  });

  it("offers a way out beside the way in", () => {
    const html = render(estimateOf("write-chapter", 1));

    expect(html).toContain("Annuler");
    expect(html).toContain('href="/projects/project-1"');
  });
});
