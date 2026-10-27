#!/usr/bin/env node
// @ts-nocheck — runs under tsx. PRIORITY-ONE acceptance gate (V22): proves the learning loop is CLOSED in the
// live selector (capability-router.route), which decision-engine consumes:
//   POSITIVE — a prior validated learning item (a patch-memory precedent) CHANGES a later decision (Memory wins).
//   NEGATIVE — after reuse NET-REGRESSES (reuse-ledger records 2 reuse-failed), the SAME later decision changes:
//              the precedent is DE-SELECTED (Memory no longer wins) until revalidated.
//   RECOVERY — once validations outweigh failures, the precedent is re-selected.
// Hermetic: patch-memory + reuse-ledger share ONE injected in-memory store; no runtime/generated pollution, no net.
"use strict";
const assert = require("assert");
const path = require("path");
const os = require("os");
const fs = require("fs");

// patch-memory writes via autonomy-store (CWD-relative runtime/generated). To stay hermetic we run in a temp
// CWD so the real repo state is untouched; reuse-ledger is driven through an INJECTED store so route() and
// recordReuseOutcome() share the exact same ledger.
const ROUTER = require("./capability-router.js");
const PM = require("./patch-memory.js");
const RL = require("./reuse-ledger.js");

let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-loop-"));
const origCwd = process.cwd();
process.chdir(tmp);
try {
  // A reusable, previously-APPLIED precedent for this objective's signature.
  const task = { goal: "fix the broken import in module X", objectiveId: "OBJ-1" };
  const edits = [{ target: "src/x.ts", content: "fixed" }];
  PM.record({ goal: task.goal, objectiveId: task.objectiveId, edits, authoredBy: "ODG_CAPABILITY", mission: "M-TEST" });
  const sig = PM.signature(task);

  const ledgerStore = (() => { const m = {}; return { read: (n, f) => (n in m ? m[n] : (f === undefined ? null : f)), write: (n, o) => { m[n] = o; return o; } }; })();
  const rOpts = { reuseLedgerOpts: { store: ledgerStore } };

  // (1) POSITIVE — the validated precedent changes the decision: Memory tier wins.
  const r1 = ROUTER.route(task, rOpts);
  ok("POSITIVE: precedent selected — Memory tier wins (decision changed)", r1.chosen && r1.chosen.tier === "PATCH_MEMORY" && r1.reuse && r1.reuse.selected === true && r1.reuse.suppressed === false);

  // (2) a control objective with NO precedent is unaffected (no reuse info, Memory not chosen).
  const ctrl = ROUTER.route({ goal: "something never seen", objectiveId: "OBJ-NONE" }, rOpts);
  ok("CONTROL: no precedent ⇒ no reuse, Memory not chosen", !ctrl.reuse && !(ctrl.chosen && ctrl.chosen.tier === "PATCH_MEMORY"));

  // Now reuse FAILS twice (net regression) — recorded via the SAME ledger store, keyed by the SAME signature.
  const worse = { before: { signals: { failingTests: 2 } }, after: { signals: { failingTests: 5 } }, senseMap: { failingTests: "lower" } };
  RL.recordReuseOutcome(sig, { ...worse, at: "t1", context: "M-RUN-1" }, { store: ledgerStore });
  const after2 = RL.recordReuseOutcome(sig, { ...worse, at: "t2", context: "M-RUN-2" }, { store: ledgerStore });
  ok("ledger: 2 failed reuses ⇒ asset suppressed", after2.asset.suppressed === true && RL.suppressedSignatures({ store: ledgerStore }).includes(sig));

  // (3) NEGATIVE — the SAME later decision now changes: the regressing precedent is DE-SELECTED.
  const r2 = ROUTER.route(task, rOpts);
  ok("NEGATIVE: failed reuse changes future selection — precedent DE-SELECTED (Memory no longer wins)", !(r2.chosen && r2.chosen.tier === "PATCH_MEMORY") && r2.reuse.suppressed === true && r2.reuse.selected === false && /revalidation required/i.test(r2.reuse.reason));
  ok("NEGATIVE: PATCH_MEMORY is absent from the plan when suppressed", !r2.plan.some(s => s.tier === "PATCH_MEMORY"));

  // (4) RECOVERY — enough validated reuses outweigh the failures ⇒ no longer suppressed ⇒ re-selected.
  const better = { before: { signals: { failingTests: 5 } }, after: { signals: { failingTests: 0 } }, senseMap: { failingTests: "lower" } };
  RL.recordReuseOutcome(sig, { ...better, at: "t3" }, { store: ledgerStore });
  RL.recordReuseOutcome(sig, { ...better, at: "t4" }, { store: ledgerStore });
  RL.recordReuseOutcome(sig, { ...better, at: "t5" }, { store: ledgerStore }); // validated 3 > failed 2
  const r3 = ROUTER.route(task, rOpts);
  ok("RECOVERY: revalidated precedent re-selected (Memory wins again)", r3.chosen && r3.chosen.tier === "PATCH_MEMORY" && r3.reuse.selected === true && r3.reuse.suppressed === false);

  // (5) the explicit opts.suppressedSignatures override also de-selects (decision-engine/other callers may pass it).
  const r4 = ROUTER.route(task, { suppressedSignatures: [sig] });
  ok("explicit suppressedSignatures override de-selects", !(r4.chosen && r4.chosen.tier === "PATCH_MEMORY") && r4.reuse.suppressed === true);

  // (6) FAIL-CLOSED consumption: a broken ledger store never crashes routing — defaults to prior behaviour (select).
  const boom = { read: () => { throw new Error("store down"); }, write: () => { throw new Error("store down"); } };
  const r5 = ROUTER.route(task, { reuseLedgerOpts: { store: boom } });
  ok("fail-closed: ledger error ⇒ no suppression (prior behaviour, Memory wins)", r5.chosen && r5.chosen.tier === "PATCH_MEMORY" && r5.reuse.suppressed === false);

  // (7) stale/unproven evidence cannot satisfy: an INCONCLUSIVE-only history never suppresses NOR fabricates validation.
  const store2 = (() => { const m = {}; return { read: (n, f) => (n in m ? m[n] : (f === undefined ? null : f)), write: (n, o) => { m[n] = o; return o; } }; })();
  const sig2 = PM.signature({ goal: "g2", objectiveId: "OBJ-2" });
  PM.record({ goal: "g2", objectiveId: "OBJ-2", edits, authoredBy: "ODG", mission: "M2" });
  RL.recordReuseOutcome(sig2, { before: { signals: { x: 1 } }, after: { signals: { x: 1 } }, at: "t" }, { store: store2 }); // flat ⇒ INCONCLUSIVE
  const h = RL.reuseHealth(sig2, { store: store2 });
  ok("no fabricated effect: flat reuse ⇒ INCONCLUSIVE, not suppressed, not validated", h.inconclusive === 1 && h.validated === 0 && h.suppressed === false);

  console.log(`\nLEARNING-LOOP-INTEGRATION suite — ${pass} assertions passed. (positive select → failed-reuse de-select → recovery; fail-closed; no fabricated effect)`);
} finally {
  process.chdir(origCwd);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
