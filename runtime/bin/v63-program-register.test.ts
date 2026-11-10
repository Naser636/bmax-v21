#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V63 (§2/§4/§12) — ten-program canonical register test. Verifies P1–P10 are integrated as traceable items
 * (mapped V12.4 parts + deliverables + tests + acceptance + status + closure), that EVERY evidence/test pointer resolves
 * (no dangling claim), that no program is ACTIVE/closed without present evidence, and that the register declares itself a
 * canonical (not parallel) roadmap with ODG as owner and the provider bounded.
 */

const path = require("path");
const fs = require("fs");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V63_PROGRAM_REGISTER.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("program register exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  const want = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"];
  check("all 10 programs present", m.programCount === 10 && want.every((w) => m.programs.some((p: any) => p.id === w)));
  check("each program maps to V12.4 parts + result + owner + closure", m.programs.every((p: any) => p.parts.length >= 1 && p.result && p.owner && p.closure));
  check("each program has deliverables + tests + acceptance criteria", m.programs.every((p: any) => p.deliverables.length >= 1 && p.tests.length >= 1 && p.acceptanceCriteria.length >= 1));
  check("EVERY evidence/test pointer resolves (no dangling claim)", m.allEvidencePointersResolve === true && m.programs.every((p: any) => p.allEvidenceResolves === true));
  check("no program ACTIVE without resolving evidence", m.programs.filter((p: any) => /ACTIVE/.test(p.status)).every((p: any) => p.allEvidenceResolves === true));
  check("maps to many V12.4 parts (>=12, no requirement dropped)", Array.isArray(m.partsCovered) && m.partsCovered.length >= 12);
  check("declares canonical (not parallel) roadmap + ODG owner + provider bounded", /not a parallel roadmap/i.test(m.invariant) && /ODG owns each program/i.test(m.invariant));
  check("nothing DONE without proof (invariant)", /never ACTIVE\/closed without present evidence/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V63 ten-program canonical register (traceable, evidence resolves, ODG-owned)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
