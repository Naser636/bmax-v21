#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V62 (§5/§6) — per-métier performance-fiche test. Verifies: 15 fiches, each with the multidimensional card;
 * every dimension carries a basis; unmeasured dimensions are NOT_MEASURED (never fabricated/0/PASS); the 5 internal
 * reference-baseline types are enumerated; NO single cross-métier global score; superiority NOT DEMONSTRATED for any
 * métier (fail-closed); P13 stays hardware-blocked.
 */

const path = require("path");
const fs = require("fs");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V62_METIER_PERFORMANCE_FICHES.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("fiches artifact exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  check("15 métier fiches", m.metierCount === 15 && m.fiches.length === 15);
  check("each fiche has a multidimensional card (>=13 dims)", m.fiches.every((f: any) => Object.keys(f.dimensions).length >= 13));
  check("every dimension carries a basis", m.fiches.every((f: any) => Object.values(f.dimensions).every((d: any) => typeof d.basis === "string" && d.basis.length > 0)));
  check("unmeasured dimensions are NOT_MEASURED (fail-closed, never fabricated)", m.fiches.every((f: any) => Object.values(f.dimensions).every((d: any) => d.basis !== "NOT_MEASURED" || d.value === null)));
  check("at least one honest NOT_MEASURED dimension present", m.fiches.some((f: any) => Object.values(f.dimensions).some((d: any) => d.basis === "NOT_MEASURED")));
  check("5 internal reference-baseline types enumerated", Array.isArray(m.referenceBaselineTypes) && m.referenceBaselineTypes.length === 5);
  check("NO single cross-métier global score", !("globalScore" in m) && /NO single artificial cross-métier score|No cross-métier global score/i.test(m["//"] + m.invariant));
  check("per-dimension ranking never combined into one score", m.perDimensionRanking.every((r: any) => /NEVER combined into a single/i.test(r.note)));
  check("superiority NOT DEMONSTRATED for any métier (fail-closed)", m.fiches.every((f: any) => /NOT DEMONSTRATED/i.test(f.superiority)));
  const p13 = m.fiches.find((f: any) => f.metier === "P13");
  check("P13 stays hardware-blocked", !!p13 && typeof p13.blocked === "string" && /GPU|hardware/i.test(p13.blocked));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V62 per-métier performance fiches (multidim, NOT_MEASURED honest, no global score, superiority fail-closed)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
