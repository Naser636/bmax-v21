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

// ── odg-resume-handoff-budget-scaling: per-blocker field budgeting as the BLOCKED population grows ──
const os = require("os"); const fs = require("fs");
function synthRegister(nBlocked, fieldLen) {
  const long = "X".repeat(fieldLen);
  const items = [{ id: "acc1", status: "ACCEPTED" }];
  for (let i = 0; i < nBlocked; i++) items.push({ id: `BLK-${i}`, status: "BLOCKED", humanActionRequired: `owner action ${i}: ${long}`, resumeTest: `resume test ${i}: ${long}` });
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "resume-budget-")), "reg.json");
  fs.writeFileSync(p, JSON.stringify({ version: "closure-register-v1", items }));
  return p;
}
// small population, SHORT fields ⇒ NOT truncated (backward-compatible: full fields preserved).
{
  const s = R.resumeState({ registerPath: synthRegister(2, 30), repo: process.cwd() });
  ok("budget: small/short ⇒ handoffTruncated false, full fields", s.handoffTruncated === false && s.blocked.length === 2 && s.blocked.every((b) => !/→register/.test(b.humanActionRequired)));
}
// MEDIUM population with adversarially-LONG fields ⇒ Tier-2: per-field truncation, under budget, NO blocker lost,
// truncation detectable, mandatory action/test fields still present + actionable (>10).
for (const [n, len] of [[12, 1500], [30, 2000]]) {
  const s = R.resumeState({ registerPath: synthRegister(n, len), repo: process.cwd() });
  const bytes = JSON.stringify(s).length;
  ok(`budget T2: ${n} blockers × ${len}c ⇒ ALL ${n} kept (no silent loss)`, s.blockedCount === n && Array.isArray(s.blocked) && s.blocked.length === n && s.blocked.every((b) => typeof b.id === "string" && b.id.length > 0));
  ok(`budget T2: ${n}×${len} ⇒ handoff stays < 6 KB (bytes=${bytes})`, bytes < 6000);
  ok(`budget T2: ${n}×${len} ⇒ handoffTruncated flagged + fieldBudgetChars present`, s.handoffTruncated === true && typeof s.fieldBudgetChars === "number");
  ok(`budget T2: ${n}×${len} ⇒ truncation EXPLICIT (…→register marker) + mandatory fields still actionable (>10)`, s.blocked.every((b) => /→register/.test(b.humanActionRequired) && b.humanActionRequired.length > 10 && b.resumeTest.length > 10));
}
// PATHOLOGICAL population ⇒ Tier-3: id-list form — every blocker id kept (no loss), fields omitted to the register,
// explicitly flagged, still under budget.
{
  const n = 60;
  const s = R.resumeState({ registerPath: synthRegister(n, 3000), repo: process.cwd() });
  const bytes = JSON.stringify(s).length;
  ok(`budget T3: ${n} blockers ⇒ ALL ${n} ids kept (no silent loss)`, s.blockedCount === n && s.blocked.length === n && s.blocked.every((b) => typeof b.id === "string" && b.id.length > 0));
  ok(`budget T3: ${n} ⇒ handoff stays < 6 KB (bytes=${bytes})`, bytes < 6000);
  ok(`budget T3: ${n} ⇒ fields explicitly OMITTED to the register (handoffTruncated + blockedFieldsOmitted + note points to register)`, s.handoffTruncated === true && s.blockedFieldsOmitted === true && /closure-register\.json/.test(s.note));
}
// deterministic: identical input ⇒ identical output.
{
  const p = synthRegister(30, 2000);
  ok("budget: deterministic (same register ⇒ byte-identical handoff)", JSON.stringify(R.resumeState({ registerPath: p, repo: process.cwd() })) === JSON.stringify(R.resumeState({ registerPath: p, repo: process.cwd() })));
}

console.log(`\nODG-RESUME suite — ${pass} assertions passed. (compact passation: register counts + blockers w/ human action + resume command + last checkpoint; <6KB; fail-closed)`);
