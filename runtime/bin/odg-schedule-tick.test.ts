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
  const d = tick.tickOnce({ allow: new Set(["M1"]), proven: new Set(), dispatch: (it) => { dispatched++; return { verified: true, detail: "ok" }; }, recordAttempt: noRecord, chain: [], assessSafety: () => ({ safe: true, reason: "test: read-only" }) });
  ok("tick: allowed mission ⇒ PASS via injected dispatch (read-only seam, no real odg-run)", d.status === "PASS" && d.mission === "M1" && dispatched === 1);
  ok("tick: PASS decision is hash-chained + verifiable", d.auditChain.length === 1 && AUDIT.verifyChain(d.auditChain).ok === true);
}

// (3) deny-by-default: the queue is allowlist-derived, so a non-allowlisted id is never a candidate (already proven)
//     ⇒ an already-proven allowlisted mission ⇒ IDLE (dedup), NOT dispatched.
{
  let dispatched = 0;
  const d = tick.tickOnce({ allow: new Set(["M1"]), proven: new Set(["M1"]), dispatch: () => { dispatched++; return okDispatch(); }, recordAttempt: noRecord, chain: [], assessSafety: () => ({ safe: true, reason: "test: read-only" }) });
  ok("tick: proven allowlisted mission ⇒ IDLE (dedup), no dispatch", d.status === "IDLE" && dispatched === 0);
}

// (4) EXCELLENCE gate active in the tick path: a reviewer returning a prohibited claim ⇒ BLOCKED, NO dispatch.
{
  let dispatched = 0;
  const badReviewer = () => ({ verdict: "IMPROVE", claims: [{ claim: "world number one", justified: false }], staleReferences: [], gaps: [] });
  const d = tick.tickOnce({ allow: new Set(["M1"]), proven: new Set(), dispatch: () => { dispatched++; return okDispatch(); }, recordAttempt: noRecord, reviewExcellence: badReviewer, chain: [], assessSafety: () => ({ safe: true, reason: "test: read-only" }) });
  ok("tick: excellence gate fires — prohibited claim ⇒ BLOCKED, no dispatch", d.status === "BLOCKED" && /EXCELLENCE_PROHIBITED_CLAIM/.test(d.reason) && dispatched === 0);
}

// (5) chain CONTINUITY across ticks + tamper detection.
{
  const d1 = tick.tickOnce({ allow: new Set(), dispatch: okDispatch, recordAttempt: noRecord, chain: [] });
  const d2 = tick.tickOnce({ allow: new Set(), dispatch: okDispatch, recordAttempt: noRecord, chain: d1.auditChain });
  ok("tick: audit chain extends across ticks + stays intact", d2.auditChain.length === 2 && AUDIT.verifyChain(d2.auditChain).ok === true);
  const t = d2.auditChain.map((e) => ({ ...e })); t[0] = { ...t[0], payload: { ...t[0].payload, status: "HACKED" } };
  ok("tick: tampered persisted chain ⇒ detected", AUDIT.verifyChain(t).ok === false);
  // SEC#3 (P0-E): the verify-on-read GATE must now ACT on that detection (not just be able to detect it).
  ok("SEC#3 auditIntegrityGate: intact chain ⇒ ok", tick.auditIntegrityGate(d2.auditChain).ok === true);
  ok("SEC#3 auditIntegrityGate: TAMPERED chain ⇒ fail-closed (ok:false, brokenAt named)", (() => { const g = tick.auditIntegrityGate(t); return g.ok === false && g.brokenAt === 0 && typeof g.reason === "string"; })());
  ok("SEC#3 auditIntegrityGate: empty/absent chain ⇒ ok (fresh start, not blocked)", tick.auditIntegrityGate([]).ok === true && tick.auditIntegrityGate(null).ok === true);
  // truncation/reorder of a persisted chain is likewise refused on read.
  ok("SEC#3 auditIntegrityGate: truncated chain ⇒ fail-closed", tick.auditIntegrityGate([d2.auditChain[1]]).ok === false);
}

// (5c) C#5 — Truth-Lock DEFAULT-ON at the unattended launcher with explicit opt-out.
{
  const save = process.env.ODG_TRUTH_LOCK_ENFORCE;
  try {
    delete process.env.ODG_TRUTH_LOCK_ENFORCE;
    ok("C#5 launcherEnforce: UNSET ⇒ enforce (default-on, not record-only)", tick.launcherEnforce() === true);
    process.env.ODG_TRUTH_LOCK_ENFORCE = "0";
    ok("C#5 launcherEnforce: =0 ⇒ opt-out (RECORDED, for throwaway/CI fixtures)", tick.launcherEnforce() === false);
    process.env.ODG_TRUTH_LOCK_ENFORCE = "false";
    ok("C#5 launcherEnforce: =false ⇒ opt-out", tick.launcherEnforce() === false);
    process.env.ODG_TRUTH_LOCK_ENFORCE = "1";
    ok("C#5 launcherEnforce: =1 ⇒ enforce", tick.launcherEnforce() === true);
  } finally { if (save === undefined) delete process.env.ODG_TRUTH_LOCK_ENFORCE; else process.env.ODG_TRUTH_LOCK_ENFORCE = save; }
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

// (7) CODE-ENFORCED READ-ONLY GATE — allowlisted + read-only mission spec ⇒ PASS, dispatched (positive control).
{
  let dispatched = 0;
  const d = tick.tickOnce({ allow: new Set(["ODG_CANARY_RO"]), proven: new Set(), dispatch: (it) => { dispatched++; return { verified: true, detail: "ok" }; }, recordAttempt: noRecord, chain: [],
    loadSpec: () => ({ mission: "ODG_CANARY_RO", requiresEngineering: false, authorizedPaths: [] }) });
  ok("tick: allowlisted + read-only spec ⇒ PASS, dispatched (safety gate admits)", d.status === "PASS" && dispatched === 1);
}
// (8) FAIL-OPEN CLOSED (the audit's flagged gap): an allowlisted but MUTATING mission ⇒ BLOCKED, NEVER dispatched.
{
  let dispatched = 0;
  const d = tick.tickOnce({ allow: new Set(["ODG_CANARY_MUT"]), proven: new Set(), dispatch: (it) => { dispatched++; return { verified: true }; }, recordAttempt: noRecord, chain: [],
    loadSpec: () => ({ mission: "ODG_CANARY_MUT", requiresEngineering: true, authorizedPaths: ["runtime/core/x.ts"] }) });
  ok("tick: allowlisted-but-MUTATING mission ⇒ BLOCKED + CANARY_REFUSES_NON_READONLY + ZERO dispatch (canary cannot become an engineering executor via the allowlist)",
     d.status === "BLOCKED" && /CANARY_REFUSES_NON_READONLY/.test(d.reason) && dispatched === 0);
}
// (9) FAIL-CLOSED: an allowlisted mission whose definition is missing/unreadable ⇒ BLOCKED, never dispatched.
{
  let dispatched = 0;
  const d = tick.tickOnce({ allow: new Set(["ODG_CANARY_UNKNOWN"]), proven: new Set(), dispatch: () => { dispatched++; return { verified: true }; }, recordAttempt: noRecord, chain: [],
    loadSpec: () => null });
  ok("tick: allowlisted mission with NO definition ⇒ BLOCKED (fail-closed, CANARY_SPEC_UNAVAILABLE), ZERO dispatch",
     d.status === "BLOCKED" && /CANARY_SPEC_UNAVAILABLE/.test(d.reason) && dispatched === 0);
}
// (10) network / spend / destructive declarations ⇒ BLOCKED each (read-only gate rejects non-RO effects).
{
  const mk = (over) => tick.tickOnce({ allow: new Set(["ODG_CANARY_X"]), proven: new Set(), dispatch: () => ({ verified: true }), recordAttempt: noRecord, chain: [],
    loadSpec: () => Object.assign({ mission: "ODG_CANARY_X", requiresEngineering: false, authorizedPaths: [] }, over) });
  const net = mk({ requiresNetwork: true }), spend = mk({ budgetEur: 5 }), destr = mk({ destructive: true });
  ok("tick: network/spend/destructive mission ⇒ BLOCKED each (no non-read-only effect admitted)",
     net.status === "BLOCKED" && spend.status === "BLOCKED" && destr.status === "BLOCKED");
}

// (11) REAL-LOADER regression (the audit's flagged gap): the REAL loadMissionSpec against a REAL mutating mission file
// that predates the requires_engineering schema (mode=IMPLEMENT, no mutation flags) ⇒ BLOCKED, ZERO dispatch. This
// exercises the on-disk classifier, not an injected stub — default-DENY, absence of a flag is NOT read-only.
{
  const realMut = "BOOTSTRAP_RUNTIME_ENGINEERING";   // real file, mode IMPLEMENT, no requires_engineering/authorized_paths
  if (fs.existsSync(path.join(process.cwd(), "runtime", "missions", realMut + ".json"))) {
    let dispatched = 0;
    const d = tick.tickOnce({ allow: new Set([realMut]), proven: new Set(), dispatch: () => { dispatched++; return { verified: true }; }, recordAttempt: noRecord, chain: [] });   // NO loadSpec/assessSafety injection ⇒ real classifier
    ok("tick: REAL mutating mission file (mode=IMPLEMENT, no flags) ⇒ BLOCKED + ZERO dispatch via the real on-disk classifier (default-deny)",
       d.status === "BLOCKED" && dispatched === 0 && /CANARY_REFUSES_NON_READONLY/.test(d.reason));
  } else {
    ok("tick: (real-loader regression skipped — fixture mission absent)", true);
  }
}

// (12) TYPE-CONFUSION fail-closed (re-audit caveat): the PURE classifier must NOT let a non-string `mode` coerce into an
// admitted read-only mode. ["READ_ONLY"].toString()==="READ_ONLY" would slip through a naive String(); the typeof guard
// blocks it. String "READ_ONLY" stays admitted (requiresEngineering false); array/object/number/null ⇒ requiresEngineering true.
{
  const sp = (mode) => tick.canarySpecFromMission({ mission: "P", mode, requires_engineering: false, authorized_paths: [] }, "P");
  ok("canarySpecFromMission: string 'READ_ONLY' ⇒ read-only (requiresEngineering false); array/object/number/null mode ⇒ engineering (true) — no coercion",
     sp("READ_ONLY").requiresEngineering === false && sp(["READ_ONLY"]).requiresEngineering === true && sp({ x: 1 }).requiresEngineering === true && sp(1).requiresEngineering === true && sp(null).requiresEngineering === true && tick.canarySpecFromMission(null, "P") === null);
}

console.log(`\nODG-SCHEDULE-TICK — ${pass} assertions passed. (NO real mission executed; scheduler NOT activated.)`);
