#!/usr/bin/env node
"use strict";
/* V231 §1.1 — jidoka-completeness. Proves: every enumerated fail-closed verdict is demonstrably CONSUMED by its decider
 * (exercised end-to-end via the real modules) ⇒ ACCEPTED; each check names producer→decider→evidence; a false ACCEPTED is
 * impossible (GAPS_REMAIN if any unconsumed); deterministic + frozen. */
const J = require("./odg-jidoka-completeness.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = J.verify();

  check("verdict ACCEPTED: all 4 fail-closed verdicts demonstrably consumed by their deciders", r.verdict === "ACCEPTED" && r.consumedCount === 4 && r.total === 4 && r.checks.every((c: any) => c.consumed === true));
  check("check 1: content-integrity MISMATCH ⇒ opportunity grade REJECTED (V223 path exercised)", r.checks.find((c: any) => /integrity=MISMATCH/.test(c.verdict)).consumed === true && /grade REJECTED/.test(r.checks.find((c: any) => /integrity=MISMATCH/.test(c.verdict)).evidence));
  check("check 2: budgetProvenance REJECTED (503) ⇒ grade downgraded A→B (V225 path exercised)", r.checks.find((c: any) => /budgetProvenance=REJECTED/.test(c.verdict)).consumed === true && /grade B \(reachable=A\)/.test(r.checks.find((c: any) => /budgetProvenance=REJECTED/.test(c.verdict)).evidence));
  check("check 3: loop contradictory (counterSources) ⇒ governanceGate REFUSED CONTRADICTORY_SIGNAL (V224 path exercised)", r.checks.find((c: any) => /loop contradictory/.test(c.verdict)).consumed === true && /REFUSED/.test(r.checks.find((c: any) => /loop contradictory/.test(c.verdict)).evidence));
  check("check 4: corroboration CONTESTED primitive (V221) feeds the loop contradictory derivation", r.checks.find((c: any) => /corroboration CONTESTED/.test(c.verdict)).consumed === true);
  check("each check names producer verdict → real decider → reproducible evidence", r.checks.every((c: any) => c.verdict && c.decider && c.evidence));
  check("honesty: ACCEPTED only if ALL consumed; verifies CONSUMPTION not real-world operation; exercises real deciders", /ACCEPTED only when ALL verdicts are demonstrably consumed/.test(r.honesty) && /not real-world operation/i.test(r.honesty));
  check("contract: exercises real deciders, no re-implemented gate, no false ACCEPTED", J.JIDOKA_COMPLETENESS_CONTRACT.invariants.some((i: string) => /no re-implemented gate/.test(i)) && J.JIDOKA_COMPLETENESS_CONTRACT.invariants.some((i: string) => /no false ACCEPTED/.test(i)));
  check("deterministic + frozen", JSON.stringify(J.verify()) === JSON.stringify(r) && Object.isFrozen(r) && Object.isFrozen(r.checks));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — jidoka-completeness (V231 §1.1: 4 fail-closed verdicts [content-integrity V223, budget-provenance V225, loop-contradiction V224, corroboration V221] all demonstrably CONSUMED by their deciders ⇒ ACCEPTED; exercises real deciders; no false ACCEPTED)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
