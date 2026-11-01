#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Adversarial proof of the mission-ledger KEYLESS tamper-evidence chain
// (verifyLedger / sealFor). Hermetic: builds payloads in memory, no disk/clock/network.
"use strict";
const assert = require("assert");
const ML = require("./mission-ledger.js");
const audit = require("./audit-log.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass += 1; };

// Build a payload the way recordMission does: forward chain; the first `legacyPrefix` entries are UNSEALED (historical),
// the rest carry seal = sealFor(i, prevSeal, entry). tipSeal = the running chain tip when any entry is sealed.
function build(cores, legacyPrefix = 0) {
  const entries = []; let prev = audit.GENESIS; let hasSealed = false;
  for (let i = 0; i < cores.length; i++) {
    const core = { ...cores[i] };
    if (i < legacyPrefix) { entries.push(core); prev = ML.sealFor(i, prev, core); }
    else { core.seal = ML.sealFor(i, prev, core); prev = core.seal; hasSealed = true; entries.push(core); }
  }
  const payload = { generatedAt: "t", count: entries.length, entries };
  if (hasSealed) payload.tipSeal = prev;
  return payload;
}
const CORES = [
  { mission: "M1", proven: true, state: "RELEASED", recordedAt: "t1" },
  { mission: "M2", proven: true, state: "RELEASED", recordedAt: "t2" },
  { mission: "M3", proven: true, state: "RELEASED", recordedAt: "t3" },
];
const clone = (p) => JSON.parse(JSON.stringify(p));

console.log("mission-ledger — keyless tamper-evidence");

// (0) VALID sealed chain + VALID historical (all-legacy)
{
  const v = ML.verifyLedger(build(CORES));
  ok("valid sealed chain ⇒ ok, verified=3, tamperEvident", v.ok === true && v.verified === 3 && v.legacyUnsealed === 0 && v.tamperEvident === true);
  const vl = ML.verifyLedger(build(CORES, 3)); // all legacy
  ok("valid historical (all legacy, no seals) ⇒ ok but verified=0, NOT tamper-evident (honest)", vl.ok === true && vl.verified === 0 && vl.legacyUnsealed === 3 && vl.tamperEvident === false);
}
// (1) MODIFIED PAYLOAD (change a data field of a sealed entry)
{ const p = clone(build(CORES)); p.entries[1].mission = "M2-FORGED"; const v = ML.verifyLedger(p); ok("modified payload ⇒ BROKEN at that entry", v.ok === false && v.brokenAt === 1 && /seal mismatch/.test(v.reason)); }
// (2) MODIFIED METADATA (change recordedAt/state — metadata is inside the seal)
{ const p = clone(build(CORES)); p.entries[2].state = "ARCHIVED-FORGED"; const v = ML.verifyLedger(p); ok("modified metadata ⇒ BROKEN", v.ok === false && v.brokenAt === 2); }
// (3) DELETED entry (remove middle, fix count ⇒ chain still breaks at the now-mislinked successor)
{ const p = clone(build(CORES)); p.entries.splice(1, 1); p.count = p.entries.length; const v = ML.verifyLedger(p); ok("deleted middle entry ⇒ BROKEN (chain relink detected)", v.ok === false); }
// (4) REORDERED two sealed entries
{ const p = clone(build(CORES)); const t = p.entries[0]; p.entries[0] = p.entries[1]; p.entries[1] = t; const v = ML.verifyLedger(p); ok("reordered entries ⇒ BROKEN", v.ok === false && v.brokenAt === 0); }
// (5) BROKEN LINK / MALFORMED seal
{ const p = clone(build(CORES)); p.entries[1].seal = "deadbeef"; const v = ML.verifyLedger(p); ok("malformed/forged seal ⇒ BROKEN", v.ok === false && v.brokenAt === 1); }
// (6) TRUNCATED FILE — drop a trailing entry (count mismatch) and (separately) count-fixed-but-tip-stale
{ const p = clone(build(CORES)); p.entries.pop(); /* count stays 3 */ const v = ML.verifyLedger(p); ok("truncation with stale count ⇒ BROKEN (count mismatch)", v.ok === false && /count/.test(v.reason));
  const p2 = clone(build(CORES)); p2.entries.pop(); p2.count = p2.entries.length; const v2 = ML.verifyLedger(p2); ok("truncation with fixed count ⇒ BROKEN (tip seal mismatch)", v2.ok === false && /tip seal/.test(v2.reason)); }
// (7) INTERRUPTED/PARTIAL WRITE simulation — a half-written payload parsed with count > entries ⇒ BROKEN
{ const p = clone(build(CORES)); p.count = 99; const v = ML.verifyLedger(p); ok("partial-write (count > entries) ⇒ BROKEN (never silently trusted)", v.ok === false && /count/.test(v.reason)); }
// (8) LEGACY PREFIX + sealed tail: valid; then tamper a LEGACY entry ⇒ first sealed successor BREAKS (legacy tamper detected once sealing began)
{
  const okp = build(CORES, 1); // entry0 legacy, entries 1-2 sealed
  ok("mixed legacy+sealed ⇒ ok, verified=2, legacyUnsealed=1", ML.verifyLedger(okp).ok === true && ML.verifyLedger(okp).verified === 2 && ML.verifyLedger(okp).legacyUnsealed === 1);
  const tam = clone(okp); tam.entries[0].mission = "M1-LEGACY-FORGED"; const v = ML.verifyLedger(tam);
  ok("tampering a LEGACY entry breaks the first sealed successor (bound to its content)", v.ok === false && v.brokenAt === 1);
}
// (9) HONEST LIMITATION A — tampering a legacy entry in an ALL-legacy ledger is NOT detected (no seals ⇒ not tamper-evident)
{ const p = clone(build(CORES, 3)); p.entries[0].mission = "FORGED"; const v = ML.verifyLedger(p); ok("all-legacy tamper ⇒ still ok (honest: unsealed history is NOT tamper-evident)", v.ok === true && v.tamperEvident === false); }
// (10) HONEST LIMITATION B — FULL-REWRITE forgery: rebuild the entire chain over forged entries + recompute all seals + tipSeal
{ const forged = build([{ mission: "ALL", proven: true, state: "FORGED", recordedAt: "x" }]); const v = ML.verifyLedger(forged);
  ok("full-rewrite forgery (all seals recomputed) ⇒ verifyLedger ok:true — the stated KEYLESS limit (needs keyed HMAC, owner-gated)", v.ok === true && v.tamperEvident === true); }
// (11) malformed payloads ⇒ fail-closed
{ ok("no entries array ⇒ fail-closed", ML.verifyLedger({}).ok === false && ML.verifyLedger(null).ok === false);
  const p = clone(build(CORES)); p.entries[1] = 42; const v = ML.verifyLedger(p); ok("malformed entry ⇒ fail-closed", v.ok === false && /malformed/.test(v.reason)); }

console.log(`\nMISSION-LEDGER INTEGRITY — ${pass} assertions passed. (keyless hash-chain: detects modify/reorder/delete/truncate/partial-write; legacy honestly unsealed; keyed authenticity is owner-gated out of scope)`);
