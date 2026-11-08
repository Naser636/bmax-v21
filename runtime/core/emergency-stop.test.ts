#!/usr/bin/env node
"use strict";
const assert = require("assert");
const ES = require("./emergency-stop");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §65 — EMERGENCY STOP");

// valid stops across scopes ⇒ stopped, state preserved, authorities revoked, detectable+traceable.
{
  const r = ES.emergencyStop({ controller: "odg", scope: "AGENT", target: "agent-x", reason: "runaway" }, { state: { phase: "P1", verified: true }, now: 1 });
  check(r.ok === true && r.stopped === true && r.revokedAuthorities.includes("agent-x") && r.preservedState.snapshot.phase === "P1" && r.detectable && r.traceable, "stop an agent ⇒ stopped, authority revoked, state preserved, detectable+traceable");
  check(ES.emergencyStop({ controller: "odg", scope: "MISSION", target: "m1" }, {}).revokedAuthorities.includes("mission:m1"), "stop a mission ⇒ mission authority revoked");
  check(ES.emergencyStop({ controller: "odg", scope: "ACTION_CLASS", target: "WRITE" }, {}).revokedAuthorities.includes("class:WRITE"), "stop an action-class ⇒ class revoked");
  check(ES.emergencyStop({ controller: "odg", scope: "ALL" }, {}).revokedAuthorities.includes("*"), "stop ALL ⇒ everything revoked");
}

// INDEPENDENCE: the stop mechanism must not depend on the stopped agent (self-stop refused).
check(ES.emergencyStop({ controller: "agent-x", scope: "AGENT", target: "agent-x" }, {}).stopped === false, "an agent CANNOT stop itself (controller must be independent)");
check(ES.stopControllerIndependent("odg", "agent-x") === true && ES.stopControllerIndependent("agent-x", "agent-x") === false && ES.stopControllerIndependent("self", "x") === false, "stopControllerIndependent: controller ≠ target (and not 'self')");
check(ES.emergencyStop({ controller: "odg", scope: "BOGUS", target: "x" }, {}).stopped === false, "invalid scope ⇒ refused (fail-closed)");

// post-stop admission: nothing is ALLOWED without re-authorization (a revoked/consequential action is denied).
check(ES.afterStopAdmission({ principal: "agent-x", verb: "write", target: "f", actionClass: "WRITE" }, ["agent-x"]).decision !== "ALLOW", "post-stop: a consequential action is NOT ALLOWED (re-authorization required)");

// restoration is refused from an unverified state; allowed from a verified one.
check(ES.verifyRestoration({ preservedState: { verified: true } }).ok === true, "restore from a VERIFIED checkpoint ⇒ allowed");
check(ES.verifyRestoration({ preservedState: { verified: false } }).ok === false, "restore from an UNVERIFIED state ⇒ BLOCKED (post-restoration verification required)");

console.log(failures === 0 ? "ALL PASS — V12.4 §65 EMERGENCY STOP" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
