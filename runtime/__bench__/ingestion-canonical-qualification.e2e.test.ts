// @ts-nocheck
/*
 * CTO V14 — CANONICAL INGESTION QUALIFICATION (REAL seams, not mocks). Proves the ingestion path end-to-end through the
 * ACTUAL canonical mechanisms, satisfying V14's exit criterion ("ne pas déclarer opérationnel sur la seule base de tests
 * à seams mockés"):
 *   - audit   = REAL audit-log.appendEntry / verifyChain, persisted to a TEMP file (snapshot ⇒ interruption/resume);
 *   - apply   = REAL broad-it-eval-ingest.measureOnEvalSet (independent-label-policy + code-execution), deterministic runner;
 *   - update  = REAL write to a TEMP register file (a SANDBOX — NEVER the canonical closure-register);
 *   - verify  = REAL re-read of the temp register;
 *   - rollback= REAL restore of the temp register from a snapshot.
 *
 * HONESTY: every input is a SYNTHETIC qualification fixture. The "independent" provenance is a TEST construct to exercise
 * the REAL_ADMITTED mechanical path; any MEASURED number is over synthetic cases written to a SANDBOX register — it is
 * NOT a real broad-IT measurement and unblocks NOTHING canonical. No canonical capability is modified.
 *
 * Run: node_modules/.bin/tsx runtime/__bench__/ingestion-canonical-qualification.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const GATE = require(path.join(REPO, "runtime/core/external-input-ingestion.js"));
const INTAKE = require(path.join(REPO, "runtime/core/external-input-intake.js"));
const PROV = require(path.join(REPO, "runtime/core/evidence-provenance.js"));
const AUDIT = require(path.join(REPO, "runtime/core/audit-log.js"));
const HARNESS = require(path.join(REPO, "runtime/core/broad-it-eval-ingest.js"));

let failures = 0;
const check = (c, l) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };

const SBX = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-qual-"));
const REG = path.join(SBX, "sandbox-register.json");
const CHAIN = path.join(SBX, "audit-chain.json");
const SEEN = path.join(SBX, "seen-digests.json");
fs.writeFileSync(REG, JSON.stringify({ items: [{ id: "broad-it-independent-eval-set", status: "BLOCKED" }] }, null, 2));

// deterministic syntax-checker runner: PASS unless the content contains "SYNTAX_ERROR".
const runner = ({ content }) => ({ status: /SYNTAX_ERROR/.test(String(content)) ? "FAIL" : "PASS" });

// REAL seams -------------------------------------------------------------------------------------------------------
function loadChain() { try { return JSON.parse(fs.readFileSync(CHAIN, "utf8")); } catch { return []; } }
function persistAudit(rec) { const c = AUDIT.appendEntry(loadChain(), rec); fs.writeFileSync(CHAIN, JSON.stringify(c)); return { ok: true }; }
function loadSeen() { try { return new Set(JSON.parse(fs.readFileSync(SEEN, "utf8"))); } catch { return new Set(); } }
function saveSeen(set) { fs.writeFileSync(SEEN, JSON.stringify([...set])); }

function realApply(decision, evalSet) {
  const res = HARNESS.measureOnEvalSet(evalSet, { runner });     // REAL harness: admits (label independence) + runs the checker
  return { ok: res.ok === true, effect: { result: res, mission: decision.kind }, proofAdmissible: res.admitted === true && res.broadIT === "MEASURED", rollbackToken: "RB" };
}
function realUpdate(effect) { const r = JSON.parse(fs.readFileSync(REG, "utf8")); const it = r.items.find((x) => x.id === "broad-it-independent-eval-set"); it.status = "ACCEPTED"; it.measured = true; fs.writeFileSync(REG, JSON.stringify(r, null, 2)); return { ok: true, unblocked: ["broad-it-independent-eval-set (SANDBOX ONLY)"] }; }
function realVerify() { const r = JSON.parse(fs.readFileSync(REG, "utf8")); const it = r.items.find((x) => x.id === "broad-it-independent-eval-set"); return { ok: it && it.status === "ACCEPTED" && it.measured === true }; }
function snapshotReg() { return fs.readFileSync(REG, "utf8"); }
function makeRollback(snap) { return () => { fs.writeFileSync(REG, snap); return { ok: true }; }; }

// fixtures ---------------------------------------------------------------------------------------------------------
const INDEP = { author: "qualification-fixture-labs", independentOfEvaluee: true, sourceRef: "fixture://qual/v1", labellingMethod: "human-third-party", devValidationSeparated: true };
const SELF = { author: "odg", independentOfEvaluee: false, sourceRef: "self", labellingMethod: "odg-self" };
// an admittable eval set (independent provenance + disjoint dev/validation + scorable validation cases).
function evalSet(prov) { return { provenance: prov, cases: [ { id: "d1", partition: "dev", language: "JavaScript", content: "const a=1;", label: "PASS" }, { id: "v1", partition: "validation", language: "JavaScript", content: "const b=2;", label: "PASS" }, { id: "v2", partition: "validation", language: "JavaScript", content: "SYNTAX_ERROR(", label: "FAIL" } ] }; }
function stamp(obj) { return PROV.stampProvenance(obj, {}); }
// envelope carrying the eval set as both payload (for the gate's format/provenance) and the harness input.
function envelope(declaredReal, prov) { const es = evalSet(prov); const stamped = stamp({ ...es, provenanceDescriptor: prov }); return { env: { kind: "EVAL_SET", declaredReal, stamped, payload: { cases: es.cases } }, es }; }

console.log("CANONICAL INGESTION QUALIFICATION — REAL seams (synthetic fixtures; sandbox register; nothing canonical touched)\n");

// Scenario 1 — SYNTHETIC admission ⇒ SIM, no unblock, register UNCHANGED.
{
  const snap = snapshotReg(); const { env } = envelope(false, INDEP);
  const out = INTAKE.processIntake(env, { persistAudit, apply: (d) => ({ ok: true, effect: { mode: "SIM" } }), updateRegisters: realUpdate, verify: realVerify, rollback: makeRollback(snap), seenDigests: loadSeen(), now: "t1", permissions: { canApplyReal: true } });
  check(out.stage === "APPLIED_SYNTHETIC" && out.unblocked.length === 0, "1 synthetic ⇒ APPLIED_SYNTHETIC, unblocks nothing");
  check(snapshotReg() === snap, "1 sandbox register UNCHANGED by a synthetic input");
}
// Scenario 2 — REAL declared, NO permission ⇒ ESCALATED, register UNCHANGED.
{
  const snap = snapshotReg(); const { env } = envelope(true, INDEP);
  const out = INTAKE.processIntake(env, { persistAudit, apply: (d) => realApply(d, evalSet(INDEP)), updateRegisters: realUpdate, verify: realVerify, rollback: makeRollback(snap), seenDigests: loadSeen(), now: "t2", permissions: { canApplyReal: false } });
  check(out.stage === "ESCALATED" && snapshotReg() === snap, "2 real without permission ⇒ ESCALATED, register UNCHANGED");
}
// Scenario 3 — AUTHORIZED real admission + REAL harness MEASURED ⇒ APPLIED_REAL, register CHANGED, verified.
{
  const snap = snapshotReg(); const { env, es } = envelope(true, INDEP); const seen = loadSeen();
  const out = INTAKE.processIntake(env, { persistAudit, apply: (d) => realApply(d, es), updateRegisters: realUpdate, verify: realVerify, rollback: makeRollback(snap), seenDigests: seen, now: "t3", permissions: { canApplyReal: true } });
  saveSeen(seen);
  check(out.stage === "APPLIED_REAL" && out.applied === true, "3 authorized + REAL harness MEASURED ⇒ APPLIED_REAL");
  check(realVerify().ok === true, "3 sandbox register CHANGED to ACCEPTED+measured (real update verified)");
  fs.writeFileSync(REG, snap); // restore for the remaining scenarios
}
// Scenario 4 — audit PERSIST failure ⇒ fail-closed, not applied.
{
  const snap = snapshotReg(); const { env, es } = envelope(true, INDEP);
  const out = INTAKE.processIntake(env, { persistAudit: () => ({ ok: false }), apply: (d) => realApply(d, es), updateRegisters: realUpdate, verify: realVerify, rollback: makeRollback(snap), seenDigests: new Set(), now: "t4", permissions: { canApplyReal: true } });
  check(out.stage === "REJECTED" && out.applied === false && snapshotReg() === snap, "4 audit-persist failure ⇒ fail-closed, register UNCHANGED");
}
// Scenario 5 — APPLY failure: self-authored eval set ⇒ REAL harness NOT admitted (NO_DATA) ⇒ NO_PROOF, nothing unblocked.
{
  const snap = snapshotReg(); const { env } = envelope(true, INDEP);  // gate sees INDEP provenance (admits REAL)…
  const selfSet = evalSet(SELF);                                      // …but the HARNESS eval set is self-authored ⇒ NO_DATA
  const out = INTAKE.processIntake(env, { persistAudit, apply: (d) => realApply(d, selfSet), updateRegisters: realUpdate, verify: realVerify, rollback: makeRollback(snap), seenDigests: new Set(), now: "t5", permissions: { canApplyReal: true } });
  check(out.stage === "NO_PROOF" && out.unblocked.length === 0, "5 real harness NOT admitted (self-authored) ⇒ NO_PROOF, nothing unblocked");
  check(snapshotReg() === snap, "5 sandbox register UNCHANGED (no proof ⇒ no update)");
}
// Scenario 6 — register UPDATE failure ⇒ ROLLED_BACK, register restored.
{
  const snap = snapshotReg(); const { env, es } = envelope(true, INDEP);
  const out = INTAKE.processIntake(env, { persistAudit, apply: (d) => realApply(d, es), updateRegisters: () => ({ ok: false, reason: "sandbox write denied" }), verify: realVerify, rollback: makeRollback(snap), seenDigests: new Set(), now: "t6", permissions: { canApplyReal: true } });
  check(out.stage === "ROLLED_BACK" && out.applied === false, "6 register-update failure ⇒ ROLLED_BACK");
  check(snapshotReg() === snap, "6 sandbox register RESTORED by rollback");
}
// Scenario 7 — independent VERIFY failure ⇒ ROLLED_BACK, register restored.
{
  const snap = snapshotReg(); const { env, es } = envelope(true, INDEP);
  const out = INTAKE.processIntake(env, { persistAudit, apply: (d) => realApply(d, es), updateRegisters: realUpdate, verify: () => ({ ok: false, reason: "independent verify failed" }), rollback: makeRollback(snap), seenDigests: new Set(), now: "t7", permissions: { canApplyReal: true } });
  check(out.stage === "ROLLED_BACK" && out.applied === false, "7 verify failure ⇒ ROLLED_BACK");
  check(snapshotReg() === snap, "7 sandbox register RESTORED by rollback (effective + verified)");
}
// Scenario 8 — audit chain is REAL + tamper-evident across the run.
{
  const chain = loadChain();
  check(chain.length >= 1 && AUDIT.verifyChain(chain).ok === true, "8 persisted audit chain verifies (real tamper-evident chain)");
  const t = JSON.parse(JSON.stringify(chain)); if (t[0]) t[0].payload = { forged: true };
  check(AUDIT.verifyChain(t).ok === false, "8 tampering a persisted entry breaks verifyChain (fail-closed)");
}
// Scenario 9 — dedup after INTERRUPTION/RESUME: reload seen-digests from disk, re-ingest the same input ⇒ REJECTED.
{
  const { env, es } = envelope(true, INDEP);
  const seen1 = loadSeen();
  INTAKE.processIntake(env, { persistAudit, apply: (d) => realApply(d, es), updateRegisters: realUpdate, verify: realVerify, rollback: makeRollback(snapshotReg()), seenDigests: seen1, now: "t9a", permissions: { canApplyReal: true } });
  saveSeen(seen1);
  const seen2 = loadSeen();               // simulate a RESTART: seen-set reloaded from disk
  const out = INTAKE.processIntake(env, { persistAudit, apply: (d) => realApply(d, es), updateRegisters: realUpdate, verify: realVerify, rollback: makeRollback(snapshotReg()), seenDigests: seen2, now: "t9b", permissions: { canApplyReal: true } });
  check(out.stage === "REJECTED" && /duplicate/i.test(JSON.stringify(out.decision.reasons)), "9 re-ingest after resume (reloaded seen-set) ⇒ REJECTED (dedup survives restart)");
}

try { fs.rmSync(SBX, { recursive: true, force: true }); } catch {}
console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAIL"} — canonical ingestion qualification (REAL seams)`);
process.exit(failures === 0 ? 0 : 1);
