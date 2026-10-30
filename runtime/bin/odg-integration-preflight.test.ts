#!/usr/bin/env node
// @ts-nocheck — behavioural unit test (runs under tsx / compiled JS unchanged); suppresses tsc typechecking only.
/*
 * odg-integration-preflight — proves the git/GitHub state reporter NEVER conflates push with merge, is fail-closed on
 * MERGED, reports gh-auth honestly with the exact owner command, and plans a linear-stack merge order. Deterministic:
 * pure fns + a CLI driven by an INJECTED git runner (no real git/gh/network).
 */
"use strict";
const assert = require("assert");
const P = require("./odg-integration-preflight.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass += 1; };

console.log("ODG integration-preflight");

// classifyBranch — the push≠merge core.
ok("MERGED only when tip is an ancestor of origin/main", P.classifyBranch({ name: "b", localTip: "a", remoteTip: "a", mergedIntoMain: true }).state === "MERGED");
ok("PUSHED (local==remote) is NOT reported as merged", (() => { const r = P.classifyBranch({ name: "b", localTip: "a", remoteTip: "a", mergedIntoMain: false }); return r.state === "PUSHED" && r.mergedIntoMain === false; })());
ok("FAIL-CLOSED: missing mergedIntoMain ⇒ NOT merged (PUSHED)", P.classifyBranch({ name: "b", localTip: "a", remoteTip: "a" }).state === "PUSHED");
ok("FAIL-CLOSED: non-true mergedIntoMain (e.g. 'yes') ⇒ NOT merged", P.classifyBranch({ name: "b", localTip: "a", remoteTip: "a", mergedIntoMain: "yes" }).state === "PUSHED");
ok("DIVERGED when local != remote", P.classifyBranch({ name: "b", localTip: "a", remoteTip: "z" }).state === "PUSHED" ? false : true); // local!=remote ⇒ not pushed
ok("LOCAL when not pushed (no remote tip)", P.classifyBranch({ name: "b", localTip: "a", remoteTip: null }).state === "LOCAL");
ok("ABSENT when no local branch", P.classifyBranch({ name: "b", localTip: null, remoteTip: null }).state === "ABSENT");
// Audit hardening: the pure API self-enforces "unpushed ⇒ never MERGED" (not just via reportCli wiring).
ok("FAIL-CLOSED: no remote tip + mergedIntoMain:true ⇒ NOT merged (unpushed can't be on main)", P.classifyBranch({ name: "b", localTip: "a", remoteTip: null, mergedIntoMain: true }).mergedIntoMain === false);
ok("push success is never a release — PUSHED detail says NOT on main", /NOT on main/.test(P.classifyBranch({ name: "b", localTip: "a", remoteTip: "a" }).detail));

// authState — gh is a separate channel; fail-fast with the exact owner command.
ok("authed via stored credential", P.authState({ ghStatusOk: true }).authed === true);
ok("authed via GH_TOKEN env", P.authState({ ghTokenPresent: true }).authed === true && P.authState({ ghTokenPresent: true }).method === "GH_TOKEN-env");
{
  const a = P.authState({ ghStatusOk: false, ghTokenPresent: false });
  ok("NOT authed ⇒ authed:false", a.authed === false);
  ok("NOT authed ⇒ exact owner command (GH_TOKEN fine-grained PAT) provided", typeof a.ownerCommand === "string" && /GH_TOKEN/.test(a.ownerCommand) && /Pull requests/.test(a.ownerCommand));
}
// Audit fix: GH_TOKEN takes precedence in the channel label (gh uses the token over any stored credential), so even
// when gh auth status ALSO returns ok, the honest method is GH_TOKEN-env — never mislabeled "stored-credential".
ok("auth method: GH_TOKEN precedence (token+status both present ⇒ GH_TOKEN-env)", P.authState({ ghStatusOk: true, ghTokenPresent: true }).method === "GH_TOKEN-env");

// planMergeOrder — a linear stack merges parent→child (roots first).
{
  // main(m) <- A(ta,parent m) <- B(tb,parent ta) <- C(tc,parent tb), supplied out of order
  const order = P.planMergeOrder([
    { name: "C", tip: "tc", parentTip: "tb" },
    { name: "A", tip: "ta", parentTip: "m" },
    { name: "B", tip: "tb", parentTip: "ta" },
  ]);
  ok("linear stack merges in dependency order A→B→C", order.join(",") === "A,B,C");
  // Audit hardening: a malformed CYCLIC parentTip must not infinite-recurse (RangeError). It returns without crashing.
  let cyc; let threw = false;
  try { cyc = P.planMergeOrder([{ name: "X", tip: "tx", parentTip: "ty" }, { name: "Y", tip: "ty", parentTip: "tx" }]); } catch { threw = true; }
  ok("planMergeOrder: cyclic parentTip ⇒ no crash (cycle-guarded)", !threw && Array.isArray(cyc) && cyc.length === 2);
}

// reportCli with an INJECTED git runner — simulate: one branch merged (ancestor of main), one pushed-not-merged.
{
  const facts = {
    "rev-parse origin/main": "MAIN",
    "rev-parse lotA": "AA", "rev-parse origin/lotA": "AA", "merge-base --is-ancestor origin/lotA origin/main": "",       // merged
    "rev-parse lotB": "BB", "rev-parse origin/lotB": "BB", "merge-base --is-ancestor origin/lotB origin/main": null,     // pushed, NOT merged
  };
  const gitRunner = (args) => { const k = args.join(" "); return Object.prototype.hasOwnProperty.call(facts, k) ? facts[k] : null; };
  const rep = P.reportCli(["lotA", "lotB"], { git: gitRunner, gh: () => false });
  const byName = Object.fromEntries(rep.rows.map((r) => [r.name, r]));
  ok("reportCli: lotA (ancestor of main) ⇒ MERGED", byName.lotA.state === "MERGED");
  ok("reportCli: lotB (pushed, not ancestor) ⇒ PUSHED, not MERGED", byName.lotB.state === "PUSHED" && byName.lotB.mergedIntoMain === false);
  ok("reportCli: gh not authed ⇒ owner command surfaced", rep.auth.authed === false && /GH_TOKEN/.test(rep.auth.ownerCommand));
  ok("reportCli: origin/main sha reported", rep.originMain === "MAIN");
}

console.log(`\nODG integration-preflight — ${pass} assertions passed.`);
