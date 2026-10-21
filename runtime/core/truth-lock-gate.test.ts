#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; migration-debt pragma (not strict typing).
/*
 * Truth-Lock PRE-EXECUTION GATE tests. Proves the gate reuses evaluateTruthLock, gathers git facts via an
 * injectable seam, decides enforcement by mission mutating-ness, and is fail-closed for a mutating mission
 * while never over-blocking a read-only one. Covers the mandate §A.5 cases: consistent state, unexpected
 * branch/HEAD, modified worktree (unstaged — must NOT block), reference unavailable, verification failure,
 * and the enforce-vs-record distinction. Pure/deterministic (synthetic GitState + injected seams).
 */
"use strict";

const assert = require("assert");
const gate = require("./truth-lock-gate.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const ALIGNED = { isRepo: true, branch: "main", head: "a1b2c3", originMain: "a1b2c3", staged: 0 };

// 1 — consistent state ⇒ PASS, never blocked (mutating or not; enforce or not).
{
  ok("consistent + mutating + enforce ⇒ PASS, not blocked", (() => { const r = gate.truthLockGate({ mission: "M", mutating: true, enforce: true, gitState: ALIGNED }); return r.status === "PASS" && r.blocked === false && r.ok === true; })());
  ok("consistent + read-only ⇒ PASS", gate.truthLockGate({ mission: "M", mutating: false, gitState: ALIGNED }).status === "PASS");
}
// 2 — unexpected branch: MUTATING+ENFORCE ⇒ BLOCKED; READ-ONLY ⇒ RECORDED; MUTATING but NOT enforced ⇒ RECORDED.
{
  const bad = { ...ALIGNED, branch: "feature/x" };
  ok("wrong branch + mutating + ENFORCE ⇒ BLOCKED (fail-closed)", (() => { const r = gate.truthLockGate({ mutating: true, enforce: true, gitState: bad }); return r.status === "BLOCKED" && r.blocked === true; })());
  ok("wrong branch + read-only ⇒ RECORDED, NOT blocked (no over-block)", (() => { const r = gate.truthLockGate({ mutating: false, enforce: true, gitState: bad }); return r.status === "RECORDED" && r.blocked === false; })());
  ok("wrong branch + mutating but NOT enforced ⇒ RECORDED (opt-in; never breaks a non-enforcing workflow)", (() => { const r = gate.truthLockGate({ mutating: true, enforce: false, gitState: bad }); return r.status === "RECORDED" && r.blocked === false; })());
}
// 3 — HEAD diverges from origin/main ⇒ mutating+enforce BLOCKED.
{
  const r = gate.truthLockGate({ mutating: true, enforce: true, gitState: { ...ALIGNED, head: "deadbeef", originMain: "a1b2c3" } });
  ok("HEAD divergence + mutating + enforce ⇒ BLOCKED", r.blocked === true && r.verdict.violations.some((v) => /diverges/.test(v)));
}
// 4 — MODIFIED WORKTREE (unstaged only; staged:0) must NOT block — the canonical isolation design.
{
  const r = gate.truthLockGate({ mutating: true, enforce: true, gitState: { ...ALIGNED, staged: 0 } });
  ok("unstaged worktree (staged:0) + mutating + enforce ⇒ PASS (isolation design, not over-blocked)", r.status === "PASS" && r.blocked === false);
}
// 5 — STAGED index ⇒ mutating+enforce BLOCKED (refuse to risk incorporating staged changes).
{
  const r = gate.truthLockGate({ mutating: true, enforce: true, gitState: { ...ALIGNED, staged: 3 } });
  ok("staged index + mutating + enforce ⇒ BLOCKED", r.blocked === true && r.verdict.violations.some((v) => /staged/.test(v)));
}
// 6 — reference unavailable (origin/main null) ⇒ mutating+enforce BLOCKED (cannot confirm the published reference).
{
  const r = gate.truthLockGate({ mutating: true, enforce: true, gitState: { ...ALIGNED, originMain: null } });
  ok("origin/main unavailable + mutating + enforce ⇒ BLOCKED", r.blocked === true && r.verdict.violations.some((v) => /origin\/main unavailable/.test(v)));
}
// 7 — not a repo ⇒ mutating+enforce BLOCKED.
{
  const r = gate.truthLockGate({ mutating: true, enforce: true, gitState: { isRepo: false, branch: "", head: "", originMain: null, staged: 0 } });
  ok("not a repo + mutating + enforce ⇒ BLOCKED", r.blocked === true);
}

// 8 — gatherGitState via an injected exec seam (no real git): maps the 5 git facts.
{
  const seam = (args) => {
    const k = args.join(" ");
    if (k === "rev-parse --is-inside-work-tree") return "true";
    if (k === "rev-parse --abbrev-ref HEAD") return "main";
    if (k === "rev-parse HEAD") return "abc123";
    if (k === "rev-parse origin/main") return "abc123";
    if (k === "diff --cached --name-only") return ""; // clean index
    return null;
  };
  const gs = gate.gatherGitState(seam);
  ok("gatherGitState maps facts from the seam (clean)", gs.isRepo === true && gs.branch === "main" && gs.head === "abc123" && gs.originMain === "abc123" && gs.staged === 0);
}
// 9 — gatherGitState: staged count from `diff --cached` + origin/main unresolvable ⇒ null.
{
  const seam = (args) => {
    const k = args.join(" ");
    if (k === "rev-parse --is-inside-work-tree") return "true";
    if (k === "rev-parse --abbrev-ref HEAD") return "main";
    if (k === "rev-parse HEAD") return "abc123";
    if (k === "rev-parse origin/main") return null;           // remote ref missing
    if (k === "diff --cached --name-only") return "a.ts\nb.ts"; // 2 staged
    return null;
  };
  const gs = gate.gatherGitState(seam);
  ok("gatherGitState: staged=2, originMain=null", gs.staged === 2 && gs.originMain === null);
  // end-to-end via gatherGitState (not synthetic): mutating + enforce ⇒ BLOCKED (origin null + staged).
  ok("gate over gathered state: mutating + enforce ⇒ BLOCKED", gate.truthLockGate({ mutating: true, enforce: true, exec: seam }).blocked === true);
}
// 10 — gatherGitState: not a repo (seam says not inside a work tree).
{
  const gs = gate.gatherGitState(() => "false");
  ok("gatherGitState: not a repo ⇒ isRepo=false", gs.isRepo === false);
}

// 11 — missionIsMutating from the mission definition (injected fs): engineering ⇒ mutating; audit ⇒ not.
{
  const mkFs = (json) => ({ readFileSync: () => JSON.stringify(json) });
  ok("requiresEngineering=true ⇒ mutating", gate.missionIsMutating("M", { fs: mkFs({ requiresEngineering: true }) }).mutating === true);
  ok("requires_engineering=true (snake) ⇒ mutating", gate.missionIsMutating("M", { fs: mkFs({ requires_engineering: true }) }).mutating === true);
  ok("mode=ENGINEERING ⇒ mutating", gate.missionIsMutating("M", { fs: mkFs({ mode: "ENGINEERING" }) }).mutating === true);
  ok("mode=AUDIT ⇒ NOT mutating (read-only)", gate.missionIsMutating("M", { fs: mkFs({ mode: "AUDIT" }) }).mutating === false);
  ok("no engineering signal ⇒ NOT mutating (record-only)", gate.missionIsMutating("M", { fs: mkFs({ mode: "SEQUENTIAL" }) }).mutating === false);
  ok("no mission file ⇒ NOT mutating (indeterminate ⇒ record-only, never over-block)", gate.missionIsMutating("M", { fs: { readFileSync: () => { throw new Error("ENOENT"); } } }).mutating === false);
}

console.log(`\ntruth-lock-gate — ${passed} assertions passed.`);
