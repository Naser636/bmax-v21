// @ts-nocheck — runs under tsx; test of the self-diagnostic incident RESOLUTION lifecycle + recurrence exclusion.
/*
 * INCIDENT RESOLUTION LIFECYCLE (CTO continuous execution — truth-of-status).
 * Proves: a FROZEN/OPEN incident is marked RESOLVED (non-destructively) ONLY when a fresh diagnostic of its OWN
 * mission no longer produces its divergence signature; an incident whose divergence STILL occurs is NOT resolved
 * (anti-greenwash); another mission's incidents are untouched; a recurrence re-opens a resolved incident; and
 * incident-recurrence EXCLUDES RESOLVED from the FROZEN_LOOP/RECURRENCE verdict. Isolated temp cwd ⇒ the REAL
 * autonomy-store is never touched. Dual-port .ts≡.js for the recurrence exclusion.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const SD = require.resolve("./self-diagnostic");
const STORE = require.resolve("./autonomy-store");

function inTempCwd(fn) {
  const prev = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "incres-"));
  process.chdir(dir);
  try {
    delete require.cache[SD];
    delete require.cache[STORE];
    const mod = require(SD);
    const store = require(STORE);
    fs.mkdirSync("runtime/generated/autonomy", { recursive: true });
    fn(mod, store, dir);
  } finally { process.chdir(prev); }
}

const LEDGER = "self-diagnostic-incidents";

// Build a mission-plan + execution that produces a `missing-output` divergence (OBJ_1 expected, absent).
function writeDivergent(mission) {
  fs.writeFileSync("runtime/generated/mission-plan.json", JSON.stringify({ mission, requiresEngineering: true, authorizedPaths: ["runtime/core/x.js"], objectives: [{ id: "OBJ_1" }] }));
  fs.writeFileSync("runtime/generated/patch-execution.json", JSON.stringify({ executed: [] })); // OBJ_1 never executed
}
// Build a CLEAN run for a mission (OBJ_1 executed with evidence) ⇒ 0 divergences.
function writeClean(mission) {
  fs.writeFileSync("runtime/generated/mission-plan.json", JSON.stringify({ mission, requiresEngineering: true, authorizedPaths: ["runtime/core/x.js"], objectives: [{ id: "OBJ_1" }] }));
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  fs.writeFileSync("runtime/generated/patch-execution.json", JSON.stringify({ executed: [{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }] }));
  // committed in-scope file so engineering gate isn't the block (not needed for divergence detection, but keeps parity with real)
}

console.log("INCIDENT RESOLUTION LIFECYCLE");

// 1 — a divergence raises an incident; a later CLEAN diagnostic of the SAME mission RESOLVES it (non-destructively).
inTempCwd((mod, store) => {
  writeDivergent("M_A");
  const r1 = mod.diagnose({ now: "T0", maxAttempts: 2 });
  ok("divergent run raises an incident (OPEN)", r1.incident && (r1.incident.status === "OPEN" || r1.incident.status === "FROZEN"));
  const id = r1.incident.id;
  const createdAt = store.read(LEDGER, { incidents: {} }).incidents[id].createdAt;
  // now the defect is fixed ⇒ clean diagnostic of M_A
  writeClean("M_A");
  const r2 = mod.diagnose({ now: "T1" });
  ok("clean re-diagnostic ⇒ no new divergence", r2.converged === true && r2.incident === null);
  ok("prior incident marked RESOLVED (reported)", Array.isArray(r2.resolvedIncidents) && r2.resolvedIncidents.includes(id));
  const inc = store.read(LEDGER, { incidents: {} }).incidents[id];
  ok("RESOLVED is non-destructive: id + createdAt + divergences PRESERVED", inc.status === "RESOLVED" && inc.id === id && inc.createdAt === createdAt && Array.isArray(inc.divergences) && inc.divergences.length >= 1);
  ok("RESOLVED stamps resolvedAt + resolvedReason (evidence)", inc.resolvedAt === "T1" && /absent in a fresh diagnostic of mission M_A/.test(inc.resolvedReason));
});

// 2 — ANTI-GREENWASH: an incident whose divergence STILL occurs is NOT resolved.
inTempCwd((mod, store) => {
  writeDivergent("M_B");
  const id = mod.diagnose({ now: "T0" }).incident.id;
  writeDivergent("M_B"); // same divergence persists
  const r = mod.diagnose({ now: "T1" });
  ok("still-reproducing incident is re-raised, NOT resolved", r.resolvedIncidents.length === 0 && store.read(LEDGER, { incidents: {} }).incidents[id].status !== "RESOLVED");
});

// 3 — other mission's incidents are untouched by a different mission's clean run.
inTempCwd((mod, store) => {
  writeDivergent("M_C");
  const idC = mod.diagnose({ now: "T0" }).incident.id;
  writeClean("M_D"); // diagnose a DIFFERENT, clean mission
  const r = mod.diagnose({ now: "T1" });
  ok("clean diagnostic of M_D does NOT resolve M_C's incident", r.resolvedIncidents.length === 0 && store.read(LEDGER, { incidents: {} }).incidents[idC].status !== "RESOLVED");
});

// 4 — RE-RAISE: a resolved incident re-opens if its divergence recurs (truth preserved, not permanent whitewash).
inTempCwd((mod, store) => {
  writeDivergent("M_E");
  const id = mod.diagnose({ now: "T0" }).incident.id;
  writeClean("M_E");
  mod.diagnose({ now: "T1" }); // resolves it
  ok("incident RESOLVED after clean run", store.read(LEDGER, { incidents: {} }).incidents[id].status === "RESOLVED");
  writeDivergent("M_E"); // the divergence comes back
  const r = mod.diagnose({ now: "T2" });
  ok("recurrence re-raises the SAME incident id, no longer RESOLVED", r.incident.id === id && r.incident.status !== "RESOLVED" && !r.incident.resolvedAt);
});

// 5 — incident-recurrence EXCLUDES RESOLVED from the verdict (FROZEN_LOOP ⇒ NONE once the only frozen is resolved).
inTempCwd((mod, store) => {
  // freeze an incident (maxAttempts=1 ⇒ first raise is FROZEN)
  writeDivergent("M_F");
  const id = mod.diagnose({ now: "T0", maxAttempts: 1 }).incident.id;
  const rec = require("./incident-recurrence");
  const before = rec.loadRecurrence({ store });
  ok("before resolution: FROZEN_LOOP (frozen counted)", before.verdict === "FROZEN_LOOP" && before.summary.frozen >= 1);
  writeClean("M_F");
  mod.diagnose({ now: "T1" });
  const after = rec.loadRecurrence({ store });
  ok("after resolution: verdict NONE, frozen=0, resolved surfaced", after.verdict === "NONE" && after.summary.frozen === 0 && after.summary.resolved >= 1);
});

// 6 — dual-port parity: analyzeRecurrence excludes RESOLVED identically in .ts and .js.
{
  const js = require(require.resolve("./incident-recurrence.js"));
  const ts = require(require.resolve("./incident-recurrence.ts"));
  const ledger = { incidents: {
    A: { id: "A", status: "RESOLVED", attempts: 3, maxAttempts: 3, severity: "ERROR" },
    B: { id: "B", status: "FROZEN", attempts: 3, maxAttempts: 3, severity: "CRITICAL" },
  } };
  const aj = js.analyzeRecurrence(ledger), at = ts.analyzeRecurrence(ledger);
  ok("parity: RESOLVED excluded, FROZEN kept (both ports)", aj.summary.frozen === 1 && aj.summary.resolved === 1 && aj.verdict === "FROZEN_LOOP");
  ok("parity: .ts ≡ .js analyzeRecurrence", JSON.stringify(aj) === JSON.stringify(at));
}

console.log(`\nINCIDENT RESOLUTION LIFECYCLE — ${passed} assertions passed.`);
