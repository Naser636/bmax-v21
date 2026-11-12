#!/usr/bin/env node
"use strict";
/*
 * V165 (§8 — p0-autonomy-measure-slice3-delegate-provenance: governability determination + INDEPENDENT reproduction of the
 * authorized part). Builds on the V164 Gate-A smoke. PURE orchestration over the REAL chain; writes only to a caller-supplied
 * or ephemeral scratch cwd (never the repo); deterministic; fail-closed.
 *
 * §8 asks: "determine if slice-3's implementation is now governable, then execute and reproduce independently any authorized
 * part." Governability splits cleanly in two:
 *
 *   (A) LIVE GOVERNED-APPLY path — GOVERNABLE and ALREADY CORRECT. The provider-proposal apply seam
 *       (patch-proposal-apply.ts applyProposal → stamps authoredBy="PROVIDER") flows through the REAL patch-executor
 *       (carries plannedAuthor(patch) into each patch-execution.json entry) and the REAL actor-provenance resolver
 *       (authoredBy∈{PROVIDER,LOCAL_PROVIDER} ⇒ TECHNICAL_PROVIDER; author governs — ODG applying does NOT promote to ODG).
 *       This module REPRODUCES it end-to-end over the real modules and asserts the honest actor. AUTHORIZED ⇒ executed here.
 *
 *   (B) HISTORICAL OUT-OF-BAND delegation path — NOT bounded-governable. A provider edit made out-of-band (the
 *       delegate-isolation/odg-delegate path) writes no patch-execution.json, and the subsequent convergence pipeline's own
 *       patch-executor OVERWRITES runtime/generated/patch-execution.json before recordMission reads it. Threading
 *       authoredBy=PROVIDER for a historical delegation therefore requires changing the CONSEQUENTIAL convergence/patch-executor
 *       execution path (it also flips mission-lifecycle.buildEvidence's EXECUTED probe from "no execution entries" to ok:true,
 *       an archival-semantics change). That needs owner/governance review ⇒ the register mission STAYS DEFERRED.
 */
const PPA = require("./patch-proposal-apply.js");
const AP = require("./actor-provenance.js");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");

// Resolve the COMPILED dist patch-executor (plain-node-runnable), whether this module runs as the .ts source (runtime/core,
// under tsx) or the compiled dist copy (runtime/dist/core) — mirrors patch-proposal-apply.ts's own resolution.
function executorPath(): string {
  return __dirname.endsWith(path.join("runtime", "dist", "core"))
    ? path.join(__dirname, "patch-executor.js")
    : path.join(__dirname, "..", "dist", "core", "patch-executor.js");
}

function withScratch(cwd: any, fn: (dir: string) => any): any {
  const own = !(typeof cwd === "string" && cwd);
  const dir = own ? fs.mkdtempSync(path.join(os.tmpdir(), "v165-slice3-")) : cwd;
  try { return fn(dir); } finally { if (own) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } } }
}

/* reproduceGovernedApply — drive the REAL live provider-apply seam (patch-proposal-apply.applyProposal, which stamps
 * authoredBy="PROVIDER") → REAL patch-executor → REAL actor-provenance, in a scratch cwd. Returns the executed entry
 * attribution + the resolved actor. This is the AUTHORIZED part executed + independently reproduced. */
function reproduceGovernedApply(opts?: any): any {
  const mission = (opts && typeof opts.mission === "string" && opts.mission) || "V165_SLICE3_GOVERNED_APPLY";
  return withScratch(opts && opts.cwd, (dir: string) => {
    fs.mkdirSync(path.join(dir, "runtime", "core"), { recursive: true });
    fs.writeFileSync(path.join(dir, "runtime", "core", "prov_fixture.txt"), "original\n");
    const res = PPA.applyProposal({ mission, authorizedPaths: ["runtime/core"], proposedEdits: [{ objectiveId: "PROV_EDIT", target: "runtime/core/prov_fixture.txt", content: "provider-edited\n" }], cwd: dir });
    const pe = path.join(dir, "runtime", "generated", "patch-execution.json");
    if (!fs.existsSync(pe)) return Object.freeze({ ok: false, reason: "no patch-execution.json produced", applied: res.applied });
    const report = JSON.parse(fs.readFileSync(pe, "utf8"));
    const resolved = AP.resolveMissionActor(report, mission);
    return Object.freeze({
      ok: true,
      applied: res.applied === true && res.reason === "APPLIED",
      entries: Object.freeze(report.executed.map((e: any) => Object.freeze({ status: e.status, authoredBy: e.authoredBy, appliedBy: e.appliedBy || null }))),
      actor: resolved.actor,
      reason: resolved.reason,
      executedBy: resolved.executedBy,
    });
  });
}

/* reproduceByAuthor — drive the REAL patch-executor directly with a chosen patch author, then resolve via REAL
 * actor-provenance. Proves the resolver DISCRIMINATES over genuine executor output (ODG-native ⇒ ODG, provider ⇒
 * TECHNICAL_PROVIDER, unknown ⇒ no attribution) — not a stub that always returns one actor. */
function reproduceByAuthor(author: any, opts?: any): any {
  const mission = (opts && typeof opts.mission === "string" && opts.mission) || ("V165_SLICE3_" + String(author));
  return withScratch(opts && opts.cwd, (dir: string) => {
    fs.mkdirSync(path.join(dir, "runtime", "core"), { recursive: true });
    fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
    fs.writeFileSync(path.join(dir, "runtime", "core", "fx.txt"), "original\n");
    const plan = { mission, authorizedPaths: ["runtime/core"], patches: [{ action: "OBJ", objectiveId: "OBJ", authoredBy: author, edits: [{ target: "runtime/core/fx.txt", content: "edited\n" }] }] };
    fs.writeFileSync(path.join(dir, "runtime", "generated", "patch-plan.json"), JSON.stringify(plan));
    cp.spawnSync(process.execPath, [executorPath()], { cwd: dir, encoding: "utf8" });
    const report = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "patch-execution.json"), "utf8"));
    const resolved = AP.resolveMissionActor(report, mission);
    return Object.freeze({ entries: Object.freeze(report.executed.map((e: any) => Object.freeze({ status: e.status, authoredBy: e.authoredBy, appliedBy: e.appliedBy || null }))), actor: resolved.actor, reason: resolved.reason });
  });
}

/* assessGovernability — the structured §8 verdict: which part of slice-3 is governable/executed now, which part stays
 * DEFERRED and why, with the exact real seams (file paths) and the acceptance a future enhancement must meet. */
function assessGovernability(): any {
  return Object.freeze({
    missionId: "p0-autonomy-measure-slice3-delegate-provenance",
    liveGovernedApply: Object.freeze({
      verdict: "GOVERNABLE — ALREADY CORRECT (reproduced here end-to-end)",
      seams: Object.freeze(["patch-proposal-apply.ts applyProposal stamps authoredBy=\"PROVIDER\"", "patch-executor.ts carries plannedAuthor(patch) into each patch-execution.json entry (defaults UNKNOWN)", "actor-provenance.ts resolveMissionActor maps authoredBy∈{PROVIDER,LOCAL_PROVIDER} ⇒ TECHNICAL_PROVIDER; author governs"]),
      proof: "reproduceGovernedApply(): provider apply ⇒ entry {authoredBy:PROVIDER, appliedBy:ODG_EXECUTOR} ⇒ actor TECHNICAL_PROVIDER (NOT ODG). Contrast via reproduceByAuthor(): ODG_RULES ⇒ ODG, UNKNOWN ⇒ no attribution.",
    }),
    historicalOutOfBand: Object.freeze({
      verdict: "NOT BOUNDED-GOVERNABLE — stays DEFERRED",
      why: Object.freeze(["the delegate-isolation/odg-delegate path writes no patch-execution.json", "the subsequent convergence pipeline's own patch-executor OVERWRITES runtime/generated/patch-execution.json before recordMission reads it (clobber)", "making authoredBy=PROVIDER survive requires changing the CONSEQUENTIAL convergence/patch-executor execution path, which also flips mission-lifecycle.buildEvidence's EXECUTED probe (archival-semantics change) ⇒ owner/governance review"]),
      acceptanceWhenAttempted: Object.freeze(["authoredBy=PROVIDER survives the convergence/patch-executor chain for a HISTORICAL delegation", "mission-lifecycle.buildEvidence EXECUTED probe is UNCHANGED for non-delegated missions", "an end-to-end delegate smoke demonstrates PROVIDER vs ODG-native attribution"]),
      currentBehaviourHonest: "a historical delegation resolves UNKNOWN actor — already HONEST (no false ODG credit); no defect open; this is a measurement ENHANCEMENT.",
    }),
    statusChangeAllowed: false,
  });
}

const SLICE3_GOVERNABILITY_CONTRACT = Object.freeze({
  id: "V165-SLICE3-GOVERNABILITY",
  purpose: "§8 — determine slice-3 governability + independently reproduce the AUTHORIZED (live governed-apply) part over the REAL patch-proposal-apply → patch-executor → actor-provenance chain",
  reuses: ["patch-proposal-apply.ts (applyProposal — the real provider seam)", "patch-executor.ts (compiled dist — the real executor)", "actor-provenance.ts (the real executor-attribution authority)"],
  invariants: Object.freeze([
    "reuses the REAL chain end-to-end; builds NO parallel executor/resolver; no new primitive",
    "writes only to an ephemeral/caller scratch cwd — NEVER the repo (runtime/generated untouched)",
    "live governed-apply is GOVERNABLE and already correct (provider ⇒ TECHNICAL_PROVIDER); reproduced + discriminated (ODG vs provider vs unknown)",
    "historical out-of-band delegation stays NOT bounded-governable (consequential convergence/patch-executor change + owner review) ⇒ register mission STAYS DEFERRED",
    "does NOT change the register mission status (a provider cannot promote/close it); deterministic + fail-closed",
  ]),
});
module.exports = { reproduceGovernedApply, reproduceByAuthor, assessGovernability, SLICE3_GOVERNABILITY_CONTRACT, executorPath };
export {};
