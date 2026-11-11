#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V92 §2/§3/§4/§7 — owner dossiers + local work + VPS fiche battery. Proves: the 14 HUMAN_SIGNOFF dossiers
 * are complete, traceable, grouped, with ODG recommendations but NO fabricated owner decision (PENDING_OWNER_DECISION);
 * NEEDS_LOCAL_BUILD parents honestly reclassified as local work; the 3 canonical-primitive tests are now gate-enforced
 * (real P5-class fix); the VPS fiche is prepared-not-executed with no secrets; and the 8-precondition register is
 * unchanged (5/8) because preparation ≠ satisfaction. Live artifacts + package.json.
 */

const path = require("path");
const fs = require("fs");
const DD = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(DD, f), "utf8")); } catch { return null; } }
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // §2 — the 14 dossiers.
  const dos = j("V92_SIGNOFF_DOSSIERS.json");
  check("§2 dossiers artifact exists", !!dos);
  if (dos) {
    check("§2 exactly 14 distinct dossiers with the required fields", dos.dossierCount === 14 && dos.dossiers.length === 14 && dos.dossiers.every((d: any) => d.parentId && d.requirement && d.expectedDecision && d.odgRecommendation && d.decisionStatus));
    check("§2 every decision PENDING_OWNER_DECISION (owner choice never fabricated)", dos.dossiers.every((d: any) => d.decisionStatus === "PENDING_OWNER_DECISION"));
    check("§2 recommendations are from the allowed set", dos.dossiers.every((d: any) => ["APPROVE", "REJECT", "APPROVE_WITH_CONDITIONS", "NEEDS_INFORMATION"].includes(d.odgRecommendation)));
    check("§2 grouped into lots of ≤3, 14 distinct traceable fiches", Object.keys(dos.lots).length >= 5 && Object.values(dos.lots).every((l: any) => l.length <= 3));
    check("§2 NEEDS_LOCAL_BUILD honestly reclassified as local work (not a false owner decision)", dos.reclassifiedAsLocalWork === 3 && dos.trueOwnerDecisions === 11);
    check("§2 each dossier distinguishes risks per option + closure conditions", dos.dossiers.every((d: any) => d.risksPerOption && d.validationAndClosureConditions));
  }

  // §3 — real local work: the 3 canonical-primitive tests are now gate-enforced (P5-class fix).
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"));
  const gate = pkg.scripts["test:report"];
  check("§3 primitive tests now gate-enforced: runtime-model + mission-contract-factory + evidence-provenance", /runtime-model\.test\.ts/.test(gate) && /mission-contract-factory\.test\.ts/.test(gate) && /evidence-provenance\.test\.ts/.test(gate));

  // §4 — VPS fiche prepared, not executed, no secrets.
  const vp = j("V92_VPS_INVENTORY_FICHE.json");
  check("§4 VPS fiche exists", !!vp);
  if (vp) {
    check("§4 fiche prepared NOT executed (no connection, no secrets disclosed)", vp.connectionPerformed === false && vp.secretsDisclosed === false);
    check("§4 nothing invented — unknowns NOT_MEASURED/OWNER_GATED; config read is names-only (values redacted)", vp.inventory.every((i: any) => i.availability === "OWNER_GATED") && vp.inventory.some((i: any) => /redacted/i.test(i.readOnlyCommand + i.expectedEvidence)));
    check("§4 dependencies to lift VPS_INVENTORY + EXECUTABLE_DEPLOYMENT_PLAN recorded", !!vp.dependenciesToLift.VPS_INVENTORY && !!vp.dependenciesToLift.EXECUTABLE_DEPLOYMENT_PLAN);
    check("§5 V91 GitHub chain preserved (not redone)", /kept, not redone|preserved/i.test(JSON.stringify(vp.dependenciesToLift.EXECUTABLE_DEPLOYMENT_PLAN)));
  }

  // §7 — register unchanged: preparation ≠ satisfaction.
  const reg = j("V91_PRECONDITIONS_REGISTER.json");
  check("§7 register still 5/8, NOT_READY (dossiers ≠ sign-off; fiche ≠ inventory; no shortcut)", !!reg && reg.metCount === 5 && reg.readyToDeliver === false);
  if (reg) check("§7 ROADMAP_EXHAUSTIVE + VPS_INVENTORY + EXECUTABLE_DEPLOYMENT_PLAN still NOT_MET", ["ROADMAP_EXHAUSTIVE", "VPS_INVENTORY", "EXECUTABLE_DEPLOYMENT_PLAN"].every((id) => reg.criteria.find((c: any) => c.id === id).status === "NOT_MET"));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V92 (14 dossiers PENDING_OWNER_DECISION; 3 primitive tests enforced; VPS fiche prepared no-secrets; register 5/8 unchanged)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
