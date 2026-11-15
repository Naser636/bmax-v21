#!/usr/bin/env node
"use strict";
/* IMP-P5-CNCF-RATING — 5-aspect self-rating with method+evidence; missing ⇒ level 1 GAP; no infra provisioning. */
const C = require("./odg-cncf-platform-maturity.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = C.rate({ evidence: {
    Investment: { level: 2, note: "dedicated platform owner" }, Adoption: { level: 3, note: "60% teams on golden paths" },
    Interfaces: { level: 2, note: "self-service portal" }, Operations: { level: 2, note: "on-call rotation" },
    Measurement: { level: 3, note: "DORA+SPACE tracked" },
  } });
  check("5 aspects rated with method+evidence", r.aspects.length === 5 && r.ratedCount === 5 && r.aspects.every((a: any) => a.status === "RATED" && a.evidence));
  check("overall level averaged", r.overallLevel === 2.4);

  // fail-closed: no evidence ⇒ level 1 GAP; level without note rejected
  const empty = C.rate({});
  check("no evidence ⇒ all aspects level 1 (Provisional) + GAP (never inflated)", empty.ratedCount === 0 && empty.aspects.every((a: any) => a.level === 1 && a.status === "GAP"));
  check("a level supplied WITHOUT a method/evidence note is NOT accepted", C.rate({ evidence: { Investment: { level: 4 } } }).aspects.find((a: any) => a.aspect === "Investment").status === "GAP");

  check("no infra provisioning + self-rating not certification (method + honesty)", /no infra provisioning/.test(r.honesty) && /not an external\/CNCF certification/.test(r.honesty) && C.CNCF_PLATFORM_MATURITY_CONTRACT.invariants.some((i: string) => /no infrastructure provisioned/.test(i)));
  check("deterministic", JSON.stringify(C.rate({}).overallLevel) === JSON.stringify(empty.overallLevel));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — cncf-platform-maturity (IMP-P5: 5-aspect self-rating with method+evidence; missing ⇒ Provisional GAP; no infra provisioning; not a certification)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
