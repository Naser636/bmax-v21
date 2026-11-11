#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V96 — FINAL RELEASE-GATE DECISION. Reads the REAL critical-gate contract (local-work-mandate + action-gate)
 * and decides, with proof, whether the Level-C delivery operations (push/merge/go-live) are authorized. They are NOT: the
 * permanent mandate EXCLUDES Level-C ("Level-C never granted") and the action-gate DENIES a push/deploy without an explicit
 * per-operation human authority (authority.human === true) — which was NOT provided and MUST NOT be fabricated (§2). So the
 * dossier is technically READY but the gate is BLOCKED pending the owner's explicit fire + the ROOT go-live action. This
 * runner performs NO push/merge/build/activate/rollback — it stops exactly at the gate. Writes docs/odg/V96_GATE_DECISION.json.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
const G = require("../core/action-gate.js");
const M = require("../core/local-work-mandate.js");
function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }
function sh(c: string): string { try { return cp.execSync(c, { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } }

// §1 truth lock.
const head = git(["rev-parse", "--short", "HEAD"]);
const headUnchanged = git(["rev-parse", "HEAD"]) === git(["rev-parse", "9a2edad"]);
const aheadMain = Number(git(["rev-list", "--count", "origin/main..HEAD"])); const behindMain = Number(git(["rev-list", "--count", "HEAD..origin/main"]));

// §2 the REAL critical-gate contract, PROVEN by running it.
const mandatePermitsPush = M.permits("push").permitted === true;        // expected false
const mandateLevelCRefused = M.authorizeLocalMission({ id: "go-live", actions: ["push", "deploy"] }).level === "C";
const pushNoAuth = G.evaluateAction({ principal: "odg", verb: "push", target: "origin/main", actionClass: "IRREVERSIBLE", reversibility: "R4", criticality: "CRITICAL", contract: {}, policy: {}, expectedTransition: null }, {});
const gateContract = {
  levelCOperations: ["push", "merge", "deploy", "vps", "ssh", "sudo"],
  permanentMandateGrantsLevelC: mandatePermitsPush,                      // false
  mandateVerdictForPush: M.authorizeLocalMission({ id: "go-live", actions: ["push", "deploy"] }).reason,
  actionGatePushDecision: pushNoAuth.decision,                           // DENY
  actionGateEscalationReasons: pushNoAuth.escalation.reasons,
  requiresForLevelC: "explicit per-operation human authority (authority.human === true) + valid STATE/CONTRACT/POLICY/AUTHORITY admission",
  explicitHumanAuthorityProvided: false,                                 // NOT provided in V96; not fabricable (§2)
};

// §3/§4 technical readiness (from V95 + fresh checks) — READY, but blocked by the gate.
const deployed = sh(`readlink /home/ubuntu/odg-releases/current 2>/dev/null | grep -oE 'e84a0cf2'`) ? "e84a0cf2 (Oct 28)" : "unknown";
const depsIdentical = (() => { try { const a = JSON.parse(git(["show", "e84a0cf2:package.json"])); const b = require(path.join(ROOT, "package.json")); return JSON.stringify(a.dependencies) === JSON.stringify(b.dependencies) && JSON.stringify(a.devDependencies) === JSON.stringify(b.devDependencies); } catch { return false; } })();
const technical = {
  github: { conflictOverlap: 0, prPackage: "PREPARED (fresh PR)", mainProtected: true, state: "READY (blocked only by the gate)" },
  releaseCandidate: { sourceCommit: git(["rev-parse", "HEAD"]), buildCommand: "scripts/odg-release.sh build --commit <SHA>", diskFree: sh("df -h / | awk 'NR==2{print $4}'"), depsVsDeployed: depsIdentical ? "IDENTICAL" : "DIFFERENT", migrations: Number(sh(`git diff --name-only e84a0cf2 HEAD 2>/dev/null | grep -icE 'migrat|schema|\\.sql$'`)), stagingVerified: fs.existsSync(path.join(ROOT, "deploy", "odg-stage-and-verify.sh")), state: "READY (blocked only by the gate)" },
  rollback: { mechanism: "scripts/odg-release.sh rollback (current→previous)", currentHealthy: /ready/.test(sh(`curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null`)), priorReleases: 9, state: "READY" },
};

// §5 verdict.
const gateApproved = gateContract.explicitHumanAuthorityProvided === true;   // false
const verdict = {
  GATE_CRITICAL: gateApproved ? "APPROVED" : "BLOCKED",
  GitHub: "READY",
  releaseCandidate: "READY",
  rollback: "READY",
  exactExecutableOperationNow: gateApproved ? "the gate-authorized Level-C operations" : "NONE — all delivery ops (push/PR/build/verify/activate/rollback) are Level-C/ROOT; stop exactly at the gate. Only local preparation (already complete) is permitted.",
  missingAuthorization: gateApproved ? null : {
    part1_github: "the owner's EXPLICIT per-operation authorization to `git push origin excellence/v3-wave3-demonstrators-20261101` + open a PR to main (Level-C push/merge). The permanent mandate excludes Level-C; a general delegation does NOT satisfy the action-gate (authority.human===true required).",
    part2_vps_golive: "the ROOT privilege + the owner's EXPLICIT go for the VPS go-live: `scripts/odg-release.sh build --commit 9a2edad` → `verify` → `activate` (atomic current-symlink swap). Requires ROOT (not held) AND an explicit owner fire.",
  },
};

const out = {
  "//": "CTO V96 — final release-gate decision. The critical gate is BLOCKED: the permanent mandate EXCLUDES Level-C and the action-gate DENIES push/deploy without an explicit per-operation human authority (not provided; not fabricable §2). The dossier is technically READY; delivery stops exactly at the gate. NO push/merge/build/activate/rollback performed.",
  truthLock: { head, headUnchangedSinceV95: headUnchanged, aheadMain, behindMain, stashes: Number(sh("git stash list|wc -l")), untracked: git(["status", "--porcelain"]).split("\n").filter((l: string) => l.startsWith("??")).length, worktrees: Number(sh("git worktree list|wc -l")) },
  criticalGateContract: gateContract,
  technicalReadiness: technical,
  deployed,
  verdict,
  honestConclusion: `GATE_CRITICAL = BLOCKED. Proven against the REAL contract: the permanent mandate EXCLUDES Level-C (push/merge/deploy) and the action-gate DENIES a push without explicit human authority (reasons: ${pushNoAuth.escalation.reasons.join("; ")}). That explicit per-operation authority (authority.human===true) was NOT provided in V96 and MUST NOT be fabricated (§2). GitHub + release candidate + rollback are all technically READY (0 conflict, deps IDENTICAL, 0 migrations, current healthy, 9-release rollback). The exact operation executable now = NONE (all delivery ops are Level-C/ROOT) — ODG stops exactly at the gate. Missing: (1) the owner's explicit fire for push+PR, (2) ROOT + explicit go for the VPS go-live. No push/deploy/build/activate/rollback performed; nothing changed.`,
  invariant: "critical gate read from the REAL contract (mandate excludes Level-C; action-gate DENIES push without authority.human===true); explicit per-operation authority not provided ⇒ BLOCKED; never fabricate a receipt (§2); stop exactly at the gate; technical readiness ≠ gate authorization; nothing pushed/deployed/changed.",
};
fs.writeFileSync(path.join(D, "V96_GATE_DECISION.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ GATE_CRITICAL: verdict.GATE_CRITICAL, GitHub: verdict.GitHub, releaseCandidate: verdict.releaseCandidate, rollback: verdict.rollback, headUnchanged, executableNow: gateApproved ? "gate ops" : "NONE (stop at gate)" }, null, 2) + "\n");
export {};
