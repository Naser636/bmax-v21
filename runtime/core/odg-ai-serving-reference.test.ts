#!/usr/bin/env node
"use strict";
/* IMP-P13-SERVING-REF — serving-readiness reference checklist; provisioning REJECTED/OWNER_GATED. */
const S = require("./odg-ai-serving-reference.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const complete = S.assess({ declared: { honestLatency: true, batching: true, autoscaling: true, modelVersioning: true, observability: true, resourceLimits: true } });
  check("all checklist items ⇒ REFERENCE_COMPLETE (readiness, not a running service)", complete.readiness === "REFERENCE_COMPLETE" && complete.satisfied === 6);
  check("provisioning REJECTED/OWNER_GATED (ODG not a serving runtime)", complete.provisioning.status === "REJECTED" && /not a model-serving runtime/i.test(complete.provisioning.reason));
  const partial = S.assess({ declared: { batching: true } });
  check("partial declaration ⇒ REFERENCE_INCOMPLETE", partial.readiness === "REFERENCE_INCOMPLETE" && partial.satisfied === 1);
  check("empty ⇒ nothing satisfied (deny-by-default)", S.assess({}).satisfied === 0);
  check("contract + honesty (checklist only; simulated≠measured)", S.AI_SERVING_REFERENCE_CONTRACT.invariants.some((i: string) => /reference checklist ONLY/.test(i)) && /never passed as measured/.test(complete.honesty));
  check("deterministic", JSON.stringify(S.assess({})) === JSON.stringify(S.assess({})));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — ai-serving-reference (IMP-P13: readiness checklist; provisioning REJECTED/OWNER_GATED; simulated≠measured)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
