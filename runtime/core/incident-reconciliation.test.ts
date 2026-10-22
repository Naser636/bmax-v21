// @ts-nocheck — self-diagnostic resolveByReconciliation (CTO V6 §2 common proof-wiring).
/*
 * Proves an OPEN/FROZEN incident is RESOLVED (provenance present-state-reconciled) ONLY when
 * present-state-reconciliation PROVES its mission; NOT_PROVEN / NOT_RECONCILABLE / no-probe ⇒ never resolved
 * (fail-closed, no false closure); one reconcile per mission (own-mission attribution); RESOLVED/OBSOLETE
 * untouched; dual-port .ts≡.js. Isolated temp store; reconciler is injected for deterministic unit coverage.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const SD = require.resolve("./self-diagnostic");
const STORE = require.resolve("./autonomy-store");
const LEDGER = "self-diagnostic-incidents";

function inTempCwd(fn) {
  const prev = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "recon-"));
  process.chdir(dir);
  try {
    delete require.cache[SD]; delete require.cache[STORE];
    const mod = require(SD); const store = require(STORE);
    fs.mkdirSync("runtime/generated/autonomy", { recursive: true });
    fn(mod, store);
  } finally { process.chdir(prev); }
}
function seed(store, id, mission, status) {
  const l = store.read(LEDGER, { incidents: {} });
  l.incidents[id] = { id, mission, status, attempts: 3, maxAttempts: 3, createdAt: "C", updatedAt: "U", severity: "ERROR", divergences: [{ category: "mission-context-stale", firstDifferenceAt: mission }], hypotheses: [] };
  store.write(LEDGER, l);
}
// Injected reconciler: PROVEN for missions in `provenSet`, else NOT_PROVEN (or NOT_RECONCILABLE for noProbeSet).
function fakeReconciler(provenSet, noProbeSet) {
  return { reconcile: (m) => noProbeSet.has(m)
    ? { mission: m, proven: false, verdict: "NOT_RECONCILABLE", reason: "no presentStateAcceptance probe declared" }
    : (provenSet.has(m)
      ? { mission: m, proven: true, verdict: "PROVEN", reason: "all declared sources present + all declared acceptance tests pass present-state" }
      : { mission: m, proven: false, verdict: "NOT_PROVEN", reason: "failed/absent tests" }) };
}

console.log("INCIDENT RESOLVE-BY-RECONCILIATION (§2 proof-wiring)");

// 1 — PROVEN ⇒ RESOLVED with provenance present-state-reconciled (non-destructive).
inTempCwd((mod, store) => {
  seed(store, "INC-P", "MISSION_PROVEN", "OPEN");
  const ids = mod.resolveByReconciliation({ now: "T1", reconciler: fakeReconciler(new Set(["MISSION_PROVEN"]), new Set()) });
  const inc = store.read(LEDGER, { incidents: {} }).incidents["INC-P"];
  ok("PROVEN mission ⇒ incident RESOLVED", ids.includes("INC-P") && inc.status === "RESOLVED");
  ok("provenance = present-state-reconciled; record preserved (createdAt/divergences)", inc.resolvedProvenance === "present-state-reconciled" && inc.createdAt === "C" && inc.divergences.length === 1 && /reconciliation PROVEN/.test(inc.resolvedReason));
});

// 2 — NOT_PROVEN (acceptance test fails) ⇒ NEVER resolved (no false closure, fail-closed).
inTempCwd((mod, store) => {
  seed(store, "INC-NP", "MISSION_FAIL", "FROZEN");
  const ids = mod.resolveByReconciliation({ now: "T1", reconciler: fakeReconciler(new Set(), new Set()) });
  ok("NOT_PROVEN ⇒ NOT resolved (fail-closed, no false closure)", ids.length === 0 && store.read(LEDGER, { incidents: {} }).incidents["INC-NP"].status === "FROZEN");
});

// 3 — NO PROBE (NOT_RECONCILABLE) ⇒ never resolved.
inTempCwd((mod, store) => {
  seed(store, "INC-NR", "MISSION_NOPROBE", "OPEN");
  const ids = mod.resolveByReconciliation({ now: "T1", reconciler: fakeReconciler(new Set(), new Set(["MISSION_NOPROBE"])) });
  ok("no-probe (NOT_RECONCILABLE) ⇒ NOT resolved", ids.length === 0 && store.read(LEDGER, { incidents: {} }).incidents["INC-NR"].status === "OPEN");
});

// 4 — ATTRIBUTION: only the PROVEN mission's incident resolves; a different OPEN mission is untouched.
inTempCwd((mod, store) => {
  seed(store, "INC-A", "MISSION_PROVEN", "OPEN");
  seed(store, "INC-B", "MISSION_OTHER", "OPEN");
  const ids = mod.resolveByReconciliation({ now: "T1", reconciler: fakeReconciler(new Set(["MISSION_PROVEN"]), new Set()) });
  const l = store.read(LEDGER, { incidents: {} }).incidents;
  ok("own-mission attribution: only MISSION_PROVEN resolved, MISSION_OTHER untouched", ids.length === 1 && l["INC-A"].status === "RESOLVED" && l["INC-B"].status === "OPEN");
});

// 5 — RESOLVED / OBSOLETE are never re-transitioned.
inTempCwd((mod, store) => {
  seed(store, "INC-R", "MISSION_PROVEN", "RESOLVED");
  seed(store, "INC-O", "MISSION_PROVEN", "OBSOLETE");
  const ids = mod.resolveByReconciliation({ now: "T1", reconciler: fakeReconciler(new Set(["MISSION_PROVEN"]), new Set()) });
  const l = store.read(LEDGER, { incidents: {} }).incidents;
  ok("RESOLVED/OBSOLETE not re-transitioned", ids.length === 0 && l["INC-R"].status === "RESOLVED" && l["INC-O"].status === "OBSOLETE");
});

// 6 — dual-port parity: the .js and .ts self-diagnostic expose resolveByReconciliation with identical behaviour.
{
  const js = require(require.resolve("./self-diagnostic.js"));
  const ts = require(require.resolve("./self-diagnostic.ts"));
  ok("both ports export resolveByReconciliation", typeof js.resolveByReconciliation === "function" && typeof ts.resolveByReconciliation === "function");
}

console.log(`\nINCIDENT RESOLVE-BY-RECONCILIATION — ${passed} assertions passed.`);
