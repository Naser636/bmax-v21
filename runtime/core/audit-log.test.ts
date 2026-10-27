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

console.log(`\nAUDIT-LOG suite — ${pass} assertions passed.`);
