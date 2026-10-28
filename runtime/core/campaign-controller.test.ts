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

console.log(`\nCAMPAIGN-CONTROLLER suite — ${pass} assertions passed. (dep-aware selection, priority, BLOCKED-skip, fail-closed ACCEPTED, durable persist+resume, cycle-safe; real register drivable)`);
