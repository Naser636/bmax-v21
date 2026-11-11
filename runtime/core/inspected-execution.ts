#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V87 §2/§3 — INSPECTED EXECUTION LAYER. The single canonical wrapper every execution path routes through so
 * that each operation traverses the V86 inspection boundary PRE + POST, fail-closed, with a proof-of-inspection RECEIPT
 * that a path's executor can REQUIRE (so a direct raw call that skipped the boundary is refused — non-bypass). It COMPOSES
 * inspection-boundary (no second engine) and takes no closure decision. A path is "wired" when its operational entry calls
 * runInspected; its effect-producing executor calls requireInspection(ctx) to refuse an un-inspected invocation. Pure/
 * deterministic (inspectors + executor injected). Dual export.
 */

const B = require("./inspection-boundary");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/*
 * runInspected(pathId, operation, ctx, execute) -> { pathId, pre, result, post, receipt, promoted, reason }.
 * Runs PRE; only on an approving verdict does it issue a receipt and call execute(argsWithReceipt); then runs POST.
 * execute receives ({ ...ctx, receipt }) so the real executor can prove it was inspected. `promoted` ⟺ PRE approved +
 * POST PASS. A BLOCKED/ESCALATE/DECLARED/NOT_MEASURED PRE ⇒ execute is NEVER called (a blocked op is not executed).
 */
function runInspected(pathId: any, operation: any, ctx: any = {}, execute: any = null): any {
  const c = isObj(ctx) ? ctx : {};
  const op = isObj(operation) ? operation : {};
  const pre = B.inspectPre(op, c);
  if (pre.verdict !== "APPROVED" && pre.verdict !== "APPROVED_WITH_RESTRICTIONS") {
    return Object.freeze({ pathId, pre, result: null, post: null, receipt: null, promoted: false, reason: `PRE ${pre.verdict} ⇒ not executed (fail-closed)` });
  }
  const receipt = B.issueReceipt(op, pre);
  if (typeof execute !== "function") return Object.freeze({ pathId, pre, result: null, post: null, receipt: receipt.token, promoted: false, reason: "no executor supplied ⇒ nothing executed (fail-closed)" });
  let result: any; try { result = execute(Object.assign({}, c, { receipt: receipt.token, operationId: op.id })); } catch (e: any) { result = { error: (e && e.message) || String(e) }; }
  const post = B.inspectPost(op, isObj(result) ? result : { objectiveMet: false }, c);
  const promoted = post.verdict === "PASS";
  return Object.freeze({ pathId, pre, result, post, receipt: receipt.token, promoted, reason: promoted ? "PRE approved + executed + POST PASS ⇒ promotable" : `POST ${post.verdict} ⇒ not promoted` });
}

/* requireInspection(ctx, operationId) -> { ok, reason }. An effect-producing executor calls this FIRST and refuses to
 * produce any effect when the receipt is absent/invalid — this is what makes a bypassing direct call fail (non-bypass). */
function requireInspection(ctx: any, operationId: any): any {
  const token = isObj(ctx) ? ctx.receipt : null;
  return B.requireReceipt(token, operationId);
}

/* inspectedGuard(pathId, buildOperation, execute) -> a path-ready inspected entry: (input, ctx) => runInspected(...).
 * buildOperation(input) maps a path's native input to the boundary operation shape. Keeps wiring uniform across paths. */
function inspectedGuard(pathId: any, buildOperation: any, execute: any): any {
  return (input: any, ctx: any = {}) => runInspected(pathId, typeof buildOperation === "function" ? buildOperation(input) : input, ctx, () => execute(input, ctx));
}

const INSPECTED_EXECUTION_CONTRACT = Object.freeze({
  id: "V87-INSPECTED-EXECUTION",
  source: "CTO V87 §2/§3 — canonical inspected-execution layer (PRE+POST + proof-of-inspection receipt, non-bypass)",
  reuses: Object.freeze(["inspection-boundary (V86): inspectPre/inspectPost/issueReceipt/requireReceipt"]),
  notAuthority: "wraps execution with mandatory inspection; it takes no closure decision and creates no authorizer",
  invariants: Object.freeze([
    "every operation routes PRE → (approve ⇒ receipt + execute) → POST; a non-approving PRE never executes",
    "the executor receives a proof-of-inspection receipt; requireInspection refuses effects without a valid one (non-bypass)",
    "promoted ⟺ PRE approved + POST PASS; executed ≠ promoted (fail-closed)",
    "pure/deterministic; composes the V86 boundary; no second engine",
  ]),
});

module.exports = { runInspected, requireInspection, inspectedGuard, INSPECTED_EXECUTION_CONTRACT };

if (require.main === module) {
  const meta = { valid: true, effective: true };
  const r = runInspected("demo-path", { id: "op", risk: "CODE_CHANGE", actions: ["code_edit_local", "test"] },
    { inspectorMeta: meta, independenceActors: { builder: { id: "P" }, verifier: { id: "I" } }, evidenceOpts: { exists: () => true, read: () => '{"done":1}', expectMarkers: ["done"] } },
    (args: any) => ({ objectiveMet: requireInspection(args, "op").ok, evidenceRef: "x.json" }));
  process.stdout.write(JSON.stringify({ ...INSPECTED_EXECUTION_CONTRACT, demo: { pre: r.pre.verdict, post: r.post.verdict, promoted: r.promoted, receiptIssued: !!r.receipt } }, null, 2) + "\n");
}

export {};
