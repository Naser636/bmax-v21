#!/usr/bin/env node

/*
 * Patch Proposal Apply — V42 govern-the-apply ADAPTER (not a new executor, not a brain).
 *
 * Marshals a PROVIDER PROPOSAL (read-only authored edits, from ProviderResult.proposedEdits) into the
 * EXISTING governed patch-executor (runtime/core/patch-executor.js) and returns its evidence. It
 * performs NO apply of its own: it writes the mission's patch-plan.json and delegates to patch-executor,
 * which is the SOLE authority that enforces authorizedPaths, the Action/Contract gate, idempotency and
 * reality C03. This is the seam that moves engineering execution authority out of Claude Code (which now
 * only PROPOSES) and into the governed ODG path (which PERFORMS).
 *
 * Authority boundary (truth, not labels):
 *   - The mission IDENTITY and authorizedPaths come from ODG (the caller), NEVER from the provider's
 *     self-report — a provider cannot widen its own scope or spoof which mission it executed.
 *   - A structurally malformed / ambiguous / empty proposal is REJECTED here BEFORE any plan is written
 *     or any process is spawned (zero mutation). Scope/authority is then re-enforced by patch-executor.
 *   - Nothing is marked successful here; patch-execution.json is pure evidence for the Validation Engine.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

/**
 * @param {object} opts
 * @param {string} opts.mission            authoritative mission id (ODG-supplied; NOT the provider's)
 * @param {string[]} opts.authorizedPaths  authoritative write scope (ODG-supplied)
 * @param {Array<{objectiveId?:string,target:string,content?:string,diff?:string}>} opts.proposedEdits
 * @param {string} [opts.cwd]              workspace root (defaults to process.cwd())
 * @param {number} [opts.stateVersion]     optional compare-and-set version passed through to the executor
 * @returns {{applied:boolean, reason:string, executed:any[], report:(object|null), executorStatus:(number|null)}}
 */
function applyProposal(opts) {
  const { mission, authorizedPaths, proposedEdits } = opts || {};
  const cwd = opts && opts.cwd ? opts.cwd : process.cwd();

  if (!mission || typeof mission !== "string") {
    throw new Error("applyProposal: authoritative mission id is required");
  }
  if (!Array.isArray(authorizedPaths) || authorizedPaths.length === 0) {
    // Engineering apply requires an explicit write scope; without it there is nothing to authorize against.
    throw new Error("applyProposal: non-empty authorizedPaths (write scope) is required");
  }
  // A provider that claims DONE without a concrete proposal authored NOTHING — reject, apply nothing.
  if (!Array.isArray(proposedEdits) || proposedEdits.length === 0) {
    return { applied: false, reason: "NO_PROPOSAL", executed: [], report: null, executorStatus: null };
  }

  // STRUCTURAL validation BEFORE any plan is written. Each edit must name a target and carry EXACTLY one
  // of content/diff. Any malformed/ambiguous edit rejects the WHOLE proposal (atomic, zero mutation) —
  // "malformed / ambiguous / partial ⇒ reject safely". Authority (scope) is re-checked by patch-executor.
  const byObjective = new Map();
  for (const e of proposedEdits) {
    if (!e || typeof e !== "object" || typeof e.target !== "string" || !e.target) {
      return { applied: false, reason: "MALFORMED_PROPOSAL", executed: [], report: null, executorStatus: null };
    }
    const hasContent = typeof e.content === "string";
    const hasDiff = typeof e.diff === "string";
    if (hasContent === hasDiff) {
      // neither, or both — ambiguous
      return { applied: false, reason: "MALFORMED_PROPOSAL", executed: [], report: null, executorStatus: null };
    }
    const oid = typeof e.objectiveId === "string" && e.objectiveId ? e.objectiveId : "PROPOSAL";
    if (!byObjective.has(oid)) byObjective.set(oid, []);
    byObjective
      .get(oid)
      .push(hasContent ? { target: e.target, content: e.content } : { target: e.target, diff: e.diff });
  }

  const patches = [...byObjective.entries()].map(([oid, edits]) => ({
    action: oid,
    objectiveId: oid,
    edits,
  }));
  // The plan carries ODG's authoritative mission + scope (never the provider's self-report).
  const plan = { mission, authorizedPaths, patches };
  if (opts && Number.isInteger(opts.stateVersion)) plan.stateVersion = opts.stateVersion;

  const genDir = path.join(cwd, "runtime", "generated");
  fs.mkdirSync(genDir, { recursive: true });
  fs.writeFileSync(path.join(genDir, "patch-plan.json"), JSON.stringify(plan, null, 2));

  const executor = path.join(__dirname, "patch-executor.js");
  const r = spawnSync("node", [executor], { cwd, encoding: "utf8" });

  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(path.join(genDir, "patch-execution.json"), "utf8"));
  } catch {
    report = null;
  }
  const executed = report && Array.isArray(report.executed) ? report.executed : [];
  const applied =
    executed.length > 0 && executed.every((x) => x.status === "APPLIED" || x.status === "DUPLICATE");
  return {
    applied,
    reason: applied ? "APPLIED" : "NOT_FULLY_APPLIED",
    executed,
    report,
    executorStatus: r.status,
  };
}

module.exports = { applyProposal };
