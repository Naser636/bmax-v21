#!/usr/bin/env node
"use strict";

/*
 * V12.4 §78 / §80–§82 / §104 — TRANSVERSAL PRESERVATION INVARIANT VERIFIER. Behaviourally verifies, READ-ONLY, that
 * the historical-preservation obligation (the §78 correction: preservation is TRANSVERSAL — it holds across every
 * step/lot) actually holds against the LIVE repo: the untracked working set is not deleted, the stashes are not
 * dropped, the working branch is unchanged, HEAD is resolvable. It REUSES truth-lock-gate.gatherGitState (injectable
 * exec seam — no second git reader) and only runs READ-ONLY git (status/stash list/rev-parse). It makes NO claim to
 * RECOVER the §80 historical assets (those are honestly UNKNOWN/TO_AUDIT — preservation ≠ recovery); it only proves
 * nothing authorized-to-be-preserved was destroyed. §82 anti-duplication + §104 local-only are referenced, not
 * re-implemented. Fail-closed: any reduction below the baseline is a VIOLATION. Dual export.
 */

const TLG = require("./truth-lock-gate");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function countLines(s: any, pred: (l: string) => boolean): number {
  return typeof s === "string" && s.length ? s.split("\n").filter((l) => l.length > 0 && pred(l)).length : 0;
}

/** gatherPreservationState(exec?) -> { isRepo, branch, head, untracked, stashes }. READ-ONLY. untracked is the
 * RECURSIVE count (git status --porcelain -uall) so deleting files inside an untracked dir is detected. */
function gatherPreservationState(exec?: any): any {
  const cp = require("child_process");
  const run = typeof exec === "function"
    ? exec
    : (args: string[]) => { try { return String(cp.execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim(); } catch { return null; } };
  const base = TLG.gatherGitState(exec);               // reuse the canonical reader for isRepo/branch/head
  if (!base.isRepo) return { isRepo: false, branch: "", head: "", untracked: 0, stashes: 0 };
  const untracked = countLines(run(["status", "--porcelain", "-uall"]), (l) => l.startsWith("??"));
  const stashes = countLines(run(["stash", "list"]), () => true);
  return { isRepo: true, branch: base.branch, head: base.head, untracked, stashes };
}

/** verifyPreservation(baseline, state) -> { ok, violations }. Fail-closed: untracked/stashes must not drop below the
 * baseline; branch must match; HEAD must resolve. (Adding untracked/stashes is fine — only destruction is a violation.) */
function verifyPreservation(baseline: any, state: any): any {
  const b = isObj(baseline) ? baseline : {};
  const s = isObj(state) ? state : {};
  const violations: string[] = [];
  if (s.isRepo !== true) violations.push("not inside a git work tree");
  if (isStr(b.branch) && s.branch !== b.branch) violations.push(`branch changed: expected ${b.branch}, got ${s.branch || "(none)"}`);
  if (typeof b.minUntracked === "number" && !(typeof s.untracked === "number" && s.untracked >= b.minUntracked)) violations.push(`untracked working set reduced: ${s.untracked} < baseline ${b.minUntracked} (preserved work may have been deleted)`);
  if (typeof b.minStashes === "number" && !(typeof s.stashes === "number" && s.stashes >= b.minStashes)) violations.push(`stashes dropped: ${s.stashes} < baseline ${b.minStashes}`);
  if (!isStr(s.head)) violations.push("HEAD not resolvable");
  return Object.freeze({ ok: violations.length === 0, violations: Object.freeze(violations) });
}

// The SÉRIE preservation baseline (reality, reconciled 2026-11-08): recursive untracked ≥404, stashes ≥5, working branch.
const SERIE_BASELINE = Object.freeze({ branch: "excellence/v3-wave3-demonstrators-20261101", minUntracked: 404, minStashes: 5 });

/** runPreservationCheck(opts?) -> live verdict + the transversal/anti-duplication/local-only framing (honest). */
function runPreservationCheck(opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const baseline = isObj(o.baseline) ? o.baseline : SERIE_BASELINE;
  const state = isObj(o.state) ? o.state : gatherPreservationState(o.exec);
  const result = verifyPreservation(baseline, state);
  return Object.freeze({
    source: "V12.4 §78/§80-82/§104 transversal preservation invariant (read-only)",
    ok: result.ok, violations: result.violations, state: Object.freeze(state), baseline,
    recoversHistoricalAssets: false,   // §80: preservation ≠ recovery; historical assets stay UNKNOWN/TO_AUDIT
    note: "Proves nothing authorized-to-be-preserved was destroyed (untracked work + stashes + branch + HEAD). Does NOT recover §80 historical assets (UNKNOWN). edg-core is observed read-only, never mutated. §82 anti-duplication + §104 local-only hold by doctrine (no 2nd engine; no push/VPS/sudo/network).",
  });
}

const PRESERVATION_INVARIANT_CONTRACT = Object.freeze({
  id: "V124-PRESERVATION-INVARIANT",
  source: "V12.4 §78 (transversal correction) / §80–§82 (historical preservation, anti-duplication) / §104 (local-only)",
  reuses: Object.freeze(["truth-lock-gate.gatherGitState (injectable read-only exec seam)"]),
  baseline: SERIE_BASELINE,
  notAuthority: "a read-only behavioural verifier of the preservation invariant; it recovers nothing and mutates nothing",
  invariants: Object.freeze([
    "READ-ONLY git only (status/stash list/rev-parse); never a write, reset, clean, or push",
    "fail-closed: untracked (recursive) or stashes dropping below baseline, or a branch change, is a VIOLATION",
    "preservation ≠ recovery: §80 historical assets stay UNKNOWN (recoversHistoricalAssets:false) — no fabricated recovery",
    "reuses gatherGitState (no second git reader); §82 anti-duplication + §104 local-only referenced, not re-implemented",
  ]),
});

module.exports = { gatherPreservationState, verifyPreservation, runPreservationCheck, SERIE_BASELINE, PRESERVATION_INVARIANT_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...PRESERVATION_INVARIANT_CONTRACT, live: runPreservationCheck() }, null, 2) + "\n"); }

export {};
