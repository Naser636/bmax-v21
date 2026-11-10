#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V64 — successor-referential test. Verifies the reconstruction of Parts I/IV/XXV is honest and grounded:
 * Part I = 26 capabilities ALL grounded in present modules; Part IV = 12 dimensions + 10 responsibilities, 0 orphans, no
 * duplicate; Part XXV = 40 fault entries; EVERY entry labelled source=RECONSTRUCTED (never claimed historical) with a
 * confidence; the recovery report records the NOT_RECOVERABLE result and FROZEN preservation. Fail-closed.
 */

const path = require("path");
const fs = require("fs");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const rec = j("V64_MASTER_RECOVERY_REPORT.json");
  const s = j("V64_SUCCESSOR_REFERENTIAL.json");
  check("recovery report + successor referential exist", !!rec && !!s);
  if (!rec || !s) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  // recovery honesty
  check("recovery: NOT_RECOVERABLE for I/IV/XXV", rec.targets.every((t: any) => t.verdict === "NOT_RECOVERABLE"));
  check("recovery: FROZEN original preserved (read-only, no destructive op)", /PRESERVED/i.test(rec.preservation) && /read-only/i.test(rec.preservation));

  // Part I
  check("Part I = 26 capabilities", s.partI.count === 26 && s.partI.capabilities.length === 26);
  check("Part I ALL grounded in present modules", s.partI.allGrounded === true && s.partI.capabilities.every((c: any) => c.grounded === true));
  check("Part I every capability source=RECONSTRUCTED (not historical)", s.partI.capabilities.every((c: any) => c.source === "RECONSTRUCTED" && typeof c.confidence === "string"));

  // Part IV
  check("Part IV = 12 dimensions + 10 responsibilities", s.partIV.dimensions.length === 12 && s.partIV.responsibilities.length === 10);
  check("Part IV 0 orphans, no duplicate responsibility", s.partIV.orphans === 0 && s.partIV.duplicateResponsibilities === false);
  check("Part IV all grounded", s.partIV.allGrounded === true);

  // Part XXV
  check("Part XXV = 40 fault entries F01–F40", s.partXXV.count === 40 && s.partXXV.faults.length === 40 && s.partXXV.faults[0].id === "F01" && s.partXXV.faults[39].id === "F40");
  check("Part XXV every entry RECONSTRUCTED (explicitly NOT the historical register)", s.partXXV.faults.every((f: any) => /RECONSTRUCTED/i.test(f.source) && /NOT_RECOVERABLE|not the historical/i.test(f.source) && typeof f.confidence === "string"));

  // global invariant
  check("invariant: reconstruction never presented as the recovered original", /never presented as the recovered original/i.test(s.invariant));
  check("owner validation still flagged (successor not auto-canonized)", /owner validation still needed|Owner validation still needed/i.test(s.honestConclusion));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V64 successor referential (I/IV/XXV reconstructed, grounded, labelled, original preserved)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
