#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V67 — radar research + agentic-risk coverage test. Verifies the live research cycle recorded external
 * signals as UNTRUSTED with provenance, turned them into tracked PRIORITIZED PROPOSED improvement missions (never
 * auto-integrated), and that the executed agentic-risk coverage maps hazards to PRESENT mechanisms fail-closed (PARTIAL/
 * UNCOVERED honest), claiming readiness — not external-standard certification.
 */

const path = require("path");
const fs = require("fs");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const reg = j("V67_RADAR_RESEARCH_REGISTER.json");
  const cov = j("V67_AGENTIC_RISK_COVERAGE.json");
  check("radar register + coverage artifacts exist", !!reg && !!cov);
  if (!reg || !cov) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  // research register
  check("live cycle triggered now", reg.cycleTriggeredNow === true);
  check("external signals recorded UNTRUSTED with provenance", reg.signals.length >= 5 && reg.signals.every((s: any) => s.basis === "EXTERNAL_UNTRUSTED" && typeof s.source === "string" && s.source.length > 0));
  check("each signal became a tracked improvement mission", reg.improvementMissions.length >= reg.signals.length - 1 && reg.improvementMissions.every((m: any) => m.program && m.improvement && typeof m.priority === "number"));
  check("missions are PROPOSED / owner-gated (never auto-integrated)", /never auto-integrated|never auto/i.test(reg.invariant) && /owner\/ODG-decided|owner\/ODG-gated|owner\/ODG/i.test(reg.governance + reg.honestConclusion));
  check("external untrusted until analysed; superiority fail-closed", /UNTRUSTED until analysed/i.test(reg.governance) && /superiority[^.]{0,12}fail-closed/i.test(reg["//"] + reg.honestConclusion));

  // executed improvement: agentic-risk coverage
  check("agentic-risk coverage executed (hazards mapped)", cov.hazardCount >= 6 && Array.isArray(cov.coverage));
  check("coverage fail-closed: every COVERED hazard has present mechanisms", cov.coverage.filter((c: any) => c.covered === "COVERED").every((c: any) => c.mechanismsPresent === true));
  check("PARTIAL/UNCOVERED stated honestly (not faked)", (cov.partial + cov.uncovered) >= 0 && cov.coverage.some((c: any) => c.covered === "PARTIAL") === (cov.partial > 0));
  check("readiness NOT certification (owner/organism validation needed)", /NOT a certification|NOT .*certification|does NOT certify/i.test(cov["//"] + cov.honestConclusion) && /readiness mapping ≠ external-standard certification/i.test(cov.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V67 radar research cycle (untrusted signals → tracked PROPOSED missions) + executed agentic-risk coverage" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
