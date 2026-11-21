#!/usr/bin/env node
"use strict";
/* Tests for odg-v360-compass (V360 P3 Boussole). A READ-ONLY VIEW: V360 capability status (anchored to merged PRs) + owner
 * decisions + superseded + nextPriority + an injectable DRIFT check (CONNECTED must have a real consumer). Deterministic. */
const M = require("./odg-v360-compass.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const c = M.buildCompass({ asOf: "2026-11-21" });
  // every capability row carries a merged-PR anchor (evidence, not a bare claim).
  check("every capability is anchored to a merged PR (evidence)", c.capabilities.length >= 10 && c.capabilities.every((r: any) => typeof r.pr === "number" && r.pr >= 812));
  check("statuses are CONNECTED / DONE_OPERATIONAL (all V360 connect-gaps closed)", c.capabilities.every((r: any) => r.status === "CONNECTED" || r.status === "DONE_OPERATIONAL"));

  // owner-gated + superseded are explicit with their exact dependency/reason; AQL stays BLOCKED (never invented).
  check("owner decisions listed with exact dependencies incl. AQL BLOCKED (never invented); radar-tech-sources RESOLVED (#824, no longer owner-gated)", Array.isArray(c.ownerDecisionsNeeded) && c.ownerDecisionsNeeded.some((d: any) => d.id === "aql-definition" && d.status === "BLOCKED") && c.ownerDecisionsNeeded.some((d: any) => d.id === "deferred-activation") && !c.ownerDecisionsNeeded.some((d: any) => d.id === "radar-tech-sources") && c.capabilities.some((r: any) => r.id === "radar-tech-sources" && r.status === "DONE_OPERATIONAL"));
  check("superseded capabilities are preserved + explained (not deleted, not re-woken)", c.superseded.some((s: any) => /scheduler/.test(s.id) && /canonical/.test(s.reason)));

  // all connected ⇒ nextPriority routes to the top owner decision (honest: next value is an owner call).
  check("nextPriority = owner-decision when all connect-gaps are closed", c.nextPriority.kind === "owner-decision" && typeof c.nextPriority.detail === "string");

  // DRIFT check: inject a hasConsumer that fails one module ⇒ that capability flips to DRIFT_NO_CONSUMER (never CONNECTED on code alone).
  const drifted = M.buildCompass({ hasConsumer: (mod: string) => mod !== "odg-native-learning-pass" });
  check("DRIFT: a CONNECTED capability with no real consumer ⇒ DRIFT_NO_CONSUMER (grounded, not assumed)", drifted.drift.some((d: any) => d.module === "odg-native-learning-pass") && drifted.capabilities.find((r: any) => r.id === "learning-intelligence").status === "DRIFT_NO_CONSUMER");
  // with a hasConsumer that passes all ⇒ no drift.
  check("no DRIFT when every CONNECTED capability has a consumer", M.buildCompass({ hasConsumer: () => true }).drift.length === 0);

  // frozen + contract
  check("frozen result", Object.isFrozen(c) && Object.isFrozen(c.capabilities));
  check("contract: a VIEW not a 2nd roadmap; never CONNECTED on code alone; AQL never invented",
    /VIEW over V12.4/.test(JSON.stringify(M.V360_COMPASS_CONTRACT.invariants)) &&
    /never CONNECTED on code alone/.test(JSON.stringify(M.V360_COMPASS_CONTRACT.invariants)) &&
    /AQL stays BLOCKED/.test(JSON.stringify(M.V360_COMPASS_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-v360-compass (P3 Boussole: V360 capability status anchored to merged PRs; owner-gated/superseded explicit [AQL BLOCKED, never invented]; nextPriority→owner decision when connects closed; injectable DRIFT check [never CONNECTED on code alone]; a VIEW over V12.4, no 2nd roadmap)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
