#!/usr/bin/env node

/* Mission Contract `verify` → Validation Engine integration test.
 *
 * Proves the wire the Validation Engine depends on: the Mission Loader projects a contract's `verify`
 * block into mission-plan.json (the sole carrier the Validation Engine reads) with the `required`
 * flag preserved. A dropped flag would silently force every declared proof to be required, making the
 * Capability Probe Framework's optional-proof path unreachable end-to-end.
 *
 * Deterministic and network-independent: runs the real loader in a throwaway cwd and feeds the
 * resulting plan.verify into the same probes.evaluate() call the Validation Engine makes. */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { execFileSync } = require("child_process");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const LOADER = path.resolve(__dirname, "mission-loader.js");
const MISSION = "TEST_VERIFY_WIRE";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loader-verify-test-"));
fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });

// A contract that declares one REQUIRED and one OPTIONAL capability proof.
fs.writeFileSync(
    path.join(dir, "runtime", "missions", `${MISSION}.json`),
    JSON.stringify({
        objectives: ["prove the verify wire"],
        verify: [
            { capability: "Internet", evidence: "internet-reachable" },
            { capability: "Build", evidence: "build-green", required: false },
        ],
    })
);

execFileSync("node", [LOADER, MISSION], { cwd: dir, stdio: "ignore" });

const plan = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "mission-plan.json"), "utf8"));

ok("plan.verify carries both declared proofs", Array.isArray(plan.verify) && plan.verify.length === 2);
ok("required proof keeps default (no explicit required flag)", plan.verify[0].evidence === "internet-reachable" && plan.verify[0].required === undefined);
ok("optional proof carries required:false through the loader", plan.verify[1].evidence === "build-green" && plan.verify[1].required === false);

// Feed plan.verify into the SAME evaluation the Validation Engine performs. No connectivity evidence
// and no green build in this cwd ⇒ both probes fail. The required one must block; the optional one
// must be recorded but NOT block.
const probes = require("./capability-probes");
const prev = process.cwd();
process.chdir(dir);
let evaluation;
try {
    evaluation = probes.evaluate(plan.verify, { missionId: MISSION, verify: null });
} finally {
    process.chdir(prev);
}

ok("both proofs executed and reported", evaluation.results.length === 2);
ok("failing REQUIRED proof blocks (evaluate.ok=false)", evaluation.ok === false);
ok("only the required proof is counted as missing", evaluation.missingRequired.length === 1 && evaluation.missingRequired[0].evidence === "internet-reachable");
ok("failing OPTIONAL proof is reported but not blocking", evaluation.results[1].ok === false && evaluation.results[1].required === false);

// ---------------------------------------------------------------------------
// Runtime-level enforcement: a mission whose INTENT is to go online but whose contract declares NO
// `verify` block must still be REQUIRED to prove Internet reachability. The loader derives that proof
// from intent (same resolver the Contract Factory uses) so completion is forbidden until the evidence
// exists — the hole that let EXPLORE_ONLINE_OPPORTUNITIES reach SUCCESS with no capability proof.
// ---------------------------------------------------------------------------
const ONLINE_MISSION = "EXPLORE_ONLINE_OPPORTUNITIES";
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "loader-online-test-"));
fs.mkdirSync(path.join(dir2, "runtime", "missions"), { recursive: true });
fs.writeFileSync(
    path.join(dir2, "runtime", "missions", `${ONLINE_MISSION}.json`),
    // Deliberately NO `verify` block — the intent alone must trigger the required proof.
    JSON.stringify({ objectives: [{ id: `${ONLINE_MISSION}_1`, goal: "Explore Online Opportunities" }] })
);

execFileSync("node", [LOADER, ONLINE_MISSION], { cwd: dir2, stdio: "ignore" });
const onlinePlan = JSON.parse(fs.readFileSync(path.join(dir2, "runtime", "generated", "mission-plan.json"), "utf8"));

ok("loader injects a required proof from online intent (contract declared none)", Array.isArray(onlinePlan.verify) && onlinePlan.verify.some((v) => v.evidence === "internet-reachable"));
ok("the injected proof is REQUIRED (blocks by default)", onlinePlan.verify.find((v) => v.evidence === "internet-reachable").required === undefined);

// With no connectivity evidence, the Validation Engine's gate must BLOCK this mission…
process.chdir(dir2);
let onlineEval, onlineEvalWithEvidence;
try {
    onlineEval = probes.evaluate(onlinePlan.verify, { missionId: ONLINE_MISSION, verify: null });
    // …and PASS only once the Connectivity Audit connector's real evidence reports reachable=true.
    fs.mkdirSync("runtime/generated", { recursive: true });
    fs.writeFileSync("runtime/generated/connectivity-audit.json", JSON.stringify({ internet: { reachable: true }, summary: { http: "2/2 reachable" } }));
    onlineEvalWithEvidence = probes.evaluate(onlinePlan.verify, { missionId: ONLINE_MISSION, verify: null });
} finally {
    process.chdir(prev);
}

ok("completion FORBIDDEN without evidence (evaluate.ok=false)", onlineEval.ok === false && onlineEval.missingRequired.some((m) => m.evidence === "internet-reachable"));
ok("completion ALLOWED once real Internet capability evidence exists", onlineEvalWithEvidence.ok === true);

console.log(`\nMission Contract verify → Validation Engine wire: ${passed} assertions passed.`);
