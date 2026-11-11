#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V68 §3 — radar-missions-closure test. Verifies all 7 RAD-M0x are off PROPOSED, each EXECUTED only with a
 * verified-present evidence pointer (fail-closed), RAD-M06 Singapore 4-dimension mapping executed (4/4 covered by present
 * mechanisms), and the invariant that a mission is never faked EXECUTED without present evidence.
 */

const path = require("path");
const fs = require("fs");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V68_RADAR_MISSIONS_CLOSURE.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("closure artifact exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  const ids = m.missions.map((x: any) => x.id);
  check("all 7 RAD-M01..M07 present", ["RAD-M01", "RAD-M02", "RAD-M03", "RAD-M04", "RAD-M05", "RAD-M06", "RAD-M07"].every((i) => ids.includes(i)));
  check("none left PROPOSED", m.missions.every((x: any) => x.status !== "PROPOSED"));
  check("every EXECUTED mission has a present evidence pointer (fail-closed)", m.missions.filter((x: any) => x.status === "EXECUTED").every((x: any) => x.evidencePresent === true));
  check("all cited evidence present", m.allEvidencePresent === true);
  check("RAD-M06 Singapore 4-dimension mapping executed (4/4 covered)", m.radM06_singaporeMapping.length === 4 && m.radM06_singaporeMapping.every((d: any) => d.covered === true));
  check("7 executed", m.executed === 7);
  check("invariant: never faked EXECUTED without present evidence; mapping≠certification", /never faked/i.test(m.invariant) && /readiness, never certification/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V68 radar-missions closure (7/7 executed, evidence present, M06 mapped)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
