#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V26 Chantier 1 — GOVERNED FEEDBACK-RETRY REPAIR LOOP. PURE orchestration (generator + verifier are seams).
 * DISCOVERED LIMIT (live qwen2.5-coder:3b, 2026-11-09): single-shot repair accepted only 2/4 progressive defects — the
 * model produced a fix referencing an undefined name (runtime error) and a fix the independent edge-case test rejected.
 * ROOT CAUSE: the repair flow was single-shot — the INDEPENDENT test's failure detail was never fed back to the model, so
 * a near-miss could not be corrected. MISSING CAPABILITY (built here): a bounded feedback-retry loop that, when the
 * independent verifier REJECTS a proposed fix (wrong result OR a thrown error), re-prompts the generator WITH the exact
 * failure and retries — never accepting a fix the INDEPENDENT test rejects, never exceeding the attempt budget.
 *
 * It reuses the existing seams (ollama-provider.generate/parseEditsProposal, repair-workflow.makeWriteSetGuard, an
 * INDEPENDENT test distinct from the generator) — it builds no model and lowers no quality gate. Fail-closed. Dual export.
 */

const RW = require("./repair-workflow.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function fn(v: any): boolean { return typeof v === "function"; }

/** buildFeedbackPrompt(basePrompt, failure) -> a retry prompt that appends the independent failure detail. */
function buildFeedbackPrompt(basePrompt: string, failure: any): string {
  const f = isObj(failure) ? failure : {};
  const detail = f.error ? `a runtime error: ${f.error}` : (f.reason ? `the independent test failed: ${f.reason}` : "the independent verification rejected the fix");
  return `${basePrompt}\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED by an INDEPENDENT test — ${detail}. Produce a CORRECTED fix that passes it (define every referenced name; handle the stated edge cases). Reply with ONLY the strict JSON edits object.`;
}

/**
 * repairWithRetry(opts) -> { accepted, attempts, finalEdit, history }. opts:
 *   { basePrompt, writeSet, allowedPath, maxAttempts?=3,
 *     generate(prompt) -> Promise<{ok, text}>        (ollama-provider.generate-shaped; a SEAM),
 *     parse(text) -> {ok, proposal}|{ok:false}       (default ollama-provider.parseEditsProposal),
 *     verify(content) -> {ok, error?, reason?} }      (the INDEPENDENT test over the proposed content — a SEAM, distinct
 *                                                      from the generator).
 * FAIL-CLOSED: a fix is accepted ONLY if it stays in the write-set AND the independent verify returns ok===true; on
 * rejection the failure is fed back and retried up to maxAttempts; the budget is never exceeded.
 */
async function repairWithRetry(opts: any = {}): Promise<any> {
  const o = isObj(opts) ? opts : {};
  const maxAttempts = Math.max(1, Math.min(10, Number(o.maxAttempts) || 3));
  const guard = RW.makeWriteSetGuard(Array.isArray(o.writeSet) ? o.writeSet : (o.allowedPath ? [o.allowedPath] : []));
  const parse = fn(o.parse) ? o.parse : require("./ollama-provider.js").parseEditsProposal;
  const allowedPath = typeof o.allowedPath === "string" ? o.allowedPath : null;
  const history: any[] = [];
  let prompt = String(o.basePrompt || "");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const g = fn(o.generate) ? await o.generate(prompt) : { ok: false };
    if (!g || g.ok !== true || typeof g.text !== "string") { history.push({ attempt, stage: "GENERATE_FAILED" }); continue; }
    const p = parse(g.text);
    if (!p || p.ok !== true || !p.proposal || !Array.isArray(p.proposal.edits) || p.proposal.edits.length === 0) { history.push({ attempt, stage: "PARSE_FAILED" }); prompt = buildFeedbackPrompt(String(o.basePrompt || ""), { reason: "the output was not a valid strict JSON edits object" }); continue; }
    const edit = (allowedPath ? p.proposal.edits.find((e: any) => e && e.path === allowedPath) : null) || p.proposal.edits[0];
    if (!edit || (edit.path && guard(edit.path) !== true)) { history.push({ attempt, stage: "WRITE_SET_VIOLATION", path: edit && edit.path }); prompt = buildFeedbackPrompt(String(o.basePrompt || ""), { reason: `the edit touched '${edit && edit.path}', outside the authorized write-set` }); continue; }
    let v: any; try { v = fn(o.verify) ? await o.verify(edit.content) : { ok: false, reason: "no verifier" }; } catch (e: any) { v = { ok: false, error: String((e && e.message) || e) }; }
    if (v && v.ok === true) { history.push({ attempt, stage: "ACCEPTED" }); return Object.freeze({ accepted: true, attempts: attempt, finalEdit: Object.freeze({ path: edit.path, content: edit.content }), history: Object.freeze(history) }); }
    history.push({ attempt, stage: "VERIFY_REJECTED", detail: (v && (v.error || v.reason)) || "rejected" });
    prompt = buildFeedbackPrompt(String(o.basePrompt || ""), v);   // feed the INDEPENDENT failure back and retry
  }
  return Object.freeze({ accepted: false, attempts: maxAttempts, finalEdit: null, history: Object.freeze(history) });   // never accept an unverified fix
}

const REPAIR_RETRY_CONTRACT = Object.freeze({
  id: "V124-REPAIR-RETRY",
  source: "CTO V26 Chantier 1 — governed feedback-retry loop (built from a discovered single-shot limit)",
  reuses: Object.freeze(["ollama-provider.generate / parseEditsProposal (the generator seam)", "repair-workflow.makeWriteSetGuard (the REAL write-set guard)", "an INDEPENDENT verifier distinct from the generator"]),
  notAuthority: "orchestrates generate→verify→feedback→retry; builds no model; a fix is accepted ONLY on the independent verifier's PASS; the attempt budget is bounded",
  invariants: Object.freeze([
    "a fix is ACCEPTED only if it stays in the authorized write-set AND the INDEPENDENT verifier returns ok (never on the generator's own claim)",
    "on rejection (wrong result OR thrown error OR parse/write-set failure) the exact failure is fed back and the loop retries",
    "the attempt budget (maxAttempts) is never exceeded; on exhaustion the result is accepted:false (no unverified fix accepted)",
    "pure orchestration: the generator and verifier are seams — the quality gate (independent verify) is never lowered",
  ]),
});

module.exports = { buildFeedbackPrompt, repairWithRetry, REPAIR_RETRY_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify(REPAIR_RETRY_CONTRACT, null, 2) + "\n"); }

export {};
