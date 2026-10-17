#!/usr/bin/env node
"use strict";

/*
 * Patch Proposal Apply — TypeScript port; parity with runtime/core/patch-proposal-apply.js.
 *
 * V42 govern-the-apply ADAPTER (not a new executor, not a brain). Marshals a PROVIDER PROPOSAL into the
 * EXISTING governed patch-executor (runtime/core/patch-executor.js) and returns its evidence. It performs
 * NO apply of its own: it writes the mission's patch-plan.json and delegates to patch-executor, the SOLE
 * authority that enforces authorizedPaths, the Action/Contract gate, idempotency and reality C03.
 *
 * Authority boundary: mission IDENTITY + authorizedPaths come from ODG (the caller), never the provider's
 * self-report; a malformed/ambiguous/empty proposal is REJECTED here before any plan is written or process
 * spawned; nothing is marked successful here (patch-execution.json is pure evidence for the Validation Engine).
 *
 * Strict TS port: public export (applyProposal), every reject code (NO_PROPOSAL/MALFORMED_PROPOSAL/…),
 * the patch grouping, plan shape, spawn + evidence-read flow and result shape are preserved EXACTLY. The
 * V71 change (shared with the .js): the executor path is resolved via runtime-paths.coreDir(__dirname) so a
 * compiled dist/core caller maps back to the canonical source executor; the spawn is an optional test seam.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const { coreDir } = require("./runtime-paths");

export interface ProposedEdit { objectiveId?: string; target: string; content?: string; diff?: string; }
export interface ApplyProposalOpts {
  mission: string;
  authorizedPaths: string[];
  proposedEdits: ProposedEdit[];
  cwd?: string;
  stateVersion?: number;
  _spawn?: (...args: any[]) => any; // test-only seam (default real spawnSync)
}
export interface ApplyProposalResult {
  applied: boolean;
  reason: string;
  executed: any[];
  report: any | null;
  executorStatus: number | null;
}

function applyProposal(opts: ApplyProposalOpts): ApplyProposalResult {
  const { mission, authorizedPaths, proposedEdits } = opts || ({} as ApplyProposalOpts);
  const cwd = opts && opts.cwd ? opts.cwd : process.cwd();

  if (!mission || typeof mission !== "string") {
    throw new Error("applyProposal: authoritative mission id is required");
  }
  if (!Array.isArray(authorizedPaths) || authorizedPaths.length === 0) {
    throw new Error("applyProposal: non-empty authorizedPaths (write scope) is required");
  }
  if (!Array.isArray(proposedEdits) || proposedEdits.length === 0) {
    return { applied: false, reason: "NO_PROPOSAL", executed: [], report: null, executorStatus: null };
  }

  const byObjective = new Map<string, any[]>();
  for (const e of proposedEdits) {
    if (!e || typeof e !== "object" || typeof e.target !== "string" || !e.target) {
      return { applied: false, reason: "MALFORMED_PROPOSAL", executed: [], report: null, executorStatus: null };
    }
    const hasContent = typeof e.content === "string";
    const hasDiff = typeof e.diff === "string";
    if (hasContent === hasDiff) {
      return { applied: false, reason: "MALFORMED_PROPOSAL", executed: [], report: null, executorStatus: null };
    }
    const oid = typeof e.objectiveId === "string" && e.objectiveId ? e.objectiveId : "PROPOSAL";
    if (!byObjective.has(oid)) byObjective.set(oid, []);
    byObjective
      .get(oid)!
      .push(hasContent ? { target: e.target, content: e.content } : { target: e.target, diff: e.diff });
  }

  const patches = [...byObjective.entries()].map(([oid, edits]) => ({
    action: oid,
    objectiveId: oid,
    authoredBy: "PROVIDER",
    edits,
  }));
  const plan: any = { mission, authorizedPaths, patches };
  if (opts && Number.isInteger(opts.stateVersion as number)) plan.stateVersion = opts.stateVersion;

  const genDir = path.join(cwd, "runtime", "generated");
  fs.mkdirSync(genDir, { recursive: true });
  fs.writeFileSync(path.join(genDir, "patch-plan.json"), JSON.stringify(plan, null, 2));

  const executor = path.join(coreDir(__dirname), "patch-executor.js");
  const spawn = opts && typeof opts._spawn === "function" ? opts._spawn : spawnSync;
  const r: any = spawn("node", [executor], { cwd, encoding: "utf8" });

  let report: any = null;
  try {
    report = JSON.parse(fs.readFileSync(path.join(genDir, "patch-execution.json"), "utf8"));
  } catch {
    report = null;
  }
  const executed = report && Array.isArray(report.executed) ? report.executed : [];
  const applied =
    executed.length > 0 && executed.every((x: any) => x.status === "APPLIED" || x.status === "DUPLICATE");
  return {
    applied,
    reason: applied ? "APPLIED" : "NOT_FULLY_APPLIED",
    executed,
    report,
    executorStatus: r.status,
  };
}

export { applyProposal };
module.exports = { applyProposal };
