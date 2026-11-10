#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V90 §3/§5/§7 — roadmap-exhaustion battery. Proves: (§5) per-métier state is an HONEST ladder with NO
 * global average, fail-closed on a missing module, and the REAL repo now has all 15 métiers VALIDATED (P5 raised by
 * wiring its real test into the gate); (§3) the gated parents decompose into the 9 V90 categories exposing genuinely-
 * local sub-work; (§7) the 8 delivery criteria reconcile with V87's 5 open. Live modules + artifacts.
 */

const path = require("path");
const fs = require("fs");
const MS = require("../core/metier-state.js");
const DD = path.join(__dirname, "..", "..", "docs", "odg");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // §5 — metier-state core: ladder + fail-closed + no averaging.
  const allPresent = { has: () => true, inbound: () => 1, testedBy: () => true, gateValidated: () => true };
  check("§5: a fully present+wired+tested+gate-wired métier ⇒ VALIDATED", MS.assessOne("x", allPresent).status === "VALIDATED");
  check("§5: a missing module ⇒ ABSENT (fail-closed)", MS.assessOne("x", { has: () => false }).status === "ABSENT");
  check("§5: tested-but-not-gate-wired ⇒ TESTED (not VALIDATED)", MS.assessOne("x", { has: () => true, inbound: () => 1, testedBy: () => true, gateValidated: () => false }).status === "TESTED");
  check("§5: present-but-no-caller ⇒ PRESENT (not WIRED)", MS.assessOne("x", { has: () => true, inbound: () => 0, testedBy: () => false, gateValidated: () => false }).status === "PRESENT");
  const mixed = MS.assessAll({ has: () => true, inbound: () => 1, testedBy: () => true, gateValidated: (m: string) => m !== "developer-platform" });
  check("§5: no global average — weakest métier surfaced individually (P5)", mixed.weakestMetier.metier === "P5" && mixed.weakestMetier.status === "TESTED" && !("average" in mixed));
  check("§5: 15 métiers enumerated", mixed.total === 15);
  check("§5: contract forbids averaging", /NEVER averages/i.test(JSON.stringify(MS.METIER_STATE_CONTRACT.invariants)));

  // §5 — the REAL repo state artifact: all 15 VALIDATED after the P5 gate-wiring fix.
  let m: any = null; try { m = JSON.parse(fs.readFileSync(path.join(DD, "V90_METIER_STATE.json"), "utf8")); } catch { /* */ }
  check("§5 artifact: real repo — 15/15 métiers VALIDATED (P5 fixed), 0 ABSENT", !!m && m.byStatus.VALIDATED === 15 && m.byStatus.ABSENT === 0);
  check("§5 artifact: P5 (developer-platform) present + validated", !!m && !!m.metiers.find((x: any) => x.metier === "P5" && x.status === "VALIDATED"));

  // the real fix is enforced: developer-platform.test.ts is now in the gate.
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"));
  check("real fix: developer-platform.test.ts wired into the gate (P5 enforced)", /developer-platform\.test\.ts/.test(pkg.scripts["test:report"]));

  // §3 — decomposition artifact: gated parents expose genuinely-local sub-work (9 categories).
  let dc: any = null; try { dc = JSON.parse(fs.readFileSync(path.join(DD, "V90_DECOMPOSITION.json"), "utf8")); } catch { /* */ }
  check("§3: gated parents decomposed into local-proceedable + reserved (no fabrication)", !!dc && dc.totalLocalProceedableSubMissions > 0 && dc.categoryTally.HUMAN_SIGNOFF > 0);
  check("§3: a gated parent is not wholesale human/external — local sub-work exposed", !!dc && dc.decompositions.every((p: any) => p.localProceedable.length > 0));

  // §7 — reconciliation: 8 criteria vs V87's 5 open, in one register, honest, not ready.
  let rc: any = null; try { rc = JSON.parse(fs.readFileSync(path.join(DD, "V90_PRECONDITIONS_RECONCILED.json"), "utf8")); } catch { /* */ }
  check("§7: 8 criteria reconciled, 5 map to V87-open", !!rc && rc.totalCriteria === 8 && rc.v87OpenCount === 5 && rc.criteria.filter((c: any) => c.wasV87Open).length === 5);
  check("§7: delivery NOT ready (fail-closed, >0 still open)", !!rc && rc.readyToDeliver === false && rc.stillOpen.length > 0);

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V90 roadmap exhaustion (15/15 métiers VALIDATED incl. real P5 fix; gated decomposed; preconditions reconciled; honest)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
