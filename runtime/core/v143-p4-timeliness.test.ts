#!/usr/bin/env node
"use strict";
/* V143 — P4 data-quality TIMELINESS dimension (research-driven). Source: the standard 6 data-quality dimensions (accuracy,
 * completeness, consistency, TIMELINESS, validity, uniqueness — ibm.com/think/topics/data-quality-dimensions, 2026). ODG's
 * assessDataQuality covered completeness/validity/uniqueness but not timeliness; this adds it OPT-IN (default unchanged).
 * Locks: default behaviour unchanged (no regression); configured timeliness flags stale/missing timestamps fail-closed. */
const P4 = require("./profession-p4-data-reference.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const NOW = Date.parse("2026-11-12T12:00:00Z");
const SCH = { id: { type: "string", required: true }, age: { type: "number", min: 0, max: 120, required: true } };
const ROWS = [{ id: "a", age: 30, updatedAt: "2026-11-12T11:00:00Z" }, { id: "b", age: 40, updatedAt: "2026-01-01T00:00:00Z" }];

function main() {
  // DEFAULT (back-compat): no timeliness config ⇒ 3 dimensions, no stale, behaviour unchanged.
  const d = P4.assessDataQuality(ROWS, SCH);
  check("DEFAULT: no timeliness config ⇒ dimsChecked 3, stale 0, clean (back-compat)", d.dimsChecked === 3 && d.stale === 0 && d.clean === true);

  // CONFIGURED: a row older than maxAge ⇒ stale ⇒ a timeliness defect ⇒ not clean.
  const t = P4.assessDataQuality(ROWS, SCH, { timeliness: { field: "updatedAt", maxAgeMs: 86400000, nowMs: NOW } });
  check("timeliness (1d max): old row flagged stale ⇒ dimsChecked 4, stale 1, not clean", t.timelinessChecked === true && t.dimsChecked === 4 && t.stale === 1 && t.clean === false);

  // fresh rows ⇒ no stale.
  const fresh = P4.assessDataQuality([{ id: "a", age: 30, updatedAt: "2026-11-12T11:30:00Z" }], SCH, { timeliness: { field: "updatedAt", maxAgeMs: 86400000, nowMs: NOW } });
  check("all-fresh rows ⇒ stale 0, clean", fresh.stale === 0 && fresh.clean === true);

  // FAIL-CLOSED: a missing/unparseable timestamp ⇒ stale (not silently trusted).
  const missing = P4.assessDataQuality([{ id: "a", age: 30 }, { id: "b", age: 40, updatedAt: "not-a-date" }], SCH, { timeliness: { field: "updatedAt", maxAgeMs: 86400000, nowMs: NOW } });
  check("missing/unparseable timestamp ⇒ stale (fail-closed, not trusted)", missing.stale === 2);

  // malformed timeliness config ⇒ ignored (no throw, dims back to 3).
  check("malformed timeliness config ⇒ ignored (no throw, dimsChecked 3)", P4.assessDataQuality(ROWS, SCH, { timeliness: { field: "updatedAt" } }).dimsChecked === 3);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — P4 timeliness dimension (opt-in; default unchanged; stale/missing timestamps fail-closed) [6-dimension data quality]" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
