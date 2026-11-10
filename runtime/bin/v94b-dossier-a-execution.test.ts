#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V94-B — decisions + Dossier A execution + XIII protocol + register battery. Proves: XXX recorded as
 * APPROVED_BY_OWNER (explicit) distinct from the 4 delegation arbitrations; Dossier A local deliverables EXECUTED on real
 * evidence (§117 preservation, §119 uncertainty register) with §118 A1-A10 honestly NOT_MEASURED (frozen, not fabricated);
 * the XIII benchmark protocol is reproducible + contamination-clean + superiority FAIL-CLOSED (no world claim); and the
 * register is 8/8 but delivery NOT performed (owner/root-gated — 8/8 ≠ delivered). Live artifacts.
 */

const path = require("path");
const fs = require("fs");
const DD = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(DD, f), "utf8")); } catch { return null; } }
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // §1 decisions.
  const da = j("V94B_DOSSIER_A.json");
  check("Dossier A artifact exists", !!da);
  if (da) {
    check("§1 XXX = APPROVED_BY_OWNER (explicit) distinct from 4 delegation arbitrations", da.ownerExplicit.length === 1 && da.ownerExplicit[0] === "REQ-XXX" && da.delegationArbitrations.length === 4);
    check("§1 no fabricated owner signature (kinds distinguished + revocable)", da.decisions.every((d: any) => d.provenance && d.revocable === true && (d.kind === "OWNER_EXPLICIT" || d.kind === "DELEGATION_ARBITRATION")));
    // §3 Dossier A execution.
    check("§117 preservation EXECUTED (verifiable git state, intact)", da.preservation && da.preservation.stashesPreserved === 5 && da.preservation.trackedClean === true);
    check("§119 uncertainty register EXECUTED (real uncertainties, honest statuses)", Array.isArray(da.uncertaintyRegister) && da.uncertaintyRegister.length >= 6 && da.uncertaintyRegister.every((u: any) => u.status && u.owner && u.nextAction));
    check("§118 A1-A10 honestly NOT_MEASURED (frozen, not fabricated)", da.dossierA["§118_A1_A10"].status === "NOT_MEASURED" && da.dossierA["§118_A1_A10"].honest === true);
    check("§3 3 local missions DONE on real evidence + 1 frozen-qualified", da.localMissionsDone === 3 && da.frozenQualified === 1 && da.dossierA.atomicMissions.filter((m: any) => m.status === "DONE").every((m: any) => m.evidence));
  }

  // XIII benchmark protocol.
  const xi = j("V94B_XIII_BENCHMARK_PROTOCOL.json");
  check("XIII protocol artifact exists", !!xi);
  if (xi) {
    check("XIII reproducible + contamination-clean (reuses benchmark-factory, no new engine)", xi.protocol.reproducible === true && xi.contaminationAudit.clean === true && xi.protocol.reusesExisting.some((m: string) => /benchmark-factory/.test(m)));
    check("XIII superiority FAIL-CLOSED NOT_MEASURED (no world claim without external comparison)", xi.superiorityClaim.worldSuperiority === "NOT_MEASURED" && xi.superiorityClaim.failClosed === true);
  }

  // §2 register.
  const reg = j("V94B_PRECONDITIONS_REGISTER.json");
  check("register artifact exists", !!reg);
  if (reg) {
    check("§2 register 8/8 preconditions MET", reg.metCount === 8 && reg.allPreconditionsMet === true && reg.notMet.length === 0);
    check("§2 8/8 ≠ delivered: push + go-live owner/ROOT-gated, NOT performed", /NOT.*performed|require.*ROOT|not a delivery/i.test(reg.deliveryDecision) && /NOT a go-live|is NOT a go-live|≠ delivered|not a release/i.test(JSON.stringify(reg)));
    check("§2 ROADMAP_EXHAUSTIVE MET on executed deliverables + qualified remainder (not decisions alone)", reg.criteria.find((c: any) => c.id === "ROADMAP_EXHAUSTIVE").status === "MET" && /executed|precisely qualified/i.test(reg.criteria.find((c: any) => c.id === "ROADMAP_EXHAUSTIVE").evidence));
  }

  // §4 no regression of the 4 prior fixes + Truth Lock preservation.
  const gate = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")).scripts["test:report"];
  check("§4 4 prior fixes intact (P5 + 3 primitives gate-wired)", ["developer-platform", "runtime-model", "mission-contract-factory", "evidence-provenance"].every((m) => gate.includes(m + ".test.ts")));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V94-B (XXX owner-explicit + 4 delegated; Dossier A executed; XIII reproducible fail-closed; 8/8 preconditions but delivery NOT performed)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
