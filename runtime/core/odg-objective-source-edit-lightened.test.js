#!/usr/bin/env node

/*
 * OPERATIONAL-GOVERNANCE RELIEF (review N°3) — a LOCAL, reversible, in-scope source edit no longer needs
 * a separate INTERMEDIATE human authorization to PROCEED through the semantic entrypoint.
 *
 * What changed (and ONLY this): "Governed Source Edit" is the LOCAL-REVERSIBLE tier
 * (capability-authorization.humanGrantRequired === false). At the `odg objective` entrypoint an absent /
 * incomplete grant for it is a NON-BLOCKING note, not a hard BLOCKED — the mission routes and is governed
 * fail-closed DOWNSTREAM (Patch Executor authorized_paths scope + action-gate admission + verification).
 *
 * What is PRESERVED verbatim (fail-closed): the SENSITIVE tier (Git Branch Integration / Bash Command /
 * External Research — irreversible / command / network) still REQUIRES an explicit human grant; absent it
 * stays a blocker ⇒ BLOCKED. A valid grant for a source edit still binds exactly as before. No false
 * success: a routed-but-unbound edit yields an honest PARTIAL, never SUCCESS.
 *
 * Pure unit tests over requiresHumanGrant / applyAuthorization + one real end-to-end run() with injected
 * io (stubbed pipeline). No provider, no network, no real disk writes outside the stubbed io.
 */

"use strict";

const assert = require("assert");
const path = require("path");
const obj = require(path.join(__dirname, "..", "bin", "odg-objective.js"));
const authz = require(path.join(__dirname, "capability-authorization.js"));

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const NOW = 1_700_000_000_000;
const MISSION = "NL_TEST";

// A synthetic routing decision with the given per-objective capabilities (the exact shape
// applyAuthorization reads: decision.result.objectives[i].capability.chosen.capability + the parallel
// decision.contract.objectives[i]). No gateway needed — we drive the policy core directly.
function decisionWith(caps) {
    return {
        mission: MISSION,
        contract: { mission: MISSION, objectives: caps.map((_, i) => ({ id: `${MISSION}_${i + 1}`, goal: "g" + i })), verify: [] },
        result: { objectives: caps.map((cap, i) => ({ capability: { chosen: { capability: cap } }, objective: { id: `${MISSION}_${i + 1}` } })) },
    };
}

// A COMPLETE, valid human grant for a local source edit (authorized paths + a concrete edit).
function sourceGrant(extra) {
    return { capability: "Governed Source Edit", mission: MISSION, scope: { authorized_paths: ["runtime/"], edits: [{ target: "runtime/x.js", content: "y" }], ...(extra || {}) }, expiresAt: NOW + 3_600_000, execute: true, human: true, issuer: "human" };
}

console.log("Case 1 — requiresHumanGrant tiers the consequential capabilities correctly");
{
    ok("Governed Source Edit does NOT require an intermediate human grant", authz.requiresHumanGrant("Governed Source Edit") === false);
    ok("Git Branch Integration (irreversible) requires a human grant", authz.requiresHumanGrant("Governed Git Branch Integration") === true);
    ok("Bash/Linux Command requires a human grant", authz.requiresHumanGrant("Governed Bash/Linux Command") === true);
    ok("External Research (network) requires a human grant", authz.requiresHumanGrant("External Research Acquisition") === true);
    ok("an unknown / read-only capability is not grant-required here", authz.requiresHumanGrant("Connectivity Audit") === false);
}

console.log("Case 2 — local source edit, NO grant ⇒ NOT a blocker (routes; governed downstream)");
{
    const d = decisionWith(["Governed Source Edit"]);
    const res = obj.applyAuthorization(d, null, NOW);
    ok("nothing bound without a grant", res.authorizations.length === 0);
    ok("ZERO blockers (no hard stop for a local reversible edit)", res.blockers.length === 0);
    ok("recorded as a transparent non-blocking note", res.notes.length === 1 && res.notes[0].capability === "Governed Source Edit");
    // run()'s BLOCKED decision is exactly `blockers.length > 0 && authorizations.length === 0`.
    ok("⇒ run() cannot emit BLOCKED for this mission", !(res.blockers.length > 0 && res.authorizations.length === 0));
}

console.log("Case 3 — SENSITIVE capability, NO grant ⇒ fail-closed blocker PRESERVED");
{
    for (const cap of ["Governed Git Branch Integration", "Governed Bash/Linux Command", "External Research Acquisition"]) {
        const res = obj.applyAuthorization(decisionWith([cap]), null, NOW);
        ok(`${cap}: blocked (fail-closed), not a soft note`, res.blockers.length === 1 && res.notes.length === 0 && res.authorizations.length === 0);
        ok(`${cap}: ⇒ run() emits BLOCKED`, res.blockers.length > 0 && res.authorizations.length === 0);
    }
}

console.log("Case 4 — local source edit WITH a valid human grant still binds exactly as before");
{
    const d = decisionWith(["Governed Source Edit"]);
    const res = obj.applyAuthorization(d, sourceGrant(), NOW);
    ok("authorized and bound", res.authorizations.length === 1 && res.authorizations[0].engineering === true);
    ok("no blockers, no notes", res.blockers.length === 0 && res.notes.length === 0);
    ok("authorized_paths bound onto the contract from the grant scope", JSON.stringify(d.contract.authorized_paths) === JSON.stringify(["runtime/"]));
    ok("the concrete edit bound onto the objective from the grant scope", Array.isArray(d.contract.objectives[0].patch) && d.contract.objectives[0].patch[0].target === "runtime/x.js");
}

console.log("Case 5 — source edit grant that VALIDATES but is structurally incomplete ⇒ note, not a block");
{
    const d = decisionWith(["Governed Source Edit"]);
    // Valid authorization (non-empty scope) but no concrete edits ⇒ buildSourceEditBinding returns null.
    const grant = { capability: "Governed Source Edit", mission: MISSION, scope: { authorized_paths: ["runtime/"] }, expiresAt: NOW + 3_600_000, execute: true, human: true, issuer: "human" };
    const res = obj.applyAuthorization(d, grant, NOW);
    ok("not bound (incomplete grant scope)", res.authorizations.length === 0);
    ok("MALFORMED_EDIT_GRANT is a NON-blocking note", res.notes.length === 1 && res.notes[0].code === "MALFORMED_EDIT_GRANT");
    ok("still no hard block", res.blockers.length === 0);
}

console.log("Case 6 — MIXED: an unauthorized SENSITIVE sibling still hard-blocks; the local edit is a note");
{
    const d = decisionWith(["Governed Source Edit", "Governed Git Branch Integration"]);
    const res = obj.applyAuthorization(d, null, NOW);
    ok("the sensitive git objective is the blocker", res.blockers.length === 1 && res.blockers[0].capability === "Governed Git Branch Integration");
    ok("the local source edit is a note, not a blocker", res.notes.length === 1 && res.notes[0].capability === "Governed Source Edit");
}

console.log("Case 7 — END-TO-END run(): `odg objective \"edit the file …\"` ROUTES instead of BLOCKING");
{
    const logs = [];
    let routed = false;
    const io = {
        log: (s) => logs.push(String(s)),
        existsSync: () => false,
        mkdirSync: () => {},
        writeFileSync: () => {},
        spawnSync: () => { routed = true; return { status: 0 }; }, // stub the governed pipeline (exit 0)
    };
    const code = obj.run("edit the file runtime/x.js to remove the unused import", { execute: true, now: NOW }, io);
    const text = logs.join("\n");
    ok("the governed pipeline WAS routed (advanced past the authz seam)", routed === true);
    ok("verdict is NOT BLOCKED", !/Verdict\s*:\s*BLOCKED/.test(text));
    ok("no 'human authorization required' hard-stop was emitted", !/requires an explicit human authorization/.test(text));
    ok("a transparent note explains it proceeded without an intermediate grant", /Note\s*:/.test(text));
    // No grant ⇒ no evidence binding ⇒ honest PARTIAL (code 3), never a fabricated SUCCESS.
    ok("outcome is honest (PARTIAL, not SUCCESS)", code !== 0 && /Verdict\s*:\s*PARTIAL/.test(text));
}

console.log(`\nODG-OBJECTIVE SOURCE-EDIT LIGHTENED — ${passed} assertions passed.`);
