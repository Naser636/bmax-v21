#!/usr/bin/env node
"use strict";
const assert = require("assert");
const V = require("./validation-campaign");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-VAL-29 — INTEGRATED VALIDATION CAMPAIGN");

const r = V.runValidationCampaign();
check(r.total === 7, "7 cross-métier pipelines validated");
check(r.allDiscriminate === true && r.discriminating === 7, "ALL 7 pipelines discriminate clean vs adversarial (truly integrated, not isolated functions)");
for (const p of r.pipelines) {
  check(p.cleanHealthy === true, `${p.pipeline}: clean ⇒ healthy (${p.cleanVerdict})`);
  check(p.adversarialDegraded === true, `${p.pipeline}: adversarial ⇒ degraded (${p.adversarialVerdict})`);
}
// determinism
check(JSON.stringify(V.runValidationCampaign()) === JSON.stringify(V.runValidationCampaign()), "deterministic validation campaign");

console.log(failures === 0 ? "ALL PASS — WI-VAL-29 VALIDATION CAMPAIGN" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
