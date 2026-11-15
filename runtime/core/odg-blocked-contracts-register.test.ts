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
  check("every contract BLOCKED_AWAITING_ISOLATION + {module,test} + acceptance", v.summary.allBlocked === true && v.summary.allHaveModuleAndTest === true && v.summary.allHaveAcceptance === true);
  check("metiers covered include the expected spread (P1/P9/M1/P14/M5)", ["P1", "P9", "M1", "P14", "M5"].every((m) => v.summary.metiersCovered.includes(m)) && v.summary.metiersCovered.length === 16);
  check("with nothing-exists predicate, targetsAlreadyExisting empty", v.summary.targetsAlreadyExisting.length === 0);

  // dedup detector works: inject a predicate that claims one known write-set file exists
  const known = R.CONTRACTS[0].writeSet[0];
  const v2 = R.consolidate({ fileExists: (p: string) => p === known });
  check("dedup-vs-existing-code flags an already-existing target", v2.summary.targetsAlreadyExisting.includes(known) && v2.summary.targetsAlreadyExisting.length === 1);

  // REAL on-disk check: none of the 16 target modules exist yet (truly unbuilt — genuine dedup against accepted code)
  const real = R.consolidate({});
  check("REAL dedup: none of the 16 write-set targets exist on disk yet (unbuilt)", Array.isArray(real.summary.targetsAlreadyExisting) && real.summary.targetsAlreadyExisting.length === 0);

  check("contract: recover-not-invent, disjoint, dedup, stays BLOCKED, no new engine", R.BLOCKED_CONTRACTS_REGISTER_CONTRACT.invariants.some((i: string) => /not invented/.test(i)) && R.BLOCKED_CONTRACTS_REGISTER_CONTRACT.invariants.some((i: string) => /stays BLOCKED_AWAITING_ISOLATION/.test(i)) && R.BLOCKED_CONTRACTS_REGISTER_CONTRACT.invariants.some((i: string) => /no new primitive\/engine\/registry/.test(i)));
  check("deterministic + frozen", JSON.stringify(R.consolidate({ fileExists: () => false }).summary) === JSON.stringify(v.summary) && Object.isFrozen(v) && Object.isFrozen(R.CONTRACTS));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — blocked-contracts-register (V200 §4/WI-FR-04: 16 contracts from 4 real sources; unique ids + disjoint write-sets; dedup-vs-existing-code [injected + REAL none-exist]; all BLOCKED_AWAITING_ISOLATION; composes existing sources, builds nothing)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
