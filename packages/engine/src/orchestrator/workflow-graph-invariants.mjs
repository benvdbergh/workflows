/**
 * Structural invariants for workflow graphs consumed by the graph walker
 * (single start/end, deterministic fan-out, interrupt/parallel edge counts).
 */

/**
 * @param {Array<{ source: string; target: string }>} edges
 * @returns {Map<string, string[]>}
 */
export function buildOutgoing(edges) {
  const out = new Map();
  for (const e of edges) {
    if (!e || typeof e.source !== "string" || typeof e.target !== "string") continue;
    const list = out.get(e.source) ?? [];
    list.push(e.target);
    out.set(e.source, list);
  }
  return out;
}

/**
 * @param {Array<{ id: string; type: string }>} nodes
 * @param {Map<string, string[]>} outgoing
 */
export function assertWorkflowGraphInvariants(nodes, outgoing) {
  const startOut = outgoing.get("__start__") ?? [];
  if (startOut.length !== 1) {
    throw new Error(
      `Workflow graph walker requires exactly one edge from "__start__"; found ${startOut.length}.`
    );
  }

  const starts = nodes.filter((n) => n.type === "start");
  const ends = nodes.filter((n) => n.type === "end");
  if (starts.length !== 1) {
    throw new Error(`Workflow graph walker requires exactly one "start" node; found ${starts.length}.`);
  }
  if (ends.length !== 1) {
    throw new Error(`Workflow graph walker requires exactly one "end" node; found ${ends.length}.`);
  }

  for (const n of nodes) {
    const outs = outgoing.get(n.id) ?? [];
    if (n.type === "switch") {
      continue;
    }
    if (n.type === "end") {
      if (outs.length !== 0) {
        throw new Error(`Node "${n.id}" (end) must have no outgoing edges; found ${outs.length}.`);
      }
      continue;
    }
    if (n.type === "interrupt") {
      if (outs.length !== 1) {
        throw new Error(
          `Node "${n.id}" (interrupt) must have exactly one outgoing edge; found ${outs.length}.`
        );
      }
      continue;
    }
    if (n.type === "parallel" || n.type === "wait" || n.type === "set_state") {
      if (outs.length !== 1) {
        throw new Error(
          `Node "${n.id}" (type "${n.type}") must have exactly one outgoing edge (successor / join target); found ${outs.length}.`
        );
      }
      continue;
    }
    if (outs.length !== 1) {
      throw new Error(
        `Node "${n.id}" (type "${n.type}") must have exactly one outgoing edge for this engine profile; found ${outs.length}.`
      );
    }
  }
}
