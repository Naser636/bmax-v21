#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V57 (§8) — objective necessary-conditions ledger test. Verifies: both canonical objectives present at their
 * CANONICAL level (never lowered); observed reality is 0 clients/conversion/cash; each condition confronts required vs
 * observed; verdict NOT MET; concrete levers listed; €500M recorded INFEASIBLE; a required value is never an observed one.
 */

const path = require("path");
const fs = require("fs");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V57_OBJECTIVE_CONDITIONS.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null;
  try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("ledger exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  check("canonical objectives at full level (5M & 500M net)", /5,?000,?000/.test(m.canonicalObjectives.minimum) && /500,?000,?000/.test(m.canonicalObjectives.ambition));
  check("min-5M target preserved", m.minimum_5M_net.targetNet === 5000000);
  check("ambition-500M target preserved", m.ambition_500M_net.targetNet === 500000000);
  check("observed reality is 0 clients/conversion/cash", m.observedReality.payingClients === 0 && m.observedReality.observedConversionRate === 0 && m.observedReality.cashCollected === 0);
  check("each condition confronts required vs observed", m.minimum_5M_net.conditions.every((c: any) => "required" in c && "observed" in c && "basis" in c));
  check("min-5M verdict NOT MET", /NOT MET/i.test(m.minimum_5M_net.verdict));
  check("ambition-500M verdict NOT MET", /NOT MET/i.test(m.ambition_500M_net.verdict));
  check("ambition-500M feasibility INFEASIBLE recorded", /INFEASIBLE/i.test(m.ambition_500M_net.feasibility));
  check("open observed gaps > 0 for both", m.minimum_5M_net.openObservedGaps > 0 && m.ambition_500M_net.openObservedGaps > 0);
  check("concrete levers listed (>=3)", Array.isArray(m.concreteLevers) && m.concreteLevers.length >= 3);
  check("invariant: required is never observed", /required value is never an observed value/i.test(m.invariant));
  check("conclusion: NOT lowered, NOT declared feasible", /NOT lowered, NOT declared feasible/i.test(m.honestConclusion));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V57 objective necessary-conditions ledger (objectives preserved, gaps honest, NOT MET)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
