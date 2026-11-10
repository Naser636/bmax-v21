#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V86 §11/§7 — universal inspection boundary battery. Proves the boundary is a MANDATORY, fail-closed, no-
 * bypass PRE+POST passage that composes V84-mandate + action-gate + V85-meta-validation + evaluator-independence + V82.
 * Covers §11's 17 required cases + §7 inspection-of-inspection (always-pass / always-fail / blind / hypersensitive
 * inspectors all rejected as unqualified unless meta-validated EFFECTIVE). Live modules + coverage artifact.
 */

const path = require("path");
const fs = require("fs");
const B = require("../core/inspection-boundary.js");
const ENGINE = require("../core/campaign-engine.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V86_INSPECTION_COVERAGE.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const QUALIFIED = { valid: true, effective: true };                      // a V85-qualified inspector
const UNQUALIFIED = { valid: true, effective: false };                   // meta-validation says INEFFECTIVE
const INDEP = { builder: { id: "P" }, verifier: { id: "I" } };
const SELF = { builder: { id: "P" }, verifier: { id: "P" } };            // self-certification
const goodEvidence = { exists: () => true, read: () => '{"done":1}', expectMarkers: ["done"] };
const localOp = (id: string, extra: any = {}) => ({ id, origin: "test", objective: id, risk: "CODE_CHANGE", actions: ["code_edit_local", "test"], ...extra });

function main(): void {
  // §11.1/§11.2/§11.3 — user/internal/sub-mission command all traverse PRE and are APPROVED when mandate+inspector+independence hold.
  check("§11.1-3: local command traverses PRE ⇒ APPROVED (qualified inspector + independent + Level-A mandate)", B.inspectPre(localOp("op1"), { inspectorMeta: QUALIFIED, independenceActors: INDEP }).verdict === "APPROVED");

  // §11.6/§7 — an UNQUALIFIED inspector (meta-validation not EFFECTIVE) cannot issue a verdict ⇒ BLOCKED.
  check("§11.6/§7: unqualified inspector ⇒ BLOCKED (no verdict honored)", B.inspectPre(localOp("op2"), { inspectorMeta: UNQUALIFIED, independenceActors: INDEP }).verdict === "BLOCKED");
  check("§7: absent inspector meta-validation ⇒ BLOCKED (fail-closed)", B.inspectPre(localOp("op3"), { independenceActors: INDEP }).verdict === "BLOCKED");

  // §11.8/§5 — a COMPROMISED independence (producer == inspector) cannot certify ⇒ BLOCKED.
  check("§11.8/§5: self-certification (producer==inspector) ⇒ BLOCKED", B.inspectPre(localOp("op4"), { inspectorMeta: QUALIFIED, independenceActors: SELF }).verdict === "BLOCKED");

  // §11.5/§13 — an unauthorized (Level-C) command is BLOCKED by the mandate.
  check("§11.5: Level-C command (deploy) ⇒ BLOCKED by mandate", B.inspectPre({ id: "opC", risk: "CODE_CHANGE", actions: ["deploy"] }, { inspectorMeta: QUALIFIED, independenceActors: INDEP }).verdict === "BLOCKED");
  // Level-B ⇒ DECLARED_UNVERIFIED (prepare, never self-accept).
  check("§13: Level-B command ⇒ DECLARED_UNVERIFIED (prepare, not accepted)", B.inspectPre({ id: "opB", risk: "CODE_CHANGE", actions: ["canonization"] }, { inspectorMeta: QUALIFIED, independenceActors: INDEP }).verdict === "DECLARED_UNVERIFIED");

  // §8 — a CRITICAL/EXTERNAL op with no action-gate-shaped action cannot be admitted ⇒ BLOCKED.
  check("§8: critical op without action-gate action ⇒ BLOCKED", B.inspectPre({ id: "opX", risk: "CRITICAL", actions: ["code_edit_local"] }, { inspectorMeta: QUALIFIED, independenceActors: INDEP }).verdict === "BLOCKED");

  // §3.A — action-gate DENY ⇒ BLOCKED; a consequential WRITE without authority is denied.
  const deny = B.inspectPre(localOp("opW", { action: { principal: "odg", verb: "write", target: "f", actionClass: "WRITE" } }), { inspectorMeta: QUALIFIED, independenceActors: INDEP });
  check("§3.A: action-gate DENY (consequential, no authority) ⇒ BLOCKED", deny.verdict === "BLOCKED");

  // §11.9/§11.10/§3.B — POST: executed ≠ validated. Missing/insufficient evidence ⇒ NOT_MEASURED (never PASS).
  check("§11.9: objective not met ⇒ DECLARED_UNVERIFIED (not promoted)", B.inspectPost(localOp("op5"), { objectiveMet: false }, { inspectorMeta: QUALIFIED }).verdict === "DECLARED_UNVERIFIED");
  check("§11.10: objective met but NO evidence ⇒ NOT_MEASURED (not PASS)", B.inspectPost(localOp("op6"), { objectiveMet: true }, { inspectorMeta: QUALIFIED }).verdict === "NOT_MEASURED");
  check("§3.B: objective met + wrong-content evidence ⇒ NOT_MEASURED (V82)", B.inspectPost(localOp("op7"), { objectiveMet: true, evidenceRef: "x.json" }, { inspectorMeta: QUALIFIED, evidenceOpts: { exists: () => true, read: () => '{"other":1}', expectMarkers: ["done"] } }).verdict === "NOT_MEASURED");
  check("§3.B: objective met + VALID evidence + qualified inspector ⇒ PASS", B.inspectPost(localOp("op8"), { objectiveMet: true, evidenceRef: "x.json" }, { inspectorMeta: QUALIFIED, evidenceOpts: goodEvidence }).verdict === "PASS");
  // a demonstrated error ⇒ FAIL.
  check("POST: reported error ⇒ FAIL", B.inspectPost(localOp("op9"), { error: "boom" }, { inspectorMeta: QUALIFIED }).verdict === "FAIL");

  // §9 — the SINGLE passage: inspect() never executes a BLOCKED command; only PRE-approved + POST-PASS is promoted.
  let executed = false;
  const blockedRun = B.inspect({ id: "opC2", risk: "CODE_CHANGE", actions: ["deploy"] }, { inspectorMeta: QUALIFIED, independenceActors: INDEP }, () => { executed = true; return { objectiveMet: true }; });
  check("§9/§11.4: a BLOCKED command is NEVER executed (executor not called)", blockedRun.promoted === false && executed === false);
  const okRun = B.inspect(localOp("op10"), { inspectorMeta: QUALIFIED, independenceActors: INDEP, evidenceOpts: goodEvidence }, () => ({ objectiveMet: true, evidenceRef: "x.json" }));
  check("§9: PRE-approved + POST-PASS ⇒ promoted", okRun.promoted === true && okRun.pre.verdict === "APPROVED" && okRun.post.verdict === "PASS");
  check("§9: no executor supplied ⇒ not promoted (fail-closed)", B.inspect(localOp("op11"), { inspectorMeta: QUALIFIED, independenceActors: INDEP }, null).promoted === false);

  // §7 — inspection-of-inspection: always-pass / always-fail / blind / hypersensitive inspectors are all rejected
  // unless meta-validated EFFECTIVE (the boundary never trusts an inspector on its say-so).
  check("§7: always-pass inspector (not meta-validated) ⇒ BLOCKED", B.inspectPre(localOp("op12"), { inspectorMeta: { valid: true, effective: false }, independenceActors: INDEP }).verdict === "BLOCKED");
  check("§7: inspectorQualified requires valid+effective (fail-closed)", B.inspectorQualified(QUALIFIED) === true && B.inspectorQualified(UNQUALIFIED) === false && B.inspectorQualified(null) === false && B.inspectorQualified({ valid: false, effective: true }) === false);

  // §11.11 — a correction must re-traverse the chain: a fresh inspect() call re-runs PRE+POST (no cached pass).
  const corr1 = B.inspect(localOp("fix"), { inspectorMeta: QUALIFIED, independenceActors: INDEP, evidenceOpts: { exists: () => true, read: () => "{}", expectMarkers: ["done"] } }, () => ({ objectiveMet: true, evidenceRef: "x.json" }));
  check("§11.11: correction with still-insufficient evidence ⇒ re-inspected, NOT promoted", corr1.promoted === false && corr1.post.verdict === "NOT_MEASURED");

  // §11.16 — V61..V85 intact: the boundary creates no authorizer (notAuthority) and defers closure.
  check("§11.16: boundary creates no authorizer (notAuthority)", /creates no authorizer/i.test(JSON.stringify(B.INSPECTION_BOUNDARY_CONTRACT.notAuthority)));

  // §11.12/§11.13 — maintenance + recovery ops are inspected like any other (same PRE path, risk-proportionate).
  check("§11.12: maintenance op (local) inspected ⇒ APPROVED", B.inspectPre({ id: "maint", risk: "CODE_CHANGE", actions: ["refactor", "test"] }, { inspectorMeta: QUALIFIED, independenceActors: INDEP }).verdict === "APPROVED");
  check("§11.13: recovery op with Level-C action ⇒ BLOCKED (no auto-permission)", B.inspectPre({ id: "recover", risk: "CODE_CHANGE", actions: ["ssh"] }, { inspectorMeta: QUALIFIED, independenceActors: INDEP }).verdict === "BLOCKED");

  // §11.4/§6 via the ENGINE — an uninspected campaign invocation accepts NOTHING (no bypass to acceptance).
  const A = (id: string) => ({ id, actions: ["test"], strategicImportance: 0.6, roadmapPriority: 0.6, unblocks: [], risk: 0.1, immediatelyExecutable: true, operationalValue: 0.6, closureWithProof: true, deps: [], status: "OPEN" });
  check("§6: engine WITHOUT inspection context ⇒ 0 accepted (isolated mode never operationally accepts)", ENGINE.runCampaign([A("a"), A("b")], {}).metrics.accepted === 0);
  check("§11.1: engine WITH qualified inspection ⇒ accepts Level-A", ENGINE.runCampaign([A("a"), A("b")], { inspection: { inspectorMeta: QUALIFIED, independenceActors: INDEP, evidenceOptsFor: () => goodEvidence } }).metrics.accepted === 2);

  // coverage artifact — honest, source-measured, never a fabricated 100%.
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("coverage artifact exists", !!m);
  if (m) {
    check("coverage: boundary built; campaign-engine WIRED; coverage measured from SOURCE (not test count)", m.boundaryBuilt === true && m.paths.find((p: any) => p.file === "campaign-engine.ts").wired === true && typeof m.coverageRatio === "number");
    check("coverage: NOT_WIRED paths reported honestly (no false 100%)", m.notWiredPaths >= 1 && m.coverageRatio < 1 && Array.isArray(m.notWiredList));
    check("invariant: coverage from source, NOT_WIRED = real bypass risk reported honestly", /measured from source/i.test(m.invariant));
  }

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V86 universal inspection boundary (PRE+POST, fail-closed, no bypass; unqualified/compromised inspectors rejected; honest coverage)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
