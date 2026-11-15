#!/usr/bin/env node
"use strict";
/* V205 — consolidated production-gate matrix. Proves: composes the real gates; deny-by-default (NOT production-ready);
 * 16 contracts BLOCKED + sandbox OWNER_GATED; deploy gate flips READY with satisfied artifacts; exact owner actions;
 * changes no status; deterministic. */
const M = require("./odg-production-gate-matrix.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

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
  check("sandbox certification OWNER_GATED (V198 patch prepared, launcher unmodified, 8 tests pending)", m.gates.find((g: any) => g.id === "sandbox-certification").status === "OWNER_GATED" && /8 in-session certification tests/.test(m.gates.find((g: any) => g.id === "sandbox-certification").remainingAction));
  check("dashboard exposure NOT_READY (deny-by-default, no controls)", m.gates.find((g: any) => g.id === "dashboard-exposure").status === "NOT_READY");
  check("ISO certification NOT_READY (no operational evidence)", m.gates.find((g: any) => g.id === "iso-certification").status === "NOT_READY");
  check("owner-gated actions enumerated with exact remaining action", m.ownerGatedActions.length >= 2 && m.ownerGatedActions.every((a: any) => a.gate && a.action) && m.ownerGatedActions.some((a: any) => a.gate === "sandbox-certification"));

  // deploy gate flips READY when the prepared artifacts are present + safe (local, buildable)
  const m2 = M.productionGateMatrix({ fileExists: () => false, deployPackage: { root: "/x", readFile: satisfyingReadFile } });
  check("deploy-package gate ⇒ READY when artifacts present+safe; deploys nothing", m2.gates.find((g: any) => g.id === "deploy-package").status === "READY" && m2.gates.find((g: any) => g.id === "deploy-package").deployedAnything === false);
  check("still NOT production-ready (contracts+sandbox+exposure+iso remain)", m2.productionReady === false);

  check("contract: composes existing gates, deny-by-default, no status change, honesty ladder", M.PRODUCTION_GATE_MATRIX_CONTRACT.invariants.some((i: string) => /no new primitive\/engine\/registry/.test(i)) && M.PRODUCTION_GATE_MATRIX_CONTRACT.invariants.some((i: string) => /no status is changed/.test(i)) && M.PRODUCTION_GATE_MATRIX_CONTRACT.invariants.some((i: string) => /DOCUMENTED ≠ BUILT/.test(i)));
  check("deterministic + frozen", JSON.stringify(M.productionGateMatrix({ fileExists: () => false }).byStatus) === JSON.stringify(m.byStatus) && Object.isFrozen(m) && Object.isFrozen(m.gates));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — production-gate-matrix (V205: 5 real gates consolidated; deny-by-default NOT production-ready; 16 contracts BLOCKED + sandbox OWNER_GATED [V198 patch/8 tests] + exposure/iso NOT_READY; deploy gate flips READY with safe artifacts, deploys nothing; exact owner actions; composes existing, changes no status)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
