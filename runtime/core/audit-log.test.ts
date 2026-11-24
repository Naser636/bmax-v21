#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Adversarial suite for the hash-chained append-only audit log. Hermetic, no clock.
"use strict";
const assert = require("assert");
const A = require("./audit-log.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// build a 3-entry chain
let ch = [];
ch = A.appendEntry(ch, { at: "2026-10-27T00:00:00Z", event: "mission.start", mission: "M1" });
ch = A.appendEntry(ch, { at: "2026-10-27T00:00:01Z", event: "gate.admit", mission: "M1" });
ch = A.appendEntry(ch, { at: "2026-10-27T00:00:02Z", event: "exec.verified", mission: "M1" });

// (1) intact chain verifies
ok("intact chain ⇒ verify ok", A.verifyChain(ch).ok === true && A.verifyChain(ch).length === 3);
// (2) append is non-mutating + links correctly
ok("append links to tail (prevHash = previous.hash)", ch[1].prevHash === ch[0].hash && ch[2].prevHash === ch[1].hash && ch[0].prevHash === A.GENESIS);
// (3) TAMPER a middle payload ⇒ detected at that index
{ const t = ch.map(e => ({ ...e })); t[1] = { ...t[1], payload: { ...t[1].payload, event: "gate.DENY-hidden" } }; const v = A.verifyChain(t); ok("tampered middle payload ⇒ detected", v.ok === false && v.brokenAt === 1 && /tampered/.test(v.reason)); }
// (4) REORDER two entries ⇒ detected (seq mismatch)
{ const t = [ch[0], ch[2], ch[1]]; const v = A.verifyChain(t); ok("reordered entries ⇒ detected", v.ok === false && /seq mismatch|prevHash/.test(v.reason)); }
// (5) DELETE a middle entry ⇒ detected
{ const t = [ch[0], ch[2]]; const v = A.verifyChain(t); ok("deleted middle entry ⇒ detected", v.ok === false); }
// (6) INSERT a forged entry ⇒ detected
{ const forged = A.appendEntry([ch[0]], { event: "forged" })[1]; const t = [ch[0], forged, ch[1], ch[2]]; const v = A.verifyChain(t); ok("inserted forged entry ⇒ detected", v.ok === false); }
// (7) FORGE a hash (recompute-proof) ⇒ detected
{ const t = ch.map(e => ({ ...e })); t[2] = { ...t[2], payload: { ...t[2].payload, event: "exec.FAILED" }, hash: t[2].hash }; const v = A.verifyChain(t); ok("payload changed but hash kept ⇒ detected", v.ok === false && v.brokenAt === 2); }
// (8) fail-closed on malformed input
ok("malformed chain ⇒ fail-closed", A.verifyChain(null).ok === false && A.verifyChain([{ seq: 0 }]).ok === false);
// (9) empty chain is trivially intact
ok("empty chain ⇒ intact", A.verifyChain([]).ok === true && A.verifyChain([]).length === 0);

// ───── KEYED-HMAC + TIP-ANCHOR mechanism (P0-E SEC#3 follow-on; owner provisions the key, mechanism proven here) ─────
const KEY = "test-ephemeral-audit-key-DO-NOT-USE-IN-PROD";
// build a keyed chain with the same payloads
let kch = [];
kch = A.appendEntry(kch, { at: "t0", event: "mission.start" }, { key: KEY });
kch = A.appendEntry(kch, { at: "t1", event: "gate.admit" }, { key: KEY });
kch = A.appendEntry(kch, { at: "t2", event: "exec.verified" }, { key: KEY });

// (10) keyed chain verifies with the key; result reports keyed:true
{ const v = A.verifyChain(kch, { key: KEY }); ok("keyed chain verifies with the key (keyed:true)", v.ok === true && v.keyed === true && v.length === 3); }
// (11) keyed entry hash DIFFERS from the keyless hash (HMAC actually applied, not sha256)
ok("keyed hash != keyless hash (HMAC applied)", kch[0].hash !== A.entryHash(0, A.GENESIS, kch[0].payload));
// (12) FULL-REWRITE forgery: an attacker without the key rebuilds a self-consistent KEYLESS chain over forged payloads.
//      Keyless verify PASSES it (the core weakness) — KEYED verify REJECTS it (the fix).
{
  let forged = [];
  forged = A.appendEntry(forged, { at: "t0", event: "mission.start" });            // no key (attacker can't repro HMAC)
  forged = A.appendEntry(forged, { at: "t1", event: "gate.DENY-hidden" });          // forged payload
  forged = A.appendEntry(forged, { at: "t2", event: "exec.FAILED-hidden" });        // forged payload
  ok("keyless verify PASSES a full-rewrite forgery (demonstrates the weakness)", A.verifyChain(forged).ok === true);
  const vk = A.verifyChain(forged, { key: KEY });
  ok("KEYED verify REJECTS the full-rewrite forgery (attacker lacks the key)", vk.ok === false && vk.keyed === true);
}
// (13) WRONG key ⇒ rejected
ok("verifying a keyed chain with the WRONG key ⇒ rejected", A.verifyChain(kch, { key: "wrong-key" }).ok === false);
// (14) TAIL TRUNCATION: dropping the last entry still yields a valid prefix chain (keyless verify passes) —
//      the out-of-band tip ANCHOR detects it.
{
  const anchor = A.chainTip(kch);                 // stored out-of-band at length 3
  const truncated = kch.slice(0, 2);
  ok("verify alone PASSES a truncated chain (prefix stays valid)", A.verifyChain(truncated, { key: KEY }).ok === true);
  const vt = A.verifyChain(truncated, { key: KEY, expectedTip: anchor });
  ok("tip anchor DETECTS tail truncation (tipAnchored:true, ok:false)", vt.ok === false && vt.tipAnchored === true && /tip/.test(vt.reason));
}
// (15) EXTENSION past the anchor is likewise detected
{ const anchor = A.chainTip(kch.slice(0, 2)); const vx = A.verifyChain(kch, { key: KEY, expectedTip: anchor }); ok("tip anchor detects extension past the anchored tip", vx.ok === false && vx.tipAnchored === true); }
// (16) keyed + anchored happy path ⇒ ok with both flags true
ok("keyed + correct tip anchor ⇒ ok, keyed+tipAnchored true", (() => { const v = A.verifyChain(kch, { key: KEY, expectedTip: A.chainTip(kch) }); return v.ok === true && v.keyed === true && v.tipAnchored === true; })());
// (17) BACKWARD-COMPAT: the historical keyless API is byte-identical (same hashes, keyed:false)
//      V17.5: new entries are sealed cv:2 (deep canon); the keyless entryHash with cv=2 reproduces them, keyed:false.
ok("keyless path (cv-2 hash reproducible, keyed:false)", ch[0].cv === 2 && ch[0].hash === A.entryHash(0, A.GENESIS, ch[0].payload, undefined, 2) && A.verifyChain(ch).keyed === false && A.verifyChain(ch).tipAnchored === false);
// (18) HISTORICAL-FORMAT PIN (NOT self-referential): the keyless preimage MUST stay NUL-separated, matching the
//      format every already-sealed chain was written with. Pinned to the exact historical hex AND recomputed
//      independently from the NUL material — a separator change (e.g. NUL→space) would break BOTH and is caught here.
{
  const crypto = require("crypto");
  const HISTORICAL = "8f1e6964e1ea194c3aaff09d6d6b278f9d40cefc24c25584dce239450de4327d"; // sha256("0\0GENESIS\042"), pre-keyed-HMAC
  const NUL = String.fromCharCode(0); const independent = crypto.createHash("sha256").update("0"+NUL+"GENESIS"+NUL+"42").digest("hex");
  ok("keyless entryHash(0,GENESIS,42) == historical NUL-sealed hash (format pinned, non-self-referential)", A.entryHash(0, A.GENESIS, 42) === HISTORICAL && HISTORICAL === independent);
}

// ===== V17.5 SECURITY FIX — deep canon (cv:2), legacy verification, no downgrade =====
// LEGACY fixture: produced by the PRE-FIX audit-log.ts (origin/main 492db6c0) — hashes pinned, NOT recomputed here.
const LEGACY = [{"seq":0,"prevHash":"GENESIS","payload":{"at":"t0","event":"mission.start","detail":{"decision":"ADMIT","actor":"odg"}},"hash":"18970a2e86b6eb7d1b62817d826c8a03a832abc1992aac1ef751188967572777"},{"seq":1,"prevHash":"18970a2e86b6eb7d1b62817d826c8a03a832abc1992aac1ef751188967572777","payload":{"at":"t1","event":"gate","detail":{"decision":"DENY","actor":"odg"}},"hash":"501d6460bc981e5e9510c3d456782737ea9226be53f2a1fc0f83b12bc535525a"}];
const LEGACY_KEYED = [{"seq":0,"prevHash":"GENESIS","payload":{"at":"t0","detail":{"decision":"ADMIT"}},"hash":"d71ef287f8b0a2f4ba3502129f5f885f7f565056846a789dae56c4e0250bb25a"}];
const clone = (x) => JSON.parse(JSON.stringify(x));
// (19) THE DEFECT, reproduced: on a LEGACY (shallow-canon) entry a NESTED payload field is NOT covered — tamper passes.
{ const t = clone(LEGACY); t[1].payload.detail.decision = "ADMIT"; const v = A.verifyChain(t);
  ok("LEGACY entry: nested tamper is NOT detected (the pre-fix defect, reproduced; surfaced as LEGACY_SHALLOW_CANON)", v.ok === true && v.legacyShallowCanon === 2 && v.canonStatus === A.LEGACY_SHALLOW_CANON); }
// (20) THE FIX: the same nested tamper on a cv-2 entry IS detected.
{ let c = []; c = A.appendEntry(c, LEGACY[0].payload); c = A.appendEntry(c, LEGACY[1].payload);
  ok("cv-2 chain verifies (deepCanon 2, legacy 0, DEEP_CANON_V2)", (() => { const v = A.verifyChain(c); return v.ok && v.deepCanon === 2 && v.legacyShallowCanon === 0 && v.canonStatus === "DEEP_CANON_V2" && v.reason === "intact"; })());
  const t = clone(c); t[1].payload.detail.decision = "ADMIT"; const v = A.verifyChain(t);
  ok("cv-2 entry: NESTED payload tamper IS detected (fix)", v.ok === false && v.brokenAt === 1 && /tampered/.test(v.reason));
  const t2 = clone(c); t2[0].payload.detail.extra = { deeper: [1, { x: 2 }] }; ok("cv-2 entry: an ADDED nested field is detected", A.verifyChain(t2).ok === false);
  const t3 = clone(c); t3[0].payload.detail = { actor: "odg", decision: "ADMIT" }; ok("cv-2: nested key ORDER is irrelevant (order-independent canon)", A.verifyChain(t3).ok === true);
  // keyed cv-2 nested tamper also detected
  let kc = []; kc = A.appendEntry(kc, { a: { b: 1 } }, { key: KEY }); const kt = clone(kc); kt[0].payload.a.b = 2;
  ok("keyed cv-2 entry: nested tamper detected; genuine keyed verifies", A.verifyChain(kc, { key: KEY }).ok === true && A.verifyChain(kt, { key: KEY }).ok === false); }
// (21) LEGACY chains (persisted pre-fix, keyless AND keyed) still verify — counted + surfaced, never reported as deep.
{ const v = A.verifyChain(clone(LEGACY)); ok("legacy keyless chain still verifies, flagged LEGACY_SHALLOW_CANON (2 entries)", v.ok === true && v.legacyShallowCanon === 2 && v.deepCanon === 0 && /LEGACY_SHALLOW_CANON/.test(v.reason));
  const vk = A.verifyChain(clone(LEGACY_KEYED), { key: "K" }); ok("legacy KEYED chain still verifies with its key (HMAC unchanged), flagged legacy", vk.ok === true && vk.keyed === true && vk.legacyShallowCanon === 1);
  ok("legacy keyed chain with WRONG key ⇒ rejected", A.verifyChain(clone(LEGACY_KEYED), { key: "nope" }).ok === false);
  ok("legacy top-level tamper still detected", (() => { const t = clone(LEGACY); t[0].payload.event = "x"; return A.verifyChain(t).ok === false; })());
  ok("requireDeepCanon:true REFUSES a legacy entry", (() => { const v = A.verifyChain(clone(LEGACY), { requireDeepCanon: true }); return v.ok === false && v.brokenAt === 0 && /requireDeepCanon/.test(v.reason); })()); }
// (22) UPGRADE in place: appending to a persisted legacy chain ⇒ legacy prefix + cv-2 tail verifies (mixed, flagged).
{ const up = A.appendEntry(clone(LEGACY), { at: "t2", detail: { decision: "ADMIT" } }); const v = A.verifyChain(up);
  ok("legacy prefix + cv-2 append verifies (legacy 2, deep 1)", v.ok === true && v.legacyShallowCanon === 2 && v.deepCanon === 1 && up[2].cv === 2 && up[2].prevHash === LEGACY[1].hash);
  const anchor = A.chainTip(up); ok("tip anchor works across the upgrade boundary (and catches truncation)", A.verifyChain(up, { expectedTip: anchor }).ok === true && A.verifyChain(up.slice(0, 2), { expectedTip: anchor }).ok === false); }
// (23) NO DOWNGRADE: a legacy entry after a cv-2 entry ⇒ FAIL, even when its legacy hash is self-consistent.
{ let c = []; c = A.appendEntry(c, { a: 1 }); const prev = c[0].hash; const p = { b: { c: 1 } };
  c.push({ seq: 1, prevHash: prev, payload: p, hash: A.entryHash(1, prev, p) }); // a perfectly valid LEGACY link
  const v = A.verifyChain(c); ok("downgrade (legacy entry after cv-2) REFUSED", v.ok === false && v.brokenAt === 1 && /DOWNGRADE/.test(v.reason)); }
// (24) STRIPPING cv from a cv-2 entry (to fall back to shallow verification) breaks the hash (cv is IN the preimage).
{ let c = []; c = A.appendEntry(c, { a: { b: 1 } }); const t = clone(c); delete t[0].cv; ok("stripping cv from a sealed cv-2 entry ⇒ hash mismatch", A.verifyChain(t).ok === false);
  const t2 = clone(c); t2[0].payload.a.b = 9; delete t2[0].cv; ok("strip cv + nested tamper ⇒ still detected", A.verifyChain(t2).ok === false);
  const t3 = clone(c); t3[0].cv = 3; ok("unknown cv ⇒ fail-closed", (() => { const v = A.verifyChain(t3); return v.ok === false && /unsupported canon version/.test(v.reason); })());
  const t4 = clone(c); t4[0].cv = "2"; ok("cv as string '2' ⇒ fail-closed (strict)", A.verifyChain(t4).ok === false); }
// (25) entryHash default (no cv) is the LEGACY preimage — mission-ledger seals depend on it (pinned history (18) still holds).
ok("entryHash without cv == legacy fixture hash (mission-ledger compat)", A.entryHash(0, A.GENESIS, LEGACY[0].payload) === LEGACY[0].hash);
ok("entryHash with an unsupported cv THROWS (no silent fallback)", (() => { try { A.entryHash(0, A.GENESIS, 1, undefined, 7); return false; } catch { return true; } })());
// (26) a cyclic payload cannot be sealed (fail-closed, no partial digest)
ok("cyclic payload ⇒ appendEntry throws", (() => { const o = {}; o.self = o; try { A.appendEntry([], o); return false; } catch { return true; } })());

console.log(`\nAUDIT-LOG suite — ${pass} assertions passed. (hash-chain tamper-evidence + keyed-HMAC full-rewrite resistance + tip-anchor truncation detection; keyless NUL format pinned to history; key is owner-provisioned, mechanism proven)`);
