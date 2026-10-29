#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the compact resume reader is a reliable passation mechanism: over the REAL
// canonical register it returns register counts, the next-lot/idle reason, BLOCKED items WITH their human action, the
// most-recent checkpoint title, and the exact resume command — a short handoff that does not require re-reading the
// 8500-line compass. Deterministic (pure read of register + a bounded compass scan).
"use strict";
const assert = require("assert");
const path = require("path");
const R = require("./odg-resume.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const s = R.resumeState({ repo: process.cwd() });

ok("reads the real register ⇒ ok, with counts", s.ok === true && s.counts && typeof s.counts.ACCEPTED === "number" && s.counts.ACCEPTED >= 20);
ok("exposes idle/nextLot + idleReason when idle", (s.nextLot !== undefined) && (s.idle === false || typeof s.idleReason === "string"));
ok("lists BLOCKED items WITH a precise next/human action for each", s.blockedCount >= 1 && Array.isArray(s.blocked) && s.blocked.every((b) => b.id && (b.humanActionRequired || b.nextAction)));
// persistent-register completeness: EVERY blocker carries BOTH the human action AND a concrete resume test (so the
// register itself — not conversation memory — is the full session-independent handoff).
ok("every BLOCKED item carries both humanActionRequired AND resumeTest (register is the complete handoff)", s.blocked.every((b) => typeof b.humanActionRequired === "string" && b.humanActionRequired.length > 10 && typeof b.resumeTest === "string" && b.resumeTest.length > 10));
ok("carries the exact resume command (odg-campaign-run)", typeof s.resumeCommand === "string" && /odg-campaign-run\.ts/.test(s.resumeCommand));
ok("surfaces the most-recent checkpoint title (compact, not the whole compass)", typeof s.lastCheckpoint === "string" && /CHECKPOINT/.test(s.lastCheckpoint));
ok("reports a verified HEAD + stale count (honest state)", typeof s.head === "string" && s.head.length >= 6 && typeof s.staleAcceptances === "number");

// output is COMPACT — the serialized handoff is small (context-growth mitigation), far under the full compass size.
const bytes = JSON.stringify(s).length;
ok("handoff is compact (< 6 KB) — does not drag the full compass into context", bytes < 6000);

// fail-closed on a missing register.
ok("missing register ⇒ ok:false (fail-closed, not a crash)", R.resumeState({ registerPath: "/no/such/register.json" }).ok === false);

console.log(`\nODG-RESUME suite — ${pass} assertions passed. (compact passation: register counts + blockers w/ human action + resume command + last checkpoint; <6KB; fail-closed)`);
