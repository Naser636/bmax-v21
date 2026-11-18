#!/usr/bin/env node
"use strict";
/* V205 — consolidated production-gate matrix. Proves: composes the real gates; deny-by-default (NOT production-ready);
 * 16 contracts BLOCKED + sandbox OWNER_GATED; deploy gate flips READY with satisfied artifacts; exact owner actions;
 * changes no status; deterministic. */
const M = require("./odg-production-gate-matrix.js");
const fs = require("fs");
const path = require("path");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

// an 8/8 + all-markers C6 evidence record (what the real isolated child produced)
const C6_PATH = "docs/odg/c6-certification-evidence.json";
function certifiedEvidence(): any {
  return { results: { tests: [1,2,3,4,5,6,7,8].map((n) => ({ n, pass: true, evidence: "proof-" + n })),
    session: { netnsOnlyLo: true, canonicalInvisible: true, workWritable: true, noAnthropicKey: true } } };
}
function c6Reader(obj: any) { return (p: string): string | null => (p === C6_PATH ? JSON.stringify(obj) : null); }

// a readFile that satisfies ALL deploy-package REQUIRED artifacts (so the deploy gate can flip READY)
function satisfyingReadFile(p: string): string | null {
  if (/odg-stage-and-verify\.sh$/.test(p)) return "set -euo pipefail\nbuild: true\nNo service was restarted\n";
  if (/odg-rollback\.sh$/.test(p)) return "set -euo pipefail\nno force\n";
  if (/odg\.service\.template$/.test(p)) return "[Unit]\n[Service]\n[Install]\n<REPO_ABS_PATH>\nNoNewPrivileges=true\n";
  if (/README\.md$/.test(p)) return "ONE root sudo systemctl ... denies `sudo`\n";
  return null;
}

function main() {
  // deny-by-default: no facts ⇒ not production-ready, gates fail-closed
  const m = M.productionGateMatrix({ fileExists: () => false });
  check("5 gates reconciled from the real modules", m.gates.length === 5 && ["improvement-contracts", "sandbox-certification", "deploy-package", "dashboard-exposure", "iso-certification"].every((id) => m.gates.find((g: any) => g.id === id)));
  check("deny-by-default ⇒ NOT production-ready", m.productionReady === false && /NOT production-ready/.test(m.headline));
  check("16 contracts gate BLOCKED_AWAITING_ISOLATION", m.gates.find((g: any) => g.id === "improvement-contracts").status === "BLOCKED_AWAITING_ISOLATION" && /16 contracts/.test(m.gates.find((g: any) => g.id === "improvement-contracts").detail));
  check("sandbox certification OWNER_GATED when NO C6 evidence readable (deny-by-default)", m.gates.find((g: any) => g.id === "sandbox-certification").status === "OWNER_GATED" && /8 in-session certification tests/.test(m.gates.find((g: any) => g.id === "sandbox-certification").remainingAction));
  check("dashboard exposure NOT_READY (deny-by-default, no controls)", m.gates.find((g: any) => g.id === "dashboard-exposure").status === "NOT_READY");
  check("ISO certification NOT_READY (no operational evidence)", m.gates.find((g: any) => g.id === "iso-certification").status === "NOT_READY");
  check("owner-gated actions enumerated with exact remaining action", m.ownerGatedActions.length >= 2 && m.ownerGatedActions.every((a: any) => a.gate && a.action) && m.ownerGatedActions.some((a: any) => a.gate === "sandbox-certification"));

  // deploy gate flips READY when the prepared artifacts are present + safe (local, buildable)
  const m2 = M.productionGateMatrix({ fileExists: () => false, deployPackage: { root: "/x", readFile: satisfyingReadFile } });
  check("deploy-package gate ⇒ READY when artifacts present+safe; deploys nothing", m2.gates.find((g: any) => g.id === "deploy-package").status === "READY" && m2.gates.find((g: any) => g.id === "deploy-package").deployedAnything === false);
  check("still NOT production-ready (contracts+sandbox+exposure+iso remain)", m2.productionReady === false);

  // EVIDENCE-DRIVEN sandbox gate: certified 8/8 + markers ⇒ READY, but production STILL not ready (exposure/iso/contracts)
  const m3 = M.productionGateMatrix({ fileExists: () => false, readFile: c6Reader(certifiedEvidence()) });
  const sg3 = m3.gates.find((g: any) => g.id === "sandbox-certification");
  check("sandbox ⇒ READY when the ingested C6 evidence certifies (8/8 + markers)", sg3.status === "READY" && sg3.ownerGated === false && /CERTIFIED from real in-session evidence/.test(sg3.detail));
  check("C6 certified does NOT force production-ready (exposure/iso/contracts still gate)", m3.productionReady === false);

  // TEETH — deny-by-default: a tampered record (one test flipped, or a marker false) must NOT certify
  const tamperTest = certifiedEvidence(); tamperTest.results.tests[4].pass = false; // test n=5 fails
  check("teeth: a FAILED canonical test ⇒ sandbox stays OWNER_GATED (not certified)", M.productionGateMatrix({ fileExists: () => false, readFile: c6Reader(tamperTest) }).gates.find((g: any) => g.id === "sandbox-certification").status === "OWNER_GATED");
  const tamperMarker = certifiedEvidence(); tamperMarker.results.session.noAnthropicKey = false;
  check("teeth: a FALSE isolation marker ⇒ sandbox stays OWNER_GATED (not certified)", M.productionGateMatrix({ fileExists: () => false, readFile: c6Reader(tamperMarker) }).gates.find((g: any) => g.id === "sandbox-certification").status === "OWNER_GATED");

  // the REAL committed record must certify (proves the shipped evidence is valid, not a stub)
  const realReader = (p: string): string | null => (p === C6_PATH ? fs.readFileSync(path.join(__dirname, "..", "..", C6_PATH), "utf8") : null);
  const mReal = M.productionGateMatrix({ fileExists: () => false, readFile: realReader });
  check("the COMMITTED docs/odg/c6-certification-evidence.json certifies ⇒ sandbox READY", mReal.gates.find((g: any) => g.id === "sandbox-certification").status === "READY");

  // REGISTER-DRIVEN improvement-contracts: all modules present ⇒ READY; a missing module ⇒ BLOCKED (teeth)
  const mC = M.productionGateMatrix({ fileExists: () => true });
  check("improvement-contracts ⇒ READY when every contract module+test exists (register-driven)", mC.gates.find((g: any) => g.id === "improvement-contracts").status === "READY" && /BUILT \+ TESTED/.test(mC.gates.find((g: any) => g.id === "improvement-contracts").detail));
  const mCmiss = M.productionGateMatrix({ fileExists: (p: string) => !/odg-dora-metrics-view\.ts$/.test(p) });
  check("teeth: one missing contract module ⇒ improvement-contracts BLOCKED (fail-closed)", mCmiss.gates.find((g: any) => g.id === "improvement-contracts").status === "BLOCKED_AWAITING_ISOLATION");

  // STRONGEST cannot-force-GO: satisfy EVERY satisfiable gate at once (contracts+sandbox+deploy) — production STILL not ready
  const mAll = M.productionGateMatrix({ fileExists: () => true, readFile: c6Reader(certifiedEvidence()), deployPackage: { root: "/x", readFile: satisfyingReadFile } });
  const st = (id: string) => mAll.gates.find((g: any) => g.id === id).status;
  check("every satisfiable gate READY (contracts+sandbox+deploy) yet productionReady STILL false (exposure+iso owner/external)", st("improvement-contracts") === "READY" && st("sandbox-certification") === "READY" && st("deploy-package") === "READY" && st("dashboard-exposure") === "NOT_READY" && st("iso-certification") === "NOT_READY" && mAll.productionReady === false);

  check("contract: composes existing gates, deny-by-default, evidence-driven sandbox, read-only, honesty ladder", M.PRODUCTION_GATE_MATRIX_CONTRACT.invariants.some((i: string) => /no new primitive\/engine\/registry/.test(i)) && M.PRODUCTION_GATE_MATRIX_CONTRACT.invariants.some((i: string) => /EVIDENCE-DRIVEN/.test(i)) && M.PRODUCTION_GATE_MATRIX_CONTRACT.invariants.some((i: string) => /read-only/.test(i)) && M.PRODUCTION_GATE_MATRIX_CONTRACT.invariants.some((i: string) => /DOCUMENTED ≠ BUILT/.test(i)));
  check("deterministic + frozen", JSON.stringify(M.productionGateMatrix({ fileExists: () => false }).byStatus) === JSON.stringify(m.byStatus) && Object.isFrozen(m) && Object.isFrozen(m.gates));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — production-gate-matrix (V205/V313: 5 real gates; deny-by-default NOT production-ready; sandbox is EVIDENCE-DRIVEN via the canonical C6 ingest [certified 8/8+markers ⇒ READY, tamper/absent ⇒ OWNER_GATED] and a real C6 PASS does NOT force production-ready; exposure/iso NOT_READY; deploy flips READY with safe artifacts, deploys nothing; read-only, composes existing)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
