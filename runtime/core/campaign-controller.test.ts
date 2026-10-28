#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the persistent campaign controller: dependency-aware next-lot selection (via
// dep-planner), priority ordering, BLOCKED skipped (dependents stay open, independents flow), fail-closed ACCEPTED
// (evidence required), durable persist + resume, and that the REAL closure-register is drivable.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const C = require("./campaign-controller.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const reg = (items) => ({ version: "t", items });

// (1) deps gate selection: B depends on A (READY) ⇒ A selected first; after A ACCEPTED ⇒ B selected.
{
  let r = reg([
    { id: "A", status: "READY", deps: [], priority: 2 },
    { id: "B", status: "READY", deps: ["A"], priority: 1 },
  ]);
  const n1 = C.selectNextLot(r);
  ok("dep-gated: A selected before B (B's dep A not yet ACCEPTED, despite higher priority)", n1.lot.id === "A");
  C.advance(r, "A", { status: "ACCEPTED", evidence: "did A" });
  ok("after A ACCEPTED ⇒ B becomes admissible", C.selectNextLot(r).lot.id === "B");
}

// (2) priority within an eligible layer.
{
  const r = reg([{ id: "X", status: "READY", deps: [], priority: 5 }, { id: "Y", status: "READY", deps: [], priority: 2 }]);
  ok("lower priority number selected first", C.selectNextLot(r).lot.id === "Y");
}

// (3) BLOCKED skipped; its dependent stays unselectable; an independent READY lot still flows.
{
  const r = reg([
    { id: "BLK", status: "BLOCKED", deps: [], priority: 1, blockReason: "owner-gated" },
    { id: "DEP_ON_BLK", status: "READY", deps: ["BLK"], priority: 1 },
    { id: "INDEP", status: "READY", deps: [], priority: 3 },
  ]);
  ok("BLOCKED not selected; dependent-on-blocked not selected; independent lot selected", C.selectNextLot(r).lot.id === "INDEP");
}

// (4) fail-closed ACCEPTED requires evidence.
{
  const r = reg([{ id: "A", status: "IN_PROGRESS", deps: [], priority: 1 }]);
  ok("ACCEPTED without evidence ⇒ EVIDENCE_REQUIRED (rejected)", C.advance(r, "A", { status: "ACCEPTED" }).code === "EVIDENCE_REQUIRED" && r.items[0].status === "IN_PROGRESS");
  ok("ACCEPTED with evidence ⇒ accepted", C.advance(r, "A", { status: "ACCEPTED", evidence: "proof" }).ok === true && r.items[0].status === "ACCEPTED");
}

// (5) durable persist + RESUME: save, reload, continue from the same next lot.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-campaign-"));
  const p = path.join(dir, "reg.json");
  let r = reg([{ id: "A", status: "READY", deps: [], priority: 1 }, { id: "B", status: "READY", deps: ["A"], priority: 2 }]);
  C.saveRegister(p, r);
  // simulate interruption: reload from disk, advance A, persist
  const l1 = C.loadRegister(p); C.advance(l1.register, "A", { status: "ACCEPTED", evidence: "done A" }); C.saveRegister(p, l1.register);
  // resume: fresh load picks up B as next (no re-analysis)
  const l2 = C.loadRegister(p);
  ok("resume after persist: A ACCEPTED on disk, next lot = B", l2.ok && l2.register.items.find(x => x.id === "A").status === "ACCEPTED" && C.selectNextLot(l2.register).lot.id === "B");
  fs.rmSync(dir, { recursive: true, force: true });
}

// (6) cycle ⇒ surfaced (fail-closed, via dep-planner), not a crash.
{
  const r = reg([{ id: "A", status: "READY", deps: ["B"] }, { id: "B", status: "READY", deps: ["A"] }]);
  ok("dependency cycle ⇒ idle with planning-error reason (no crash)", C.selectNextLot(r).lot === null && /planning error/.test(C.selectNextLot(r).reason));
}

// (7) summary + the REAL register is loadable and drivable.
{
  const real = C.loadRegister(path.join(process.cwd(), "docs", "odg", "closure-register.json"));
  ok("real closure-register loads", real.ok === true && real.register.items.length >= 8);
  const s = C.summary(real.register);
  ok("real register: has a next lot OR explicit idle reason; blockers listed", (s.nextLot || s.idleReason) && Array.isArray(s.blocked));
  ok("real register: ACCEPTED items carry evidence (closure discipline)", real.register.items.filter(i => i.status === "ACCEPTED").every(i => typeof i.evidence === "string" && i.evidence.length > 0));
}

// (8) DECOMPOSITION PATTERN (the one this campaign relied on): a BLOCKED parent does NOT freeze the register — an
// independent decomposed prep subtask keeps flowing, and the engine distinguishes "truly BLOCKED" from "awaiting deps".
{
  // parent BLOCKED, its ACCEPTED prep sibling, and a fresh independent READY prep lot.
  const r = reg([
    { id: "PARENT", status: "BLOCKED", deps: ["PARENT_PREP"], priority: 1, blockReason: "owner-gated external remainder" },
    { id: "PARENT_PREP", status: "ACCEPTED", deps: [], priority: 1, evidence: "prep done" },
    { id: "OTHER_PREP", status: "READY", deps: [], priority: 2 },
  ]);
  ok("blocked parent does NOT freeze the register: independent prep subtask is selected", C.selectNextLot(r).lot.id === "OTHER_PREP");
  // once OTHER_PREP is accepted, no admissible lot remains and the parent is STILL correctly reported BLOCKED (not idle-by-deps-confusion).
  C.advance(r, "OTHER_PREP", { status: "ACCEPTED", evidence: "done" });
  const s = C.summary(r);
  ok("after prep accepted ⇒ idle; parent reported BLOCKED (not mislabelled)", s.idle === true && s.blocked.some(b => b.id === "PARENT") && !s.nextLot);
}

// (9) distinguishes truly-BLOCKED from awaiting-deps: a READY item whose dep is BLOCKED is not selectable, but the
// idleReason names the blocker (so a human can act), whereas a READY item with satisfied deps IS selected.
{
  const blockedChain = reg([
    { id: "GATE", status: "BLOCKED", deps: [], priority: 1, blockReason: "needs authorized install" },
    { id: "WAITING", status: "READY", deps: ["GATE"], priority: 1 },
  ]);
  const n = C.selectNextLot(blockedChain);
  ok("READY item depending on a BLOCKED gate ⇒ not selected; idleReason names the blocker", n.lot === null && /GATE/.test(n.reason));
  const freed = reg([
    { id: "GATE", status: "ACCEPTED", deps: [], priority: 1, evidence: "installed" },
    { id: "WAITING", status: "READY", deps: ["GATE"], priority: 1 },
  ]);
  ok("same item becomes selectable once its dep is ACCEPTED (not BLOCKED)", C.selectNextLot(freed).lot.id === "WAITING");
}

// (10) NO-REPEAT guard: a lot whose attempt FAILED is not re-selected while UNCHANGED; an independent lot flows; a
// new strategy (or cleared failure) makes it selectable again. (Before the fix, selectNextLot looped the same lot.)
{
  const r = reg([{ id: "A", status: "READY", deps: [], priority: 1 }, { id: "B", status: "READY", deps: [], priority: 2 }]);
  // first pick = A (priority); record a failed attempt, unchanged.
  const first = C.selectNextLot(r).lot.id;
  C.advance(r, first, { attemptFailed: true, reason: "same failure, no change" });
  ok("failed+unchanged lot is NOT re-selected; independent lot flows instead", first === "A" && C.selectNextLot(r).lot.id === "B");
  // fail B too (unchanged) ⇒ both stalled ⇒ idle with a stalled reason (not an infinite re-pick).
  C.advance(r, "B", { attemptFailed: true, reason: "same failure" });
  const idle = C.selectNextLot(r);
  ok("all failed+unchanged ⇒ idle, reason names stalled (no infinite repeat)", idle.lot === null && /stalled/.test(idle.reason) && idle.stalled.length === 2);
  ok("summary surfaces stalled with attempt counts", C.summary(r).stalled.length === 2 && C.summary(r).stalled.every(s => s.attempts >= 1));
  // a NEW strategy = a genuinely different attempt ⇒ fingerprint changes ⇒ A selectable again.
  C.advance(r, "A", { strategy: "different-approach-v2" });
  ok("new strategy un-stalls the lot (different attempt)", C.selectNextLot(r).lot.id === "A");
  // explicit clearFailure also re-admits (e.g. new external evidence arrived).
  C.advance(r, "B", { clearFailure: true });
  ok("clearFailure re-admits a previously-stalled lot", C.summary(r).stalled.every(s => s.id !== "B"));
}

// (11) fingerprint stability + sensitivity: deterministic; changes only when the actionable definition changes.
{
  const l = { id: "X", title: "t", deps: ["d"], strategy: "s", inputsHash: "h" };
  const fp1 = C.lotFingerprint(l);
  ok("fingerprint deterministic + 16-hex", fp1 === C.lotFingerprint({ ...l }) && /^[0-9a-f]{16}$/.test(fp1));
  ok("fingerprint changes on strategy change, stable on status change", C.lotFingerprint({ ...l, strategy: "s2" }) !== fp1 && C.lotFingerprint({ ...l, status: "READY" }) === fp1);
}

console.log(`\nCAMPAIGN-CONTROLLER suite — ${pass} assertions passed. (dep-aware selection, priority, BLOCKED-skip, fail-closed ACCEPTED, durable persist+resume, cycle-safe; decomposition: blocked-parent never freezes independent prep; NO-REPEAT: failed+unchanged lot not re-selected until strategy/evidence changes; real register drivable)`);
