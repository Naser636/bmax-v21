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

console.log(`\nMission Contract verify → Validation Engine wire: ${passed} assertions passed.`);
