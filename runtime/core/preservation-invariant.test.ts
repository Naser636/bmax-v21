#!/usr/bin/env node
"use strict";
const assert = require("assert");
const PI = require("./preservation-invariant");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §78/§80-82/§104 — TRANSVERSAL PRESERVATION INVARIANT");

const baseline = { branch: "excellence/v3-wave3-demonstrators-20261101", minUntracked: 404, minStashes: 5 };

// synthetic exec seam producing a given (untracked, stashes, branch, head).
function seam(untracked: number, stashes: number, branch: string, head = "abc123") {
  return (args: string[]) => {
    const a = args.join(" ");
    if (a === "rev-parse --is-inside-work-tree") return "true";
    if (a === "rev-parse --abbrev-ref HEAD") return branch;
    if (a === "rev-parse HEAD") return head;
    if (a === "rev-parse origin/main") return "deadbeef";
    if (a === "diff --cached --name-only") return "";
    if (a === "status --porcelain -uall") return Array.from({ length: untracked }, (_, i) => "?? f" + i).join("\n");
    if (a === "stash list") return Array.from({ length: stashes }, (_, i) => "stash@{" + i + "}: x").join("\n");
    return null;
  };
}

// POSITIVE: meets/exceeds the baseline ⇒ preserved.
{
  const r = PI.runPreservationCheck({ exec: seam(404, 5, baseline.branch), baseline });
  check(r.ok === true && r.violations.length === 0, "POSITIVE: 404 untracked + 5 stashes + right branch ⇒ preserved");
  check(r.recoversHistoricalAssets === false, "honest: preservation ≠ recovery (§80 assets NOT claimed recovered)");
  const r2 = PI.runPreservationCheck({ exec: seam(500, 7, baseline.branch), baseline });
  check(r2.ok === true, "POSITIVE: MORE untracked/stashes than baseline is fine (only destruction is a violation)");
}

// NEGATIVE: a dropped stash ⇒ violation.
{
  const r = PI.runPreservationCheck({ exec: seam(404, 4, baseline.branch), baseline });
  check(r.ok === false && r.violations.some((v: any) => /stashes dropped/.test(v)), "NEGATIVE: stashes 4<5 ⇒ VIOLATION (a stash was dropped)");
}

// NEGATIVE: deleted untracked work ⇒ violation.
{
  const r = PI.runPreservationCheck({ exec: seam(400, 5, baseline.branch), baseline });
  check(r.ok === false && r.violations.some((v: any) => /untracked working set reduced/.test(v)), "NEGATIVE: untracked 400<404 ⇒ VIOLATION (preserved work deleted)");
}

// ADVERSARIAL: a branch switch (e.g. onto main) ⇒ violation.
{
  const r = PI.runPreservationCheck({ exec: seam(404, 5, "main"), baseline });
  check(r.ok === false && r.violations.some((v: any) => /branch changed/.test(v)), "ADVERSARIAL: branch changed to main ⇒ VIOLATION");
}

// ADVERSARIAL: not a repo ⇒ violation (fail-closed, never a vacuous pass).
{
  const r = PI.verifyPreservation(baseline, { isRepo: false, branch: "", head: "", untracked: 0, stashes: 0 });
  check(r.ok === false && r.violations.some((v: any) => /not inside a git work tree/.test(v)), "ADVERSARIAL: no repo ⇒ fail-closed VIOLATION");
}

// NON-REGRESSION: LIVE check against the real repo passes (real untracked≥404, stashes≥5, right branch).
{
  const live = PI.runPreservationCheck();
  check(live.ok === true, "NON-REGRESSION: LIVE repo meets the preservation baseline (real git, read-only)");
  check(live.state.stashes >= 5 && live.state.untracked >= 404, `LIVE: untracked=${live.state.untracked}≥404, stashes=${live.state.stashes}≥5`);
}

check(PI.PRESERVATION_INVARIANT_CONTRACT.invariants.some((i: any) => /READ-ONLY/.test(i)), "contract documents READ-ONLY + fail-closed");

console.log(failures === 0 ? "ALL PASS — V12.4 §78/§80-82/§104 PRESERVATION INVARIANT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
