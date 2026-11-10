#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V72 — three-workstream test. Chantier A: durable multi-mission execution demonstrated on the real scheduler
 * (blocked-dep isolation, dep-chain order, interrupt+resume no-repeat, induced failure recorded, duration MEASURED).
 * Chantier C: adversarial governance battery — all 6 attacks blocked/quarantined; compute-cost honestly NOT_MEASURED.
 */

const path = require("path");
const fs = require("fs");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // Chantier A — durable execution
  const a = j("V72_DURABLE_EXECUTION_DEMO.json");
  check("A: durable-execution demo exists", !!a);
  if (a) {
    check("A: blocked-dependency isolated", a.invariantsObserved.blockedDependencyIsolated === true);
    check("A: dependency chain respected", a.invariantsObserved.dependencyChainRespected === true);
    check("A: interrupt+resume with NO re-run", a.invariantsObserved.interruptThenResumeNoRepeat === true && a.phase2_resumed.resumes >= 1);
    check("A: induced failure recorded (never ACCEPTED)", a.invariantsObserved.inducedFailureRecorded === true && a.allFailed.includes("FX"));
    check("A: duration MEASURED (wall-clock)", typeof a.durationMs === "number" && a.durationMs >= 0);
    check("A: compute-cost honestly NOT_MEASURED", /NOT_MEASURED/.test(a.computeCost));
    check("A: multiple missions accepted across interrupt", Array.isArray(a.allAccepted) && a.allAccepted.length >= 4);
  }

  // Chantier C — adversarial governance
  const c = j("V72_ADVERSARIAL_GOVERNANCE.json");
  check("C: adversarial suite exists", !!c);
  if (c) {
    check("C: >=6 attacks run", c.attackCount >= 6);
    check("C: ALL attacks blocked/quarantined (fail-closed)", c.blockedAll === true && c.attacks.every((x: any) => x.blocked === true));
    check("C: covers injection + self-auth + self-replication + off-scope + no-authority + tamper", ["injection", "self-authorization", "self-replication", "off-scope", "no authority", "tampering"].every((k) => c.attacks.some((x: any) => new RegExp(k, "i").test(x.attack))));
    check("C: invariant — existing guards, no new engine, unblocked=DEFECT", /EXISTING canonical guard/i.test(c.invariant) && /never excused/i.test(c.invariant));
  }

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V72 three workstreams (A durable execution + C adversarial governance, real guards)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
