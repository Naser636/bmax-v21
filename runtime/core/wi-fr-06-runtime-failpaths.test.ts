#!/usr/bin/env node
"use strict";
/*
 * V201 §5 — WI-FR-06 runtime-integration FAILURE & SECURITY paths. STRENGTHENS the existing frontier-pipeline.test.ts
 * (which covers A duplicate / C unauthorized-Lab / D no-self-promotion / F idempotent / J injection / K policy-deny /
 * N verifier-disagreement / O rollback) by exercising the REMAINING §5 negative paths through the REAL canonical
 * entrypoints — NO new engine/queue/scheduler/store:
 *   B  DEFERRED lot is never selected            (campaign-controller.selectNextLot)
 *   M  dependency not satisfied ⇒ not selected    (campaign-controller.selectNextLot)
 *   H  scheduler reports no admissible lot         (campaign-controller.selectNextLot)
 *   P  invalid registry transition rejected + register unchanged (campaign-controller.advance)
 *   I  missing/invalid evidence ⇒ not acceptable  (mission-evidence.assertAcceptable)
 *   G  corrupted store detected (file + loop level) (autonomy-store.readStrict / evolution-loop fail-closed)
 *   E  crash → checkpoint recovery + idempotent re-persist (evolution-loop.persistCycle/resume)
 *
 * HONESTY (§6): these are LOCAL, deterministic negative-path tests over the orchestration/authorization/evidence/
 * recovery mechanisms. They do NOT execute untrusted code and do NOT prove real isolated Frontier-Lab execution —
 * that boundary stays OWNER_GATED/unproven until the 8 in-session sandbox certification tests pass.
 */
const assert = require("assert");
const CC = require("./campaign-controller.js");
const ME = require("./mission-evidence.js");
const EVO = require("./evolution-loop.js");
const STORE = require("./autonomy-store.js");
const fs = require("fs");

let failures = 0;
function check(c: any, label: string) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  NOT OK -", label); } assert.ok(c, label); }

function memStore(): any {
  const m: any = {};
  return {
    write: (k: string, v: any) => { m[k] = v; return v; },
    read: (k: string, f: any) => (k in m ? m[k] : (f === undefined ? null : f)),
    readStrict: (k: string) => (k in m ? { present: true, corrupt: false, value: m[k] } : { present: false, corrupt: false, value: null }),
  };
}

function main() {
  // ── M: dependency not satisfied + B: DEFERRED never selected + H: no admissible lot ──
  const regBlocked = { items: [{ id: "A", status: "DEFERRED", deps: [] }, { id: "B", status: "READY", deps: ["A"] }] };
  const selBlocked = CC.selectNextLot(regBlocked);
  check(selBlocked.lot === null, "M+B+H: DEFERRED dep A never selected AND READY B with unsatisfied dep A NOT selected ⇒ no admissible lot");
  check(typeof selBlocked.reason === "string" && selBlocked.reason.length > 0, "H: scheduler reports an explicit no-admissible-lot reason (fail-closed, not a crash)");

  // positive: once the dependency is ACCEPTED, B becomes selectable (dependency gate is real, not blanket)
  const regReady = { items: [{ id: "A", status: "ACCEPTED", deps: [], evidence: [{ sha256: "x" }] }, { id: "B", status: "READY", deps: ["A"] }] };
  const selReady = CC.selectNextLot(regReady);
  check(selReady.lot && selReady.lot.id === "B", "M(positive): dependency satisfied (A ACCEPTED) ⇒ B is selected");

  // ── P: invalid registry transition rejected + recovery (register unchanged) ──
  const regP = { items: [{ id: "B", status: "READY", deps: [] }] };
  const bad = CC.advance(regP, "B", { status: "ACCEPTED" });   // ACCEPTED without evidence
  check(bad.ok === false && bad.code === "EVIDENCE_REQUIRED", "P: advance→ACCEPTED without evidence is REJECTED (EVIDENCE_REQUIRED)");
  check(regP.items[0].status === "READY", "P(recovery): the rejected transition left the register unchanged (fail-closed, no partial mutation)");

  // ── I: missing / invalid evidence ⇒ not acceptable (false-success gate) ──
  const base = { mission: { id: "m1" }, authorization: { authorized: true, scope: ["x"] }, attempts: [{ command: "t", exitCode: 0 }], verification: { verified: true, by: "indep", method: "preregistered" }, transition: { to: "ACCEPTED", from: "IN_PROGRESS" } };
  const recMissing = ME.buildEvidenceRecord({ ...base, artifacts: [{ path: "a.ts" }] });   // no sha256
  const aMissing = ME.assertAcceptable(recMissing, { expect: "ACCEPTED" });
  check(aMissing.acceptable === false && aMissing.reasons.some((r: string) => /integrity digest|missing/.test(r)), "I: artifact without an integrity digest ⇒ NOT acceptable (presence alone is not proof)");
  const recOk = ME.buildEvidenceRecord({ ...base, artifacts: [{ path: "a.ts", sha256: "deadbeef", present: true }] });
  const aOk = ME.assertAcceptable(recOk, { expect: "ACCEPTED" });
  check(aOk.acceptable === true, "I(positive): complete evidence (exit 0 + artifact digest + agreeing verification) ⇒ acceptable");

  // ── G: corrupted store detected — file level (real torn JSON) ──
  const key = "wi-fr-06-failpath-corrupt-" + process.pid;
  try {
    STORE.write(key, { ok: 1 });
    check(STORE.readStrict(key).present === true && STORE.readStrict(key).corrupt === false, "G: valid store value reads back present+uncorrupt");
    fs.writeFileSync(STORE.file(key), "{ this is not valid json");
    const rs = STORE.readStrict(key);
    check(rs.present === true && rs.corrupt === true && rs.value === null, "G: a torn store file is detected as present+CORRUPT (caller can REFUSE to overwrite — never silently discarded)");
  } finally {
    try { fs.unlinkSync(STORE.file(key)); } catch { /* ignore */ }
  }
  // ── G: corrupted store at the evolution-loop level ⇒ fail-closed persist ──
  const corruptStore = { readStrict: () => ({ present: true, corrupt: true, value: null }), write: () => { /* must not be reached */ }, read: () => null };
  const startedForCorrupt = EVO.startCycle({ id: "cycC", proposalRef: "propC", hypothesis: { hypothesis: "h", refutationConditions: ["r"], successCriteria: ["s"] }, budget: { calls: 1 } }, { now: 1 });
  const pcCorrupt = EVO.persistCycle(startedForCorrupt.cycle, { store: corruptStore });
  check(pcCorrupt.ok === false && pcCorrupt.corrupt === true, "G: evolution-loop REFUSES to persist over a corrupt cycles store (fail-closed, no overwrite)");

  // ── E: crash → checkpoint recovery + idempotent re-persist ──
  const mem = memStore();
  const started = EVO.startCycle({ id: "cyc1", proposalRef: "prop1", hypothesis: { hypothesis: "h", refutationConditions: ["r"], successCriteria: ["s"] }, budget: { calls: 1 } }, { now: 1 });
  check(started.ok === true && started.cycle.state === "OBSERVE", "E(setup): startCycle produces an OBSERVE cycle with a complete falsifiable hypothesis + budget");
  const p1 = EVO.persistCycle(started.cycle, { store: mem, now: 1 });
  check(p1.ok === true && p1.added === true, "E: cycle checkpointed to the store (immutable snapshot)");
  const resumed = EVO.resume({ store: mem });   // simulate crash → resume from the store
  check(resumed.ok === true && resumed.cycles["cyc1"] && resumed.cycles["cyc1"].state === "OBSERVE", "E(recovery): resume reconstructs the cycle from the checkpoint after a crash");
  const p2 = EVO.persistCycle(started.cycle, { store: mem, now: 1 });
  check(p2.decision === "DUPLICATE" && p2.added === false, "F/E: re-persisting the same (cycle,state) is idempotent (DUPLICATE, no double-write)");

  // ── honesty boundary (§6) ──
  check(true, "HONESTY: these negative-path tests are LOCAL/synthetic — they do NOT prove real isolated Frontier-Lab execution (that boundary stays OWNER_GATED/unproven)");

  console.log("\n" + (failures === 0 ? "ALL PASS — wi-fr-06 runtime failpaths (V201 §5: B/M/H selection guards; P invalid-transition reject+recover; I missing-evidence reject; G corrupt-store detect [file+loop]; E crash→resume+idempotent — all via REAL canonical entrypoints; real Lab execution NOT claimed)" : failures + " FAIL"));
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
