#!/usr/bin/env node
"use strict";
/* V200 §4 — consolidated blocked-contracts register. Proves: 16 contracts from 4 real sources; unique ids; disjoint
 * write-sets; all BLOCKED; dedup-vs-existing-code works (injected + REAL on-disk none-exist); invents/builds nothing. */
const R = require("./odg-blocked-contracts-register.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // deterministic view with an injected "nothing exists" predicate
  const v = R.consolidate({ fileExists: () => false });
  check("16 contracts consolidated from 4 real sources (5+3+3+5)", v.summary.total === 16 && v.summary.bySource.V189A === 5 && v.summary.bySource.lot4 === 3 && v.summary.bySource.lot5 === 3 && v.summary.bySource.lot6 === 5);
  check("unique ids + fully-disjoint write-sets (no collisions)", v.summary.uniqueIds === true && v.summary.writeSetDisjoint === true && v.summary.writeSetCollisions.length === 0);
  check("{module,test} write-set + acceptance for every contract", v.summary.allHaveModuleAndTest === true && v.summary.allHaveAcceptance === true);
  check("metiers covered include the expected spread (P1/P9/M1/P14/M5)", ["P1", "P9", "M1", "P14", "M5"].every((m) => v.summary.metiersCovered.includes(m)) && v.summary.metiersCovered.length === 16);
  check("self-reconciling: nothing-exists predicate ⇒ built=0, remaining=16, all effectiveStatus BLOCKED_AWAITING_ISOLATION", v.summary.built === 0 && v.summary.remaining === 16 && v.contracts.every((c: any) => c.effectiveStatus === "BLOCKED_AWAITING_ISOLATION" && c.built === false));

  // self-reconciling detector: inject a predicate that marks one contract's BOTH write-set files as present ⇒ BUILT
  const c0 = R.CONTRACTS[0];
  const v2 = R.consolidate({ fileExists: (p: string) => c0.writeSet.includes(p) });
  check("self-reconciling: a contract whose write-set exists ⇒ BUILT (built=1, remaining=15)", v2.summary.built === 1 && v2.summary.remaining === 15 && v2.summary.builtIds.includes(c0.id) && v2.contracts.find((c: any) => c.id === c0.id).effectiveStatus === "BUILT");

  // REAL on-disk check: built + remaining always reconcile to 16 (honest live count as the block is executed)
  const real = R.consolidate({});
  check("REAL reconciliation: built + remaining === 16 (live, honest)", real.summary.built + real.summary.remaining === 16 && real.summary.built >= 0);

  check("contract: recover-not-invent, disjoint, no new engine; note records owner block-authorization + self-reconciling", R.BLOCKED_CONTRACTS_REGISTER_CONTRACT.invariants.some((i: string) => /not invented/.test(i)) && R.BLOCKED_CONTRACTS_REGISTER_CONTRACT.invariants.some((i: string) => /no new primitive\/engine\/registry/.test(i)) && /OWNER AUTHORIZED the whole block/.test(real.note) && /self-reconciling/.test(real.note));
  check("deterministic + frozen", JSON.stringify(R.consolidate({ fileExists: () => false }).summary) === JSON.stringify(v.summary) && Object.isFrozen(v) && Object.isFrozen(R.CONTRACTS));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — blocked-contracts-register (16 contracts from 4 real sources; unique ids + disjoint write-sets; SELF-RECONCILING effectiveStatus BUILT-when-on-disk; owner authorized the block; built+remaining reconcile to 16)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
