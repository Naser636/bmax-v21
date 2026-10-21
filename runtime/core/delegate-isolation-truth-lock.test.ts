#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; migration-debt pragma (not strict typing).
/*
 * Day-5 Lot 2 — Truth-Lock PRE-WRITE gate in delegate-isolation.applyProposal (a mutation path that bypasses
 * resolve()). Fully isolated: an `io` double RECORDS writes (no real fs), git facts injected via opts.gitExec
 * (no real git). Reproduces the bypass (scope-valid change applied on a non-conforming repo) and proves the
 * gate refuses BEFORE any write while preserving validateScope and the legitimate/record-only paths.
 */
"use strict";

const assert = require("assert");
const del = require("./delegate-isolation.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const CHANGES = [{ rel: "src/a.ts", kind: "content", after: "export const x = 1;\n" }];
const WRITESET = ["src/a.ts"];
function ioDouble() { const writes = []; return { writes, io: { writeFileSync: (p) => writes.push(p), mkdirSync: () => {}, rmSync: () => {} } }; }
const mk = (branch, head, origin, staged) => (args) => {
  const k = args.join(" ");
  if (k === "rev-parse --is-inside-work-tree") return "true";
  if (k === "rev-parse --abbrev-ref HEAD") return branch;
  if (k === "rev-parse HEAD") return head;
  if (k === "rev-parse origin/main") return origin;
  if (k === "diff --cached --name-only") return staged ? "x.ts" : "";
  return null;
};
const clean = mk("main", "h", "h", 0);
const wrongBranch = mk("feature/x", "h", "h", 0);
const diverged = mk("main", "h1", "h2", 0);
const staged = mk("main", "h", "h", 1);
const originNull = mk("main", "h", null, 0);

function apply(gitExec, enforce) {
  const d = ioDouble();
  const r = del.applyProposal("/fake/root", CHANGES, WRITESET, d.io, { enforce, gitExec });
  return { r, writes: d.writes };
}

console.log("delegate-isolation.applyProposal — Truth-Lock PRE-WRITE gate (isolated)");

// 0 — REPRODUCE THE BYPASS: with enforcement OFF, a scope-valid change applies even on a NON-CONFORMING repo
//     (wrong branch). This is the pre-fix behavior that the gate must close under enforcement.
{
  const { r, writes } = apply(wrongBranch, false);
  ok("bypass reproduced: enforce OFF + bad repo state ⇒ change APPLIED (record-only default, byte-identical)", r.ok === true && writes.length === 1);
}
// 1 — CONFORME: clean state + enforce ⇒ applied (legitimate operation preserved).
{
  const { r, writes } = apply(clean, true);
  ok("clean state + enforce ⇒ applied (legitimate preserved)", r.ok === true && r.refused !== true && writes.length === 1 && writes[0].endsWith("src/a.ts"));
}
// 2 — BRANCHE INCORRECTE: enforce ⇒ REFUSED before any write.
{
  const { r, writes } = apply(wrongBranch, true);
  ok("wrong branch + enforce ⇒ REFUSED, NO write (Truth-Lock)", r.ok === false && r.refused === true && /Truth-Lock/.test(r.reason) && writes.length === 0);
}
// 3 — DIVERGENCE: HEAD != origin/main ⇒ REFUSED, no write.
{
  const { r, writes } = apply(diverged, true);
  ok("HEAD divergence + enforce ⇒ REFUSED, no write", r.ok === false && r.refused === true && writes.length === 0);
}
// 4 — INDEX MODIFIÉ: staged changes ⇒ REFUSED, no write.
{
  const { r, writes } = apply(staged, true);
  ok("staged index + enforce ⇒ REFUSED, no write", r.ok === false && writes.length === 0 && /staged/.test(r.truthLock.detail));
}
// 5 — ÉTAT NON VÉRIFIABLE: origin/main unavailable ⇒ REFUSED, no write.
{
  const { r, writes } = apply(originNull, true);
  ok("origin/main unavailable + enforce ⇒ REFUSED, no write", r.ok === false && writes.length === 0);
}
// 6 — RECORD-ONLY (strict OFF): bad state + enforce OFF ⇒ applied (default behavior unchanged).
{
  const { r, writes } = apply(diverged, false);
  ok("bad state + enforce OFF ⇒ applied (record-only; strict NOT active by default)", r.ok === true && writes.length === 1);
}
// 7 — NO RESIDUAL / NO BYPASS ON RESUME: re-applying after a refusal (same bad state, enforce) ⇒ still refused,
//     still zero writes (the refusal left no partial effect and cannot be bypassed by retry).
{
  const a = apply(wrongBranch, true);
  const b = apply(wrongBranch, true);
  ok("retry after refusal ⇒ still REFUSED, still zero writes (no residual, no bypass-by-resume)", a.r.ok === false && b.r.ok === false && a.writes.length === 0 && b.writes.length === 0);
}
// 8 — EXISTING CONTROL PRESERVED: an out-of-scope change is still REFUSED by validateScope (Truth-Lock did not
//     replace it) — even on a CLEAN repo and with enforce on, and nothing is written.
{
  const d = ioDouble();
  const r = del.applyProposal("/fake/root", [{ rel: "SECRET.ts", kind: "content", after: "x" }], WRITESET, d.io, { enforce: true, gitExec: clean });
  ok("out-of-scope change ⇒ REFUSED by validateScope (existing control intact), no write", r.ok === false && /out-of-scope/.test(r.reason) && d.writes.length === 0);
}

console.log(`\ndelegate-isolation-truth-lock — ${passed} assertions passed.`);
