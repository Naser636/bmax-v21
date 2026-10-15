#!/usr/bin/env node
/*
 * `odg migrate-ts` — single-command TypeScript migration campaign driver (η3-B78 vertical slice).
 * ================================================================================================
 * ONE launch command, DISTINCT internal validation gates per stage. This slice runs ONLY the
 * `validation-engine` lot (CTO authorisation η3-B78); any other lot is BLOCKED, not silently run.
 *
 * REUSE (no parallel mechanism invented): the gates drive the EXISTING toolchain — `build:runtime`
 * (tsc -p tsconfig.runtime-dist.json), the strict gate (tsc -p tsconfig.runtime-leaves-strict.json
 * --noEmit), the equivalence-bench recipe (git-archive isolated candidate + the lot's *.e2e.test.ts),
 * the lot's historical suites, and the sibling regression benches.
 *
 * CHECKPOINT / RESUME (honest limitation, per η3-B77 §5.6): checkpoint-engine.js persists a SINGLE
 * shared runtime/generated/pipeline-checkpoint.json keyed by ONE mission; reusing it here would CLOBBER
 * an in-flight mission-pipeline checkpoint. For this single-lot slice there is nothing to resume mid-lot
 * that a fresh, deterministic re-run (the candidate is rebuilt from committed HEAD every run) would not
 * safely redo, so NO durable cross-invocation checkpoint is written — a demonstrated limitation, NOT a
 * silent second mechanism. The checkpoint CONTRACT is honoured in spirit: a FAILED/BLOCKED gate is NEVER
 * treated as DONE (RC-2), subsequent gates are marked NOT RUN, and HEAD is revalidated (truthLock) before
 * the run. Multi-lot durable resume needs a dedicated checkpoint namespace = a future CTO decision.
 *
 * The real side effects live behind injectable SEAMS (same pattern as converge-cli.ts) so runMigrateTs()
 * is unit-testable on BOTH success and failure without the heavy real candidate build.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

export type GateStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT RUN";
export interface GateResult { gate: string; status: GateStatus; detail: string }
export interface TruthLock { ok: boolean; head: string; branch: string; detail: string; violations: string[] }

// Observable git facts the Truth Lock policy decides on. Gathered once by realSeams and RE-gathered just
// before the sensitive git-archive (a captured HEAD alone is not a revalidation — η3-B79 §5).
export interface GitState {
  isRepo: boolean;
  branch: string;
  head: string;
  originMain: string | null; // null when origin/main cannot be resolved (remote unavailable / no ref)
  staged: number;            // staged (index) entry count
}
export interface TruthLockPolicy { expectedBranch: string }
export const DEFAULT_TRUTH_LOCK_POLICY: TruthLockPolicy = { expectedBranch: "main" };

/**
 * evaluateTruthLock — PURE policy over observable git facts (unit-testable with synthetic states).
 *
 * Refuses (ok=false, no migration) when any campaign invariant fails: not a git repo; unexpected branch;
 * origin/main unresolvable; HEAD diverges from origin/main; or the INDEX carries staged changes (which a
 * run must never risk incorporating). It deliberately does NOT require a fully clean WORKTREE: unstaged
 * local edits (A2/A3/B49, the B78/B79 slice) are ISOLATED — the candidate is `git archive HEAD` (committed)
 * plus an overlay of ONLY the authorised write-set, so unstaged changes are never overwritten, staged, or
 * incorporated (proven η3-B79 §D). Requiring a pristine worktree would block authorised local development;
 * this exception is precise, verifiable and non-destructive.
 */
export function evaluateTruthLock(s: GitState, policy: TruthLockPolicy = DEFAULT_TRUTH_LOCK_POLICY): TruthLock {
  const violations: string[] = [];
  if (!s.isRepo) {
    violations.push("not a git repository");
  } else {
    if (s.branch !== policy.expectedBranch) violations.push(`unexpected branch "${s.branch}" (expected "${policy.expectedBranch}")`);
    if (s.originMain === null) violations.push("origin/main unavailable — cannot confirm the published reference");
    else if (s.head !== s.originMain) violations.push(`HEAD ${s.head.slice(0, 8)} diverges from origin/main ${s.originMain.slice(0, 8)}`);
    if (s.staged > 0) violations.push(`${s.staged} staged change(s) in the index — refuse to risk incorporating/committing them`);
  }
  const ok = violations.length === 0;
  const detail = ok
    ? "repo on expected branch, HEAD == origin/main, index empty; candidate built from committed HEAD (unstaged local changes isolated by git-archive, never overwritten/incorporated)"
    : "REFUSED — " + violations.join("; ");
  return { ok, head: s.head, branch: s.branch, detail, violations };
}

export interface MigrateSeams {
  allowedLots: string[];
  truthLock(): TruthLock;
  gate(name: string, lot: string): { status: GateStatus; detail: string };
  log(msg: string): void;
}
export interface MigrateResult { lot: string; truthLock: TruthLock | null; gates: GateResult[]; ok: boolean; exitCode: number }

// The ordered, DISTINCT internal validation gates. STOP on the first non-PASS; the rest are NOT RUN.
export const GATE_SEQUENCE = [
  "build:runtime",
  "strict-gate",
  "equivalence-bench",
  "historical-suites",
  "regressions",
] as const;

/**
 * runMigrateTs(lot, seams) — pure orchestrator. Exit codes: 0 all gates PASS; 1 a gate FAILed;
 * 2 BLOCKED (lot not authorised for this slice, or Truth Lock refused). A FAILED/BLOCKED gate is never
 * recorded as DONE and halts the sequence (remaining gates = NOT RUN).
 */
export function runMigrateTs(lot: string, seams: MigrateSeams): MigrateResult {
  if (!seams.allowedLots.includes(lot)) {
    seams.log(`BLOCKED: lot "${lot}" is not authorised for this slice (allowed: ${seams.allowedLots.join(", ") || "none"}). STOP — request a new CTO authorisation.`);
    return { lot, truthLock: null, gates: [], ok: false, exitCode: 2 };
  }
  const tl = seams.truthLock();
  seams.log(`Truth Lock: HEAD=${tl.head} branch=${tl.branch} — ${tl.detail}`);
  if (!tl.ok) {
    seams.log("BLOCKED: Truth Lock refused — repository state is not safe to run. STOP (no write, no overwrite).");
    return { lot, truthLock: tl, gates: [], ok: false, exitCode: 2 };
  }
  const gates: GateResult[] = [];
  let stopped = false;
  for (const name of GATE_SEQUENCE) {
    if (stopped) {
      gates.push({ gate: name, status: "NOT RUN", detail: "skipped after an earlier non-PASS gate (no false DONE)" });
      continue;
    }
    const r = seams.gate(name, lot);
    gates.push({ gate: name, status: r.status, detail: r.detail });
    seams.log(`  ${r.status.padEnd(8)} ${name} — ${r.detail}`);
    if (r.status !== "PASS") stopped = true;
  }
  const ok = gates.length === GATE_SEQUENCE.length && gates.every((g) => g.status === "PASS");
  return { lot, truthLock: tl, gates, ok, exitCode: ok ? 0 : 1 };
}

// --------------------------------------------------------------------------------------------------
// Real seams — the actual campaign side effects. Builds ONE isolated candidate (git-archive of committed
// HEAD + overlay of ONLY the authorised write-set source files) and runs every gate against it. The real
// repo is never written; the historical .js is never touched. Offline: npm ci is NOT run (node_modules is
// reused from the repo via symlink) — this is an OFFLINE candidate validation, never a network install.
// --------------------------------------------------------------------------------------------------
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

// The authorised write-set source files overlaid onto the committed-HEAD candidate for the validation-engine lot.
const LOT_WRITE_SET: Record<string, string[]> = {
  "validation-engine": [
    "runtime/core/validation-engine.ts",
    "runtime/__bench__/validation-engine-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
    "tsconfig.runtime-leaves-strict.json",
  ],
  // local-test-gate lot (CTO authorisation V9). Leaf module (no internal ./requires); the compiled
  // .ts is self-contained in dist. The strict-gate's leaves config is unchanged (it is not a dist
  // pipeline leaf), so the port is type-checked by the tsconfig.runtime-dist compile alone.
  "local-test-gate": [
    "runtime/core/local-test-gate.ts",
    "runtime/__bench__/local-test-gate-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // governance-kernel lot (CTO authorisation V10). Leaf module (only `fs`); compiled .ts is
  // self-contained in dist. Not a strict-leaves config member, so the port is type-checked by the
  // tsconfig.runtime-dist compile. Adding it to dist also gives the dist consumers (mission-ledger,
  // mission-lifecycle) a compiled `./governance-kernel` target.
  "governance-kernel": [
    "runtime/core/governance-kernel.ts",
    "runtime/__bench__/governance-kernel-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // research-ranking lot (CTO standing delegation V11). Pure leaf (no requires); self-contained in dist.
  "research-ranking": [
    "runtime/core/research-ranking.ts",
    "runtime/__bench__/research-ranking-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // connectivity-classifier lot (CTO standing delegation V11). Pure leaf; self-contained in dist.
  "connectivity-classifier": [
    "runtime/core/connectivity-classifier.ts",
    "runtime/__bench__/connectivity-classifier-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // local-fixers lot (CTO standing delegation V12). Leaf (only `fs`); self-contained in dist.
  "local-fixers": [
    "runtime/core/local-fixers.ts",
    "runtime/__bench__/local-fixers-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // decision-rules lot (CTO standing delegation V12). Pure leaf; self-contained in dist. Recognition
  // table only — authorization is unchanged (recognition is NOT authorization, as the .js documents).
  "decision-rules": [
    "runtime/core/decision-rules.ts",
    "runtime/__bench__/decision-rules-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // idempotency-guard lot (CTO standing delegation V13). Pure leaf; self-contained in dist. Consumed by
  // the dist-built patch-executor ⇒ dist include also gives it a compiled ./idempotency-guard target.
  "idempotency-guard": [
    "runtime/core/idempotency-guard.ts",
    "runtime/__bench__/idempotency-guard-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // scope-observer lot (CTO standing delegation V13). Leaf (fs + cwd-relative git; NO __dirname). A
  // validation-engine EVIDENCE dependency ⇒ dist include gives the dist consumer a compiled target.
  "scope-observer": [
    "runtime/core/scope-observer.ts",
    "runtime/__bench__/scope-observer-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // state-transition lot (CTO authorisation V15). Pure leaf (C03 STATE validator); self-contained in
  // dist. Widely consumed (mission-lifecycle/action-gate/capability-probes/... dist-built) ⇒ dist
  // include gives those compiled consumers a compiled ./state-transition target.
  "state-transition": [
    "runtime/core/state-transition.ts",
    "runtime/__bench__/state-transition-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // runtime-model lot (CTO authorisation V17). Pure leaf (deterministic, root-relative, no writes);
  // self-contained in dist. Consumed by the dist-built capability-registry ⇒ dist include gives it a
  // compiled ./runtime-model target.
  "runtime-model": [
    "runtime/core/runtime-model.ts",
    "runtime/__bench__/runtime-model-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // autonomy-measure lot (CTO authorisation V18). Pure deterministic leaf (no I/O); self-contained in
  // dist. Consumed by dist-built final-report + autonomy-rate ⇒ dist include gives a compiled target.
  "autonomy-measure": [
    "runtime/core/autonomy-measure.ts",
    "runtime/__bench__/autonomy-measure-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
};
// The lot's historical suites (replayed against the unchanged .js) and the sibling regression benches.
const LOT_HISTORICAL: Record<string, string[]> = {
  "validation-engine": [
    "src/runtime/validation-engine-recorded-noop.test.ts",
    "src/runtime/validation-engine-probe-freshness.test.ts",
  ],
  // The lot's existing behavioural suite, replayed against the UNCHANGED historical .js.
  "local-test-gate": [
    "runtime/core/local-test-gate.test.js",
  ],
  "governance-kernel": [
    "runtime/core/governance-kernel.test.js",
  ],
  "research-ranking": [
    "runtime/core/research-ranking.test.js",
  ],
  "connectivity-classifier": [
    "runtime/core/connectivity-classifier.test.js",
  ],
  "local-fixers": [
    "runtime/core/local-fixers.test.js",
  ],
  "decision-rules": [
    "runtime/core/decision-rules.test.js",
  ],
  "idempotency-guard": [
    "runtime/core/idempotency-guard.test.js",
  ],
  "scope-observer": [
    "runtime/core/scope-observer.test.js",
  ],
  "state-transition": [
    "runtime/core/state-transition.test.js",
  ],
  "runtime-model": [
    "runtime/core/runtime-model.test.js",
  ],
  "autonomy-measure": [
    "runtime/core/autonomy-measure.test.js",
  ],
};
const REGRESSION_BENCHES = [
  "runtime/__bench__/capability-registry-equivalence.e2e.test.ts",
  "runtime/__bench__/dist-closure-relocation.e2e.test.ts",
  "runtime/__bench__/project-context-engine-equivalence.e2e.test.ts",
  "runtime/__bench__/fleet-stage-equivalence.e2e.test.ts",
  "runtime/__bench__/mission-lifecycle-equivalence.e2e.test.ts",
];

function sh(cmd: string, args: string[], cwd: string): { code: number; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return { code: r.status === null ? 1 : r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// Gather the observable git facts for the Truth Lock policy (real repo). Any git failure degrades to a
// safe, refusing state rather than throwing.
function gatherGitState(): GitState {
  function g(args: string[]): string | null {
    const r = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
    return r.status === 0 ? (r.stdout || "").trim() : null;
  }
  const head = g(["rev-parse", "HEAD"]);
  if (head === null) return { isRepo: false, branch: "?", head: "?", originMain: null, staged: 0 };
  const branch = g(["rev-parse", "--abbrev-ref", "HEAD"]) || "?";
  const originMain = g(["rev-parse", "origin/main"]);
  const stagedOut = g(["diff", "--cached", "--name-only"]);
  const staged = stagedOut ? stagedOut.split("\n").filter(Boolean).length : 0;
  return { isRepo: true, branch, head, originMain, staged };
}

export function realSeams(): MigrateSeams {
  let candidate = "";
  let lockedHead = ""; // HEAD confirmed by truthLock; re-validated right before the sensitive git-archive.
  const tsx = path.join(REPO, "node_modules", ".bin", "tsx");
  const tsc = path.join(REPO, "node_modules", ".bin", "tsc");
  return {
    allowedLots: Object.keys(LOT_WRITE_SET),
    truthLock(): TruthLock {
      const tl = evaluateTruthLock(gatherGitState());
      if (tl.ok) lockedHead = tl.head;
      return tl;
    },
    gate(name: string, lot: string): { status: GateStatus; detail: string } {
      try {
        if (name === "build:runtime") {
          // RE-VALIDATE the invariants right before the sensitive op (a captured HEAD is not a
          // revalidation — η3-B79 §5): HEAD must still equal the one Truth Lock confirmed, and the
          // index must still be empty. Refuse (BLOCKED) rather than archive an unexpected state.
          const now = gatherGitState();
          const reTl = evaluateTruthLock(now);
          if (!reTl.ok) return { status: "BLOCKED", detail: "Truth Lock re-validation failed before archive: " + reTl.detail };
          if (now.head !== lockedHead) return { status: "BLOCKED", detail: `HEAD changed since Truth Lock (${lockedHead.slice(0, 8)} → ${now.head.slice(0, 8)}) — refuse to archive a shifted reference` };
          // Build the isolated candidate: git archive HEAD + overlay ONLY the authorised write-set.
          candidate = fs.mkdtempSync(path.join(os.tmpdir(), "odg-migrate-ts-"));
          const tar = spawnSync("bash", ["-c", `git archive HEAD | tar -x -C ${JSON.stringify(candidate)}`], { cwd: REPO, encoding: "utf8" });
          if (tar.status !== 0) return { status: "FAIL", detail: "git archive failed: " + (tar.stderr || "") };
          for (const rel of LOT_WRITE_SET[lot]) fs.cpSync(path.join(REPO, rel), path.join(candidate, rel));
          fs.symlinkSync(path.join(REPO, "node_modules"), path.join(candidate, "node_modules"));
          const b = sh(tsc, ["-p", "tsconfig.runtime-dist.json"], candidate);
          const emitted = fs.existsSync(path.join(candidate, "runtime", "dist", "core", `${lot}.js`));
          return b.code === 0 && emitted
            ? { status: "PASS", detail: `build:runtime EXIT 0, dist/core/${lot}.js emitted (OFFLINE candidate; npm ci NOT run)` }
            : { status: "FAIL", detail: `build rc=${b.code}, emitted=${emitted}` };
        }
        if (name === "strict-gate") {
          const r = sh(tsc, ["-p", "tsconfig.runtime-leaves-strict.json", "--noEmit"], candidate);
          return r.code === 0 ? { status: "PASS", detail: "strict gate EXIT 0" } : { status: "FAIL", detail: "strict gate rc=" + r.code + " " + r.out.slice(0, 200) };
        }
        if (name === "equivalence-bench") {
          const r = sh(tsx, [`runtime/__bench__/${lot}-equivalence.e2e.test.ts`], candidate);
          return r.code === 0 ? { status: "PASS", detail: "equivalence bench ALL PASS" } : { status: "FAIL", detail: "bench rc=" + r.code + " " + r.out.slice(-200) };
        }
        if (name === "historical-suites") {
          for (const t of LOT_HISTORICAL[lot]) {
            const r = sh(tsx, [t], candidate);
            if (r.code !== 0) return { status: "FAIL", detail: `${t} rc=${r.code}` };
          }
          return { status: "PASS", detail: `${LOT_HISTORICAL[lot].length} historical suite(s) green vs unchanged .js` };
        }
        if (name === "regressions") {
          for (const t of REGRESSION_BENCHES) {
            const r = sh(tsx, [t], candidate);
            if (r.code !== 0) return { status: "FAIL", detail: `${t} rc=${r.code}` };
          }
          return { status: "PASS", detail: `${REGRESSION_BENCHES.length} regression bench(es) green` };
        }
        return { status: "BLOCKED", detail: "unknown gate" };
      } catch (e: any) {
        return { status: "FAIL", detail: "gate threw: " + String(e && e.message || e) };
      } finally {
        // best-effort cleanup only AFTER the last gate
        if (name === "regressions" && candidate) { try { fs.rmSync(candidate, { recursive: true, force: true }); } catch { /* best-effort */ } }
      }
    },
    log(msg: string): void { console.log(msg); },
  };
}

function renderReport(res: MigrateResult): string {
  const lines = [
    "======================================",
    "ODG migrate-ts — TS migration campaign",
    "======================================",
    `Lot       : ${res.lot}`,
    res.truthLock ? `Truth Lock: HEAD=${res.truthLock.head} branch=${res.truthLock.branch}` : "Truth Lock: (not run)",
    "Gates     :",
    ...res.gates.map((g) => `  ${g.status.padEnd(8)} ${g.gate} — ${g.detail}`),
    `Outcome   : ${res.ok ? "ALL PASS" : "NOT COMPLETE"} (exit ${res.exitCode})`,
    "======================================",
  ];
  return lines.join("\n");
}

// Only run main() when invoked directly (tsx entrypoint), never when imported by the unit test.
const isMain = (() => { try { return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname); } catch { return false; } })();
if (isMain) {
  const lot = process.argv[2] || "validation-engine";
  const seams = realSeams();
  const res = runMigrateTs(lot, seams);
  console.log(renderReport(res));
  process.exit(res.exitCode);
}
