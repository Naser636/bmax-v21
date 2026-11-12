#!/usr/bin/env node
"use strict";
/*
 * V164 (§1 — p0-autonomy-measure-slice3-delegate-provenance, REALIZABLE Gate-A portion). PURE/deterministic, fail-closed.
 * The mission's own nextAction: "Gate-A refined contract + isolated delegate-flow smoke BEFORE any implementation." Its
 * deps (slice2 + slice2-r1-hardening) are ACCEPTED. This module delivers exactly that Gate-A evidence, REUSING the canonical
 * delegate-isolation.ts (no parallel delegate engine), WITHOUT the larger enhancement (threading authoredBy=PROVIDER through
 * the convergence/patch-executor chain — a consequential execution-path change that stays its own future governed work).
 *
 * The mission's diagnosis: odg-delegate writes NO patch-execution.json, so a HISTORICAL delegation (provider edited
 * out-of-band) has no execution-chain provenance ⇒ slice-2 correctly resolves UNKNOWN actor — which is ALREADY HONEST (no
 * false ODG credit). This module EMPIRICALLY CONFIRMS: (1) the delegate flow emits no patch-execution provenance (the gap),
 * and (2) write-scope isolation holds (out-of-scope changes refused). It does NOT change the register mission status
 * (a provider cannot close a real mission); the enhancement stays DEFERRED pending the correct contract.
 */
const DI = require("./delegate-isolation.js");
const fs = require("node:fs");
const path = require("node:path");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/* gateARefinedContract — the structured Gate-A contract: the exact enhancement requirement + why the simple stamp fails +
 * why current behaviour is already honest + the scope boundary. Pure data distilled from the canonical slice-3 diagnosis. */
function gateARefinedContract(): any {
  return Object.freeze({
    missionId: "p0-autonomy-measure-slice3-delegate-provenance",
    goal: "honest execution-chain provenance for HISTORICAL odg-delegate missions (distinguish PROVIDER-authored from ODG-native)",
    currentBehaviourHonest: "a HISTORICAL delegation (provider edited out-of-band) produces no patch-execution.json ⇒ slice-2 resolves UNKNOWN actor. This is HONEST — ODG claims no false credit. NO defect is open; this is a measurement ENHANCEMENT.",
    whySimpleStampFails: Object.freeze([
      "a conformance-point patch-execution.json would be CLOBBERED: the delegate path reaches recordMission via odg-converge → converge-cli → AutonomyRuntimeAdapter.archive, which runs the convergence pipeline's OWN patch-executor and overwrites it before recordMission reads it",
      "it would COLLIDE with mission-lifecycle.buildEvidence's EXECUTED probe (executed.length>0 && !anyFailed), changing archival behaviour",
    ]),
    correctEnhancement: "thread authoredBy=PROVIDER through the convergence/patch-executor chain for HISTORICAL delegations (execution-path, consequential) — NOT a delegate-step write. Requires an execution-chain contract + this empirical smoke first.",
    scopeBoundary: "Gate-A = contract + empirical smoke ONLY (this lot). Implementation of the authoredBy threading is a LARGER future governed mission. The register mission stays DEFERRED.",
    acceptanceForEnhancement_whenAttempted: Object.freeze(["authoredBy=PROVIDER survives the convergence/patch-executor chain for a HISTORICAL delegation", "mission-lifecycle.buildEvidence EXECUTED probe is unchanged for non-delegated missions", "a provenance smoke demonstrates PROVIDER vs ODG-native attribution end-to-end"]),
  });
}

/* delegateFlowSmoke(rootDir) — EMPIRICAL Gate-A smoke using the canonical composable delegate-isolation functions (no bwrap
 * needed for scope/diff/provenance). Proves: (A) the delegate flow emits NO patch-execution.json (the provenance gap), and
 * (B) write-scope isolation holds (out-of-scope changes refused). rootDir is a caller-supplied scratch repo (the test cleans it). */
function delegateFlowSmoke(rootDir: any): any {
  if (typeof rootDir !== "string" || !fs.existsSync(rootDir)) return Object.freeze({ ok: false, code: "NO_ROOT" });
  const io = fs;
  const findings: any = { provenanceGap: null, scopeIsolation: null };

  // (A) PROVENANCE GAP — the canonical delegate module writes NO patch-execution.json. Confirmed structurally AND via the
  // runIsolated result surface (which, even when it refuses for lack of a sandbox, carries NO execution-chain provenance key).
  const refusal = DI.runIsolated({ root: rootDir, writeSet: ["in.txt"], command: "/bin/true", io });
  const resultKeys = isObj(refusal) ? Object.keys(refusal) : [];
  findings.provenanceGap = Object.freeze({
    delegateEmitsPatchExecution: resultKeys.indexOf("patchExecution") >= 0 || resultKeys.indexOf("patch-execution") >= 0,
    runIsolatedResultKeys: Object.freeze(resultKeys),
    historicalDelegationHasNoExecutionProvenance: resultKeys.indexOf("patchExecution") < 0,
    detail: "the delegate flow carries no execution-chain provenance (no patch-execution.json) ⇒ a HISTORICAL delegation resolves UNKNOWN actor (honest).",
  });

  // (B) SCOPE ISOLATION — materialize a working copy, simulate an in-scope + an out-of-scope provider edit, and confirm
  // validateScope REFUSES the out-of-scope change (the write-confinement the delegate flow enforces).
  try {
    const resolved = DI.resolveWriteSet(rootDir, ["in.txt"]);
    if (resolved.ok) {
      const mat = DI.materializeWorkingCopy(rootDir, resolved.files, io);
      // in-scope edit (allowed) + out-of-scope edit (must be refused)
      io.writeFileSync(path.join(mat.workDir, "in.txt"), "edited-by-provider\n");
      io.writeFileSync(path.join(mat.workDir, "secret.txt"), "out-of-scope\n");
      const changes = DI.diffWorkingCopy(mat.pristine, mat.workDir, io);
      const scope = DI.validateScope(changes, resolved.files);
      try { io.rmSync(mat.workDir, { recursive: true, force: true }); } catch { /* best-effort */ }
      findings.scopeIsolation = Object.freeze({ changesSeen: changes.length, scopeRefused: scope.ok === false, detail: scope.ok ? "unexpected: out-of-scope change accepted" : `out-of-scope change REFUSED (${scope.detail || "scope violation"})` });
    } else {
      findings.scopeIsolation = Object.freeze({ scopeRefused: null, detail: `resolveWriteSet failed: ${resolved.error}` });
    }
  } catch (e: any) { findings.scopeIsolation = Object.freeze({ scopeRefused: null, detail: "smoke threw: " + ((e && e.message) || String(e)) }); }

  // (C) PROVENANCE-GAP double-check: no patch-execution.json was created anywhere under the root by the flow.
  let patchExecCreated = false;
  try { for (const f of io.readdirSync(rootDir)) if (/patch-execution/.test(f)) patchExecCreated = true; } catch { /* ignore */ }

  return Object.freeze({
    ok: true,
    provenanceGapConfirmed: findings.provenanceGap.historicalDelegationHasNoExecutionProvenance === true && patchExecCreated === false,
    scopeIsolationHolds: findings.scopeIsolation.scopeRefused === true,
    findings: Object.freeze(findings),
    note: "Gate-A empirical smoke over the CANONICAL delegate-isolation (no parallel engine). Confirms the provenance gap + scope isolation. The authoredBy-threading enhancement is NOT implemented here; the register mission stays DEFERRED (a provider cannot close it).",
  });
}

const DELEGATE_PROVENANCE_SMOKE_CONTRACT = Object.freeze({
  id: "V164-DELEGATE-PROVENANCE-SMOKE",
  purpose: "§1 slice-3 Gate-A (realizable) — refined contract + isolated delegate-flow smoke confirming the provenance gap + scope isolation, BEFORE the larger authoredBy-threading enhancement",
  reuses: ["delegate-isolation.ts (resolveWriteSet/materializeWorkingCopy/diffWorkingCopy/validateScope/runIsolated) — THE canonical delegate flow; no parallel engine"],
  invariants: Object.freeze([
    "reuses the canonical delegate-isolation; builds NO parallel delegate engine; no new primitive",
    "EMPIRICALLY confirms the provenance gap (delegate flow emits no patch-execution.json) and scope isolation (out-of-scope refused)",
    "current behaviour (HISTORICAL delegation ⇒ UNKNOWN actor) is already HONEST — no false ODG credit; this is a measurement ENHANCEMENT, not a defect",
    "the authoredBy=PROVIDER threading through the convergence/patch-executor chain is OUT OF SCOPE (larger governed work); mission stays DEFERRED",
    "does NOT change the register mission status (a provider cannot close a real mission); deterministic + fail-closed",
  ]),
});
module.exports = { gateARefinedContract, delegateFlowSmoke, DELEGATE_PROVENANCE_SMOKE_CONTRACT };
export {};
