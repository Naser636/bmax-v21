#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V96 — final release-gate decision battery. Proves the decision is grounded in the REAL contract: the
 * permanent mandate EXCLUDES Level-C and the action-gate DENIES a push without explicit human authority; that authority
 * was NOT provided and NOT fabricated (§2) ⇒ GATE_CRITICAL BLOCKED; GitHub + release candidate + rollback are technically
 * READY; the exact executable operation now is NONE (stop at the gate) with a precise minimal authorization request. Also
 * re-proves the gate live via action-gate + local-work-mandate (not just reading the artifact). Live modules + artifact.
 */

const path = require("path");
const fs = require("fs");
const DD = path.join(__dirname, "..", "..", "docs", "odg");
const G = require("../core/action-gate.js");
const M = require("../core/local-work-mandate.js");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(DD, f), "utf8")); } catch { return null; } }
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // re-prove the gate LIVE (independent of the artifact).
  check("LIVE: permanent mandate does NOT permit push/deploy (Level-C excluded)", M.permits("push").permitted === false && M.permits("deploy").permitted === false);
  check("LIVE: authorizeLocalMission([push,deploy]) ⇒ Level-C REFUSED", M.authorizeLocalMission({ id: "x", actions: ["push", "deploy"] }).authorized === false && M.authorizeLocalMission({ id: "x", actions: ["push", "deploy"] }).level === "C");
  const pushNoAuth = G.evaluateAction({ principal: "odg", verb: "push", target: "origin/main", actionClass: "IRREVERSIBLE", reversibility: "R4", criticality: "CRITICAL", contract: {}, policy: {}, expectedTransition: null }, {});
  check("LIVE: action-gate DENIES push without explicit human authority", pushNoAuth.decision === "DENY" && pushNoAuth.escalation.reasons.length >= 1);

  const d = j("V96_GATE_DECISION.json");
  check("decision artifact exists", !!d);
  if (d) {
    check("§1 Truth Lock: HEAD unchanged since V95; 5 stashes + ≥6 untracked preserved (new lot files transient)", d.truthLock.headUnchangedSinceV95 === true && d.truthLock.stashes === 5 && d.truthLock.untracked >= 6);
    check("§2 gate contract proven: mandate excludes Level-C + action-gate DENY + NO explicit authority (not fabricated)", d.criticalGateContract.permanentMandateGrantsLevelC === false && d.criticalGateContract.actionGatePushDecision === "DENY" && d.criticalGateContract.explicitHumanAuthorityProvided === false);
    check("§5 GATE_CRITICAL = BLOCKED", d.verdict.GATE_CRITICAL === "BLOCKED");
    check("§5 GitHub + releaseCandidate + rollback technically READY", d.verdict.GitHub === "READY" && d.verdict.releaseCandidate === "READY" && d.verdict.rollback === "READY");
    check("§4 RC preconditions verified (deps IDENTICAL, 0 migrations, current healthy)", d.technicalReadiness.releaseCandidate.depsVsDeployed === "IDENTICAL" && d.technicalReadiness.releaseCandidate.migrations === 0 && d.technicalReadiness.rollback.currentHealthy === true);
    check("§5 executable operation NOW = NONE (stop exactly at the gate)", /NONE/.test(d.verdict.exactExecutableOperationNow));
    check("§5 minimal authorization request precise (push+PR explicit fire + VPS go-live ROOT)", !!d.verdict.missingAuthorization && /push/.test(d.verdict.missingAuthorization.part1_github) && /ROOT/.test(d.verdict.missingAuthorization.part2_vps_golive));
    check("invariant: never fabricate a receipt; stop at gate; nothing pushed/deployed/changed", /never fabricate a receipt/i.test(d.invariant) && /nothing pushed\/deployed\/changed/i.test(d.invariant));
  }

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V96 (GATE_CRITICAL BLOCKED, proven live; dossier technically READY; stop at gate; no receipt fabricated; nothing pushed/deployed)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
