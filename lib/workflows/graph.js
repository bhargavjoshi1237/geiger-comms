// Workflow steps ↔ React Flow graph. Steps are canonical; the graph adds node positions and connectors (ported from geiger-events).

const NODE_W = 300;
const ROW_H = 150;
const COL_X = 0;

export function stepsToGraph(steps, prevGraph) {
  const list = Array.isArray(steps) ? steps : [];

  const nodes = list.map((step, i) => ({
    id: step.id,
    type: step.kind,
    position: step.position || { x: COL_X, y: i * ROW_H },
    data: {
      type: step.type,
      config: step.config || {},
      kind: step.kind,
    },
    width: NODE_W,
    // Every workflow needs its trigger; only conditions and actions can be deleted on the canvas.
    deletable: step.kind !== "trigger",
  }));

  const edges = [];
  for (let i = 0; i < list.length - 1; i += 1) {
    const a = list[i];
    const b = list[i + 1];
    edges.push({
      id: `e-${a.id}-${b.id}`,
      source: a.id,
      target: b.id,
      type: "smoothstep",
    });
  }

  const viewport =
    prevGraph && prevGraph.viewport ? prevGraph.viewport : { x: 0, y: 0, zoom: 1 };

  return { nodes, edges, viewport };
}

// Walks the edges from the trigger to rebuild step order; unconnected nodes follow in canvas order.
export function graphToSteps(graph, prevSteps) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  if (!nodes.length) return Array.isArray(prevSteps) ? prevSteps : [];

  const prevById = new Map(
    (Array.isArray(prevSteps) ? prevSteps : []).map((s) => [s.id, s]),
  );
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const outgoing = new Map();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source).push(e.target);
  }

  const toStep = (node) => {
    const prev = prevById.get(node.id) || {};
    return {
      id: node.id,
      kind: node.data?.kind || node.type || prev.kind,
      type: node.data?.type ?? prev.type,
      config: node.data?.config ?? prev.config ?? {},
      position: node.position || prev.position || { x: COL_X, y: 0 },
    };
  };

  const triggerNode =
    nodes.find((n) => (n.data?.kind || n.type) === "trigger") || nodes[0];

  const ordered = [];
  const seen = new Set();
  let cursor = triggerNode;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    ordered.push(toStep(cursor));
    const nextIds = outgoing.get(cursor.id) || [];
    cursor = nextIds.map((id) => nodeById.get(id)).find((n) => n && !seen.has(n.id));
  }

  for (const node of nodes) {
    if (!seen.has(node.id)) {
      ordered.push(toStep(node));
      seen.add(node.id);
    }
  }

  return ordered;
}
