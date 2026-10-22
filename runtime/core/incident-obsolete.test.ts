// @ts-nocheck — runs under tsx; test of the OBSOLETE incident transition (CTO FROZEN INCIDENTS §A).
/*
 * Proves: an OPEN/FROZEN incident whose mission has NO executable contract (file absent) transitions → OBSOLETE
 * (non-destructively); an incident whose contract EXISTS is NEVER obsoleted (hard guard); RESOLVED/OBSOLETE are
 * never re-transitioned; history is preserved; incident-recurrence EXCLUDES OBSOLETE from the verdict/counts
 * (surfaced as summary.obsolete); OBSOLETE is DISTINCT from RESOLVED. Isolated temp cwd ⇒ real store untouched.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "obsolete-"));
  process.chdir(dir);
  try {
    delete require.cache[SD]; delete require.cache[STORE];
    const mod = require(SD); const store = require(STORE);
    fs.mkdirSync("runtime/generated/autonomy", { recursive: true });
    fs.mkdirSync("runtime/missions", { recursive: true });
    fn(mod, store, dir);
  } finally { process.chdir(prev); }
}

// seed a ledger incident directly (bypass diagnose) with a chosen mission + status.
function seed(store, id, mission, status) {
  const l = store.read(LEDGER, { incidents: {} });
  l.incidents[id] = { id, mission, status, attempts: 3, maxAttempts: 3, createdAt: "C", updatedAt: "U", severity: "ERROR", divergences: [{ category: "recorded-noop", firstDifferenceAt: "X" }], hypotheses: [] };
  store.write(LEDGER, l);
}

console.log("INCIDENT OBSOLETE TRANSITION (§A)");

// 1 — ELIGIBLE: absent-contract FROZEN ⇒ OBSOLETE (non-destructive).
inTempCwd((mod, store) => {
  seed(store, "INC-ABSENT", "GHOST_MISSION", "FROZEN"); // no runtime/missions/GHOST_MISSION.json
  const ids = mod.resolveObsoleteIncidents({ now: "T1" });
  ok("absent-contract FROZEN ⇒ returned as obsoleted", ids.includes("INC-ABSENT"));
  const inc = store.read(LEDGER, { incidents: {} }).incidents["INC-ABSENT"];
  ok("status OBSOLETE (distinct from RESOLVED)", inc.status === "OBSOLETE");
  ok("non-destructive: id/createdAt/divergences preserved + obsoletedAt/reason added", inc.id === "INC-ABSENT" && inc.createdAt === "C" && inc.divergences.length === 1 && inc.obsoletedAt === "T1" && /contract absent/.test(inc.obsoletedReason));
});

// 2 — NON-ELIGIBLE (HARD GUARD): present-contract FROZEN is NEVER obsoleted.
inTempCwd((mod, store) => {
  fs.writeFileSync("runtime/missions/REAL_MISSION.json", JSON.stringify({ mission: "REAL_MISSION", objectives: [{ id: "O1" }] }));
  seed(store, "INC-REAL", "REAL_MISSION", "FROZEN");
  const ids = mod.resolveObsoleteIncidents({ now: "T1" });
  ok("present-contract FROZEN is NOT obsoleted (hard guard)", !ids.includes("INC-REAL") && store.read(LEDGER, { incidents: {} }).incidents["INC-REAL"].status === "FROZEN");
  ok("missionContractExists reflects the file", mod.missionContractExists("REAL_MISSION") === true && mod.missionContractExists("GHOST_MISSION") === false && mod.missionContractExists(null) === false);
});

// 3 — FORBIDDEN re-transition: RESOLVED / already-OBSOLETE are untouched.
inTempCwd((mod, store) => {
  seed(store, "INC-RES", "GHOST", "RESOLVED");
  seed(store, "INC-OBS", "GHOST", "OBSOLETE");
  const ids = mod.resolveObsoleteIncidents({ now: "T1" });
  const l = store.read(LEDGER, { incidents: {} }).incidents;
  ok("RESOLVED not re-transitioned to OBSOLETE", !ids.includes("INC-RES") && l["INC-RES"].status === "RESOLVED");
  ok("already-OBSOLETE untouched", !ids.includes("INC-OBS") && l["INC-OBS"].status === "OBSOLETE");
});

// 4 — incident-recurrence EXCLUDES OBSOLETE (verdict drops; surfaced as summary.obsolete).
inTempCwd((mod, store) => {
  seed(store, "INC-G", "GHOST", "FROZEN");
  const rec = require("./incident-recurrence");
  const before = rec.loadRecurrence({ store });
  ok("before: FROZEN_LOOP (frozen counted)", before.verdict === "FROZEN_LOOP" && before.summary.frozen === 1);
  mod.resolveObsoleteIncidents({ now: "T1" });
  const after = rec.loadRecurrence({ store });
  ok("after: verdict NONE, frozen=0, obsolete surfaced", after.verdict === "NONE" && after.summary.frozen === 0 && after.summary.obsolete === 1);
});

// 5 — dual-port parity: analyzeRecurrence excludes OBSOLETE identically in .ts and .js.
{
  const js = require(require.resolve("./incident-recurrence.js"));
  const ts = require(require.resolve("./incident-recurrence.ts"));
  const ledger = { incidents: {
    A: { id: "A", status: "OBSOLETE", attempts: 3, maxAttempts: 3, severity: "ERROR" },
    B: { id: "B", status: "FROZEN", attempts: 3, maxAttempts: 3, severity: "CRITICAL" },
    C: { id: "C", status: "RESOLVED", attempts: 2, maxAttempts: 3, severity: "ERROR" },
  } };
  const aj = js.analyzeRecurrence(ledger), at = ts.analyzeRecurrence(ledger);
  ok("parity: OBSOLETE+RESOLVED excluded, FROZEN kept", aj.summary.frozen === 1 && aj.summary.obsolete === 1 && aj.summary.resolved === 1 && aj.verdict === "FROZEN_LOOP");
  ok("parity: .ts ≡ .js analyzeRecurrence", JSON.stringify(aj) === JSON.stringify(at));
}

// 6 — PLACEHOLDER id (§A.5): a reserved/placeholder id (__<word>__) whose stub contract EXISTS is OBSOLETE-eligible;
//     a real-named mission with a contract is NEVER obsoleted (fail-closed intact).
inTempCwd((mod, store) => {
  ok("isPlaceholderMissionId: __none__/__probe__ true; real names false", mod.isPlaceholderMissionId("__none__") === true && mod.isPlaceholderMissionId("__probe__") === true && mod.isPlaceholderMissionId("BUILD_RUNTIME") === false && mod.isPlaceholderMissionId("") === false);
  // placeholder WITH a stub contract present:
  fs.writeFileSync("runtime/missions/__none__.json", JSON.stringify({ mission: "__none__", objectives: [{ id: "O1" }] }));
  seed(store, "INC-PH", "__none__", "FROZEN");
  // real-named WITH a contract present (must stay FROZEN):
  fs.writeFileSync("runtime/missions/BUILD_RUNTIME.json", JSON.stringify({ mission: "BUILD_RUNTIME", objectives: [{ id: "O1" }] }));
  seed(store, "INC-REALNAMED", "BUILD_RUNTIME", "FROZEN");
  const ids = mod.resolveObsoleteIncidents({ now: "T1" });
  const l = store.read(LEDGER, { incidents: {} }).incidents;
  ok("placeholder-id (contract present) ⇒ OBSOLETE with placeholder reason", ids.includes("INC-PH") && l["INC-PH"].status === "OBSOLETE" && /placeholder\/reserved/.test(l["INC-PH"].obsoletedReason));
  ok("real-named present-contract ⇒ NOT obsoleted (fail-closed intact)", !ids.includes("INC-REALNAMED") && l["INC-REALNAMED"].status === "FROZEN");
});

console.log(`\nINCIDENT OBSOLETE TRANSITION — ${passed} assertions passed.`);
