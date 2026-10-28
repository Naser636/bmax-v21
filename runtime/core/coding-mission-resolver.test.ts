#!/usr/bin/env node
// @ts-nocheck — runs under tsx. INTEGRATION test: drives the REAL official MissionContext (built via
// mission-context-builder's supported injected-loader seam) through the resolver, proving a real routing+planning
// +fidelity decision — EXECUTE (JS/TS/Python + authorizedPaths) / ROUTE_UNSUPPORTED (Go) / ABSTAIN (unknown) /
// BLOCKED (executable but no authorizedPaths), and that completion is judged by objective-fidelity. Not an island.
"use strict";
const assert = require("assert");
const MCB = require("./mission-context-builder.js");
const RES = require("./coding-mission-resolver.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const ALL = { JavaScript: true, TypeScript: true, Python: true };
// Build a REAL MissionContext via the official builder's injected loaders (the supported seam).
function ctx(plan) {
  return MCB.buildMissionContext("M-CODE", {
    cwd: process.cwd(),
    loadPlan: () => plan,
    loadRuntime: () => ({ project: { root: "/ws", files: 3, directories: 1 }, version: "test" }),
  });
}
const tsPlan = { authorizedPaths: ["src/"], requiresEngineering: true, objectives: [{ id: "o1", goal: "fix build" }], definitionOfDone: ["tsc passes", "tests green"] };
const tsRepo = { files: ["src/app.ts", "src/x.ts"], manifests: { "package.json": {} } };

// (1) real context → EXECUTE, concrete plan bound to authorizedPaths, fidelity contract from definitionOfDone.
const r1 = RES.resolveCodingMission(ctx(tsPlan), tsRepo, { toolchain: ALL, family: "check" });
ok("official MissionContext drives EXECUTE with a concrete plan", r1.ok && r1.route === "EXECUTE" && r1.language === "TypeScript" && r1.plan.module === "code-execution");
ok("plan writeSet is bound to context.authorizedPaths", JSON.stringify(r1.plan.writeSet) === JSON.stringify(["src/"]));
ok("fidelity contract derived from definitionOfDone (2 required outcomes)", r1.fidelityContract.requiredOutcomes.length === 2 && r1.fidelityContract.objectiveId === "M-CODE");

// (2) family selection maps to the proven module.
const r1b = RES.resolveCodingMission(ctx(tsPlan), tsRepo, { toolchain: ALL, family: "repair-exports" });
ok("family 'repair-exports' maps to task-fix-exports module", r1b.plan.module === "task-fix-exports");

// (3) Go repo ⇒ ROUTE_UNSUPPORTED (subcontract; not faked).
const r2 = RES.resolveCodingMission(ctx({ authorizedPaths: ["src/"], definitionOfDone: ["x"] }), { files: ["main.go"], manifests: { "go.mod": {} } }, { toolchain: ALL });
ok("Go ⇒ ROUTE_UNSUPPORTED + axis-D next action", r2.route === "ROUTE_UNSUPPORTED" && /subcontract/i.test(r2.nextAction));

// (4) unknown repo ⇒ ABSTAIN.
const r3 = RES.resolveCodingMission(ctx({ authorizedPaths: ["src/"], definitionOfDone: ["x"] }), { files: ["README", "data.bin"], manifests: {} }, { toolchain: ALL });
ok("unknown repo ⇒ ABSTAIN", r3.route === "ABSTAIN" && r3.plan === null);

// (5) EXECUTABLE but NO authorizedPaths ⇒ BLOCKED (refuse an unbounded write-set) — fail-closed.
const r4 = RES.resolveCodingMission(ctx({ authorizedPaths: [], definitionOfDone: ["x"] }), tsRepo, { toolchain: ALL });
ok("executable but no authorizedPaths ⇒ BLOCKED (no unbounded write-set)", r4.route === "BLOCKED" && /authorizedPaths/.test(r4.reason));

// (6) completion is judged by objective-fidelity: a false completion is rejected through the resolver's contract.
const falseClaim = [{ outcomeId: "dod-1", state: "VERIFIED", evidence: "ok" }, { outcomeId: "dod-2", state: "IMPLEMENTED_UNVERIFIED", evidence: "" }];
const assessed = RES.assessCodingMissionCompletion(r1, falseClaim);
ok("assessCodingMissionCompletion ⇒ INCOMPLETE on a false completion", assessed.verdict === "INCOMPLETE" && assessed.unsatisfied.some(u => u.id === "dod-2"));
const trueClaim = [{ outcomeId: "dod-1", state: "VERIFIED", evidence: "tsc 0" }, { outcomeId: "dod-2", state: "VERIFIED", evidence: "tests 142/142" }];
ok("assessCodingMissionCompletion ⇒ COMPLETE on genuine evidence", RES.assessCodingMissionCompletion(r1, trueClaim).verdict === "COMPLETE");

// (7) fail-closed.
ok("fail-closed: not a MissionContext", RES.resolveCodingMission(null, tsRepo).code === "INVALID_INPUT");
ok("fail-closed: no repoSignals", RES.resolveCodingMission(ctx(tsPlan), null).code === "INVALID_INPUT");

console.log(`\nCODING-MISSION-RESOLVER suite — ${pass} assertions passed. (real MissionContext → routing+plan+fidelity; EXECUTE/ROUTE_UNSUPPORTED/ABSTAIN/BLOCKED; completion judged by objective-fidelity; fail-closed)`);
