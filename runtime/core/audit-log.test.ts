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
ok("keyless path unchanged (byte-identical hash, keyed:false)", ch[0].hash === A.entryHash(0, A.GENESIS, ch[0].payload) && A.verifyChain(ch).keyed === false && A.verifyChain(ch).tipAnchored === false);
// (18) HISTORICAL-FORMAT PIN (NOT self-referential): the keyless preimage MUST stay NUL-separated, matching the
//      format every already-sealed chain was written with. Pinned to the exact historical hex AND recomputed
//      independently from the NUL material — a separator change (e.g. NUL→space) would break BOTH and is caught here.
{
  const crypto = require("crypto");
  const HISTORICAL = "8f1e6964e1ea194c3aaff09d6d6b278f9d40cefc24c25584dce239450de4327d"; // sha256("0\0GENESIS\042"), pre-keyed-HMAC
  const NUL = String.fromCharCode(0); const independent = crypto.createHash("sha256").update("0"+NUL+"GENESIS"+NUL+"42").digest("hex");
  ok("keyless entryHash(0,GENESIS,42) == historical NUL-sealed hash (format pinned, non-self-referential)", A.entryHash(0, A.GENESIS, 42) === HISTORICAL && HISTORICAL === independent);
}

console.log(`\nAUDIT-LOG suite — ${pass} assertions passed. (hash-chain tamper-evidence + keyed-HMAC full-rewrite resistance + tip-anchor truncation detection; keyless NUL format pinned to history; key is owner-provisioned, mechanism proven)`);
