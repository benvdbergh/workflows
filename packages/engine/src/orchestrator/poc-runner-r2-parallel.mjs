/**
 * R2 parallel branch walking and join policies (deterministic branch order).
 * @see docs/RFC/rfc-04-execution-model.md §4.7
 */

import { applyOutputWithReducers } from "./linear-runner.mjs";

/**
 * @typedef {'all' | 'any' | 'n_of_m'} ParallelJoin
 */

/**
 * @typedef {object} R2WalkHooks
 * @property {() => Record<string, unknown>} getState
 * @property {(s: Record<string, unknown>) => void} setState
 * @property {(name: string, payload: Record<string, unknown>) => { replayed: boolean }} appendCmd
 * @property {(name: string, payload: Record<string, unknown>) => number} appendEvt
 * @property {(nodeId: string, stateSnapshot: Record<string, unknown>, lastAppliedEventSeq: number, parallelSpan?: Record<string, unknown>) => void} appendCheckpoint
 * @property {(node: { id: string; type: string; config?: object }, state: Record<string, unknown>, jq: { json: (data: unknown, query: string) => Promise<unknown> }) => Promise<string>} resolveSwitchTarget
 * @property {(node: { id: string; type: string; config?: object }, state: Record<string, unknown>, jq: { json: (data: unknown, query: string) => Promise<unknown> }) => Promise<Record<string, unknown>>} buildSetStateOutput
 * @property {(node: { id: string; type: string; config?: object }, scheduled: { replayed: boolean }, state: Record<string, unknown>, parallelSpan?: Record<string, unknown>) => Promise<
 *   | { ok: true; output: Record<string, unknown> }
 *   | { ok: false; error: string; code?: string }
 *   | { kind: 'awaiting_activity'; nodeId: string; parallelSpan?: Record<string, unknown> }
 * >} runPlaceholderActivity
 * @property {(node: { id: string; type: string; config?: object }, scheduled: { replayed: boolean }) => Promise<void>} runWaitNode
 * @property {(state: Record<string, unknown>, context: string) => void} throwIfStateInvalid
 * @property {object} stateSchema
 * @property {{ json: (data: unknown, query: string) => Promise<unknown> }} jq
 */

/**
 * @param {object} params
 * @param {Map<string, { id: string; type: string; config?: object }>} params.byId
 * @param {Map<string, string[]>} params.outgoing
 * @param {R2WalkHooks} params.hooks
 */
export function createR2ParallelRuntime(params) {
  const { byId, outgoing, hooks } = params;
  const PLACEHOLDER_TYPES = new Set(["step", "llm_call", "tool_call"]);

  /**
   * @param {string} nodeId
   * @param {string} joinTargetId
   * @param {{ parallelNodeId: string; joinTargetId: string; branchName: string; branchEntryNodeId: string }} branchCtx
   * @returns {Promise<
   *   | { kind: 'ok' }
   *   | { kind: 'failed'; error: string }
   *   | { kind: 'interrupt'; nodeId: string; state: Record<string, unknown> }
   *   | { kind: 'awaiting_activity'; nodeId: string; state: Record<string, unknown>; parallelSpan?: Record<string, unknown> }
   * >}
   */
  async function runBranchToJoin(nodeId, joinTargetId, branchCtx) {
    const parallelSpan = {
      parallelNodeId: branchCtx.parallelNodeId,
      joinTargetId: branchCtx.joinTargetId,
      branchName: branchCtx.branchName,
      branchEntryNodeId: branchCtx.branchEntryNodeId,
    };
    let cur = nodeId;
    while (cur !== joinTargetId) {
      const node = byId.get(cur);
      if (!node) {
        return { kind: "failed", error: `Edge references unknown node id "${cur}".` };
      }

      const scheduled = hooks.appendCmd("ScheduleNode", { nodeId: cur });
      hooks.appendEvt("NodeScheduled", { nodeId: cur });

      if (node.type === "switch") {
        let targetId;
        try {
          targetId = await hooks.resolveSwitchTarget(
            /** @type {{ id: string; type: string; config?: object }} */ (node),
            hooks.getState(),
            hooks.jq
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          hooks.appendCmd("FailNode", { nodeId: cur, reason: "switch_routing_failed", message: msg });
          hooks.appendEvt("ExecutionFailed", { error: msg });
          return { kind: "failed", error: msg };
        }
        if (!byId.has(targetId)) {
          const msg = `switch "${node.id}" resolved to unknown target "${targetId}"`;
          hooks.appendCmd("FailNode", { nodeId: cur, reason: "switch_routing_failed", message: msg });
          hooks.appendEvt("ExecutionFailed", { error: msg });
          return { kind: "failed", error: msg };
        }
        hooks.appendCmd("CompleteNode", { nodeId: cur, output: {} });
        const stateUpdatedSeq = hooks.appendEvt("StateUpdated", {
          nodeId: cur,
          state: JSON.parse(JSON.stringify(hooks.getState())),
        });
        hooks.appendCheckpoint(cur, hooks.getState(), stateUpdatedSeq, parallelSpan);
        try {
          hooks.throwIfStateInvalid(hooks.getState(), `State invalid after switch "${cur}"`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { kind: "failed", error: msg };
        }
        cur = targetId;
        continue;
      }

      if (node.type === "interrupt") {
        const cfg = node.config && typeof node.config === "object" ? /** @type {{ prompt?: string }} */ (node.config) : {};
        const promptSummary =
          typeof cfg.prompt === "string" ? (cfg.prompt.length > 200 ? `${cfg.prompt.slice(0, 200)}…` : cfg.prompt) : "";
        hooks.appendCmd("RaiseInterrupt", { nodeId: cur, prompt: promptSummary });
        const interruptSeq = hooks.appendEvt("InterruptRaised", { nodeId: cur, prompt: promptSummary });
        hooks.appendCheckpoint(cur, hooks.getState(), interruptSeq, parallelSpan);
        return {
          kind: "interrupt",
          nodeId: cur,
          state: JSON.parse(JSON.stringify(hooks.getState())),
        };
      }

      if (node.type === "parallel") {
        const outs = outgoing.get(cur) ?? [];
        if (outs.length !== 1) {
          return {
            kind: "failed",
            error: `parallel "${cur}" must have exactly one outgoing edge (join target); found ${outs.length}.`,
          };
        }
        const nestedJoin = outs[0];
        const pr = await executeParallelBlock(
          /** @type {{ id: string; type: string; config?: object }} */ (node),
          nestedJoin
        );
        if (pr.kind !== "ok") return pr;
        cur = nestedJoin;
        continue;
      }

      if (node.type === "wait") {
        try {
          await hooks.runWaitNode(
            /** @type {{ id: string; type: string; config?: object }} */ (node),
            scheduled
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          hooks.appendCmd("FailNode", { nodeId: cur, reason: "wait_failed", message: msg });
          hooks.appendEvt("ExecutionFailed", { error: msg });
          return { kind: "failed", error: msg };
        }
        hooks.appendCmd("CompleteNode", { nodeId: cur, output: {} });
        const stateUpdatedSeq = hooks.appendEvt("StateUpdated", {
          nodeId: cur,
          state: JSON.parse(JSON.stringify(hooks.getState())),
        });
        hooks.appendCheckpoint(cur, hooks.getState(), stateUpdatedSeq, parallelSpan);
        try {
          hooks.throwIfStateInvalid(hooks.getState(), `State invalid after wait "${cur}"`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { kind: "failed", error: msg };
        }
        const nextOut = outgoing.get(cur) ?? [];
        if (nextOut.length !== 1) {
          return {
            kind: "failed",
            error: `Node "${cur}" (wait) must have exactly one outgoing edge; found ${nextOut.length}.`,
          };
        }
        cur = nextOut[0];
        continue;
      }

      if (node.type === "set_state") {
        let output;
        try {
          output = await hooks.buildSetStateOutput(
            /** @type {{ id: string; type: string; config?: object }} */ (node),
            hooks.getState(),
            hooks.jq
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          hooks.appendCmd("FailNode", { nodeId: cur, reason: "set_state_failed", message: msg });
          hooks.appendEvt("ExecutionFailed", { error: msg });
          return { kind: "failed", error: msg };
        }
        hooks.appendCmd("CompleteNode", { nodeId: cur, output });
        hooks.setState(
          /** @type {Record<string, unknown>} */ (applyOutputWithReducers(hooks.getState(), output, hooks.stateSchema))
        );
        const stateUpdatedSeq = hooks.appendEvt("StateUpdated", {
          nodeId: cur,
          state: JSON.parse(JSON.stringify(hooks.getState())),
        });
        hooks.appendCheckpoint(cur, hooks.getState(), stateUpdatedSeq, parallelSpan);
        try {
          hooks.throwIfStateInvalid(hooks.getState(), `State invalid after set_state "${cur}"`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { kind: "failed", error: msg };
        }
        const nextOut = outgoing.get(cur) ?? [];
        if (nextOut.length !== 1) {
          return {
            kind: "failed",
            error: `Node "${cur}" (set_state) must have exactly one outgoing edge; found ${nextOut.length}.`,
          };
        }
        cur = nextOut[0];
        continue;
      }

      if (node.type === "end") {
        return {
          kind: "failed",
          error: `Invalid "end" node "${cur}" reached inside a parallel branch before the join target.`,
        };
      }

      /** @type {Record<string, unknown>} */
      let output = {};

      if (node.type === "start") {
        output = {};
      } else if (PLACEHOLDER_TYPES.has(node.type)) {
        const activityResult = await hooks.runPlaceholderActivity(
          /** @type {{ id: string; type: string; config?: object }} */ (node),
          scheduled,
          hooks.getState(),
          parallelSpan
        );
        if (activityResult && typeof activityResult === "object" && "kind" in activityResult && activityResult.kind === "awaiting_activity") {
          return {
            kind: "awaiting_activity",
            nodeId: activityResult.nodeId,
            state: JSON.parse(JSON.stringify(hooks.getState())),
            ...(activityResult.parallelSpan ? { parallelSpan: activityResult.parallelSpan } : {}),
          };
        }
        if (!activityResult.ok) {
          const { error, code } = activityResult;
          hooks.appendEvt("ActivityFailed", { nodeId: cur, error, ...(code !== undefined ? { code } : {}) });
          hooks.appendCmd("FailNode", {
            nodeId: cur,
            reason: "activity_failed",
            message: error,
            ...(code !== undefined ? { code } : {}),
          });
          hooks.appendEvt("ExecutionFailed", { error });
          return { kind: "failed", error };
        }
        output = activityResult.output;
      } else {
        return { kind: "failed", error: `Unsupported node type "${node.type}" inside parallel branch.` };
      }

      hooks.appendCmd("CompleteNode", { nodeId: cur, output });

      if (node.type !== "start") {
        hooks.setState(
          /** @type {Record<string, unknown>} */ (applyOutputWithReducers(hooks.getState(), output, hooks.stateSchema))
        );
        const stateUpdatedSeq = hooks.appendEvt("StateUpdated", {
          nodeId: cur,
          state: JSON.parse(JSON.stringify(hooks.getState())),
        });
        hooks.appendCheckpoint(cur, hooks.getState(), stateUpdatedSeq, parallelSpan);
        try {
          hooks.throwIfStateInvalid(hooks.getState(), `State invalid after node "${cur}"`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { kind: "failed", error: msg };
        }
      }

      const outs = outgoing.get(cur) ?? [];
      if (outs.length !== 1) {
        return {
          kind: "failed",
          error: `Node "${cur}" (type "${node.type}") must have exactly one outgoing edge inside a branch; found ${outs.length}.`,
        };
      }
      cur = outs[0];
    }
    return { kind: "ok" };
  }

  /**
   * @param {{ id: string; type: string; config?: object }} parallelNode
   * @param {string} joinTargetId
   * @returns {Promise<
   *   | { kind: 'ok' }
   *   | { kind: 'failed'; error: string }
   *   | { kind: 'interrupt'; nodeId: string; state: Record<string, unknown> }
   *   | { kind: 'awaiting_activity'; nodeId: string; state: Record<string, unknown>; parallelSpan?: Record<string, unknown> }
   * >}
   */
  async function executeParallelBlock(parallelNode, joinTargetId) {
    const cfg =
      parallelNode.config && typeof parallelNode.config === "object"
        ? /** @type {{ join?: string; n?: number; branches?: Array<{ name: string; entry: string }> }} */ (
            parallelNode.config
          )
        : {};
    const join = /** @type {ParallelJoin} */ (cfg.join);
    const branches = Array.isArray(cfg.branches) ? cfg.branches : [];
    const n = cfg.n;

    if (!join || !["all", "any", "n_of_m"].includes(join)) {
      return { kind: "failed", error: `parallel "${parallelNode.id}": invalid or missing join policy.` };
    }
    if (branches.length === 0) {
      return { kind: "failed", error: `parallel "${parallelNode.id}": branches must be non-empty.` };
    }
    if (join === "n_of_m") {
      if (!Number.isInteger(n) || n < 1 || n > branches.length) {
        return {
          kind: "failed",
          error: `parallel "${parallelNode.id}": n_of_m requires integer n with 1 ≤ n ≤ branch count (${branches.length}).`,
        };
      }
    }

    const branchNames = branches.map((b) => b.name);
    hooks.appendCmd("StartParallel", {
      nodeId: parallelNode.id,
      join,
      branchNames,
      ...(join === "n_of_m" && n !== undefined ? { n } : {}),
    });
    hooks.appendEvt("ParallelForked", {
      nodeId: parallelNode.id,
      join,
      branchNames,
    });

    /**
     * @param {number} fromIndex inclusive
     */
    function cancelRemaining(fromIndex) {
      for (let i = fromIndex; i < branches.length; i++) {
        const b = branches[i];
        hooks.appendCmd("CancelParallelBranch", { nodeId: parallelNode.id, branchName: b.name });
        hooks.appendEvt("ParallelBranchCancelled", { nodeId: parallelNode.id, branchName: b.name });
      }
    }

    if (join === "all") {
      for (const b of branches) {
        const r = await runBranchToJoin(b.entry, joinTargetId, {
          parallelNodeId: parallelNode.id,
          joinTargetId,
          branchName: b.name,
          branchEntryNodeId: b.entry,
        });
        if (r.kind !== "ok") return r;
      }
    } else if (join === "any") {
      let successIndex = -1;
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        const r = await runBranchToJoin(b.entry, joinTargetId, {
          parallelNodeId: parallelNode.id,
          joinTargetId,
          branchName: b.name,
          branchEntryNodeId: b.entry,
        });
        if (r.kind === "awaiting_activity") return r;
        if (r.kind === "interrupt") return r;
        if (r.kind === "ok") {
          successIndex = i;
          break;
        }
      }
      if (successIndex < 0) {
        const msg = `parallel "${parallelNode.id}" (join any): no branch completed successfully.`;
        hooks.appendCmd("FailNode", { nodeId: parallelNode.id, reason: "parallel_join_failed", message: msg });
        hooks.appendEvt("ExecutionFailed", { error: msg });
        return { kind: "failed", error: msg };
      }
      cancelRemaining(successIndex + 1);
    } else {
      let successes = 0;
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        if (successes >= /** @type {number} */ (n)) {
          cancelRemaining(i);
          break;
        }
        const r = await runBranchToJoin(b.entry, joinTargetId, {
          parallelNodeId: parallelNode.id,
          joinTargetId,
          branchName: b.name,
          branchEntryNodeId: b.entry,
        });
        if (r.kind === "awaiting_activity") return r;
        if (r.kind === "interrupt") return r;
        if (r.kind === "ok") {
          successes += 1;
          if (successes >= /** @type {number} */ (n)) {
            cancelRemaining(i + 1);
            break;
          }
        }
      }
      if (successes < /** @type {number} */ (n)) {
        const msg = `parallel "${parallelNode.id}" (join n_of_m): needed ${n} successful branches, got ${successes}.`;
        hooks.appendCmd("FailNode", { nodeId: parallelNode.id, reason: "parallel_join_failed", message: msg });
        hooks.appendEvt("ExecutionFailed", { error: msg });
        return { kind: "failed", error: msg };
      }
    }

    hooks.appendCmd("JoinParallel", { nodeId: parallelNode.id, join });
    hooks.appendEvt("ParallelJoined", { nodeId: parallelNode.id, join });
    return { kind: "ok" };
  }

  return { executeParallelBlock, runBranchToJoin };
}
