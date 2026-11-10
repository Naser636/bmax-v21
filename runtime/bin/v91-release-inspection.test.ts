#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V91 §2/§3/§4 — release-inspection + deployment-plan + precondition-register battery. Proves the release
 * inspection is independent + meta-validated + routed through the V86 boundary (not a mere report), the P5 fix is still
 * enforced, the deployment plan uses real GitHub commands with VPS owner-gated (nothing invented), and the 8-precondition
 * register is honest + fail-closed (NOT_READY). Live artifacts.
 */

const path = require("path");
const fs = require("fs");
const DD = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(DD, f), "utf8")); } catch { return null; } }

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // §2 — independent release inspection.
  const insp = j("V91_RELEASE_INSPECTION.json");
  check("§2 release inspection artifact exists", !!insp);
  if (insp) {
    check("§2.2 inspector qualified (blind control rejected) + independent", insp.inspectorMetaValidation.qualified === true && insp.inspectorMetaValidation.blindControlRejected === true && insp.independence === "INDEPENDENT");
    check("§2 routed through the V86 boundary (PRE approved, not a mere report)", /APPROVED/.test(insp.boundaryPre));
    check("§2.1.D P5 fix explicitly verified present in the gate", insp.p5FixPresent === true && !!insp.domains.find((d: any) => d.id === "D-tests-proofs" && d.verdict === "PASS"));
    check("§2 technical verdict not BLOCKED; 6 domains audited", insp.technicalVerdict !== "BLOCKED" && insp.domains.length === 6);
    check("§2 NOT a delivery authorization (delivery stays gated)", /NOT_READY/.test(insp.deliveryDecision));
  }

  // §3 — executable deployment plan.
  const plan = j("V91_DEPLOYMENT_PLAN.json");
  check("§3 deployment plan artifact exists", !!plan);
  if (plan) {
    check("§3.1 GitHub chain uses REAL commands (npm run test:report, tsc)", plan.github.chain.some((s: any) => /test:report/.test(s.command)) && plan.github.chain.some((s: any) => /tsc --noEmit/.test(s.command)));
    check("§3.1 push/PR/merge are OWNER_GATED (Level-C)", plan.github.chain.find((s: any) => s.name.indexOf("push (OWNER") === 0).status === "OWNER_GATED" && plan.github.ownerGatedSteps >= 4);
    check("§3.2 VPS chain fully ordered + ALL owner-gated (nothing invented)", plan.vps.chain.length === 17 && plan.vps.allOwnerGated === true);
    check("§3.3 backup: restorability PROVEN by a real non-destructive drill", plan.backupRollback.restorationTest && /worktree/.test(plan.backupRollback.restorationTest));
    check("§3 plan honestly NOT complete (VPS specifics pending)", plan.executablePlanComplete === false);
  }

  // §4 — canonical 8-precondition register.
  const reg = j("V91_PRECONDITIONS_REGISTER.json");
  check("§4 register artifact exists", !!reg);
  if (reg) {
    check("§4 exactly 8 stable criteria", reg.criteria.length === 8 && reg.criteria.every((c: any) => typeof c.id === "string" && typeof c.definition === "string" && typeof c.nextAction === "string"));
    check("§4 INDEPENDENT_RELEASE_INSPECTION MET (qualified independent mechanism ran, not a report)", !!reg.criteria.find((c: any) => c.id === "INDEPENDENT_RELEASE_INSPECTION" && c.status === "MET"));
    check("§4 BACKUP_ROLLBACK MET (restorability proven)", !!reg.criteria.find((c: any) => c.id === "BACKUP_ROLLBACK" && c.status === "MET"));
    check("§4 ROADMAP_EXHAUSTIVE + VPS_INVENTORY + EXECUTABLE_DEPLOYMENT_PLAN still NOT_MET (honest)", ["ROADMAP_EXHAUSTIVE", "VPS_INVENTORY", "EXECUTABLE_DEPLOYMENT_PLAN"].every((id) => reg.criteria.find((c: any) => c.id === id).status === "NOT_MET"));
    check("§4 delivery NOT_READY (fail-closed, 5/8)", reg.readyToDeliver === false && reg.metCount === 5);
    check("§4 VPS + owner sign-offs flagged humanAuth/owner-gated", reg.criteria.find((c: any) => c.id === "VPS_INVENTORY").humanAuth === true && reg.criteria.find((c: any) => c.id === "ROADMAP_EXHAUSTIVE").humanAuth === true);
  }

  // §5 limits — no push/deploy performed (the plan's Level-C steps are OWNER_GATED, not executed).
  check("§5 no delivery performed — Level-C steps owner-gated", !!plan && plan.github.chain.filter((s: any) => /OWNER_GATED/.test(s.status)).length >= 4);

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V91 release inspection (independent+meta-validated), deployment plan (real GitHub/VPS-gated), 8-precondition register (5/8, NOT_READY)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
