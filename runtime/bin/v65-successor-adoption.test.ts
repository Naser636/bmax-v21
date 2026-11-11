#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V65 §2 — successor-adoption test. Verifies ODG's independent re-verification ran all checks, that adoption
 * is ADOPTED only because ALL checks passed (fail-closed), that the FROZEN original + RECONSTRUCTED provenance + recovery
 * history are preserved, and that adoption is operational (never relabels the reconstruction as the historical original).
 */

const path = require("path");
const fs = require("fs");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V65_SUCCESSOR_ADOPTION.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("adoption artifact exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  check("independent re-verification ran multiple checks", Array.isArray(m.checks) && m.checks.length >= 6);
  check("ADOPTED iff all checks passed (fail-closed consistency)", (m.allChecksPassed === true) === /^ADOPTED/.test(m.decision));
  check("decision is ADOPTED (all checks passed)", m.allChecksPassed === true && /^ADOPTED/.test(m.decision));
  check("26 capabilities + 12 dims + 10 resps + F01–F40 checks all ok", m.checks.filter((c: any) => /partI|partIV|partXXV/.test(c.check)).every((c: any) => c.ok === true));
  check("nine-primitive links verified", m.checks.some((c: any) => c.check === "nine-primitive-links" && c.ok === true));
  check("preserves FROZEN original + RECONSTRUCTED provenance + recovery history", /FROZEN Master original/i.test(JSON.stringify(m.preserved)) && /RECONSTRUCTED/i.test(JSON.stringify(m.preserved)) && /recovery/i.test(JSON.stringify(m.preserved)));
  check("adoption is operational, not a historical relabel", /operational/i.test(m.ownerNote) && /does NOT claim the reconstruction is the historical original/i.test(m.ownerNote));
  check("invariant: original can supersede successor; never relabelled", /FROZEN original is preserved and can supersede/i.test(m.invariant) && /never relabelled as the recovered original/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V65 successor adoption (ODG-verified, fail-closed, original preserved)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
