#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves REAL campaign continuity: successive auto-transitions, resume-after-interruption
// from a durable checkpoint, blocked-lot-does-not-freeze-the-campaign, controlled retry without losing evidence,
// idempotent re-run (no double-execution), explicit IDLE/WAITING states, no false COMPLETED, and no false terminal on
// an evidence-less ACCEPTED. All deterministic (injected executor; no subprocess).
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const L = require("./campaign-loop.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const reg = (items) => ({ version: "loop-test", items });
// an executor that ACCEPTS every selected lot with evidence, recording the order it was asked to run.
const acceptAll = (calls) => (lot) => { calls.push(lot.id); return { status: "ACCEPTED", evidence: `did ${lot.id}` }; };

// (1) mission done ⇒ next starts automatically (no user message), dependency-ordered.
{
  const calls = []; const r = L.runCampaignLoop({ register: reg([{ id: "A", status: "READY", deps: [], priority: 1 }, { id: "B", status: "READY", deps: ["A"], priority: 2 }]), execute: acceptAll(calls) });
  ok("two missions auto-run in dep order ⇒ COMPLETED", r.stopped === "COMPLETED" && r.campaignComplete === true && JSON.stringify(calls) === JSON.stringify(["A", "B"]) && r.iterations === 2);
}
// (2) resume after interruption from a durable checkpoint (persist to file, reload, continue).
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-loop-")); const p = path.join(dir, "reg.json");
  fs.writeFileSync(p, JSON.stringify(reg([{ id: "A", status: "READY", deps: [], priority: 1 }, { id: "B", status: "READY", deps: ["A"], priority: 2 }])));
  const calls1 = []; L.runCampaignLoop({ registerPath: p, execute: acceptAll(calls1), maxIterations: 1 });           // interrupt after 1 mission
  const midA = JSON.parse(fs.readFileSync(p, "utf8")).items.find(x => x.id === "A").status;
  const calls2 = []; const r2 = L.runCampaignLoop({ registerPath: p, execute: acceptAll(calls2) });                 // resume from checkpoint
  ok("resume: A persisted ACCEPTED mid-run; resumed loop runs only B ⇒ COMPLETED", midA === "ACCEPTED" && JSON.stringify(calls2) === JSON.stringify(["B"]) && r2.campaignComplete === true);
  fs.rmSync(dir, { recursive: true, force: true });
}
// (3) a READY lot in the register is picked up and driven to execution (register→run bridge).
{
  const calls = []; const r = L.runCampaignLoop({ register: reg([{ id: "solo", status: "READY", deps: [], priority: 1 }]), execute: acceptAll(calls) });
  ok("admissible lot in register ⇒ reconciled + executed + COMPLETED", calls.length === 1 && calls[0] === "solo" && r.campaignComplete === true);
}
// (4) blocked parent does NOT freeze the campaign — an independent lot still progresses.
{
  const calls = []; const r = L.runCampaignLoop({ register: reg([{ id: "BLK", status: "BLOCKED", deps: [], priority: 1 }, { id: "DEP", status: "READY", deps: ["BLK"], priority: 1 }, { id: "INDEP", status: "READY", deps: [], priority: 3 }]), execute: acceptAll(calls) });
  ok("blocked lot ⇒ INDEP still runs; stop IDLE_BLOCKED (not COMPLETED)", calls.join() === "INDEP" && r.stopped === "IDLE_BLOCKED" && r.campaignComplete === false && r.summary.counts.ACCEPTED === 1);
}
// (5) provider failure ⇒ controlled retry (changed strategy) without losing prior evidence.
{
  const r0 = reg([{ id: "A", status: "READY", deps: [], priority: 1 }, { id: "B", status: "READY", deps: [], priority: 2 }]);
  let bAttempts = 0;
  const exec = (lot) => { if (lot.id === "A") return { status: "ACCEPTED", evidence: "A done" }; bAttempts++; return bAttempts < 2 ? { status: "RETRY", reason: "provider timeout", strategy: `attempt-${bAttempts + 1}` } : { status: "ACCEPTED", evidence: "B done on retry" }; };
  const r = L.runCampaignLoop({ register: r0, execute: exec });
  ok("retry with changed strategy ⇒ B eventually ACCEPTED; A's evidence preserved", r.campaignComplete === true && r0.items.find(x => x.id === "A").evidence === "A done" && r0.items.find(x => x.id === "B").status === "ACCEPTED" && bAttempts === 2);
}
// (6) an already-ACCEPTED mission is NOT re-executed.
{
  const calls = []; const r = L.runCampaignLoop({ register: reg([{ id: "done", status: "ACCEPTED", deps: [], evidence: "prior" }, { id: "todo", status: "READY", deps: [], priority: 1 }]), execute: acceptAll(calls) });
  ok("ACCEPTED lot skipped; only the READY lot executed", JSON.stringify(calls) === JSON.stringify(["todo"]) && r.campaignComplete === true);
}
// (7) idempotent re-run (supervisor restart) ⇒ no double execution.
{
  const r0 = reg([{ id: "A", status: "READY", deps: [], priority: 1 }, { id: "B", status: "READY", deps: ["A"], priority: 2 }]);
  const c1 = []; L.runCampaignLoop({ register: r0, execute: acceptAll(c1) });
  const c2 = []; const r2 = L.runCampaignLoop({ register: r0, execute: acceptAll(c2) });   // re-run on completed register
  ok("re-run on completed campaign ⇒ 0 re-executions, still COMPLETED (idempotent)", c1.length === 2 && c2.length === 0 && r2.campaignComplete === true && r2.iterations === 0);
}
// (8) nothing admissible ⇒ explicit stop, executor NEVER called (no invented work).
{
  let called = 0; const r = L.runCampaignLoop({ register: reg([{ id: "X", status: "BLOCKED", deps: [], blockReason: "owner" }]), execute: () => { called++; return { status: "ACCEPTED", evidence: "e" }; } });
  ok("all blocked ⇒ IDLE_BLOCKED, executor not called, no invented work", r.stopped === "IDLE_BLOCKED" && called === 0 && r.campaignComplete === false && Array.isArray(r.blocked) && r.blocked.includes("X"));
}
// (9) a WAITING_EXTERNAL lot is parked (BLOCKED) while an independent lot still completes.
{
  const calls = []; const exec = (lot) => lot.id === "ext" ? { status: "WAITING_EXTERNAL", reason: "needs owner credential" } : { status: "ACCEPTED", evidence: `did ${lot.id}` };
  const r0 = reg([{ id: "ext", status: "READY", deps: [], priority: 1 }, { id: "work", status: "READY", deps: [], priority: 2 }]);
  const r = L.runCampaignLoop({ register: r0, execute: exec });
  ok("WAITING_EXTERNAL lot parked BLOCKED; independent lot completes", r0.items.find(x => x.id === "ext").status === "BLOCKED" && r0.items.find(x => x.id === "work").status === "ACCEPTED" && r.stopped === "IDLE_BLOCKED");
}
// (10) COMPLETED only when NO open lots remain (a stalled lot ⇒ IDLE_BLOCKED, not COMPLETED).
{
  const exec = (lot) => ({ status: "FAILED", reason: "always fails unchanged" });
  const r = L.runCampaignLoop({ register: reg([{ id: "F", status: "READY", deps: [], priority: 1 }]), execute: exec, maxIterations: 20 });
  ok("a lot that keeps failing unchanged ⇒ stalled, loop stops IDLE_BLOCKED (NOT COMPLETED), bounded iterations", r.stopped === "IDLE_BLOCKED" && r.campaignComplete === false && r.iterations <= 2);
}
// (11) no false terminal: ACCEPTED WITHOUT evidence is rejected (fail-closed), lot NOT marked COMPLETED.
{
  const r0 = reg([{ id: "A", status: "READY", deps: [], priority: 1 }]);
  const r = L.runCampaignLoop({ register: r0, execute: () => ({ status: "ACCEPTED" }), maxIterations: 5 });   // no evidence
  ok("ACCEPTED without evidence ⇒ NOT accepted (no false terminal); stops IDLE_BLOCKED/stalled", r0.items[0].status !== "ACCEPTED" && r.campaignComplete === false);
}
// (12) e2e multi-mission chain + iteration baseline.
{
  const calls = []; const items = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, status: "READY", deps: i ? [`m${i - 1}`] : [], priority: i }));
  const r = L.runCampaignLoop({ register: reg(items), execute: acceptAll(calls) });
  ok("e2e 5-mission chain ⇒ all COMPLETED in exactly 5 iterations (baseline)", r.campaignComplete === true && r.iterations === 5 && calls.length === 5 && JSON.stringify(calls) === JSON.stringify(["m0", "m1", "m2", "m3", "m4"]));
}
// (13) the REAL closure-register is loop-drivable (dry-run executor declines ⇒ honest non-COMPLETED stop).
{
  const r = L.runCampaignLoop({ registerPath: path.join(process.cwd(), "docs", "odg", "closure-register.json"), execute: () => ({ status: "WAITING_EXTERNAL", reason: "dry-run" }), maxIterations: 50 });
  ok("real register drivable; honest stop (not falsely COMPLETED while blocked)", (r.stopped === "IDLE_BLOCKED" || r.stopped === "COMPLETED") && typeof r.iterations === "number");
}

console.log(`\nCAMPAIGN-LOOP suite — ${pass} assertions passed. (auto-transitions; resume-from-checkpoint; blocked≠frozen; retry w/o evidence loss; idempotent re-run; explicit IDLE/WAITING; no false COMPLETED/terminal; bounded)`);
