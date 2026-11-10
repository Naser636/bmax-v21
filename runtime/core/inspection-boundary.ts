#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V86 — UNIVERSAL MANDATORY INSPECTION BOUNDARY. PURE, deterministic. From V86 independent inspection is a
 * permanent STRUCTURAL property: no work passes without qualified independent inspection, PRE and POST, fail-closed, no
 * bypass. This is the single canonical passage point — it COMPOSES the existing canonical mechanisms and creates NO second
 * authorization/certification engine:
 *   - V84 local-work-mandate      — the owner's standing permission + Level-C refusal (permits / authorizeLocalMission).
 *   - action-gate                 — STATE/CONTRACT/POLICY/AUTHORITY admission (evaluateAction).
 *   - V85 inspector-meta-validation — an inspector may issue a verdict ONLY if it is demonstrably EFFECTIVE (qualified).
 *   - evaluator-independence      — the producer may not inspect/certify its own result (COMPROMISED ⇒ BLOCKED).
 *   - V82 evidence-qualifier      — POST: a result is not "done" unless its evidence is semantically VALID.
 * It takes NO closure decision and creates no authorizer — it returns an honest verdict for ODG to record. The depth of
 * control is PROPORTIONATE to risk (§8) but inspection is NEVER skipped (a low risk still checks mandate/scope/result).
 * Dual export. I/O (the inspectors) is injected so it is testable offline.
 */

const MANDATE = require("./local-work-mandate");
const GATE = require("./action-gate");
const META = require("./inspector-meta-validation");
const IND = require("./evaluator-independence");
const Q = require("./evidence-qualifier");

const PRE_VERDICT = Object.freeze(["APPROVED", "APPROVED_WITH_RESTRICTIONS", "BLOCKED", "DECLARED_UNVERIFIED", "NOT_MEASURED"]);
const POST_VERDICT = Object.freeze(["PASS", "FAIL", "DECLARED_UNVERIFIED", "NOT_MEASURED", "BLOCKED"]);
// §8 — risk tiers; each raises the REQUIRED depth but none removes inspection.
const RISK = Object.freeze(["READ", "CODE_CHANGE", "CRITICAL", "EXTERNAL"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// V87 — deterministic proof-of-inspection RECEIPT. A path's executor can REQUIRE a valid receipt before producing any
// effect, so a direct raw call that skipped the boundary is refused (non-bypass). Pure: a receipt is a hash of the
// operation id + the approving PRE verdict (no clock, no randomness). A receipt is issued ONLY for an approving PRE.
function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16).padStart(8, "0"); }
function issueReceipt(operation: any, pre: any): any {
  const id = isObj(operation) && typeof operation.id === "string" ? operation.id : "";
  const v = isObj(pre) ? pre.verdict : "";
  if (v !== "APPROVED" && v !== "APPROVED_WITH_RESTRICTIONS") return Object.freeze({ token: null, reason: `PRE ${v} is not approving ⇒ no receipt issued` });
  return Object.freeze({ token: `INSP:${id}:${v}:${hash(id + "|" + v)}`, operationId: id, verdict: v });
}
/* verifyReceipt(token, operationId) -> { valid, reason }. Valid ⟺ well-formed, id matches, verdict approving, hash recomputes. */
function verifyReceipt(token: any, operationId: any): any {
  if (typeof token !== "string" || token.indexOf("INSP:") !== 0) return Object.freeze({ valid: false, reason: "no/!malformed inspection receipt ⇒ un-inspected (fail-closed)" });
  const parts = token.split(":");
  if (parts.length !== 4) return Object.freeze({ valid: false, reason: "malformed receipt" });
  const [, id, v, h] = parts;
  if (typeof operationId === "string" && operationId && id !== operationId) return Object.freeze({ valid: false, reason: `receipt is for operation "${id}", not "${operationId}" (cross-operation reuse)` });
  if (v !== "APPROVED" && v !== "APPROVED_WITH_RESTRICTIONS") return Object.freeze({ valid: false, reason: `receipt carries non-approving verdict ${v}` });
  if (h !== hash(id + "|" + v)) return Object.freeze({ valid: false, reason: "receipt hash mismatch (tampered/forged)" });
  return Object.freeze({ valid: true, reason: "valid proof-of-inspection", operationId: id, verdict: v });
}
/* requireReceipt(token, operationId) -> { ok, reason }. An executor calls this to REFUSE effects without a valid receipt. */
function requireReceipt(token: any, operationId: any): any { const r = verifyReceipt(token, operationId); return Object.freeze({ ok: r.valid, reason: r.reason }); }

/* qualifiedInspector(metaResult) -> bool. §4/§7: an inspector may issue a verdict ONLY if its V85 meta-validation shows
 * it EFFECTIVE (caught all seeded defects, no false alarms). Absent/invalid meta-validation ⇒ NOT qualified (fail-closed). */
function inspectorQualified(metaResult: any): boolean {
  return isObj(metaResult) && metaResult.valid === true && metaResult.effective === true;
}

/*
 * inspectPre(operation, ctx) -> { verdict, reason, checks, restrictions }. Mandatory PRE-EXECUTION inspection.
 * operation: { id, origin, objective, risk, actions:[tags], action?(action-gate shape), producer?, inspector? }
 * ctx: { inspectorMeta?(V85 result for the issuing inspector), independenceActors?, gateContext?, revoked? }
 * Fail-closed order: no inspector / inspector not qualified / independence COMPROMISED / mandate refuses / gate denies ⇒ BLOCKED.
 */
function inspectPre(operation: any, ctx: any = {}): any {
  const op = isObj(operation) ? operation : {};
  const c = isObj(ctx) ? ctx : {};
  const checks: any = {};
  const restrictions: string[] = [];

  // (§6) an inspection that cannot run at all is BLOCKED — never a silent pass.
  if (typeof op.id !== "string" || !op.id) return Object.freeze({ verdict: "BLOCKED", reason: "operation has no identity ⇒ cannot be inspected (fail-closed)", checks, restrictions: Object.freeze([]) });

  // (§4/§7) the issuing inspector MUST be meta-validated EFFECTIVE, else no verdict may be honored.
  checks.inspectorQualified = inspectorQualified(c.inspectorMeta);
  if (!checks.inspectorQualified) return Object.freeze({ verdict: "BLOCKED", reason: "no qualified inspector (V85 meta-validation absent or not EFFECTIVE) ⇒ BLOCKED (fail-closed §4/§7)", checks, restrictions: Object.freeze([]) });

  // (§5) independence: the producer may not inspect its own result.
  if (isObj(c.independenceActors)) {
    const indep = IND.auditIndependence(c.independenceActors);
    checks.independence = indep.verdict;
    if (indep.verdict === "COMPROMISED") return Object.freeze({ verdict: "BLOCKED", reason: "evaluator independence COMPROMISED (producer == inspector or shared critical dependency) ⇒ BLOCKED (§5)", checks, restrictions: Object.freeze([]) });
    if (indep.verdict === "WEAK") restrictions.push("independence WEAK (non-critical shared dependency) — verdict advisory until strengthened");
  } else {
    checks.independence = "NOT_MEASURED";
    restrictions.push("independence not measured — reduced confidence");
  }

  // (§5/§13) V84 mandate: the declared actions must be within the owner's standing local mandate; Level-C ⇒ refused.
  const mandate = MANDATE.authorizeLocalMission({ id: op.id, actions: arr(op.actions) }, { revoked: c.revoked === true });
  checks.mandate = { authorized: mandate.authorized, level: mandate.level };
  if (!mandate.authorized) {
    // Level-C / Level-B / unknown ⇒ not locally authorized. Level-C is BLOCKED; Level-B is DECLARED_UNVERIFIED (prepare, never self-accept).
    const verdict = mandate.level === "B" ? "DECLARED_UNVERIFIED" : "BLOCKED";
    return Object.freeze({ verdict, reason: `mandate does not authorize this operation locally: ${mandate.reason}`, checks, restrictions: Object.freeze(restrictions) });
  }

  // (§3.A) action-gate admission when an action-gate-shaped action is supplied (risk CODE_CHANGE+).
  if (isObj(op.action)) {
    const g = GATE.evaluateAction(op.action, isObj(c.gateContext) ? c.gateContext : {});
    checks.actionGate = g.decision;
    if (g.decision === "DENY") return Object.freeze({ verdict: "BLOCKED", reason: "action-gate DENY: " + arr(g.violations).join("; "), checks, restrictions: Object.freeze(restrictions) });
    if (g.decision === "ESCALATE") return Object.freeze({ verdict: "DECLARED_UNVERIFIED", reason: "action-gate ESCALATE — human authority required (" + arr(g.escalation.reasons).join("; ") + ")", checks, restrictions: Object.freeze(restrictions) });
  } else if (op.risk === "CRITICAL" || op.risk === "EXTERNAL") {
    // §8: a critical/external operation MUST carry an action-gate-shaped action, else it cannot be admitted.
    return Object.freeze({ verdict: "BLOCKED", reason: `risk ${op.risk} requires an action-gate-shaped action for admission — none supplied ⇒ BLOCKED (fail-closed §8)`, checks, restrictions: Object.freeze(restrictions) });
  }

  const verdict = restrictions.length > 0 ? "APPROVED_WITH_RESTRICTIONS" : "APPROVED";
  return Object.freeze({ verdict, reason: restrictions.length > 0 ? "approved with restrictions (see restrictions)" : "mandate + independence + inspector-qualification + admission all satisfied", checks, restrictions: Object.freeze(restrictions) });
}

/*
 * inspectPost(operation, result, ctx) -> { verdict, reason, checks }. Mandatory POST-EXECUTION inspection.
 * result: { objectiveMet?:bool, evidenceRef?, sideEffects?, error? }
 * ctx: { inspectorMeta?, evidenceOpts?(exists/read/expectMarkers/gateSuites for V82), independenceActors? }
 * "executed" ≠ "succeeded" ≠ "validated": fail-closed. Insufficient evidence ⇒ NOT_MEASURED (never promoted to PASS).
 */
function inspectPost(operation: any, result: any, ctx: any = {}): any {
  const op = isObj(operation) ? operation : {};
  const r = isObj(result) ? result : {};
  const c = isObj(ctx) ? ctx : {};
  const checks: any = {};

  if (!inspectorQualified(c.inspectorMeta)) return Object.freeze({ verdict: "BLOCKED", reason: "no qualified inspector for POST inspection (V85) ⇒ BLOCKED (fail-closed)", checks });

  // a demonstrated failure is FAIL (never massaged into a pass).
  if (r.error) { checks.error = String(r.error); return Object.freeze({ verdict: "FAIL", reason: "operation reported an error ⇒ FAIL (demonstrated failure)", checks }); }

  // (§3.B.2) compare the result with the ORIGINAL objective — a result that does not meet its objective is not a pass.
  checks.objectiveMet = r.objectiveMet === true;
  if (r.objectiveMet !== true) return Object.freeze({ verdict: "DECLARED_UNVERIFIED", reason: "result does not demonstrably meet the original objective ⇒ DECLARED_UNVERIFIED", checks });

  // (§3.B.6 / V82) qualify the evidence SEMANTICALLY — not mere existence.
  if (isObj(c.evidenceOpts) && typeof r.evidenceRef === "string") {
    const q = Q.qualify(r.evidenceRef, c.evidenceOpts);
    checks.evidence = q.status;
    if (q.status !== "VALID") return Object.freeze({ verdict: "NOT_MEASURED", reason: `evidence not semantically VALID (V82 ${q.status}: ${q.basis}) ⇒ NOT_MEASURED (not promoted to PASS)`, checks });
  } else {
    checks.evidence = "NOT_MEASURED";
    return Object.freeze({ verdict: "NOT_MEASURED", reason: "no qualifiable evidence supplied ⇒ NOT_MEASURED (a result without sufficient proof is never PASS/ACCEPTED §3.B)", checks });
  }

  return Object.freeze({ verdict: "PASS", reason: "objective met + evidence semantically VALID + qualified independent inspector", checks });
}

/*
 * inspect(operation, ctx, execute) -> { pre, result, post, promoted }. The SINGLE universal passage (§9).
 * Runs PRE; only on APPROVED / APPROVED_WITH_RESTRICTIONS does it run execute(); then runs POST. `promoted` (the result
 * may advance) is true ONLY when PRE approved AND POST is PASS. Any missing mandatory step ⇒ not promoted (fail-closed §9).
 * execute must be a function; if PRE does not approve, execute is NEVER called (a blocked command is not executed §3.A).
 */
function inspect(operation: any, ctx: any = {}, execute: any = null): any {
  const pre = inspectPre(operation, ctx);
  if (pre.verdict !== "APPROVED" && pre.verdict !== "APPROVED_WITH_RESTRICTIONS") {
    return Object.freeze({ pre, result: null, post: null, promoted: false, reason: `PRE ${pre.verdict} ⇒ not executed, not promoted` });
  }
  let result: any; let ran = false;
  if (typeof execute === "function") { try { result = execute(); ran = true; } catch (e: any) { result = { error: e && e.message ? e.message : String(e) }; ran = true; } }
  else { return Object.freeze({ pre, result: null, post: null, promoted: false, reason: "no executor supplied ⇒ nothing executed (fail-closed)" }); }
  const post = inspectPost(operation, result, ctx);
  const promoted = ran && post.verdict === "PASS";
  return Object.freeze({ pre, result, post, promoted, reason: promoted ? "PRE approved + executed + POST PASS ⇒ promotable" : `POST ${post.verdict} ⇒ not promoted` });
}

const INSPECTION_BOUNDARY_CONTRACT = Object.freeze({
  id: "V86-INSPECTION-BOUNDARY",
  source: "CTO V86 — universal mandatory independent inspection (PRE+POST, fail-closed, no bypass)",
  preVerdicts: PRE_VERDICT, postVerdicts: POST_VERDICT, riskTiers: RISK,
  reuses: Object.freeze(["local-work-mandate (V84)", "action-gate", "inspector-meta-validation (V85)", "evaluator-independence", "evidence-qualifier (V82)"]),
  notAuthority: "the single canonical passage; it composes existing mechanisms, takes no closure decision, creates no authorizer",
  invariants: Object.freeze([
    "no work passes without qualified independent inspection PRE and POST — universal, non-optional, fail-closed",
    "an inspector may issue a verdict ONLY if V85 meta-validation shows it EFFECTIVE (qualified); else BLOCKED (§4/§7)",
    "producer ≠ inspector: independence COMPROMISED ⇒ BLOCKED (§5); the producer never certifies its own result",
    "PRE BLOCKED/ESCALATE ⇒ the command is NOT executed; a partially-authorized command is decomposed (restrictions)",
    "executed ≠ succeeded ≠ validated: POST requires objective-met + V82-VALID evidence; insufficient ⇒ NOT_MEASURED (never PASS)",
    "risk-proportionate depth (§8) but NEVER zero inspection; critical/external needs an action-gate admission",
    "no dev-flag / legacy mode / compatibility option grants a bypass in normal operation (§6)",
    "pure/deterministic; inspectors injected (testable offline); V61/V82/V84/V85 intact",
  ]),
});

module.exports = { PRE_VERDICT, POST_VERDICT, RISK, inspectorQualified, inspectPre, inspectPost, inspect, issueReceipt, verifyReceipt, requireReceipt, INSPECTION_BOUNDARY_CONTRACT };

if (require.main === module) {
  const effMeta = { valid: true, effective: true };
  const demo = inspect(
    { id: "demo-op", origin: "campaign-engine", objective: "local refactor", risk: "CODE_CHANGE", actions: ["code_edit_local", "test"] },
    { inspectorMeta: effMeta, independenceActors: { builder: { id: "P" }, verifier: { id: "I" } }, evidenceOpts: { exists: () => true, read: () => '{"done":1}', expectMarkers: ["done"] } },
    () => ({ objectiveMet: true, evidenceRef: "x.json" }),
  );
  process.stdout.write(JSON.stringify({ ...INSPECTION_BOUNDARY_CONTRACT, demo: { pre: demo.pre.verdict, post: demo.post.verdict, promoted: demo.promoted } }, null, 2) + "\n");
}

export {};
