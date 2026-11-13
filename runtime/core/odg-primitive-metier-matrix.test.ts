#!/usr/bin/env node
"use strict";
/* V183 Livrable B — 9×15 use-matrix. Proves: exactly 135 classified intersections; REUSE default; overrides are real
 * exceptions; OWNER_GATED preserved (payment/cert); NO construction engaged; reuses canonical roster; deterministic. */
const B = require("./odg-primitive-metier-matrix.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const m = B.matrix();
  check("exactly 135 intersections (9×15)", B.PRIMITIVES.length === 9 && m.metierCount === 15 && m.intersections === 135 && m.cells.length === 135);
  check("every cell is classified (one of the 5 labels) and carries a reference + basis", m.cells.every((c: any) => B.CLASS.includes(c.classification) && c.ref && c.basis && c.primitive && c.metier));
  check("sum of class counts equals 135", Object.values(m.byClass).reduce((a: any, b: any) => a + b, 0) === 135);
  check("REUSE is the dominant default (primitives implemented once, reused)", m.byClass.REUSE >= 100);

  const get = (p: string, mt: string) => m.cells.find((c: any) => c.primitive === p && c.metier === mt);
  check("EXECUTOR×P9 (FinOps payment) is OWNER_GATED", get("EXECUTOR", "P9").classification === "OWNER_GATED" && /payment/i.test(get("EXECUTOR", "P9").ref));
  check("CONTRACT×P10 (regulatory certification) is OWNER_GATED", get("CONTRACT", "P10").classification === "OWNER_GATED");
  check("EVIDENCE×P11 (document provenance) is IMPROVE", get("EVIDENCE", "P11").classification === "IMPROVE");
  check("POLICY×P3 (security OWASP) is IMPROVE", get("POLICY", "P3").classification === "IMPROVE");
  check("POLICY×P4 (data-layer tenancy) is BUILD_CONDITIONAL (absence demonstrated)", get("POLICY", "P4").classification === "BUILD_CONDITIONAL" && /NOT present/i.test(get("POLICY", "P4").ref));
  check("a plain cell defaults to REUSE with the primitive's canonical ref", get("IDENTITY", "P1").classification === "REUSE" && /agent-identity/.test(get("IDENTITY", "P1").ref));

  // ---- NO construction engaged ----
  const cb = B.conditionalBuilds();
  check("BUILD_CONDITIONAL cells surfaced but NOT built (deferred to PARKED extension after Gate A)", cb.count >= 1 && /NOT engaged here/.test(cb.note) && cb.rows.every((r: any) => r.classification === "BUILD_CONDITIONAL"));

  // ---- reuses canonical roster, not a duplicate ----
  check("metier names come from the canonical planner roster (P9=FinOps, P11=Document intelligence)", get("STATE", "P9").metierName === "FinOps" && get("STATE", "P11").metierName === "Document intelligence");

  // ---- contract + determinism ----
  check("contract: 135 intersections, REUSE default, no construction, OWNER_GATED preserved", B.PRIMITIVE_METIER_MATRIX_CONTRACT.invariants.some((i: string) => /135 intersections/.test(i)) && B.PRIMITIVE_METIER_MATRIX_CONTRACT.invariants.some((i: string) => /NO construction engaged/.test(i)));
  check("deterministic + frozen", JSON.stringify(B.matrix().byClass) === JSON.stringify(m.byClass) && Object.isFrozen(m) && Object.isFrozen(m.cells));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — primitive-metier-matrix (Livrable B: 135 intersections [9×15] classified REUSE/IMPROVE/BUILD_CONDITIONAL/NOT_APPLICABLE/OWNER_GATED with refs; REUSE default [no 2nd canonical system]; NO construction engaged; payment/cert OWNER_GATED; reuses canonical roster)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
