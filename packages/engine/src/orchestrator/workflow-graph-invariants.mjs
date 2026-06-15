/**
 * Structural invariants for workflow graphs consumed by the graph walker
 * (single start/end, deterministic fan-out, interrupt/parallel edge counts).
 */

/** @see docs/engine-profile.md §3 — interrupt inside a parallel branch is not resume-safe. */
export const INTERRUPT_IN_PARALLEL_BRANCH_CODE = "INTERRUPT_IN_PARALLEL_BRANCH";

export class InterruptInParallelBranchError extends Error {
  /**
   * @param {string} interruptNodeId
   * @param {string} parallelNodeId
   * @param {string} branchName
   */
  constructor(interruptNodeId, parallelNodeId, branchName) {
    super(
      `${INTERRUPT_IN_PARALLEL_BRANCH_CODE}: node "${interruptNodeId}" (interrupt) is not allowed on parallel "${parallelNodeId}" branch "${branchName}".`
    );
    this.name = "InterruptInParallelBranchError";
    this.code = INTERRUPT_IN_PARALLEL_BRANCH_CODE;
    this.interruptNodeId = interruptNodeId;
    this.parallelNodeId = parallelNodeId;
    this.branchName = branchName;
  }
}

/**
 * @param {string} entryId
 * @param {string} joinTargetId
 * @param {Map<string, { id: string; type: string; config?: object }>} byId
 * @param {Map<string, string[]>} outgoing
 * @param {string} parallelNodeId
 * @param {string} branchName
 * @param {Set<string>} visited
 */
function walkBranchUntilJoin(entryId, joinTargetId, byId, outgoing, parallelNodeId, branchName, visited) {
  let cur = entryId;
  while (cur !== joinTargetId) {
    if (visited.has(cur)) {
      throw new Error(`Branch graph cycle detected at node "${cur}".`);
    }
    visited.add(cur);
    const node = byId.get(cur);
    if (!node) {
      throw new Error(`Edge references unknown node id "${cur}".`);
    }
    if (node.type === "interrupt") {
      throw new InterruptInParallelBranchError(cur, parallelNodeId, branchName);
    }
    if (node.type === "parallel") {
      const outs = outgoing.get(cur) ?? [];
      if (outs.length !== 1) {
        throw new Error(
          `parallel "${cur}" must have exactly one outgoing edge (join target); found ${outs.length}.`
        );
      }
      const innerJoin = outs[0];
      const innerBranches = Array.isArray(node.config?.branches) ? node.config.branches : [];
      for (const ib of innerBranches) {
        if (typeof ib?.entry !== "string" || !ib.entry) continue;
        walkBranchUntilJoin(ib.entry, innerJoin, byId, outgoing, parallelNodeId, branchName, visited);
      }
      cur = innerJoin;
      continue;
    }
    const nextOut = outgoing.get(cur) ?? [];
    if (nextOut.length !== 1) {
      throw new Error(
        `Node "${cur}" (type "${node.type}") must have exactly one outgoing edge inside a parallel branch; found ${nextOut.length}.`
      );
    }
    cur = nextOut[0];
  }
}

/**
 * Profile invariant: `interrupt` nodes must not appear on any parallel branch path
 * (conservative POC; parallel-aware resume is out of scope).
 *
 * @param {{ nodes?: Array<{ id: string; type: string; config?: object }>; edges?: Array<{ source: string; target: string }> }} definition
 */
export function assertNoInterruptInParallelBranch(definition) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  const edges = Array.isArray(definition?.edges) ? definition.edges : [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = buildOutgoing(edges);

  for (const node of nodes) {
    if (node.type !== "parallel") continue;
    const joinOut = outgoing.get(node.id) ?? [];
    if (joinOut.length !== 1) continue;
    const joinTargetId = joinOut[0];
    const branches = Array.isArray(node.config?.branches) ? node.config.branches : [];
    for (const b of branches) {
      if (typeof b?.entry !== "string" || !b.entry) continue;
      const branchName = typeof b.name === "string" ? b.name : b.entry;
      walkBranchUntilJoin(b.entry, joinTargetId, byId, outgoing, node.id, branchName, new Set());
    }
  }
}

/**
 * @param {InterruptInParallelBranchError} error
 * @returns {import("ajv").ErrorObject[]}
 */
export function interruptInParallelBranchToValidationErrors(error, nodes = []) {
  const index = nodes.findIndex((n) => n.id === error.interruptNodeId);
  const instancePath = index >= 0 ? `/nodes/${index}` : `/nodes/${error.interruptNodeId}`;
  return [
    {
      instancePath,
      schemaPath: "#/profile/interrupt-in-parallel-branch",
      keyword: "profile",
      params: { code: error.code },
      message: error.message,
    },
  ];
}

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
    if (
      n.type === "parallel" ||
      n.type === "wait" ||
      n.type === "set_state" ||
      n.type === "subworkflow" ||
      n.type === "agent_delegate"
    ) {
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
