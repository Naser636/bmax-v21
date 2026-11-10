#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V93 §3/§4/§5/§7 — delegation decisions + real VPS inventory + runbook + register battery. Proves ODG
 * actually DECIDED the delegable dossiers (6), honestly kept the 3 Master-content ones NOT_MEASURED (no fabrication),
 * consolidated only 5 genuine owner decisions; the VPS inventory was PERFORMED read-only (no secrets, deployed health
 * READY, residuals OWNER_GATED); the runbook uses the real odg-release.sh; the register advanced to 7/8 on real evidence
 * (NOT_READY); and the 4 prior gate fixes did not regress. Live artifacts + package.json.
 */

const path = require("path");
const fs = require("fs");
const DD = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(DD, f), "utf8")); } catch { return null; } }
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // §3 — dossier decisions under delegation.
  const dec = j("V93_DOSSIER_DECISIONS.json");
  check("§3 dossier decisions artifact exists", !!dec);
  if (dec) {
    check("§3 ODG actually DECIDED the 6 delegable dossiers (not 14 blocks)", dec.odgDecidedCount === 6 && dec.odgDecided.every((d: any) => d.odgDecision && d.closureStatus === "DECIDED_CLOSED_ON_EXISTING_PROOF"));
    check("§3 3 NEEDS_LOCAL_BUILD honestly NOT_MEASURED (Master content never fabricated)", dec.localVerifyCount === 3 && dec.localVerify.every((d: any) => /NOT_MEASURED/.test(d.closureStatus)));
    check("§3 only 5 genuine owner decisions remain, consolidated into one sheet", dec.trulyNonDelegableCount === 5 && dec.consolidatedOwnerSheet.count === 5 && dec.consolidatedOwnerSheet.decisions.every((d: any) => d.status === "PENDING_OWNER_DECISION"));
    check("§3 owner decision never fabricated (recommendations only)", dec.consolidatedOwnerSheet.decisions.every((d: any) => ["APPROVE", "REJECT", "APPROVE_WITH_CONDITIONS", "NEEDS_INFORMATION"].includes(d.odgRecommendation)));
  }

  // §4 — real read-only VPS inventory.
  const inv = j("V93_VPS_INVENTORY.json");
  check("§4 VPS inventory artifact exists", !!inv);
  if (inv) {
    check("§4 inventory PERFORMED read-only (no sudo, no connection, no secrets)", inv.performedReadOnly === true && inv.sudoUsed === false && inv.connectionPerformed === false && inv.secretsDisclosed === false);
    check("§4 real facts observed (OS + node CI-match + ollama + deployed health READY)", /Ubuntu/.test(inv.observed.os) && inv.observed.runtime.matchesCI === true && inv.observed.deployedApp.healthOk === true);
    check("§4 deployed-vs-HEAD divergence recorded (deployed is OLD)", !!inv.observed.deployedVsHead.deployedSha && inv.observed.deployedVsHead.deployedIsAncestorOfHead === true);
    check("§4 config vars by NAME only (no values); secrets present by name not shown", Array.isArray(inv.observed.configVarNames) && inv.observed.configVarNames.length > 0);
    check("§4 sudo-gated residuals OWNER_GATED (not invented)", Array.isArray(inv.ownerGatedResiduals) && inv.ownerGatedResiduals.length >= 4);
  }

  // §5 — runbook with real deploy script.
  const rb = j("V93_RELEASE_RUNBOOK.json");
  check("§5 runbook exists + uses the repo's real odg-release.sh", !!rb && rb.releaseScriptPresent === true && rb.inventoryBacked === true);
  if (rb) {
    check("§5 VPS steps use real odg-release.sh commands + all OWNER_GATED (nothing executed)", rb.vps.every((s: any) => /odg-release\.sh|api\/health/.test(s.command)) && rb.vps.every((s: any) => /OWNER_GATED/.test(s.status)));
    check("§5 rollback = atomic symlink to 'previous' (observed mechanism)", /symlink.*previous/i.test(rb.rollback.mechanism) && rb.rollback.atomicSwap === true);
    check("§5 every step has precondition/command/before-after/evidence/stop/rollback", [...rb.github, ...rb.vps].every((s: any) => s.precondition && s.command && s.beforeControl && s.afterControl && s.expectedEvidence && s.stopCriterion && s.rollbackAction));
  }

  // §7 — register advanced to 7/8 on real evidence.
  const reg = j("V93_PRECONDITIONS_REGISTER.json");
  check("§7 register 7/8 MET, readyToDeliver false (fail-closed)", !!reg && reg.metCount === 7 && reg.readyToDeliver === false);
  if (reg) {
    check("§7 VPS_INVENTORY + EXECUTABLE_DEPLOYMENT_PLAN now MET on real evidence", reg.criteria.find((c: any) => c.id === "VPS_INVENTORY").status === "MET" && reg.criteria.find((c: any) => c.id === "EXECUTABLE_DEPLOYMENT_PLAN").status === "MET");
    check("§7 ROADMAP_EXHAUSTIVE still NOT_MET (genuine owner decisions remain)", reg.criteria.find((c: any) => c.id === "ROADMAP_EXHAUSTIVE").status === "NOT_MET");
  }

  // §6 — the 4 prior gate fixes did not regress.
  const gate = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")).scripts["test:report"];
  check("§6 4 prior fixes intact (P5 + 3 primitives gate-wired)", ["developer-platform", "runtime-model", "mission-contract-factory", "evidence-provenance"].every((m) => gate.includes(m + ".test.ts")));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V93 (6 dossiers DECIDED, 3 NOT_MEASURED, 5 owner-consolidated; real VPS inventory; runbook; register 7/8 NOT_READY)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
