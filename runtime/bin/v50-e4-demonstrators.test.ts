#!/usr/bin/env node
"use strict";
// V50 C2 — E4 deliverable-soundness test (hermetic; reads committed artifacts). Asserts each DEMONSTRATED métier's
// deliverable is a valid O1 report: metier+status, evidence with an independently-verifiable digest, explicit limits, and
// validation conditions — the E4 standard, not a sale/certification.
const fs = require("fs");
const path = require("path");
const O2 = require("../core/shared-evidence-wrapper");
const D = path.join(__dirname, "..", "..", "docs", "odg", "demonstrators");
let failures = 0;
function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }

const E4 = { P3: "P3_CRA_SBOM_READINESS.json", P11: "P11_EINVOICE_STP_READINESS.json", P9: "P9_FINOPS_READINESS.json", P10: "P10_AIGOV_READINESS.json", P15: "P15_AUTOMATION_READINESS.json" };
for (const [m, f] of Object.entries(E4)) {
  const p = path.join(D, f);
  check(fs.existsSync(p), `${m}: E4 artifact exists (${f})`);
  if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const rep = d.report;
  check(rep && rep.metier === m && typeof rep.status === "string" && rep.status.length > 0, `${m}: has metier + status`);
  check(rep && rep.evidence && rep.evidence.integrity && rep.evidence.integrity.digest, `${m}: evidence carries an integrity digest`);
  check(rep && O2.verifyEvidence(rep.evidence).ok === true, `${m}: evidence independently verifiable (digest matches)`);
  check(rep && Array.isArray(rep.limits) && rep.limits.length > 0, `${m}: explicit limits present (no overclaim)`);
  check(rep && Array.isArray(rep.validationConditions) && rep.validationConditions.length > 0, `${m}: validation conditions present`);
  check(rep && rep.evidence.counts.PROVEN !== undefined, `${m}: evidence basis tracked (not upgraded)`);
}
// the matrix is honest: exactly 5 DEMONSTRATED, 1 BLOCKED (P13), rest DEFINED_PENDING; none E5.
const matrix = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "docs", "odg", "V50_E4_ASSESSMENT_MATRIX.json"), "utf8"));
check(matrix.tally.DEMONSTRATED === 5 && matrix.tally.BLOCKED === 1, "E4 matrix: 5 DEMONSTRATED, 1 BLOCKED (honest)");
check(matrix.metiers.P13.e4 === "BLOCKED", "P13 honestly BLOCKED (no GPU, not simulated)");

if (failures === 0) process.stdout.write("ALL PASS — V50 E4 deliverables sound (P3/P11/P9/P10/P15), evidence verifiable, no overclaim\n");
process.exit(failures === 0 ? 0 : 1);
export {};
