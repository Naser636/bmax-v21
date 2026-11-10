#!/usr/bin/env node
"use strict";
const R = require("./roadmap-manager");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
const items = [{ id: "cap-x", title: "parse edge handling", status: "ACCEPTED", deps: [] }, { id: "blk-y", title: "needs external data", status: "BLOCKED", deps: ["missing-dep"] }];
// (1) a discovery is PROPOSED and NEVER authorized/executed by discovery (the invariant).
{
  const d = R.intakeDiscovery({ title: "a missing symbol-table capability" }, items);
  check(d.status === "PROPOSED" && d.authorized === false && d.executed === false, "a discovery ⇒ PROPOSED, authorized:false, executed:false (discovery ≠ authorization)");
  check(d.classification === "MISSING_CAPABILITY", "classified by signal (MISSING_CAPABILITY)");
}
// (2) DEDUP: a discovery matching an existing register item ⇒ DUPLICATE, not re-added.
{
  const d = R.intakeDiscovery({ title: "parse edge handling" }, items);
  check(d.status === "DUPLICATE" && d.relatedTo === "cap-x", "a discovery duplicating a register item ⇒ DUPLICATE (no parallel registry)");
}
// (3) AUTHORIZATION is a separate deny-by-default step: a PROPOSED discovery is NOT authorized without an explicit decision.
{
  const prop = R.intakeDiscovery({ title: "new improvement idea" }, items);
  check(R.authorizeDiscovery(prop, null).authorized === false, "no authorization ⇒ not authorized (fail-closed)");
  check(R.authorizeDiscovery(prop, { approved: false, authorizedBy: "x" }).authorized === false, "not-approved ⇒ not authorized");
  check(R.authorizeDiscovery(prop, { approved: true, authorizedBy: "odg-cto" }).authorized === true, "explicit approved external decision ⇒ authorized");
  // a non-PROPOSED (e.g., a DUPLICATE) cannot be authorized.
  check(R.authorizeDiscovery({ status: "DUPLICATE" }, { approved: true, authorizedBy: "x" }).authorized === false, "only a PROPOSED discovery may be authorized");
}
// (4) inventory derives from the register only; reports real progress + blocked-by-dependency.
{
  const inv = R.buildInventory(items);
  check(inv.total === 2 && inv.accepted === 1 && inv.open === 1, "inventory counts from the canonical register");
  check(inv.blockedByDependency.includes("blk-y"), "an item with an unmet dep is flagged blocked-by-dependency");
  check(/not auto-executable/.test(inv.forecast), "forecast never declares auto-completion");
}
// (5) a titleless discovery ⇒ REJECTED (fail-closed).
check(R.intakeDiscovery({}, items).status === "REJECTED", "a titleless discovery ⇒ REJECTED");
// (6) contract invariants.
check(/never to unauthorized execution|discovery .* authorization/i.test(JSON.stringify(R.ROADMAP_MANAGER_CONTRACT.invariants)), "contract: discovery ≠ unauthorized execution");
check(/no parallel registry/i.test(JSON.stringify(R.ROADMAP_MANAGER_CONTRACT.invariants)), "contract: no parallel registry");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 ROADMAP MANAGER\n");
process.exit(failures === 0 ? 0 : 1);
export {};
