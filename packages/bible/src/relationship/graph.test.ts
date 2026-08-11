import { describe, expect, it } from "vitest";

import { aGraph } from "./fixtures";
import {
  type DescribableEdge,
  describeRelationshipGraph,
  RELATIONSHIP_SYMMETRIES,
  RELATIONSHIP_SYMMETRY_LABELS,
  resolveRelationshipGraph,
} from "./graph";

const edges = (): DescribableEdge[] =>
  aGraph().relations.map((relation) => ({
    fromCharacterName: relation.fromCharacterName,
    toCharacterName: relation.toCharacterName,
    type: relation.type,
    label: relation.label,
    description: relation.description,
  }));

describe("resolveRelationshipGraph", () => {
  it("gathers every character an edge touches, in order of first appearance", () => {
    expect(resolveRelationshipGraph(edges()).characters).toEqual([
      "Corentin Maillard",
      "Élise Fougeray",
      "Nadia Berthelot",
    ]);
  });

  it("puts both directions of a pair in one bucket", () => {
    const graph = resolveRelationshipGraph(edges());

    expect(graph.pairs).toHaveLength(3);
    expect(graph.pairs.map((pair) => [pair.first, pair.second])).toEqual([
      ["Corentin Maillard", "Élise Fougeray"],
      ["Corentin Maillard", "Nadia Berthelot"],
      ["Élise Fougeray", "Nadia Berthelot"],
    ]);
  });

  it("classifies a pair declared identically from both sides as mutual", () => {
    const pair = resolveRelationshipGraph(edges()).pairs[0];

    expect(pair?.symmetry).toBe("mutual");
    expect(pair?.typesOnlyForward).toEqual([]);
    expect(pair?.typesOnlyBackward).toEqual([]);
  });

  it("classifies a tie nobody answered as one-sided — the acceptance criterion", () => {
    const pair = resolveRelationshipGraph(edges()).pairs[1];

    expect(pair?.symmetry).toBe("one-sided");
    expect(pair?.forward).toHaveLength(1);
    expect(pair?.backward).toEqual([]);
    expect(pair?.typesOnlyForward).toEqual(["FAMILY"]);
  });

  it("classifies two sides declaring different types as divergent", () => {
    const pair = resolveRelationshipGraph(edges()).pairs[2];

    expect(pair?.symmetry).toBe("divergent");
    expect(pair?.typesOnlyForward).toEqual(["ALLIANCE"]);
    expect(pair?.typesOnlyBackward).toEqual(["RIVALRY"]);
  });

  it("never completes a pair — a one-sided tie stays one-sided", () => {
    const graph = resolveRelationshipGraph(edges());
    const total = graph.pairs.reduce(
      (count, pair) => count + pair.forward.length + pair.backward.length,
      0,
    );

    expect(total).toBe(edges().length);
  });

  it("is stable under the caller's order: the pair is not renamed by a later edge", () => {
    const reversed = [...edges()].reverse();
    const graph = resolveRelationshipGraph(reversed);
    const pair = graph.pairs.find(
      (candidate) =>
        candidate.first === "Nadia Berthelot" || candidate.second === "Nadia Berthelot",
    );

    // Reversing the input makes Nadia's edge the first one seen for its pair,
    // so she is `first` — the ordering follows the caller, and every edge is
    // still classified the same way.
    expect(pair?.first).toBe("Nadia Berthelot");
    expect(graph.pairs.map((candidate) => candidate.symmetry).sort()).toEqual([
      "divergent",
      "mutual",
      "one-sided",
    ]);
  });

  it("labels every symmetry it can answer", () => {
    for (const symmetry of RELATIONSHIP_SYMMETRIES) {
      expect(RELATIONSHIP_SYMMETRY_LABELS[symmetry].length).toBeGreaterThan(0);
    }
  });
});

describe("describeRelationshipGraph", () => {
  it("writes one line per directed edge", () => {
    const lines = describeRelationshipGraph(edges());

    for (const edge of edges()) {
      expect(
        lines.some(
          (line) => line.includes(edge.fromCharacterName) && line.includes(edge.toCharacterName),
        ),
      ).toBe(true);
    }
  });

  it("names what was never answered, which is what a model cannot infer", () => {
    const lines = describeRelationshipGraph(edges());
    const notice = lines.find((line) => line.includes("rien n'est déclaré en retour"));

    expect(notice).toBeDefined();
    expect(notice).toContain("Corentin Maillard");
    expect(notice).toContain("Nadia Berthelot");
  });

  it("names the divergence when two sides declare different ties", () => {
    const lines = describeRelationshipGraph(edges());
    const notice = lines.find((line) => line.includes("alliance") && line.includes("rivalité"));

    expect(notice).toBeDefined();
  });

  it("spends no line saying two characters agree", () => {
    const lines = describeRelationshipGraph(edges());
    const notices = lines.filter((line) => line.startsWith("Asymétrie du lien :"));

    // Three pairs, one of them mutual.
    expect(notices).toHaveLength(2);
  });

  it("carries the side-specific half when there is one, and nothing when there is not", () => {
    const lines = describeRelationshipGraph(edges());

    expect(lines.some((line) => line.includes("De ce côté :"))).toBe(true);
    expect(
      lines.some((line) => line.includes("ancienne associée de") && !line.includes("De ce côté :")),
    ).toBe(true);
  });
});
