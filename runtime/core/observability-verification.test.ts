// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/* B140 — Governed Observability Verification capability + autonomy-observability-verified probe +
 * mission-contract-factory objective binding. Proves a mission whose deliverable is an OBSERVABLE STATE
 * (the governed dashboard / autonomy-rate signal) can be LEGITIMATELY proven WITHOUT weakening the
 * anti-false-success gate. Required matrix: no-op without evidence -> refuse; absent/invalid/stale
 * evidence -> refuse; valid evidence linked + verified -> success; wrong id/other mission -> refuse;
 * factory binds only the observability intent (no regression on other missions). Hermetic: runs in a
 * temp cwd so the real runtime/generated is never touched. */
const fs = require("fs");
const os = require("os");
const path = require("path");

const execMod = require("./capability-executors");
const probes = require("./capability-probes");
const factory = require("./mission-contract-factory");

let pass = 0, fail = 0;
function ok(label, cond) { if (cond) { pass++; console.log("  ok - " + label); } else { fail++; console.log("  FAIL - " + label); } }
function throws(label, fn) { let t = false; try { fn(); } catch { t = true; } ok(label, t); }

const EXECUTOR = execMod.EXECUTORS.find((e) => e.capability === "Governed Observability Verification");
ok("capability executor is registered", !!EXECUTOR);

// --- matches() : prefix disjoint; the OLD skeletal id must NOT match (that was the no-op) ---
ok("matches VERIFY_OBSERVABILITY_1", EXECUTOR.matches({ objectiveId: "VERIFY_OBSERVABILITY_1" }) === true);
ok("does NOT match an unrelated objective", EXECUTOR.matches({ objectiveId: "SOME_OTHER_1" }) === false);
ok("does NOT match the old skeletal GOVERNED_DASHBOARD_OBSERVABILITY_1", EXECUTOR.matches({ objectiveId: "GOVERNED_DASHBOARD_OBSERVABILITY_1" }) === false);

// --- hermetic cwd with a runtime/generated/ fixture ---
const origCwd = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-obs-verif-"));
const GEN = path.join(tmp, "runtime", "generated");
fs.mkdirSync(GEN, { recursive: true });
const EVID = path.join(GEN, "observability-verification.json");
function writeGen(name, obj) { fs.writeFileSync(path.join(GEN, name), JSON.stringify(obj, null, 2)); }
function clearGen() { for (const f of fs.readdirSync(GEN)) fs.rmSync(path.join(GEN, f), { force: true }); }

try {
  process.chdir(tmp);

  // 1. REFUSE: no genuine run (mission-plan absent) -> throws (no fabricated pass, no trivial always-pass).
  clearGen();
  throws("run REFUSES when mission-plan.json is absent", () => EXECUTOR.run({ objectiveId: "VERIFY_OBSERVABILITY_1" }));

  // 2. SUCCESS at pipeline timing: mission-plan present, patch-execution NOT yet written (the Patch
  //    Executor's own later output) -> builder honestly returns not-measurable; evidence is honest.
  clearGen();
  writeGen("mission-plan.json", { mission: "GOVERNED_DASHBOARD_OBSERVABILITY", objectives: [{ id: "VERIFY_OBSERVABILITY_1" }] });
  const resEarly = EXECUTOR.run({ objectiveId: "VERIFY_OBSERVABILITY_1" });
  ok("run SUCCEEDS at patch-executor timing (patch-execution absent) with honest evidence", resEarly && resEarly.capability === "Governed Observability Verification" && JSON.parse(fs.readFileSync(EVID, "utf8")).honest === true);

  // 3. SUCCESS: a fuller run (patch-execution present) -> re-derives the signal, writes HONEST evidence.
  clearGen();
  writeGen("patch-execution.json", { mission: "GOVERNED_DASHBOARD_OBSERVABILITY", executed: [{ objectiveId: "VERIFY_OBSERVABILITY_1", status: "EXECUTED", evidence: "x" }] });
  writeGen("mission-plan.json", { mission: "GOVERNED_DASHBOARD_OBSERVABILITY", objectives: [{ id: "VERIFY_OBSERVABILITY_1" }] });
  const res = EXECUTOR.run({ objectiveId: "VERIFY_OBSERVABILITY_1" });
  ok("run returns the capability + evidence path", res && res.capability === "Governed Observability Verification" && res.evidence === "runtime/generated/observability-verification.json");
  const ev = JSON.parse(fs.readFileSync(EVID, "utf8"));
  ok("evidence records honest===true", ev.honest === true);
  ok("evidence records a boolean measurable", typeof ev.measurable === "boolean");
  ok("evidence is attributed to the VERIFY_OBSERVABILITY_ objective", ev.objective === "VERIFY_OBSERVABILITY_1");
  ok("evidence fabricates no number when not measurable (percent null, reason present)", ev.measurable === true ? typeof ev.autonomyPercent === "number" : (ev.autonomyPercent === null && typeof ev.reason === "string" && ev.reason.length > 0));

  // --- PROBE matrix ---
  const freshCtx = {}; // no runStartedAtMs ⇒ content-only (fresh)
  ok("probe PASSES on valid fresh evidence", probes.runProbe("autonomy-observability-verified", freshCtx).ok === true);

  // absent evidence -> refuse
  fs.rmSync(EVID, { force: true });
  ok("probe REFUSES when evidence is absent", probes.runProbe("autonomy-observability-verified", freshCtx).ok === false);

  // non-honest evidence -> refuse
  writeGen("observability-verification.json", { objective: "VERIFY_OBSERVABILITY_1", honest: false, measurable: true, autonomyPercent: 100 });
  ok("probe REFUSES when honest!==true", probes.runProbe("autonomy-observability-verified", freshCtx).ok === false);

  // measurable:true but no numeric percent -> refuse (cannot fabricate a number)
  writeGen("observability-verification.json", { objective: "VERIFY_OBSERVABILITY_1", honest: true, measurable: true, autonomyPercent: null });
  ok("probe REFUSES measurable:true without a numeric percent", probes.runProbe("autonomy-observability-verified", freshCtx).ok === false);

  // wrong objective (another mission's / non-prefixed) -> refuse (never satisfies a foreign objective)
  writeGen("observability-verification.json", { objective: "SOME_OTHER_1", honest: true, measurable: false, reason: "x" });
  ok("probe REFUSES evidence for a non-VERIFY_OBSERVABILITY_ objective", probes.runProbe("autonomy-observability-verified", freshCtx).ok === false);

  // valid honest not-measurable -> pass
  writeGen("observability-verification.json", { objective: "VERIFY_OBSERVABILITY_1", honest: true, measurable: false, reason: "eligibility declarations incomplete" });
  ok("probe PASSES on honest not-measurable (reason present)", probes.runProbe("autonomy-observability-verified", freshCtx).ok === true);

  // STALE: evidence mtime strictly before the run start -> refuse
  const future = Date.now() + 10 * 60 * 1000;
  ok("probe REFUSES a stale prior-run artifact (mtime < runStart)", probes.runProbe("autonomy-observability-verified", { runStartedAtMs: future }).ok === false);

} finally {
  process.chdir(origCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// --- FACTORY binding (pure; no cwd dependency) ---
const obsEntry = { id: "GOVERNED_DASHBOARD_OBSERVABILITY", title: "Governed Dashboard & Autonomy Observability", requires_engineering: true, authorized_paths: ["runtime/**"] };
const obsContract = factory.buildContract(obsEntry);
ok("factory binds the observability objective id to VERIFY_OBSERVABILITY_1", obsContract.objectives[0].id === "VERIFY_OBSERVABILITY_1");
ok("factory declares the per-objective proof", obsContract.objectives[0].proof === "autonomy-observability-verified");

// Regression: an UNRELATED engineering mission is byte-identical (no rewrite, no proof injected).
const otherEntry = { id: "SOME_UNRELATED_MISSION", title: "Some Unrelated Mission", requires_engineering: true, authorized_paths: ["runtime/**"] };
const otherContract = factory.buildContract(otherEntry);
ok("factory does NOT rewrite an unrelated mission's objective id", otherContract.objectives[0].id !== "VERIFY_OBSERVABILITY_1");
ok("factory does NOT inject a proof on an unrelated mission", otherContract.objectives[0].proof === undefined);

console.log(`\nOBSERVABILITY VERIFICATION — ${pass} assertions passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
