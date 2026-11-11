#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V71 §8 — global pilot dashboard test. Verifies the single ODG coordination view: open work items inventoried
 * & honestly typed (BLOCKED_HUMAN/BLOCKED_EXTERNAL), 4 chantiers + P1–P10 + 15 métiers present, blockers typed (not faked
 * DONE), single-orchestrator invariant, and the self-replication hazard now COVERED (dedicated guard, 0 PARTIAL).
 */

const path = require("path");
const fs = require("fs");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }
const G = require("../core/self-replication-guard.js");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const d = j("V71_GLOBAL_PILOT_DASHBOARD.json");
  check("dashboard exists & parses", !!d);
  if (!d) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  check("open work items inventoried + honestly typed", Array.isArray(d.openWorkItems) && d.openWorkItems.filter((x: any) => x.state !== "INFO").every((x: any) => ["BLOCKED_HUMAN", "BLOCKED_EXTERNAL"].includes(x.state)));
  check("4 chantiers coordinated", Array.isArray(d.chantiers) && d.chantiers.length === 4);
  check("P1–P10 present", Array.isArray(d.programs) && d.programs.length === 10);
  check("15 métiers", d.metiers && d.metiers.count === 15);
  check("blockers typed BLOCKED_HUMAN + BLOCKED_EXTERNAL (not faked DONE)", Array.isArray(d.blockers.BLOCKED_HUMAN) && Array.isArray(d.blockers.BLOCKED_EXTERNAL) && d.blockers.BLOCKED_HUMAN.length >= 1 && d.blockers.BLOCKED_EXTERNAL.length >= 1);
  check("single ODG orchestrator, no detached process (invariant)", /One ODG orchestrator/i.test(d.invariant) && /no detached process/i.test(d.singleOrchestrator));
  check("honest: no dangling LOCAL work item; open threads gated", /no dangling LOCAL work item/i.test(d.honestConclusion));

  // C4: self-replication hazard now COVERED (dedicated guard)
  const ag = j("V67_AGENTIC_RISK_COVERAGE.json");
  const sr = ag.coverage.find((c: any) => /self-replication/i.test(c.hazard));
  check("self-replication hazard now COVERED (dedicated guard)", !!sr && sr.covered === "COVERED" && ag.partial === 0);
  // live guard behaviour
  check("live guard: self-copy ⇒ DENY", G.assessSpawn({ spawnerId: "A", childId: "A", authorization: { approved: true, by: "ctrl" } }).decision === "DENY");
  check("live guard: bounded authorized non-self ⇒ ALLOW", G.assessSpawn({ spawnerId: "A", childId: "B", currentDepth: 0, currentSpawnCount: 0, authorization: { approved: true, by: "ctrl" } }, { maxDepth: 3, maxSpawnCount: 8 }).decision === "ALLOW");

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V71 global pilot dashboard (4 chantiers, open items typed, self-replication COVERED)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
