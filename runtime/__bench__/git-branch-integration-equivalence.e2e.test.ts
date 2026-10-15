#!/usr/bin/env node
/*
 * LOT git-branch-integration — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, ZERO REAL GIT: build:runtime compiles runtime/core/git-branch-integration.ts →
 * runtime/dist/core/git-branch-integration.js; build-dist-closure co-locates its dep (state-transition.js —
 * a TS port) in dist/core. The git runner is INJECTED (opts.git = a deterministic MOCK), so NO real git
 * command ever runs and the repo is never touched. Evidence is pure (no clock/random) ⇒ BYTE-IDENTICAL
 * across DRY_RUN / BLOCKED / HUMAN_APPROVAL_REQUIRED / ALREADY_UP_TO_DATE / INTEGRATED(live) + push-refusal
 * + classify.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/git-branch-integration-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "git-branch-integration.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "git-branch-integration.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Run on both libs; capture return or thrown GovernedGitError ({outcome,reason,evidence}) identically. */
function both(jsCall: () => any, tsCall: () => any): boolean {
  const run = (f: () => any) => {
    try {
      return { ok: true, value: f() };
    } catch (e: any) {
      return { ok: false, outcome: e.outcome, reason: e.reason, evidence: e.evidence, name: e.name };
    }
  };
  return EQ(run(jsCall), run(tsCall));
}

console.log("LOT git-branch-integration — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/git-branch-integration.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/git-branch-integration.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "state-transition.js")), "prerequisite: dep state-transition.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["run", "classify", "captureState", "makeGit", "resolveRef", "resolveBranch", "isAncestor", "OUTCOME", "DEFAULT_PROTECTED", "GovernedGitError"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(EQ(js.OUTCOME, ts.OUTCOME) && EQ(js.DEFAULT_PROTECTED, ts.DEFAULT_PROTECTED) && Object.isFrozen(ts.OUTCOME), "OUTCOME + DEFAULT_PROTECTED byte-identical + frozen");

const SHA_T = "1111111111111111111111111111111111111111"; // target tip
const SHA_S = "2222222222222222222222222222222222222222"; // source tip

/**
 * Build a deterministic MOCK git runner (NO real git). `cfg` controls the simulated repo:
 *   { isRepo, currentBranch, dirty, branches:{name:sha}, refs:{ref:sha}, ancestor:bool, ahead, afterFF }
 * On an integrated FF, `afterFF` flips the target branch sha to the source (simulating the mutation).
 */
function mockGit(cfg: any) {
  const state = { targetSha: cfg.branches ? cfg.branches[cfg.target] : undefined };
  return function git(args: any, opts?: any): any {
    const a = args.join(" ");
    const okOut = (stdout: string) => ({ status: 0, stdout, stderr: "" });
    const failOut = () => ({ status: 1, stdout: "", stderr: "not found" });
    if (args[0] === "push") throw new js.GovernedGitError(js.OUTCOME.BLOCKED, "push"); // never reached in these scenarios
    if (a === "rev-parse --is-inside-work-tree") return cfg.isRepo ? okOut("true") : okOut("false");
    if (a === "rev-parse HEAD") return okOut(cfg.head || SHA_T);
    if (a === "rev-parse --abbrev-ref HEAD") return okOut(cfg.currentBranch || "feature");
    if (a === "status --porcelain") return okOut(cfg.dirty ? " M file.ts" : "");
    if (args[0] === "rev-parse" && args.includes("--verify")) {
      const ref = args[args.length - 1];
      // refs/heads/<name>^{commit}
      let m = ref.match(/^refs\/heads\/(.+)\^\{commit\}$/);
      if (m) {
        const name = m[1];
        const sha = (cfg.afterFF && name === cfg.target) ? SHA_S : (cfg.branches && cfg.branches[name]);
        return sha ? okOut(sha) : failOut();
      }
      // <observedTo>^2  (second parent — none on a FF)
      if (ref.endsWith("^2")) return failOut();
      // <source>^{commit}
      m = ref.match(/^(.+)\^\{commit\}$/);
      if (m) {
        const sha = (cfg.refs && cfg.refs[m[1]]) || (cfg.branches && cfg.branches[m[1]]);
        return sha ? okOut(sha) : failOut();
      }
      return failOut();
    }
    if (args[0] === "merge-base") return cfg.ancestor ? okOut("") : failOut();
    if (args[0] === "rev-list") return okOut(String(cfg.ahead == null ? 2 : cfg.ahead));
    if (args[0] === "merge" || args[0] === "update-ref") { cfg.afterFF = true; return okOut(""); } // simulate FF mutation
    return opts && opts.allowFail ? failOut() : okOut("");
  };
}

// DRY_RUN predicting INTEGRATED.
{
  const cfg = () => ({ isRepo: true, currentBranch: "feature", target: "dev", branches: { dev: SHA_T }, refs: { feature: SHA_S }, ancestor: true, ahead: 2 });
  check(both(() => js.run({ target: "dev", source: "feature" }, { git: mockGit(cfg()) }), () => ts.run({ target: "dev", source: "feature" }, { git: mockGit(cfg()) })), "DRY_RUN predict INTEGRATED BYTE-IDENTICAL");
  const r = js.run({ target: "dev", source: "feature" }, { git: mockGit(cfg()) });
  check(r.outcome === "DRY_RUN" && r.predicted_outcome === "INTEGRATED" && r.fast_forwardable === true && r.pushed === false, "DRY_RUN evidence: predicts INTEGRATED, ff-able, pushed=false");
}
// DRY_RUN predicting BLOCKED (non-fast-forward / diverged).
{
  const cfg = () => ({ isRepo: true, currentBranch: "feature", target: "dev", branches: { dev: SHA_T }, refs: { feature: SHA_S }, ancestor: false });
  check(both(() => js.run({ target: "dev", source: "feature" }, { git: mockGit(cfg()) }), () => ts.run({ target: "dev", source: "feature" }, { git: mockGit(cfg()) })), "DRY_RUN predict BLOCKED (non-ff) BYTE-IDENTICAL");
}
// LIVE BLOCKED: dirty worktree ⇒ throws GovernedGitError.
{
  const cfg = () => ({ isRepo: true, currentBranch: "feature", target: "dev", dirty: true, branches: { dev: SHA_T }, refs: { feature: SHA_S }, ancestor: true });
  check(both(() => js.run({ target: "dev", source: "feature", execute: true }, { git: mockGit(cfg()) }), () => ts.run({ target: "dev", source: "feature", execute: true }, { git: mockGit(cfg()) })), "LIVE dirty-worktree ⇒ throws BLOCKED BYTE-IDENTICAL");
}
// HUMAN_APPROVAL_REQUIRED: protected target "main", no authority (dry-run predicts; live throws).
{
  const cfgP = () => ({ isRepo: true, currentBranch: "feature", target: "main", branches: { main: SHA_T }, refs: { feature: SHA_S }, ancestor: true });
  check(both(() => js.run({ target: "main", source: "feature" }, { git: mockGit(cfgP()) }), () => ts.run({ target: "main", source: "feature" }, { git: mockGit(cfgP()) })), "protected target dry-run predicts HUMAN_APPROVAL BYTE-IDENTICAL");
  check(both(() => js.run({ target: "main", source: "feature", execute: true }, { git: mockGit(cfgP()) }), () => ts.run({ target: "main", source: "feature", execute: true }, { git: mockGit(cfgP()) })), "protected target LIVE ⇒ throws HUMAN_APPROVAL BYTE-IDENTICAL");
  // With explicit authority ⇒ allowed (dry-run predicts INTEGRATED).
  check(both(() => js.run({ target: "main", source: "feature", authorization: { allow_protected: true } }, { git: mockGit(cfgP()) }), () => ts.run({ target: "main", source: "feature", authorization: { allow_protected: true } }, { git: mockGit(cfgP()) })), "protected + allow_protected ⇒ predicts INTEGRATED BYTE-IDENTICAL");
}
// ALREADY_UP_TO_DATE: targetSha === sourceSha.
{
  const cfg = () => ({ isRepo: true, currentBranch: "feature", target: "dev", branches: { dev: SHA_T }, refs: { feature: SHA_T }, ancestor: true });
  check(both(() => js.run({ target: "dev", source: "feature", execute: true }, { git: mockGit(cfg()) }), () => ts.run({ target: "dev", source: "feature", execute: true }, { git: mockGit(cfg()) })), "LIVE ALREADY_UP_TO_DATE BYTE-IDENTICAL");
}
// INTEGRATED (live): target NOT checked out ⇒ update-ref path; mock simulates FF; VERIFIED + C03 transition.
{
  const cfg = () => ({ isRepo: true, currentBranch: "feature", target: "dev", head: SHA_S, branches: { dev: SHA_T }, refs: { feature: SHA_S }, ancestor: true, ahead: 3 });
  check(both(() => js.run({ target: "dev", source: "feature", execute: true, objectiveId: "o1" }, { git: mockGit(cfg()) }), () => ts.run({ target: "dev", source: "feature", execute: true, objectiveId: "o1" }, { git: mockGit(cfg()) })), "LIVE INTEGRATED (update-ref FF) BYTE-IDENTICAL");
  const r = js.run({ target: "dev", source: "feature", execute: true, objectiveId: "o1" }, { git: mockGit(cfg()) });
  check(r.outcome === "INTEGRATED" && r.integrated === true && r.merge_commit === false && r.pushed === false && r.state_transition && r.state_transition.verification_status === "VERIFIED", "INTEGRATED evidence: VERIFIED C03, no merge commit, no push");
}
// push refusal: a direct push invocation via makeGit throws BLOCKED BEFORE touching git.
{
  const gJ = js.makeGit(process.cwd()); const gT = ts.makeGit(process.cwd());
  check(both(() => gJ(["push", "origin", "main"]), () => gT(["push", "origin", "main"])), "makeGit refuses push (local-only) BYTE-IDENTICAL, no git invoked");
}
// classify — pure, over synthetic state/ctx (no git calls needed for the non-ancestor branches).
{
  const st = { isRepo: true, worktreeClean: true, dirtyEntries: [] };
  const mkctx = (o: any) => ({ git: () => ({ status: 1 }), target: "dev", source: "feature", protectedTarget: false, authorized: false, targetSha: SHA_T, sourceSha: SHA_S, ...o });
  check(EQ(js.classify({ isRepo: false }, mkctx({})), ts.classify({ isRepo: false }, mkctx({}))), "classify(not repo) ⇒ BLOCKED identical");
  check(EQ(js.classify(st, mkctx({ targetSha: null })), ts.classify(st, mkctx({ targetSha: null }))), "classify(no target) ⇒ BLOCKED identical");
  check(EQ(js.classify(st, mkctx({ protectedTarget: true })), ts.classify(st, mkctx({ protectedTarget: true }))), "classify(protected, unauthorized) ⇒ HUMAN_APPROVAL identical");
  check(EQ(js.classify(st, mkctx({ targetSha: SHA_T, sourceSha: SHA_T })), ts.classify(st, mkctx({ targetSha: SHA_T, sourceSha: SHA_T }))), "classify(target==source) ⇒ ALREADY_UP_TO_DATE identical");
}
// Missing target/source ⇒ throws BLOCKED.
check(both(() => js.run({ source: "x" }, { git: mockGit({ isRepo: true }) }), () => ts.run({ source: "x" }, { git: mockGit({ isRepo: true }) })), "run(missing target) ⇒ throws BLOCKED BYTE-IDENTICAL");

console.log(failures === 0 ? "ALL PASS — LOT git-branch-integration EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
