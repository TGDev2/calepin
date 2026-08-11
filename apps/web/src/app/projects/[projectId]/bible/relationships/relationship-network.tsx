/**
 * The relationship network, drawn (CAL-091).
 *
 * A server component producing plain SVG: the layout is a function of the
 * cast's order and nothing else, so it is identical on the server and in the
 * browser, needs no client JavaScript, and carries none of the hydration risk
 * a `defaultValue` field does (the lesson `source-text/page.tsx` records). It
 * also means the diagram is there before hydration, which for a page whose
 * point is *seeing* the graph is most of the value.
 *
 * **The two directions of a pair are drawn as two arcs, never as one line.**
 * That is the whole visual argument of CAL-091: a line between two names says
 * they are related, which is exactly the claim the data does not make. Each
 * arc bows to one side — the side is decided by comparing the two ids, so it
 * is stable — and carries an arrowhead at the end it points to.
 *
 * **A tie only one side declares is drawn differently**, in the warning
 * colour and dashed: it is not an error, it is the state the author most needs
 * to see, and it must not read as an ordinary edge.
 *
 * The diagram is decorative in the accessibility sense — every relation it
 * draws is also in the table below it, which is the readable version — so it
 * carries a `<title>` and is otherwise left out of the reading order.
 */

import type { RelationshipSymmetry } from "@calepin/bible";

import styles from "./relationship-network.module.css";

const SIZE = 520;
const CENTRE = SIZE / 2;
const RADIUS = SIZE / 2 - 90;
const NODE_RADIUS = 6;

export interface NetworkNode {
  readonly id: string;
  readonly name: string;
}

export interface NetworkEdge {
  readonly id: string;
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  /** The classification of the *pair* this edge belongs to. */
  readonly symmetry: RelationshipSymmetry;
}

export interface RelationshipNetworkProps {
  readonly nodes: readonly NetworkNode[];
  readonly edges: readonly NetworkEdge[];
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Node `index` of `total`, on a circle starting at twelve o'clock. */
function placeNode(index: number, total: number): Point {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;

  return { x: CENTRE + RADIUS * Math.cos(angle), y: CENTRE + RADIUS * Math.sin(angle) };
}

/**
 * A quadratic arc from one node to another, stopping short of the target so
 * the arrowhead lands beside the node rather than under it.
 */
function arc(from: Point, to: Point, bow: number): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;

  // Pull the endpoints back by the node's radius plus the arrowhead's reach.
  const inset = NODE_RADIUS + 7;
  const start = { x: from.x + (dx / length) * inset, y: from.y + (dy / length) * inset };
  const end = { x: to.x - (dx / length) * inset, y: to.y - (dy / length) * inset };

  // The control point sits perpendicular to the midpoint; `bow` decides which
  // side, which is what keeps the two directions of a pair apart.
  const control = {
    x: (start.x + end.x) / 2 - (dy / length) * bow,
    y: (start.y + end.y) / 2 + (dx / length) * bow,
  };

  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

/** Anchor a label so it never overlaps the circle it hangs off. */
function labelAnchor(point: Point): "start" | "middle" | "end" {
  if (point.x > CENTRE + 8) return "start";

  return point.x < CENTRE - 8 ? "end" : "middle";
}

/**
 * Roughly how wide a name is at the label's own font size. An estimate rather
 * than a measurement, because there is nothing to measure on a server — and an
 * over-estimate only adds margin, while a fixed padding clips: a name may run
 * to `CHARACTER_LABEL_CHAR_CEILING`, so no constant is wide enough.
 */
function labelWidth(name: string): number {
  return name.length * 6.8;
}

/**
 * The box the drawing actually occupies — the nodes, plus the labels that hang
 * off them.
 *
 * A circle of three nodes fills barely two thirds of its square, and the
 * leftover was a third of the figure's height in dead space. Fitting the box
 * to what is drawn rather than to the construction circle makes every cast
 * size sit right, which a fixed square cannot.
 */
function viewBoxFor(placed: readonly { readonly point: Point; readonly name: string }[]): string {
  if (placed.length === 0) return `0 0 ${String(SIZE)} ${String(SIZE)}`;

  const extents = placed.map(({ point, name }) => {
    const anchor = labelAnchor(point);
    const width = labelWidth(name);

    if (anchor === "start") return { left: point.x, right: point.x + 14 + width };
    if (anchor === "end") return { left: point.x - 14 - width, right: point.x };

    return { left: point.x - width / 2, right: point.x + width / 2 };
  });

  // Room for the arc that bows past a node, and for the label's own line.
  const pad = 26;
  const minX = Math.min(...extents.map((extent) => extent.left)) - pad;
  const maxX = Math.max(...extents.map((extent) => extent.right)) + pad;
  const minY = Math.min(...placed.map(({ point }) => point.y)) - pad - 14;
  const maxY = Math.max(...placed.map(({ point }) => point.y)) + pad;

  return `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`;
}

export function RelationshipNetwork({ nodes, edges }: RelationshipNetworkProps) {
  const positions = new Map(nodes.map((node, index) => [node.id, placeNode(index, nodes.length)]));

  return (
    <svg
      className={styles.network}
      viewBox={viewBoxFor(
        nodes.map((node, index) => ({
          point: positions.get(node.id) ?? placeNode(index, nodes.length),
          name: node.name,
        })),
      )}
      role="img"
      aria-label="Réseau des relations entre les personnages"
    >
      <title>Réseau des relations entre les personnages</title>
      <defs>
        <marker
          id="relationship-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" className={styles.arrowHead} />
        </marker>
        <marker
          id="relationship-arrow-asymmetric"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" className={styles.arrowHeadAsymmetric} />
        </marker>
      </defs>

      {edges.map((edge) => {
        const from = positions.get(edge.fromCharacterId);
        const to = positions.get(edge.toCharacterId);

        if (from === undefined || to === undefined) return null;

        // Comparing the two ids gives each direction a stable side of the pair.
        const bow = edge.fromCharacterId < edge.toCharacterId ? 26 : -26;
        const answered = edge.symmetry === "mutual";

        return (
          <path
            key={edge.id}
            d={arc(from, to, bow)}
            className={answered ? styles.edge : styles.edgeAsymmetric}
            markerEnd={`url(#relationship-arrow${answered ? "" : "-asymmetric"})`}
          />
        );
      })}

      {nodes.map((node, index) => {
        const point = positions.get(node.id) ?? placeNode(index, nodes.length);
        const anchor = labelAnchor(point);
        const offset = anchor === "start" ? 14 : anchor === "end" ? -14 : 0;

        return (
          <g key={node.id}>
            <circle cx={point.x} cy={point.y} r={NODE_RADIUS} className={styles.node} />
            <text
              x={point.x + offset}
              y={point.y + (anchor === "middle" ? -14 : 4)}
              textAnchor={anchor}
              className={styles.nodeLabel}
            >
              {node.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
