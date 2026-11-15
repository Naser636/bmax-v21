#!/usr/bin/env node
"use strict";
/* V195 / V12.4 master-directive reconciliation. Proves: verified canonical Truth-Lock; sandbox NOT_ACTIVE governs blocked
 * work; M&BI + Speed Marketing attached to existing architecture (no duplication, not operational); Extension PARKED. */
const R = require("./odg-master-directive-reconciliation.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const v = R.reconcile();
  check("Truth-Lock: ROADMAP 1.1.0/11 missions + closure 427 + master md exists (verified)", v.truthLock.roadmapJson.contractVersion === "1.1.0" && v.truthLock.roadmapJson.missions === 11 && v.truthLock.closureRegister.items === 427 && v.truthLock.masterRoadmapMd.exists === true && v.truthLock.registersUntouched === true);
  check("master roadmap md: canonical path, do NOT duplicate", /docs\/odg-operational\/ODG_MASTER_ROADMAP_V12\.4\.md/.test(v.truthLock.masterRoadmapMd.path) && /do NOT create a duplicate/.test(v.truthLock.masterRoadmapMd.note));

  check("reference reconciliation distinguishes VERIFIED vs HISTORICAL_UNVERIFIED (not recopied)", v.referenceReconciliation.some((r: any) => r.item === "11 canonical missions" && r.status === "VERIFIED") && v.referenceReconciliation.some((r: any) => r.status === "HISTORICAL_UNVERIFIED") && v.verifiedReferences >= 3);
  check("166 caps = historical/documented (full re-count NOT claimed)", v.referenceReconciliation.find((r: any) => /166/.test(r.item)).status === "HISTORICAL_DOCUMENTED");

  check("sandbox NOT_ACTIVE: exec did not isolate; governs blocked work + V195", v.sandbox.state === "NOT_ACTIVE" && /did NOT isolate/.test(v.sandbox.conclusion) && v.sandbox.governs.some((g: string) => /BLOCKED_AWAITING_ISOLATION/.test(g)) && v.sandbox.governs.some((g: string) => /V195/.test(g)));

  check("M&BI attaches to existing Radar; no 2nd radar/registry", v.newDimensions.some((d: any) => /Market & Business Intelligence/.test(d.dimension) && /EXISTING Radar/.test(d.attachTo) && /no 2nd radar/.test(d.antiDuplication) && /no new primitive/.test(d.primitive)));
  check("Speed Marketing attaches to existing commercial engine; no 2nd CRM/engine", v.newDimensions.some((d: any) => /Speed Marketing/.test(d.dimension) && /EXISTING commercial engine/.test(d.attachTo) && /no 2nd commercial engine/.test(d.antiDuplication)));
  check("both dimensions DOCUMENTED, NOT operational (collection/campaign pending real runs)", v.newDimensions.every((d: any) => /DOCUMENTED/.test(d.status) && /NOT operational/.test(d.status)) && v.newDimensions.every((d: any) => /EXIGENCE/.test(d.traceability) && /ACCEPTATION/.test(d.traceability)));

  check("MBI source catalog = candidates only; paid = OWNER_GATED; pricing NOT_VERIFIED", v.mbiSourceCatalog.length >= 4 && v.mbiSourceCatalog.some((s: any) => /OWNER_GATED/.test(s.status)) && v.mbiSourceCatalog.some((s: any) => s.pricing === "NOT_VERIFIED"));
  check("Extension PARKED (no implicit activation)", /PARKED/.test(v.extensionStatus) && /no implicit activation/.test(v.extensionStatus));

  check("contract invariants: reconcile-not-recopy, sandbox-honest, no-duplication, nothing operational, PARKED", R.MASTER_RECONCILIATION_CONTRACT.invariants.some((i: string) => /reconciled NOT recopied/.test(i)) && R.MASTER_RECONCILIATION_CONTRACT.invariants.some((i: string) => /did NOT isolate/.test(i)) && R.MASTER_RECONCILIATION_CONTRACT.invariants.some((i: string) => /no new primitive\/métier\/campaign\/radar\/memory/.test(i)) && R.MASTER_RECONCILIATION_CONTRACT.invariants.some((i: string) => /no capability declared operational/.test(i)));
  check("deterministic + frozen", JSON.stringify(R.reconcile().headline) === JSON.stringify(v.headline) && Object.isFrozen(v) && Object.isFrozen(R.REFERENCE_RECONCILIATION));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — master-directive-reconciliation (V195/V12.4: canonical Truth-Lock VERIFIED [ROADMAP 1.1.0/11, closure 427, master md]; sandbox NOT_ACTIVE governs blocked work; M&BI + Speed Marketing ATTACHED to existing Radar + commercial engine [DOCUMENTED, not operational, no duplication]; Extension PARKED)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
