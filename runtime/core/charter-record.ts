#!/usr/bin/env node
/**
 * charter-record — attach a sealed, machine-readable CHARTER to every acceptance/verification verdict:
 * WHAT was probed (subject), HOW (method), and AGAINST WHICH GROUND TRUTH (oracle). This is James Bach's
 * Session-Based Test Management charter discipline + the independent-label honesty principle, made a
 * first-class, provenance-bound record (CAPABILITY_GAP_REGISTER_V1.md G-02, P2; raises evidence quality
 * campaign-wide for D05/D01/D09).
 *
 * WHY (the honesty gap it closes): a bare verdict ("ACCEPT" / "ACCEPTANCE_VERIFIED") does not, by itself,
 * record what was examined or what it was judged against — so a reader cannot tell a well-grounded verdict
 * from an ungrounded one. A charter binds the verdict to its probe + method + declared oracle, so the
 * provenance of HOW a verdict was reached travels with it and is tamper-evident.
 *
 * ADDITIVE / NON-INVASIVE: this module does NOT modify reality-gate or mechanical-acceptance (their verdict
 * logic is unchanged, byte-identical). It is a pure composable helper a caller attaches to a verdict it
 * already computed. It normalizes BOTH engines' native result shapes without inventing fields:
 *   - mechanical-acceptance: { verdict: ACCEPT|REJECT|BLOCKED|UNKNOWN, rejections, blocks, unknowns, proofs }
 *   - reality-gate: GateResult { granted, awarded, requested, reasons } OR classify() { state, reasons }
 *
 * FAIL-CLOSED / NO FABRICATION:
 *   - missing subject or method ⇒ INVALID_CHARTER (you cannot charter an unnamed probe).
 *   - an unrecognized verdict shape ⇒ INVALID_CHARTER (never coerced to a pass).
 *   - NO declared ground truth ⇒ groundTruth:null + grounded:false recorded EXPLICITLY (the verdict had no
 *     declared oracle — an honest limitation, never a fabricated "verified-against-truth").
 *   - the charter NEVER changes or upgrades the verdict; it only records it.
 *
 * PURE (no fs/network/clock; git read is the injectable fail-closed one inside evidence-provenance). REUSES
 * the EVIDENCE primitive (evidence-provenance stamp/verify) for the tamper-evident seal — NO new primitive.
 * Dual export (ESM + CJS) like dataset-quality-service / characterization-baseline.
 */
"use strict";

const EP: any = require("./evidence-provenance.js");

const SCHEMA = "odg.charter-record.v1";
const BASIS = "CHARTER_RECORD";
const MA_VERDICTS = new Set(["ACCEPT", "REJECT", "BLOCKED", "UNKNOWN"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function strList(xs: any): string[] { return Array.isArray(xs) ? xs.filter((x) => typeof x === "string") : []; }

// Normalize a native verdict from either engine into { ok, engine, outcome, reasons }. No field invented;
// an unrecognized shape ⇒ ok:false (fail-closed, never coerced to a pass).
function normalizeVerdict(v: any): any {
  if (!isObj(v)) return { ok: false, reason: "verdict must be an engine result object" };
  if (typeof v.verdict === "string" && MA_VERDICTS.has(v.verdict)) {
    const reasons = ([] as string[]).concat(
      strList(v.rejections).map((r) => "REJECT: " + r),
      strList(v.blocks).map((r) => "BLOCKED: " + r),
      strList(v.unknowns).map((r) => "UNKNOWN: " + r),
      strList(v.proofs).map((r) => "PROOF: " + r),
    );
    return { ok: true, engine: "mechanical-acceptance", outcome: v.verdict, reasons };
  }
  if (typeof v.awarded === "string" && ("granted" in v || typeof v.requested === "string")) {
    return { ok: true, engine: "reality-gate", outcome: v.awarded, granted: v.granted === true, requested: typeof v.requested === "string" ? v.requested : null, reasons: strList(v.reasons) };
  }
  if (typeof v.state === "string" && "reasons" in v) {
    return { ok: true, engine: "reality-gate", outcome: v.state, reasons: strList(v.reasons) };
  }
  return { ok: false, reason: "unrecognized verdict shape (expected mechanical-acceptance or reality-gate result)" };
}

// Build a sealed, tamper-evident charter for a verdict.
// input: { subject, method, groundTruth?, verdict, key?, revision?, runId?, spawn? }
//   subject    (string, required)  — WHAT was probed (e.g. mission id / target)
//   method     (string|object, required) — HOW it was probed/checked
//   groundTruth({source, independent?, ref?}, optional) — AGAINST WHICH oracle; omitted ⇒ grounded:false
//   verdict    (object, required)  — a native engine result (normalized, never mutated/upgraded)
function makeCharter(input: any): any {
  if (!isObj(input)) return { ok: false, code: "INVALID_CHARTER", reason: "input object required", basis: BASIS };
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  if (!subject) return { ok: false, code: "INVALID_CHARTER", reason: "subject (string) required — what was probed", basis: BASIS };
  const methodOk = typeof input.method === "string" ? input.method.trim().length > 0 : isObj(input.method);
  if (!methodOk) return { ok: false, code: "INVALID_CHARTER", reason: "method (non-empty string or object) required — how it was probed", basis: BASIS };
  const nv = normalizeVerdict(input.verdict);
  if (!nv.ok) return { ok: false, code: "INVALID_CHARTER", reason: `verdict: ${nv.reason}`, basis: BASIS };

  // Ground truth is recorded honestly: present ⇒ must declare a source; absent ⇒ grounded:false (NOT a pass).
  let groundTruth: any = null;
  let grounded = false;
  if (input.groundTruth !== undefined && input.groundTruth !== null) {
    const gt = input.groundTruth;
    if (!isObj(gt) || typeof gt.source !== "string" || !gt.source.trim()) {
      return { ok: false, code: "INVALID_CHARTER", reason: "groundTruth, when present, must be an object with a non-empty source", basis: BASIS };
    }
    groundTruth = { source: gt.source.trim(), independent: gt.independent === true, ref: typeof gt.ref === "string" ? gt.ref : null };
    grounded = true;
  }
  delete (nv as any).ok;

  const core = { schema: SCHEMA, basis: BASIS, subject, method: input.method, groundTruth, grounded, verdict: nv };
  const opts = input;
  const charter = EP.stampProvenance(core, { key: opts.key, revision: opts.revision, runId: opts.runId, spawn: opts.spawn });
  return {
    ok: true,
    charter,
    note: grounded
      ? "Charter sealed: verdict bound to its probe, method and declared ground-truth oracle (tamper-evident)."
      : "Charter sealed, but NO ground-truth oracle was declared (grounded:false) — the verdict's basis is recorded as ungrounded, NOT as verified-against-truth.",
  };
}

// Verify a sealed charter (tamper-evidence via evidence-provenance). opts.key required to verify a keyed seal.
function verifyCharter(charter: any, opts?: any): any {
  const key = opts && typeof opts === "object" ? opts.key : undefined;
  const v = EP.verifyProvenance(charter, { key });
  if (!v.ok) return { ok: false, reason: v.reason, basis: BASIS };
  if (!charter || charter.schema !== SCHEMA || typeof charter.subject !== "string" || !isObj(charter.verdict)) {
    return { ok: false, reason: "not a charter record", basis: BASIS };
  }
  return { ok: true, reason: v.reason, grounded: charter.grounded === true, outcome: charter.verdict.outcome, engine: charter.verdict.engine, basis: BASIS };
}

export { normalizeVerdict, makeCharter, verifyCharter, SCHEMA, BASIS };
module.exports = { normalizeVerdict, makeCharter, verifyCharter, SCHEMA, BASIS };

if (require.main === module) {
  const rev = { commit: "demo", treeDirty: false, available: true };
  const c = makeCharter({ subject: "mission-123", method: "ran focused tests + reality-gate", groundTruth: { source: "sealed k-eval corpus", independent: true }, verdict: { state: "TEST_VERIFIED", reasons: ["all required rungs evidenced"] }, revision: rev });
  process.stdout.write(JSON.stringify({ ok: c.ok, grounded: c.charter && c.charter.grounded, outcome: c.charter && c.charter.verdict.outcome, verify: verifyCharter(c.charter).ok }, null, 2) + "\n");
}
