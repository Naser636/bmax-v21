#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Exercises the REAL odg-schedule-tick decision path (tickOnce) hermetically: injected
// dispatch (NO real odg-run spawn), injected recordAttempt (no fs), deny-by-default canary admission, the excellence
// gate, and the AXE-3 tamper-evident audit chain. No mission is really executed; the scheduler is NOT activated.
"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const AUDIT = require("../core/audit-log.js");
const tick = require("./odg-schedule-tick.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const noRecord = () => {};
const okDispatch = () => ({ verified: true, detail: "stub (no real odg-run)" });

// (1) empty allowlist ⇒ IDLE, decision audited + verifiable, ZERO dispatch.
{
  let dispatched = 0;
  const d = tick.tickOnce({ allow: new Set(), proven: new Set(), dispatch: () => { dispatched++; return okDispatch(); }, recordAttempt: noRecord, chain: [] });
  ok("tick: empty allowlist ⇒ IDLE + audited + verifiable + ZERO dispatch", d.status === "IDLE" && dispatched === 0 && Array.isArray(d.auditChain) && d.auditChain.length === 1 && AUDIT.verifyChain(d.auditChain).ok === true);
}

// (2) canary-allowed mission + injected verified dispatch ⇒ PASS via the READ-ONLY seam (no real odg-run), audited.
{
  let dispatched = 0;
  const d = tick.tickOnce({ allow: new Set(["M1"]), proven: new Set(), dispatch: (it) => { dispatched++; return { verified: true, detail: "ok" }; }, recordAttempt: noRecord, chain: [] });
  ok("tick: allowed mission ⇒ PASS via injected dispatch (read-only seam, no real odg-run)", d.status === "PASS" && d.mission === "M1" && dispatched === 1);
  ok("tick: PASS decision is hash-chained + verifiable", d.auditChain.length === 1 && AUDIT.verifyChain(d.auditChain).ok === true);
}

// (3) deny-by-default: the queue is allowlist-derived, so a non-allowlisted id is never a candidate (already proven)
//     ⇒ an already-proven allowlisted mission ⇒ IDLE (dedup), NOT dispatched.
{
  let dispatched = 0;
  const d = tick.tickOnce({ allow: new Set(["M1"]), proven: new Set(["M1"]), dispatch: () => { dispatched++; return okDispatch(); }, recordAttempt: noRecord, chain: [] });
  ok("tick: proven allowlisted mission ⇒ IDLE (dedup), no dispatch", d.status === "IDLE" && dispatched === 0);
}

// (4) EXCELLENCE gate active in the tick path: a reviewer returning a prohibited claim ⇒ BLOCKED, NO dispatch.
{
  let dispatched = 0;
  const badReviewer = () => ({ verdict: "IMPROVE", claims: [{ claim: "world number one", justified: false }], staleReferences: [], gaps: [] });
  const d = tick.tickOnce({ allow: new Set(["M1"]), proven: new Set(), dispatch: () => { dispatched++; return okDispatch(); }, recordAttempt: noRecord, reviewExcellence: badReviewer, chain: [] });
  ok("tick: excellence gate fires — prohibited claim ⇒ BLOCKED, no dispatch", d.status === "BLOCKED" && /EXCELLENCE_PROHIBITED_CLAIM/.test(d.reason) && dispatched === 0);
}

// (5) chain CONTINUITY across ticks + tamper detection.
{
  const d1 = tick.tickOnce({ allow: new Set(), dispatch: okDispatch, recordAttempt: noRecord, chain: [] });
  const d2 = tick.tickOnce({ allow: new Set(), dispatch: okDispatch, recordAttempt: noRecord, chain: d1.auditChain });
  ok("tick: audit chain extends across ticks + stays intact", d2.auditChain.length === 2 && AUDIT.verifyChain(d2.auditChain).ok === true);
  const t = d2.auditChain.map((e) => ({ ...e })); t[0] = { ...t[0], payload: { ...t[0].payload, status: "HACKED" } };
  ok("tick: tampered persisted chain ⇒ detected", AUDIT.verifyChain(t).ok === false);
}

// (6) persist/read round-trip of the audit artifact in an isolated temp cwd (no repo writes).
{
  const prev = process.cwd(); const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tick-test-"));
  try {
    process.chdir(dir);
    const chain = AUDIT.appendEntry([], { status: "IDLE", mission: null, reason: "x" });
    tick.persistAuditChain(chain);
    const back = tick.readAuditChain();
    ok("tick: audit-chain persist/read round-trip verifiable", JSON.stringify(back) === JSON.stringify(chain) && AUDIT.verifyChain(back).ok === true);
  } finally { process.chdir(prev); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

console.log(`\nODG-SCHEDULE-TICK — ${pass} assertions passed. (NO real mission executed; scheduler NOT activated.)`);
