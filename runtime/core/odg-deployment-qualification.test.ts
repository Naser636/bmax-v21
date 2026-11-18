#!/usr/bin/env node
"use strict";
/* CTO addendum — pre-deployment GO/NO-GO qualification. Asserts: 12 mandated controls each carry an explicit status;
 * deny-by-default (empty facts ⇒ all critical NOT_MEASURED ⇒ NO_GO, GO never by omission); a single critical
 * FAIL/BLOCKED ⇒ NO_GO; GO requires ALL critical PASS/NA AND production-gate-matrix production-ready; owner decision
 * always required; composes the real odg-production-gate-matrix; deterministic + frozen. Real component, no mocks. */
const Q = require("./odg-deployment-qualification.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

// build a controls fact map where every control has the given status.
function allControls(status: string): any { const o: any = {}; for (const id of Q.CONTROL_IDS) o[id] = { status, evidence: "e", reference: "r" }; return o; }
// facts that make the composed production-gate-matrix production-ready (satisfy deploy-package + exposure + cert).
function readyGates(): any {
  const satisfyingReadFile = (p: string): string | null => {
    if (/odg-stage-and-verify\.sh$/.test(p)) return "set -euo pipefail\nbuild: true\nNo service was restarted\n";
    if (/odg-rollback\.sh$/.test(p)) return "set -euo pipefail\nno force\n";
    if (/odg\.service\.template$/.test(p)) return "[Unit]\n[Service]\n[Install]\n<REPO_ABS_PATH>\nNoNewPrivileges=true\n";
    if (/README\.md$/.test(p)) return "ONE root sudo systemctl ... denies `sudo`\n";
    return null;
  };
  return {
    fileExists: () => true,
    deployPackage: { root: "/repo", readFile: satisfyingReadFile },
    exposure: { tlsConfigured: true, reverseProxyConfigured: true, firewallConfigured: true, authConfigured: true, healthcheckConfigured: true, backupConfigured: true },
    certification: { gatedSuites: [], evidence: true, dossier: true, now: "2026-11-18" },
  };
}

function main() {
  // deny-by-default: empty facts ⇒ every control NOT_MEASURED ⇒ NO_GO.
  const empty = Q.qualify({});
  check("12 controls, each with an explicit status from the enum", empty.controls.length === 12 && empty.controls.every((c: any) => Q.STATUS.includes(c.status)));
  check("deny-by-default: no evidence ⇒ all NOT_MEASURED ⇒ NO_GO (GO never by omission)", empty.controls.every((c: any) => c.status === "NOT_MEASURED") && empty.verdict === "NO_GO");
  check("owner decision ALWAYS required", empty.ownerDecisionRequired === true);
  check("blockers list every critical NOT_MEASURED control", empty.blockers.length === Q.CONTROLS.filter((c: any) => c.critical).length);

  // a single critical BLOCKED ⇒ NO_GO even if all else PASS and gates ready.
  const oneBlocked = allControls("PASS"); oneBlocked.C7_DATA_RECOVERY = { status: "BLOCKED", evidence: "backup not verifiable", reference: "V289" };
  const rBlocked = Q.qualify({ controls: oneBlocked, gates: readyGates() });
  check("a single CRITICAL BLOCKED control ⇒ NO_GO (not masked by other PASS)", rBlocked.verdict === "NO_GO" && rBlocked.blockers.some((b: any) => b.id === "C7_DATA_RECOVERY" && b.status === "BLOCKED"));

  // a single FAIL ⇒ NO_GO.
  const oneFail = allControls("PASS"); oneFail.C2_TEST_SUITES = { status: "FAIL" };
  check("any FAIL ⇒ NO_GO", Q.qualify({ controls: oneFail, gates: readyGates() }).verdict === "NO_GO");

  // control-side logic: all criticals PASS + a non-critical NOT_MEASURED ⇒ the 12-control side is SATISFIED.
  const nonCrit = allControls("PASS"); nonCrit.C5_DORMANT_INVENTORY = { status: "NOT_MEASURED" };
  const rNonCrit = Q.qualify({ controls: nonCrit, gates: readyGates() });
  check("control-side satisfied when every CRITICAL is PASS/NA (a non-critical NOT_MEASURED does not unmeet it)", rNonCrit.controlsSatisfied === true);

  // HONEST SAFETY POSTURE: the composed V205 gate matrix has two permanently non-READY gates (improvement-contracts
  // BLOCKED + sandbox-certification OWNER_GATED), so productionReady can never be true today ⇒ GO is UNREACHABLE even
  // with all 12 controls PASS. The qualification correctly returns NO_GO (deploy stays gated on the owner's gates).
  const goControls = allControls("PASS"); goControls.C5_DORMANT_INVENTORY = { status: "NOT_APPLICABLE" };
  const rGo = Q.qualify({ controls: goControls, gates: readyGates() });
  check("all 12 controls PASS/NA ⇒ control-side satisfied, BUT gate-matrix blocks ⇒ still NO_GO (GO unreachable until owner resolves contracts/sandbox gates)", rGo.controlsSatisfied === true && rGo.gatesProductionReady === false && rGo.verdict === "NO_GO");

  // GO is blocked when criticals PASS but the composed gate matrix is NOT production-ready (deny via gates).
  const rGatesNotReady = Q.qualify({ controls: allControls("PASS") });   // no gate facts ⇒ matrix not ready
  check("criticals PASS but gate-matrix NOT production-ready ⇒ NO_GO (composition enforced)", rGatesNotReady.verdict === "NO_GO" && rGatesNotReady.productionGateMatrix.productionReady === false);

  // composes the real production-gate-matrix (headline surfaced).
  check("composes odg-production-gate-matrix (headline + ownerGatedActions surfaced)", typeof empty.productionGateMatrix.headline === "string" && Array.isArray(empty.productionGateMatrix.ownerGatedActions));

  // determinism + frozen + contract.
  check("deterministic + frozen", JSON.stringify(Q.qualify({})) === JSON.stringify(empty) && Object.isFrozen(empty) && Object.isFrozen(Q.CONTROLS));
  check("contract: deny-by-default + GO-never-by-omission + owner-final + composes-existing + no-new-chain invariants", Q.DEPLOYMENT_QUALIFICATION_CONTRACT.invariants.some((i: string) => /deny-by-default/.test(i)) && Q.DEPLOYMENT_QUALIFICATION_CONTRACT.invariants.some((i: string) => /NEVER reachable by omission/.test(i)) && Q.DEPLOYMENT_QUALIFICATION_CONTRACT.invariants.some((i: string) => /OWNER always retains/.test(i)) && Q.DEPLOYMENT_QUALIFICATION_CONTRACT.invariants.some((i: string) => /no parallel governance chain/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-deployment-qualification (CTO addendum: 12-control GO/NO-GO, explicit statuses, deny-by-default [GO never by omission], single critical FAIL/BLOCKED ⇒ NO_GO, GO requires all-critical-PASS + production-gate-matrix ready, owner keeps final decision; composes V205 gate matrix — no new primitive/chain; deterministic/read-only)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
