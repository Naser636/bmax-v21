#!/usr/bin/env node

"use strict";

/*
 * Focused adversarial lock for the governed human-authorization transport seam
 * (runtime/core/capability-authorization.js). Covers the 10 CTO cases: valid executes, missing blocks,
 * wrong mission blocks, expired blocks, scope exceeded blocks, ODG cannot self-authorize, independent
 * authorized actions continue, authorization visible in evidence, cannot become permanent/global,
 * revoke/deny fail-closed. Pure (injected clock); no network, no I/O.
 *
 * Run: node runtime/core/capability-authorization.test.js
 */

const assert = require("assert");
const authz = require("./capability-authorization");

let passed = 0;
function ok(label, cond) {
    assert.strictEqual(cond, true, "FAIL: " + label);
    console.log("  ok -", label);
    passed++;
}

const NOW = 1_000_000_000_000;
const CAP = "Governed Git Branch Integration";
const MISSION = "NL_IMPLEMENT_DEADBEEF";

// A canonical VALID human grant: explicit capability, mission, scope, expiry, execute, human.
function validGrant(over) {
    return {
        capability: CAP,
        mission: MISSION,
        scope: { target: "odg-authz-proof-tmp", allow_protected: false, maxCommits: 50 },
        expiresAt: NOW + 60_000,
        execute: true,
        human: true,
        issuer: "akabi@algonaser.fr",
        id: "GRANT-TEST-1",
        ...(over || {}),
    };
}
function req(over) {
    return { capability: CAP, mission: MISSION, requestedScope: { target: "odg-authz-proof-tmp" }, ...(over || {}) };
}
const CTX = { now: NOW };

console.log("CAPABILITY AUTHORIZATION — GOVERNED HUMAN-AUTHORIZATION TRANSPORT");

// 1. Valid human authorization ⇒ ALLOW (the governed path may execute the consequential capability).
{
    const d = authz.authorizeCapability(req(), validGrant(), CTX);
    ok("1 valid human authorization ⇒ ALLOW", d.decision === "ALLOW" && d.code === "AUTHORIZED");
    ok("1 ALLOW returns the capability's EXISTING probe (for the evidence gate)", d.probe === "git-branch-integrated");
}

// 2. Missing authorization ⇒ BLOCKED (the entrypoint never fabricates it).
{
    const d = authz.authorizeCapability(req(), null, CTX);
    ok("2 missing authorization ⇒ DENY NO_AUTHORIZATION", d.decision === "DENY" && d.code === "NO_AUTHORIZATION");
}

// 3. Wrong mission ⇒ BLOCKED (no transfer to another mission).
{
    const d = authz.authorizeCapability(req(), validGrant({ mission: "SOME_OTHER_MISSION" }), CTX);
    ok("3 wrong-mission grant ⇒ DENY MISSION_MISMATCH", d.decision === "DENY" && d.code === "MISSION_MISMATCH");
    // And symmetrically: a grant for THIS mission cannot be used on a request for another mission.
    const d2 = authz.authorizeCapability(req({ mission: "ANOTHER" }), validGrant(), CTX);
    ok("3 grant cannot transfer to a different requested mission", d2.decision === "DENY" && d2.code === "MISSION_MISMATCH");
}

// 4. Expired authorization ⇒ BLOCKED.
{
    const d = authz.authorizeCapability(req(), validGrant({ expiresAt: NOW - 1 }), CTX);
    ok("4 expired grant ⇒ DENY EXPIRED", d.decision === "DENY" && d.code === "EXPIRED");
}

// 5. Scope exceeded ⇒ BLOCKED (requested target not within the granted scope; numeric limit exceeded).
{
    const d = authz.authorizeCapability(req({ requestedScope: { target: "main" } }), validGrant(), CTX);
    ok("5 out-of-scope target ⇒ DENY SCOPE_EXCEEDED", d.decision === "DENY" && d.code === "SCOPE_EXCEEDED");
    const d2 = authz.authorizeCapability(req({ requestedScope: { maxCommits: 999 } }), validGrant(), CTX);
    ok("5 numeric limit exceeded ⇒ DENY SCOPE_EXCEEDED", d2.decision === "DENY" && d2.code === "SCOPE_EXCEEDED");
}

// 6. ODG cannot self-authorize — a grant not marked human-issued is rejected.
{
    const d = authz.authorizeCapability(req(), validGrant({ human: false }), CTX);
    ok("6 grant.human !== true ⇒ DENY NOT_HUMAN_ISSUED (no self-authorization)", d.decision === "DENY" && d.code === "NOT_HUMAN_ISSUED");
    const d2 = authz.authorizeCapability(req(), validGrant({ human: undefined }), CTX);
    ok("6 absent human flag ⇒ DENY (fail-closed)", d2.decision === "DENY" && d2.code === "NOT_HUMAN_ISSUED");
}

// 7. Independent authorized actions continue — one valid grant ALLOWs even while another is denied.
{
    const allow = authz.authorizeCapability(req(), validGrant(), CTX);
    const block = authz.authorizeCapability(req(), null, CTX);
    ok("7 authorized action ⇒ ALLOW independently of the blocked one", allow.decision === "ALLOW");
    ok("7 unauthorized action ⇒ DENY and does not affect the authorized one", block.decision === "DENY");
}

// 8. Authorization is visible in evidence — exactly what was used.
{
    const d = authz.authorizeCapability(req(), validGrant(), CTX);
    const e = d.evidence;
    ok("8 evidence records the capability", e.capability === CAP);
    ok("8 evidence records the mission", e.mission === MISSION);
    ok("8 evidence records the issuer", e.issuer === "akabi@algonaser.fr");
    ok("8 evidence records the scope + expiry + execute", JSON.stringify(e.scope) === JSON.stringify(validGrant().scope) && e.expiresAt === NOW + 60_000 && e.execute === true);
    ok("8 evidence carries the composed action-gate decision", e.gate && e.gate.decision === "ALLOW");
}

// 9. Authorization can never become permanent or global.
{
    ok("9 no expiry ⇒ DENY NO_EXPIRY (never permanent)", authz.authorizeCapability(req(), validGrant({ expiresAt: undefined }), CTX).code === "NO_EXPIRY");
    ok("9 no scope ⇒ DENY NO_SCOPE (never unbounded)", authz.authorizeCapability(req(), validGrant({ scope: {} }), CTX).code === "NO_SCOPE");
    ok("9 wrong capability ⇒ DENY CAPABILITY_MISMATCH (never a blanket grant)", authz.authorizeCapability(req(), validGrant({ capability: "Governed Bash/Linux Command" }), CTX).code === "CAPABILITY_MISMATCH");
    ok("9 execute not granted ⇒ DENY EXECUTE_NOT_PERMITTED", authz.authorizeCapability(req(), validGrant({ execute: false }), CTX).code === "EXECUTE_NOT_PERMITTED");
}

// 10. Revoke / deny is fail-closed.
{
    const d = authz.authorizeCapability(req(), validGrant(), { now: NOW, revokedGrants: ["GRANT-TEST-1"] });
    ok("10 revoked-by-id grant ⇒ DENY REVOKED", d.decision === "DENY" && d.code === "REVOKED");
    const d2 = authz.authorizeCapability(req(), validGrant(), { now: NOW, revokedGrants: [CAP] });
    ok("10 revoked-by-capability ⇒ DENY REVOKED", d2.decision === "DENY" && d2.code === "REVOKED");
    ok("10 malformed grant ⇒ DENY (fail-closed)", authz.authorizeCapability(req(), "not-a-grant", CTX).decision === "DENY");
    ok("10 no clock ⇒ DENY NO_CLOCK (cannot check expiry)", authz.authorizeCapability(req(), validGrant(), {}).code === "NO_CLOCK");
    ok("10 a READ-ONLY capability may never be routed through this human-auth seam", authz.authorizeCapability(req({ capability: "Connectivity Audit" }), validGrant({ capability: "Connectivity Audit" }), CTX).code === "NOT_CONSEQUENTIAL");
}

// 11. Spec transport — the executor spec is built STRICTLY from the human grant scope (never invented).
{
    const rs = authz.buildExecutorSpec("External Research Acquisition", { objective: "pricing", planned_sources: ["https://a.org"] });
    ok("11 research spec field is the executor's existing key", rs.field === "research_acquisition");
    ok("11 research spec carries the human-granted sources + objective", JSON.stringify(rs.value.source_allowlist) === JSON.stringify(["https://a.org"]) && rs.value.objective === "pricing");
    ok("11 research spec defaults to dry-run (execute=false) unless scope.live", rs.value.execute === false);
    ok("11 scope.live===true arms the live flag", authz.buildExecutorSpec("External Research Acquisition", { live: true }).value.execute === true);
    const gs = authz.buildExecutorSpec("Governed Git Branch Integration", { target: "t", source: "s" });
    ok("11 git spec field + params come from scope", gs.field === "git_branch_integration" && gs.value.target === "t" && gs.value.source === "s");
    ok("11 no adapter / non-object scope ⇒ null", authz.buildExecutorSpec("Connectivity Audit", { x: 1 }) === null && authz.buildExecutorSpec("External Research Acquisition", null) === null);
}

// 12. Scope containment at execution — a carried spec that exceeds the grant scope is DENIED.
{
    const grant = validGrant({ capability: "External Research Acquisition", scope: { objective: "pricing", planned_sources: ["https://good.org"] } });
    const within = authz.requestedScopeOf("External Research Acquisition", { source_allowlist: ["https://good.org"], objective: "pricing" });
    const beyond = authz.requestedScopeOf("External Research Acquisition", { source_allowlist: ["https://evil.org"], objective: "pricing" });
    ok("12 requestedScopeOf projects the spec back to grant-scope shape", JSON.stringify(within) === JSON.stringify({ objective: "pricing", planned_sources: ["https://good.org"] }));
    const okReq = { capability: "External Research Acquisition", mission: MISSION, requestedScope: within };
    const badReq = { capability: "External Research Acquisition", mission: MISSION, requestedScope: beyond };
    ok("12 spec within grant scope ⇒ ALLOW", authz.authorizeCapability(okReq, grant, CTX).decision === "ALLOW");
    ok("12 spec beyond grant scope ⇒ DENY SCOPE_EXCEEDED", authz.authorizeCapability(badReq, grant, CTX).code === "SCOPE_EXCEEDED");
}

console.log(`\ncapability-authorization: ${passed} assertions passed`);
