#!/usr/bin/env node
"use strict";
/* IMP-M4-DATA-CONTRACTS — data-contract validation; fail-at-layer tripwire; no external platform. */
const Q = require("./odg-data-contract-quality.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const contract = { schema: { id: "string", amount: "number" }, required: ["id", "amount"], referential: { currency: ["EUR", "USD"] } };

function main() {
  const ok = Q.validateBatch({ layer: "silver", contract, records: [{ id: "a", amount: 10, currency: "EUR" }] });
  check("conformant batch ⇒ PASS", ok.verdict === "PASS" && ok.violationCount === 0);

  const bad = Q.validateBatch({ layer: "silver", contract, records: [{ id: "a" }, { id: 1, amount: "x", currency: "GBP" }] });
  check("violations ⇒ FAIL_AT_LAYER (silver), not the dashboard", bad.verdict === "FAIL_AT_LAYER" && bad.failedLayer === "silver" && /TRIPWIRE/.test(bad.note));
  check("detects null-required + schema-type + referential violations", bad.violations.some((v: any) => v.rule === "null/missing required") && bad.violations.some((v: any) => v.rule === "schema type") && bad.violations.some((v: any) => v.rule === "referential integrity"));

  const stale = Q.validateBatch({ layer: "bronze", contract: { ...contract, freshnessMaxMs: 1000 }, records: [{ id: "a", amount: 1, currency: "EUR", __ts: 0 }], nowEpochMs: 5000 });
  check("freshness tripwire fails stale records", stale.verdict === "FAIL_AT_LAYER" && stale.violations.some((v: any) => v.rule === "stale"));

  check("no external data platform integrated (harness only)", bad.externalPlatform.status === "NOT_INTEGRATED");
  check("contract + honesty (harness only; fail the layer)", Q.DATA_CONTRACT_QUALITY_CONTRACT.invariants.some((i: string) => /NO external data platform/.test(i)) && /never silently passes/.test(bad.honesty));
  check("deterministic", JSON.stringify(Q.validateBatch({ layer: "silver", contract, records: [{ id: "a", amount: 10, currency: "EUR" }] })) === JSON.stringify(ok));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — data-contract-quality (IMP-M4: schema/required/freshness/referential; FAIL_AT_LAYER tripwire; no external platform)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
