#!/usr/bin/env node
"use strict";
/* IMP-P15-SAGA-REF — saga compensation reverse order; unsafe flagged; runtime REJECTED; composes existing. */
const S = require("./odg-saga-idempotency-reference.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const steps = [{ id: "a", hasCompensation: true }, { id: "b", hasCompensation: true }, { id: "c", hasCompensation: true }];
  const ok = S.planSaga(steps, null);
  check("no failure ⇒ COMMITTED, no compensations", ok.outcome === "COMMITTED" && ok.compensations.length === 0);

  const fail = S.planSaga(steps, 2); // c fails ⇒ compensate b then a (reverse of completed)
  check("failure ⇒ compensate completed steps in REVERSE order (b, a)", fail.outcome === "COMPENSATED" && fail.compensations.map((c: any) => c.id).join(",") === "b,a" && fail.failedStep === "c");

  const gap = S.planSaga([{ id: "a", hasCompensation: true }, { id: "b", hasCompensation: false }, { id: "c", hasCompensation: true }], 2);
  check("step without compensation ⇒ flagged UNSAFE (MANUAL_INTERVENTION), not ignored", gap.outcome === "COMPENSATED_WITH_GAPS" && gap.unsafeSteps.includes("b"));

  check("durable-execution runtime REJECTED/OWNER_GATED; composes existing, no 2nd engine", fail.runtime.status === "REJECTED" && /no 2nd engine/.test(fail.runtime.reason));
  check("contract + honesty (reference; reverse compensation; runtime rejected)", S.SAGA_IDEMPOTENCY_REFERENCE_CONTRACT.invariants.some((i: string) => /REJECTED\/OWNER_GATED/.test(i)) && /compensated in REVERSE/.test(fail.honesty));
  check("deterministic", JSON.stringify(S.planSaga(steps, 2)) === JSON.stringify(fail));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — saga-idempotency-reference (IMP-P15: reverse-order compensation; unsafe steps flagged; durable-execution runtime REJECTED; composes existing)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
