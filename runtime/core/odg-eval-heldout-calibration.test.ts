#!/usr/bin/env node
"use strict";
/* IMP-P6-EVAL-HELDOUT — held-out versioned by date; anti-contamination; full run BLOCKED on owner corpus. */
const E = require("./odg-eval-heldout-calibration.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = E.buildHeldOut({
    cutoffDate: "2026-06-01",
    knownHashes: ["h-known"],
    items: [
      { id: "a", contentHash: "h-new1", date: "2026-09-01" },      // included (post-cutoff, not known)
      { id: "b", contentHash: "h-known", date: "2026-09-01" },     // excluded (leakage)
      { id: "c", contentHash: "h-old", date: "2026-03-01" },       // excluded (pre-cutoff)
      { id: "d", contentHash: "h-new2", date: "2026-10-01" },      // included
    ],
  });
  check("held-out versioned by date (heldout@2026-06-01)", r.version === "heldout@2026-06-01" && r.cutoffDate === "2026-06-01");
  check("anti-contamination: known-corpus overlap EXCLUDED", r.excluded.some((x: any) => x.id === "b" && /leakage/.test(x.reason)));
  check("anti-contamination: pre-cutoff item EXCLUDED", r.excluded.some((x: any) => x.id === "c" && /cutoff/.test(x.reason)));
  check("only post-cutoff non-known items included (a,d)", r.includedCount === 2 && r.included.every((x: any) => ["a", "d"].includes(x.id)));
  check("FULL eval run stays BLOCKED on owner corpus (no fabricated scores)", r.fullRun.status === "BLOCKED" && /OWNER's labelled corpus/.test(r.fullRun.reason));
  check("contract + honesty (versioned, anti-contamination, blocked)", E.EVAL_HELDOUT_CONTRACT.invariants.some((i: string) => /anti-contamination/.test(i)) && /no eval scores are fabricated/.test(r.honesty));
  check("deterministic", JSON.stringify(E.buildHeldOut({ cutoffDate: "2026-06-01", knownHashes: ["h-known"], items: [] }).included) === "[]");

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — eval-heldout-calibration (IMP-P6: held-out versioned by date; known/pre-cutoff EXCLUDED; full run BLOCKED on owner corpus)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
