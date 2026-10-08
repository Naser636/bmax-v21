#!/usr/bin/env node

/*
 * MIXED-MISSION AUTHORIZATION — several objectives, DIFFERENT authorizations, one invocation.
 *
 * Proves the semantic entrypoint (runtime/bin/odg-objective.js) can drive a mission whose consequential
 * objectives each require their OWN human grant: supply N grants (repeated --authorize and/or a JSON
 * array) and each objective is matched to its own grant. The already-validated PARTIAL/BLOCKED behaviour
 * is preserved verbatim — an objective with no matching grant stays BLOCKED (fail-closed) while authorized
 * siblings proceed, and a grant for mission/capability X never authorizes objective Y.
 *
 * Pure unit test over applyAuthorization / authorizeOne / parseAuthorize: no pipeline, no provider, no
 * disk writes outside a throwaway cwd. Run: `node <this>`.
 */

"use strict";

const assert = require("assert");
const path = require("path");
const obj = require(path.join(__dirname, "..", "bin", "odg-objective.js"));

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const NOW = 1_000_000;
const MISSION = "NL_IMPLEMENT_MIXED01";

// A valid human grant for a consequential capability (shape per capability-authorization.js invariants).
function grant(capability, mission = MISSION, extra = {}) {
    return { capability, mission, scope: { objective: "x" }, expiresAt: NOW + 3_600_000, execute: true, human: true, issuer: "human", ...extra };
}

// Build a decision with two consequential objectives needing DIFFERENT capabilities.
function mixedDecision() {
    return {
        mission: MISSION,
        contract: {
            mission: MISSION,
            objectives: [
                { id: MISSION + "_1", goal: "research prior art" },
                { id: MISSION + "_2", goal: "integrate the release branch" },
            ],
        },
        result: {
            objectives: [
                { objective: { id: MISSION + "_1" }, capability: { chosen: { capability: "External Research Acquisition" } } },
                { objective: { id: MISSION + "_2" }, capability: { chosen: { capability: "Governed Git Branch Integration" } } },
            ],
        },
    };
}

console.log("Case 1 — TWO matching grants ⇒ BOTH objectives authorized (real mixed driving)");
{
    const d = mixedDecision();
    const res = obj.applyAuthorization(d, [grant("External Research Acquisition"), grant("Governed Git Branch Integration")], NOW);
    ok("both objectives authorized", res.authorizations.length === 2);
    ok("no blockers", res.blockers.length === 0);
    const caps = res.authorizations.map((a) => a.capability).sort();
    ok("each grant authorized its OWN capability", caps[0] === "External Research Acquisition" && caps[1] === "Governed Git Branch Integration");
    ok("objective 1 carries its authorization", d.contract.objectives[0].authorization && d.contract.objectives[0].authorization.capability === "External Research Acquisition");
    ok("objective 2 carries its authorization", d.contract.objectives[1].authorization && d.contract.objectives[1].authorization.capability === "Governed Git Branch Integration");
}

console.log("Case 2 — ONE grant for a mixed mission ⇒ one authorized, one BLOCKED (PARTIAL preserved)");
{
    const d = mixedDecision();
    const res = obj.applyAuthorization(d, [grant("External Research Acquisition")], NOW);
    ok("exactly one objective authorized", res.authorizations.length === 1);
    ok("the authorized one is the research objective", res.authorizations[0].capability === "External Research Acquisition");
    ok("exactly one blocker (the unauthorized git objective)", res.blockers.length === 1);
    ok("blocker is the git capability, fail-closed", res.blockers[0].capability === "Governed Git Branch Integration");
}

console.log("Case 3 — NO grant ⇒ both objectives BLOCKED (fail-closed, unchanged)");
{
    const d = mixedDecision();
    const res = obj.applyAuthorization(d, null, NOW);
    ok("nothing authorized", res.authorizations.length === 0);
    ok("both objectives blocked", res.blockers.length === 2);
    ok("blocker code is a governed denial (not a bypass)", res.blockers.every((b) => typeof b.code === "string" && b.code.length > 0));
}

console.log("Case 4 — single grant OBJECT (back-compat) behaves identically to a 1-element list");
{
    const d1 = mixedDecision();
    const d2 = mixedDecision();
    const asObject = obj.applyAuthorization(d1, grant("External Research Acquisition"), NOW);
    const asList = obj.applyAuthorization(d2, [grant("External Research Acquisition")], NOW);
    ok("object and 1-element list authorize the same count", asObject.authorizations.length === asList.authorizations.length && asObject.authorizations.length === 1);
    ok("object and 1-element list block the same count", asObject.blockers.length === asList.blockers.length && asObject.blockers.length === 1);
}

console.log("Case 5 — a grant bound to a DIFFERENT mission never authorizes (no transfer, fail-closed)");
{
    const d = mixedDecision();
    const res = obj.applyAuthorization(d, [grant("External Research Acquisition", "SOME_OTHER_MISSION"), grant("Governed Git Branch Integration")], NOW);
    ok("only the correctly-bound grant authorizes", res.authorizations.length === 1 && res.authorizations[0].capability === "Governed Git Branch Integration");
    ok("the cross-mission grant's objective is blocked", res.blockers.length === 1 && res.blockers[0].capability === "External Research Acquisition");
}

console.log("Case 6 — authorizeOne prefers the capability-matching grant regardless of order");
{
    const grants = [grant("Governed Git Branch Integration"), grant("External Research Acquisition")];
    const d = obj.authorizeOne({ capability: "External Research Acquisition", mission: MISSION }, obj.normalizeGrants(grants), NOW);
    ok("matching grant chosen even when listed last", d && d.decision === "ALLOW" && d.evidence.capability === "External Research Acquisition");
}

console.log("Case 7 — parseAuthorize collects repeated flags, a JSON array, and @file; strips them all from the sentence");
{
    const os = require("os");
    const fs = require("fs");
    const file = path.join(os.tmpdir(), "mixed-grant-" + process.pid + ".json");
    fs.writeFileSync(file, JSON.stringify(grant("Governed Bash/Linux Command")));
    try {
        const args = [
            "deliver", "the", "mixed", "mission",
            "--authorize", JSON.stringify(grant("External Research Acquisition")),
            "--authorize", JSON.stringify([grant("Governed Git Branch Integration")]),
            "--authorize", "@" + file,
            "--execute",
        ];
        const { authorize, consumed } = obj.parseAuthorize(args);
        ok("three grants collected (object + array + @file)", Array.isArray(authorize) && authorize.length === 3);
        const caps = authorize.map((g) => g.capability).sort();
        ok("all three capabilities present", caps.join("|") === "External Research Acquisition|Governed Bash/Linux Command|Governed Git Branch Integration");
        // Reconstruct the sentence the CLI would build (strip consumed indexes + control flags).
        const control = new Set(["--execute", "--run"]);
        const sentence = args.filter((a, i) => !consumed.has(i) && !control.has(a)).join(" ");
        ok("no grant JSON leaks into the sentence", sentence === "deliver the mixed mission");
    } finally {
        fs.rmSync(file, { force: true });
    }
}

console.log("Case 8 — a single malformed grant is skipped (fail-closed) but still stripped from the sentence");
{
    const args = ["do", "x", "--authorize", "{ not json", "--execute"];
    const { authorize, consumed } = obj.parseAuthorize(args);
    ok("malformed grant ⇒ no authorization (null)", authorize === null);
    const control = new Set(["--execute", "--run"]);
    const sentence = args.filter((a, i) => !consumed.has(i) && !control.has(a)).join(" ");
    ok("malformed JSON does not leak into the sentence", sentence === "do x");
}

console.log(`\nODG-OBJECTIVE MIXED AUTHORIZATION — ${passed} assertions passed.`);
