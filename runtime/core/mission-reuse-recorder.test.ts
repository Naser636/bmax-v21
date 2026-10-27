#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the PRODUCER side of the learning loop records reuse outcomes HONESTLY from a
// mission's decision + report: failed mission ⇒ REUSE_FAILED (and after 2 ⇒ suppressed, which the router consumes);
// passed+measured-improvement ⇒ REUSE_VALIDATED; passed+unmeasured ⇒ REUSE_INCONCLUSIVE (no fabricated effect);
// CONTRACT-authored patches are NOT counted as reuse. Hermetic: injected deps + injected ledger store.
"use strict";
const assert = require("assert");
const REC = require("./mission-reuse-recorder.js");
const RL = require("./reuse-ledger.js");
const PM = require("./patch-memory.js");
const ROUTER = require("./capability-router.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const memStore = () => { const m = {}; return { read: (n, f) => (n in m ? m[n] : (f === undefined ? null : f)), write: (n, o) => { m[n] = o; return o; } }; };
const sig = (goal, id) => PM.signature({ goal, objectiveId: id });

// A mission whose decision reused ONE memory precedent (authoredBy ≠ CONTRACT) and one CONTRACT patch (not reuse).
const decision = {
  mission: "M1", objectives: [
    { id: "OBJ-A", goal: "fix import", patch: [{ target: "a.ts", content: "x" }], authoredBy: "ODG_CAPABILITY" }, // REUSED
    { id: "OBJ-B", goal: "contract thing", patch: [{ target: "b.ts", content: "y" }], authoredBy: "CONTRACT" },     // NOT reuse
    { id: "OBJ-C", goal: "plain" },                                                                                 // no patch
  ],
};

// (1) reusedObjectives picks only the memory-reused one.
ok("reusedObjectives = only memory-sourced (authoredBy≠CONTRACT, has patch)", REC.reusedObjectives(decision).length === 1 && REC.reusedObjectives(decision)[0].id === "OBJ-A");

// (2) FAILED mission ⇒ REUSE_FAILED recorded for the reused signature.
let st = memStore();
const rf = REC.recordMissionReuseOutcomes("M1", { decision, report: { mission: "M1", validated: false }, at: "t1" }, { store: st });
ok("failed mission ⇒ REUSE_FAILED (1 recorded, CONTRACT skipped)", rf.ok && rf.recorded === 1 && rf.results[0].outcome === "REUSE_FAILED" && rf.validated === false);

// (3) a SECOND failed mission ⇒ the signature becomes suppressed ⇒ the router de-selects it (end-to-end loop).
REC.recordMissionReuseOutcomes("M1", { decision, report: { mission: "M1", validated: false }, at: "t2" }, { store: st });
const sigA = sig("fix import", "OBJ-A");
ok("2 failed missions ⇒ signature suppressed in ledger", RL.suppressedSignatures({ store: st }).includes(sigA));
// seed patch-memory so the router's Memory tier has an answer for this task, then route with the same ledger store.
PM.record({ goal: "fix import", objectiveId: "OBJ-A", edits: [{ target: "a.ts", content: "x" }], authoredBy: "ODG_CAPABILITY", mission: "M1" });
const routed = ROUTER.route({ goal: "fix import", objectiveId: "OBJ-A" }, { reuseLedgerOpts: { store: st } });
ok("END-TO-END: producer-recorded failures make the router DE-SELECT the precedent", !(routed.chosen && routed.chosen.tier === "PATCH_MEMORY") && routed.reuse && routed.reuse.suppressed === true);

// (4) PASSED mission, unmeasured ⇒ REUSE_INCONCLUSIVE (no fabricated validation).
let st2 = memStore();
const rp = REC.recordMissionReuseOutcomes("M1", { decision, report: { mission: "M1", validated: true }, at: "t" }, { store: st2 });
ok("passed+unmeasured ⇒ REUSE_INCONCLUSIVE (no fabricated effect)", rp.results[0].outcome === "REUSE_INCONCLUSIVE");

// (5) PASSED mission WITH a measured improvement ⇒ REUSE_VALIDATED.
let st3 = memStore();
const rv = REC.recordMissionReuseOutcomes("M1", {
  decision, report: { mission: "M1", validated: true }, at: "t",
  improvement: { "OBJ-A": { before: { signals: { failingTests: 3 } }, after: { signals: { failingTests: 0 } }, senseMap: { failingTests: "lower" } } },
}, { store: st3 });
ok("passed+measured improvement ⇒ REUSE_VALIDATED", rv.results[0].outcome === "REUSE_VALIDATED");

// (6) no reuse in the mission ⇒ recorded 0, honest reason.
const none = REC.recordMissionReuseOutcomes("M1", { decision: { mission: "M1", objectives: [{ id: "x", goal: "g" }] }, report: { mission: "M1", validated: true } }, { store: memStore() });
ok("no reused precedent ⇒ recorded 0, NO_REUSE_IN_MISSION", none.ok && none.recorded === 0 && none.reason === "NO_REUSE_IN_MISSION");

// (7) fail-closed: missing/mismatched decision or report.
ok("fail-closed: wrong-mission decision ⇒ NO_DECISION", REC.recordMissionReuseOutcomes("M1", { decision: { mission: "OTHER", objectives: [] }, report: { mission: "M1", validated: true } }).code === "NO_DECISION");
ok("fail-closed: report without validated boolean ⇒ NO_REPORT", REC.recordMissionReuseOutcomes("M1", { decision, report: { mission: "M1" } }).code === "NO_REPORT");
ok("fail-closed: empty mission id ⇒ INVALID_INPUT", REC.recordMissionReuseOutcomes("", {}).code === "INVALID_INPUT");

console.log(`\nMISSION-REUSE-RECORDER suite — ${pass} assertions passed. (producer side: failed⇒FAILED⇒router de-selects; passed⇒inconclusive unless measured; fail-closed)`);
