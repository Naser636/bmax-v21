#!/usr/bin/env node
/**
 * generative-repair-adapter — V47 Lot E (register C-04): the bounded PROPOSAL→EDITS adapter that lets an authorized
 * generative provider's output flow through ODG's PROVEN, acceptance-gated, rollback-safe repair harness. It is the
 * "smallest architecture-compatible mechanism" the mandate asks for — WITHOUT activating any provider:
 *
 *   - prepareProposalContract(task)  — the STRUCTURED task contract a provider must satisfy (allowed files, acceptance
 *                                      command, max edits, required format). Explicit, bounded, no secrets.
 *   - applyProposal(contract, proposal, opts) — VALIDATE the proposal against the contract (every edit path ∈
 *                                      allowedFiles; count ≤ maxEdits; content is a string), then route it through
 *                                      runRepairWorkflow (isolated workspace, real acceptance, exact rollback). A
 *                                      malformed / out-of-scope proposal is REJECTED before anything is applied.
 *   - invokeProvider(contract, opts) — the ONLY provider-dependent step. BLOCKED (never faked) unless an authorized
 *                                      ODG_LOCAL_MODEL_CMD is configured AND opts.authorized === true. This lot does
 *                                      NOT call the model; it prepares the seam so the unblock is a one-line wiring.
 *
 * Distinct from patch-proposal-apply (which marshals proposals into the governed LIVE-repo patch-executor): this
 * adapter targets the ISOLATED repair-workflow harness, so a model's edits are proven against acceptance tests with
 * exact rollback before they could ever reach the real repo. Deterministic + fail-closed; no new primitive.
 */
"use strict";

const REPAIR = require("./repair-workflow.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** prepareProposalContract(task): the structured, bounded contract a provider proposal must satisfy. */
function prepareProposalContract(task: any): any {
  if (!isObj(task)) return { ok: false, code: "INVALID_INPUT", reason: "task object required" };
  if (typeof task.workspaceDir !== "string") return { ok: false, code: "INVALID_INPUT", reason: "workspaceDir required" };
  if (!Array.isArray(task.acceptanceCommand) || task.acceptanceCommand.length === 0) return { ok: false, code: "INVALID_INPUT", reason: "acceptanceCommand (string[]) required" };
  const allowedFiles = Array.isArray(task.allowedFiles) ? task.allowedFiles.filter((f: any) => typeof f === "string" && f) : [];
  if (allowedFiles.length === 0) return { ok: false, code: "INVALID_INPUT", reason: "allowedFiles[] required — a generative mission must have a bounded write-set" };
  return { ok: true, contract: {
    taskId: typeof task.taskId === "string" ? task.taskId : "gen-repair",
    instruction: typeof task.instruction === "string" ? task.instruction : "",
    allowedFiles,
    acceptanceCommand: task.acceptanceCommand,
    maxEdits: Number.isInteger(task.maxEdits) && task.maxEdits > 0 ? task.maxEdits : 10,
    format: "edits: [{ path: <repo-relative, within allowedFiles>, content: <full new file content> }]",
    constraints: ["no edits outside allowedFiles", "deterministic apply", "accepted only if baseline fails and acceptance passes", "exact rollback otherwise"],
  } };
}

/** validateProposal(contract, proposal): structural + write-set + size checks. Returns {ok} | {ok:false, code, reason}. */
function validateProposal(contract: any, proposal: any): any {
  if (!isObj(proposal) || !Array.isArray(proposal.edits)) return { ok: false, code: "MALFORMED_PROPOSAL", reason: "proposal.edits[] required" };
  if (proposal.edits.length === 0) return { ok: false, code: "EMPTY_PROPOSAL", reason: "no edits proposed" };
  if (proposal.edits.length > contract.maxEdits) return { ok: false, code: "TOO_MANY_EDITS", reason: `proposal has ${proposal.edits.length} edits > maxEdits ${contract.maxEdits}` };
  const allowed = new Set(contract.allowedFiles.map((f: string) => f.replace(/\/+$/, "")));
  for (const e of proposal.edits) {
    if (!isObj(e) || typeof e.path !== "string" || typeof e.content !== "string") return { ok: false, code: "MALFORMED_EDIT", reason: "each edit needs { path:string, content:string }" };
    const within = contract.allowedFiles.some((pre: string) => { const p = pre.replace(/\/+$/, ""); return e.path === p || e.path.startsWith(p + "/"); });
    if (!within) return { ok: false, code: "WRITE_SET_VIOLATION", reason: `edit '${e.path}' is outside allowedFiles` };
  }
  return { ok: true };
}

/**
 * applyProposal(contract, proposal, opts?): validate then route through the proven repair harness.
 * Returns the repair-workflow evidence record, or a REJECTED verdict if the proposal is invalid (nothing applied).
 */
function applyProposal(contract: any, proposal: any, opts: any = {}): any {
  if (!isObj(contract) || !Array.isArray(contract.allowedFiles)) return { ok: false, code: "INVALID_INPUT", reason: "a prepared contract is required" };
  const v = validateProposal(contract, proposal);
  if (!v.ok) return { ok: false, status: "REJECTED", code: v.code, reason: v.reason, applied: false };
  const task = {
    workspaceDir: opts.workspaceDir || contract.workspaceDir,
    acceptance: { command: contract.acceptanceCommand, timeoutMs: opts.timeoutMs },
    writeSet: contract.allowedFiles,
    change: { source: "edits", edits: proposal.edits },
  };
  return REPAIR.runRepairWorkflow(task, opts.runner ? { runner: opts.runner } : {});
}

/**
 * invokeProvider(contract, opts?): the provider-dependent step. Honestly BLOCKED unless an authorized model command
 * is configured AND opts.authorized === true. This lot never calls the model — it defines the gate + unblock action.
 */
function invokeProvider(contract: any, opts: any = {}): any {
  const cmd = process.env.ODG_LOCAL_MODEL_CMD;
  if (!cmd) return { ok: false, status: "BLOCKED", reason: "no authorized generative provider (ODG_LOCAL_MODEL_CMD unset) — model not called, output not faked",
    unblock: "owner authorizes + configures a sandboxed local-model command (runtime/core/provider-sandbox); then set opts.authorized" };
  if (opts.authorized !== true) return { ok: false, status: "BLOCKED", reason: "ODG_LOCAL_MODEL_CMD is set but this invocation is not owner-authorized",
    unblock: "pass opts.authorized=true only under an explicit owner authorization for this mission" };
  // Intentionally not implemented in this lot: wiring provider-sandbox.runProvider → parse → proposal is the next
  // step once a provider is authorized. We refuse rather than pretend.
  return { ok: false, status: "NOT_IMPLEMENTED", reason: "provider configured + authorized, but model-invocation wiring is deferred to the activation lot",
    unblock: "implement provider-sandbox.runProvider(contract.instruction) → parse edits → applyProposal(contract, {edits})" };
}

export { prepareProposalContract, validateProposal, applyProposal, invokeProvider };
module.exports = { prepareProposalContract, validateProposal, applyProposal, invokeProvider };
