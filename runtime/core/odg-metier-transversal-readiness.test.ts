#!/usr/bin/env node
"use strict";
/* Tests for odg-metier-transversal-readiness (V327 §7). Proves the 20-métier roster (reused from odg-program-metier-matrix)
 * maps to the COMMON transversal engines; REUSABLE only when a canonical module is present, else an honest GAP; deployment
 * = configuration of a shared base, no rebuild. Deterministic (injected presence). */
const M = require("./odg-metier-transversal-readiness.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
// a present-set covering ≥1 canonical module per transversal component
const allPresent = ["einvoice-export.ts", "client-intake.ts", "payments.ts", "mission-ledger.ts", "document-pipeline.ts"];

function main(): void {
  const full = M.metierTransversalReadiness(allPresent);
  check("reuses the canonical 20-métier roster (ROSTER20) — exactly 20 métiers", full.ok === true && full.metiersTotal === 20 && full.roster.length === 20);
  check("roster carries P-principal + M-commercial (reused, not rebuilt)", full.roster.some((m: any) => m.id === "P1") && full.roster.some((m: any) => m.id === "M5") && full.roster.every((m: any) => m.category === "PRINCIPAL" || m.category === "COMMERCIAL"));
  check("all 5 transversal engines present ⇒ shared base REUSABLE, deploymentReady", full.sharedBase.allReusable === true && full.deploymentReady === true && full.sharedBase.gaps.length === 0);
  check("deployment note: per-métier CONFIGURATION of the shared base, NOT rebuilding", /per-métier CONFIGURATION/.test(full.note) && /NOT rebuilding/.test(full.note));
  check("the base = billing/clients/payments/tracking/documents (the §7 common engines)", full.sharedBase.components.map((c: any) => c.key).join(",") === "billing,clients,payments,tracking,documents");

  // a missing transversal component ⇒ honest GAP, not deployment-ready
  const noPay = M.metierTransversalReadiness(["einvoice-export.ts", "client-intake.ts", "mission-ledger.ts", "document-pipeline.ts"]);
  check("missing payments module ⇒ GAP 'payments', deploymentReady false (honest)", noPay.sharedBase.gaps.includes("payments") && noPay.deploymentReady === false && /GAP/.test(noPay.note));

  // assessBaseReadiness: a component is REUSABLE iff ≥1 canonical module present
  const base = M.assessBaseReadiness(["odg-crm-account-view.ts"]); // only a clients module
  const clients = base.components.find((c: any) => c.key === "clients");
  check("assessBaseReadiness: clients REUSABLE via odg-crm-account-view; others GAP", clients.reusable === true && clients.present.includes("odg-crm-account-view.ts") && base.gaps.length === 4);
  check("empty presence ⇒ all 5 components GAP (nothing reusable)", M.assessBaseReadiness([]).gaps.length === 5 && M.assessBaseReadiness([]).allReusable === false);

  // fail-closed + frozen + contract
  check("fail-closed: empty roster override ⇒ NO_ROSTER", M.metierTransversalReadiness(allPresent, { roster: [] }).code === "NO_ROSTER");
  check("frozen result", Object.isFrozen(full) && Object.isFrozen(full.sharedBase) && Object.isFrozen(full.roster));
  check("contract: distinct from program-metier-matrix (primitives); reuses ROSTER20; no rebuild",
    M.METIER_TRANSVERSAL_READINESS_CONTRACT.invariants.some((s: string) => /métier→TRANSVERSAL-ENGINES/.test(s)) &&
    M.METIER_TRANSVERSAL_READINESS_CONTRACT.invariants.some((s: string) => /NO per-métier rebuild/.test(s)) &&
    M.METIER_TRANSVERSAL_READINESS_CONTRACT.reuses.some((s: string) => /ROSTER20/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-metier-transversal-readiness (V327 §7: 20-métier roster [reused ROSTER20] × common transversal engines [billing/clients/payments/tracking/documents]; REUSABLE only if a canonical module is present, else honest GAP; all-present ⇒ deployment = per-métier CONFIGURATION of the shared base [no rebuild]; distinct from program-metier-matrix [primitives]; fail-closed/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
