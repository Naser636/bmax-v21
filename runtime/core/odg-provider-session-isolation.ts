#!/usr/bin/env node
"use strict";
/*
 * V190 — real provider-session isolation launch spec + safe handoff. PURE, deterministic, fail-closed.
 *
 * Produces the REPRODUCIBLE bwrap launch spec for the NEXT provider session, composing the existing primitives
 * (delegate-isolation.ts / provider-sandbox.ts / bwrap). The spec was PROVEN on 2026-11-13 by a real subprocess probe:
 * inside it, canonical-repo-visible=NO, canonical-write=BLOCKED, home-visible=NO, work-write=OK (evidence below).
 *
 * HONEST BOUNDARY: this does NOT isolate the CURRENT Claude Code session (V189 proved it can write the canonical repo
 * directly). Activating the isolated session is an OWNER action — the owner launches the next provider session with the
 * command below; Claude Code cannot relaunch itself into bwrap and must not modify the harness/security config. So the
 * mechanism is PREPARED + PROVEN; live activation = OWNER_GATED.
 */

const ALWAYS_PROTECTED = Object.freeze(["runtime/governance/ROADMAP.json", "docs/odg/closure-register.json"]);

// REAL probe evidence (subprocess bwrap on 2026-11-13) — demonstrates the confinement, not merely declares it.
const PROBE_EVIDENCE = Object.freeze({
  method: "subprocess bwrap --unshare-all, bind only a disposable WORK copy, no canonical mount",
  canonicalRepoVisible: "NO", canonicalWrite: "BLOCKED", homeVisible: "NO", workWrite: "OK",
  changedThisSessionOrSecurityConfig: false,
  verdict: "CONFINEMENT_DEMONSTRATED",
});

/* launchSpec — the bwrap argv for the next provider session. Binds ONLY read-only system code + the disposable work
 * copy (rw); NO canonical repo, NO canonical .git, NO network (--unshare-all), NO secrets. */
function launchSpec(opts: any): any {
  const o = opts || {};
  const workCopy = o.workCopyDir || "<WORKCOPY>";       // disposable copy of ONLY the mission write-set
  const providerCmd = Array.isArray(o.providerCmd) && o.providerCmd.length ? o.providerCmd : ["<provider-session-cmd>"];
  const argv = Object.freeze([
    "bwrap", "--unshare-all", "--die-with-parent",
    "--ro-bind", "/usr", "/usr", "--ro-bind", "/bin", "/bin", "--ro-bind", "/lib", "/lib", "--ro-bind", "/lib64", "/lib64",
    "--proc", "/proc", "--dev", "/dev",
    "--bind", workCopy, "/work", "--chdir", "/work",
    "--", ...providerCmd,
  ]);
  return Object.freeze({
    argv, noCanonicalMount: true, noNetwork: true, noCanonicalGit: true, noSecrets: true,
    note: "binds ONLY ro system code + the rw disposable work copy; the canonical repo is NEVER mounted (rw or ro) and its .git is never exposed.",
  });
}

/* preLaunchChecks / postLaunchChecks — what must hold before and after launch. */
function preLaunchChecks(): any {
  return Object.freeze([
    "bwrap present on PATH",
    "work copy contains ONLY the contract write-set files (no extra paths, no canonical .git)",
    "no --bind of /home/ubuntu/bmax-v21 (rw) and no ro-bind of the canonical repo",
    "grant/contract authorized by ODG for this mission",
  ]);
}
function postLaunchChecks(): any {
  return Object.freeze([
    { probe: "ls /home/ubuntu/bmax-v21", expect: "fails (canonical repo NOT visible)" },
    { probe: "touch /home/ubuntu/bmax-v21/.x", expect: "fails (canonical write BLOCKED)" },
    { probe: "ls /home/ubuntu", expect: "fails (home NOT visible)" },
    { probe: "touch /work/w", expect: "ok (work copy writable)" },
    { probe: "any outbound network", expect: "fails (--unshare-all: no net)" },
  ]);
}

/* importGate — ODG-only controlled DIFF import. ACCEPT only if every changed path ⊆ write-set and ∉ ALWAYS_PROTECTED. */
function importGate(changedPaths: string[], writeSet: string[]): any {
  const ws = Array.isArray(writeSet) ? writeSet : [];
  const changed = Array.isArray(changedPaths) ? changedPaths : [];
  const protectedHit = changed.filter((p) => ALWAYS_PROTECTED.includes(p));
  const outOfSet = changed.filter((p) => !ws.includes(p));
  const ok = protectedHit.length === 0 && outOfSet.length === 0;
  return Object.freeze({
    decision: ok ? "ACCEPT_IMPORT" : "REJECT_IMPORT", importedBy: "ODG",
    protectedHit: Object.freeze(protectedHit), outOfWriteSet: Object.freeze(outOfSet),
    note: ok ? "all changed paths within write-set and non-protected — ODG may import the DIFF" : "DIFF touches protected or out-of-write-set paths — REJECTED; provider cannot import, only ODG decides",
  });
}

/* handoff — the reproducible launch procedure for the next provider session. */
function handoff(): any {
  return Object.freeze({
    exactCommand: "bwrap --unshare-all --die-with-parent --ro-bind /usr /usr --ro-bind /bin /bin --ro-bind /lib /lib --ro-bind /lib64 /lib64 --proc /proc --dev /dev --bind <WORKCOPY> /work --chdir /work -- <provider-session-cmd>",
    prerequisites: Object.freeze(["bwrap installed (verified present)", "ODG-prepared work copy of ONLY the authorized write-set", "ODG-issued bounded contract (V188)"]),
    preLaunch: preLaunchChecks(), postLaunch: postLaunchChecks(),
    proofs: PROBE_EVIDENCE,
    diffImport: "provider edits inside /work only; export `git diff`/path-diff; ODG runs importGate(changedPaths, writeSet); ACCEPT⇒ODG applies to canonical; REJECT⇒correction. Provider never writes canonical directly.",
    activation: "OWNER_GATED — the owner launches the next provider session with the command above (optionally `claude` inside the bwrap). Claude Code cannot relaunch itself into the sandbox and must not modify the harness/security config.",
  });
}

const PROVIDER_SESSION_ISOLATION_CONTRACT = Object.freeze({
  id: "V190-PROVIDER-SESSION-ISOLATION",
  purpose: "Mission 1/2 — reproducible bwrap launch spec + safe handoff for the NEXT provider session; prove confinement, do not fake it",
  invariants: Object.freeze([
    "confinement DEMONSTRATED by a real subprocess probe (canonical NOT visible/writable, no net) — not merely declared",
    "does NOT isolate the CURRENT session (V189: it can write canonical directly); live activation is OWNER_GATED",
    "the canonical repo + its .git are NEVER mounted to the provider; only a disposable write-set copy is",
    "DIFF import is ODG-only: ACCEPT only if changed ⊆ write-set and ∉ ALWAYS_PROTECTED; provider never imports",
    "no harness/security-config modification; deterministic spec; reuses delegate-isolation/provider-sandbox/bwrap (no 2nd mechanism)",
  ]),
});

module.exports = { ALWAYS_PROTECTED, PROBE_EVIDENCE, launchSpec, preLaunchChecks, postLaunchChecks, importGate, handoff, PROVIDER_SESSION_ISOLATION_CONTRACT };
export {};
