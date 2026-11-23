/*
 * RUN-OUTPUT ISOLATION (V15.1) — OPT-IN per-run output directory for the governed odg-run pipeline.
 *
 * WHY: every odg-run stage reads/writes the SHARED cwd-relative runtime/generated/ (≈85 hard-coded literals across
 * ~50 modules of the stage closure). Two concurrent runs therefore clobber each other's mission-plan / patch-plan /
 * mission-report / checkpoint, and the mission-ledger read-modify-write loses updates. The wave planner
 * (odg-schedule-tick ODG_TICK_WAVE=1) consequently had to add runtime/generated to EVERY write-set ⇒ waves of 1.
 *
 * WHAT: when ODG_RUN_OUTPUT_DIR=<dir> is set, odg-run installs this module in its own process AND (via NODE_OPTIONS
 * --require) in every node descendant (the 13–14 stage processes and anything they spawn). It is ONE chokepoint on
 * the `fs` module object — so it covers every literal in every module, including ones nobody remembered to list —
 * that maps paths under <ROOT>/runtime/generated as a COPY-ON-WRITE OVERLAY:
 *   - WRITES of a generated path go to the per-run UPPER layer <dir>/<rel> (parents auto-created). The shared
 *     runtime/generated is NEVER written by an isolated run, EXCEPT the explicit SHARED_STATE set below;
 *   - READS of a per-run artifact the run itself produces (PER_RUN_ARTIFACTS, logs/, reports/) are UPPER-ONLY: an
 *     isolated run can never consume another run's (or a stale prior run's) plan/report/checkpoint;
 *   - READS of anything else (shared INPUTS: project-context.json, present-state-reconciliation.json, autonomy/
 *     patch-memory + capability library …) fall through to the shared LOWER layer, READ-ONLY — exactly what the
 *     default path would have read;
 *   - SHARED_STATE (mission-ledger.json + its .lock/.tmp-*) passes through to the real shared file; the ledger
 *     stage serializes its read-modify-write with withExclusiveLock (O_CREAT|O_EXCL) when isolation is active.
 * Directory listings merge both layers (upper wins on a name clash). Deletes/renames only ever touch the upper layer.
 *
 * DEFAULT UNCHANGED: with ODG_RUN_OUTPUT_DIR unset nothing here is loaded by odg-run, no fs function is patched, no
 * NODE_OPTIONS is set and the stage spawn argv/env are byte-identical to before.
 *
 * LIMITS (stated, not hidden): non-node descendants (git, grep, sh) are not redirected (they only read in a read-only
 * canary run); a write to shared learning state (e.g. autonomy/patch-memory.json) by an ISOLATED run is captured in
 * the per-run layer and NOT propagated to the shared file (no lost-update, but no shared learning either — read-only
 * canaries perform none, measured); only string paths are mapped (Buffer/URL/fd arguments pass through unchanged);
 * the git-based Clean-Workspace observation sees the physical workspace, so its transient-candidate list differs; the
 * stale-lock break (holder dead > staleMs) is best-effort — two waiters breaking the SAME stale lock may race once.
 */
"use strict";

import * as fs from "fs";
import * as path from "path";

const ENV_DIR = "ODG_RUN_OUTPUT_DIR";
const ENV_ROOT = "ODG_RUN_OUTPUT_ROOT";   // pinned repo root, so a descendant with another cwd maps only the REAL generated dir
const INSTALLED = Symbol.for("odg.runOutputIsolation.installed");

/* Shared state that MUST stay shared (other runs + the scheduler's proven-dedup read it). Serialized by a lock. */
const SHARED_STATE: readonly string[] = Object.freeze(["mission-ledger.json"]);
/* Artifacts an odg-run run PRODUCES (measured inventory of a governed read-only canary run). Upper-only reads. */
const PER_RUN_ARTIFACTS: readonly string[] = Object.freeze([
  "truth-lock.json", "runtime-pipeline.json", "pipeline-checkpoint.json", "mission-interpretation.json",
  "mission-plan.json", "mission-context.json", "coding-resolution.json", "execution-plan.json",
  "capability-registry.json", "knowledge.json", "runtime-context.json", "decision.json", "patch-plan.json",
  "patch-execution.json", "runtime-verify.json", "mission-report.json", "fidelity-verdict.json",
  "mission-lifecycle.json", "clean-workspace-scan.json",
]);
const PER_RUN_DIRS: readonly string[] = Object.freeze(["logs", "reports"]);

type Kind = "OUTSIDE" | "SHARED" | "PER_RUN" | "INPUT";
interface Ctx { root: string; gen: string; out: string }

function isWithin(p: string, dir: string): boolean { return p === dir || p.startsWith(dir + path.sep); }

/* resolveConfig — PURE validation of the opt-in. null ⇒ isolation OFF. Throws on an unsafe value (fail-closed). */
function resolveConfig(env: Record<string, string | undefined> = process.env, cwd: string = process.cwd()): Ctx | null {
  const raw = env[ENV_DIR];
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const root = path.resolve(typeof env[ENV_ROOT] === "string" && env[ENV_ROOT]!.trim() ? env[ENV_ROOT]!.trim() : cwd);
  const gen = path.join(root, "runtime", "generated");
  const out = path.resolve(root, raw.trim());
  if (out === gen || isWithin(gen, out)) throw new Error(`${ENV_DIR}="${raw}" resolves to (an ancestor of) the shared runtime/generated — refusing (isolation would be a no-op)`);
  if (isWithin(out, root) && !isWithin(out, gen)) throw new Error(`${ENV_DIR}="${raw}" is inside the repository but outside runtime/generated — refusing to write per-run output into tracked space`);
  return { root, gen, out };
}

/* classify — PURE: which layer a generated-relative path belongs to. */
function classifyRel(rel: string): Kind {
  const norm = rel.split(path.sep).join("/");
  const base = norm.split("/")[0];
  for (const s of SHARED_STATE) if (norm === s || norm === s + ".lock" || norm.startsWith(s + ".tmp-")) return "SHARED";
  for (const a of PER_RUN_ARTIFACTS) if (norm === a || norm.startsWith(a + ".tmp-")) return "PER_RUN";
  if (PER_RUN_DIRS.indexOf(base) >= 0) return "PER_RUN";
  return "INPUT";
}

/* mapPath — PURE: (path, ctx) → the layer + upper/lower physical paths. */
function mapPath(p: string, ctx: Ctx): { kind: Kind; rel?: string; upper?: string; lower?: string } {
  const abs = path.resolve(ctx.root, p);
  if (isWithin(abs, ctx.out) || !isWithin(abs, ctx.gen)) return { kind: "OUTSIDE" };
  const rel = path.relative(ctx.gen, abs);
  const kind: Kind = rel === "" ? "INPUT" : classifyRel(rel);
  return { kind, rel, upper: rel === "" ? ctx.out : path.join(ctx.out, rel), lower: abs };
}

function sleepMs(ms: number): void { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

/* withExclusiveLock — cross-process mutual exclusion via an O_CREAT|O_EXCL lock file (atomic on POSIX local fs).
 * A lock older than staleMs (crashed holder) is broken. Throws after timeoutMs — never proceeds unlocked. */
function withExclusiveLock<T>(lockFile: string, fn: () => T, o: { timeoutMs?: number; staleMs?: number; pollMs?: number } = {}): T {
  const timeoutMs = o.timeoutMs ?? 60000, staleMs = o.staleMs ?? 120000, pollMs = o.pollMs ?? 15;
  const t0 = Date.now();
  let fd: number | null = null;
  while (fd === null) {
    try { fd = fs.openSync(lockFile, "wx"); fs.writeSync(fd, String(process.pid)); }
    catch (e: any) {
      if (!e || e.code !== "EEXIST") throw e;
      try { if (Date.now() - fs.statSync(lockFile).mtimeMs > staleMs) { fs.rmSync(lockFile, { force: true }); continue; } } catch { /* raced */ }
      if (Date.now() - t0 > timeoutMs) throw new Error(`withExclusiveLock: timed out after ${timeoutMs}ms waiting for ${lockFile}`);
      sleepMs(pollMs);
    }
  }
  try { return fn(); }
  finally { try { fs.closeSync(fd); } catch { /* closed */ } try { fs.rmSync(lockFile, { force: true }); } catch { /* best-effort */ } }
}

function isActive(env: Record<string, string | undefined> = process.env): boolean {
  return typeof env[ENV_DIR] === "string" && env[ENV_DIR]!.trim() !== "";
}

/* install — patch the shared `fs` module object (and fs.promises) in THIS process. Idempotent. Returns ctx|null. */
function install(env: Record<string, string | undefined> = process.env): Ctx | null {
  const g: any = globalThis as any;
  if (g[INSTALLED]) return g[INSTALLED];
  const ctx = resolveConfig(env);
  if (!ctx) return null;
  const F: any = require("fs");
  const O: any = {};
  for (const k of ["readFileSync", "writeFileSync", "appendFileSync", "existsSync", "statSync", "lstatSync", "accessSync",
    "readdirSync", "mkdirSync", "rmSync", "unlinkSync", "renameSync", "openSync", "copyFileSync", "utimesSync", "realpathSync"]) O[k] = F[k];
  const P: any = F.promises;
  const OP: any = {};
  for (const k of ["readFile", "writeFile", "appendFile", "stat", "access", "readdir", "mkdir", "rm", "unlink", "rename"]) OP[k] = P[k];
  O.mkdirSync(ctx.out, { recursive: true });

  const m = (p: any) => (typeof p === "string" ? mapPath(p, ctx) : { kind: "OUTSIDE" as Kind });
  const exists = (p: string) => O.existsSync(p);
  // read target: upper when present; upper-only for PER_RUN; else the shared lower layer (read-only fall-through).
  const rd = (p: any): any => { const x = m(p); if (x.kind === "OUTSIDE" || x.kind === "SHARED") return p; if (exists(x.upper!)) return x.upper; return x.kind === "PER_RUN" ? x.upper : x.lower; };
  const wrDir = (p: any): any => { const x = m(p); return x.kind === "OUTSIDE" || x.kind === "SHARED" ? p : x.upper; };
  const wr = (p: any): any => { const t = wrDir(p); if (t !== p) { try { O.mkdirSync(path.dirname(t), { recursive: true }); } catch { /* surfaced by the op */ } } return t; };
  const isWriteFlag = (f: any) => typeof f === "number" ? (f & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT)) !== 0 : typeof f === "string" && /[wa+]/.test(f);
  const merge = (p: any, a: any[], list: (d: string, ...r: any[]) => any[]): any => {
    const x = m(p);
    if (x.kind === "OUTSIDE" || x.kind === "SHARED") return null;
    const up = exists(x.upper!) ? list(x.upper!, ...a) : null;
    const low = x.kind !== "PER_RUN" && exists(x.lower!) ? list(x.lower!, ...a) : null;
    if (!up && !low) return list(x.kind === "PER_RUN" ? x.upper! : x.lower!, ...a); // natural ENOENT
    const seen = new Set<string>(); const res: any[] = [];
    const nameOf = (e: any) => String(typeof e === "string" ? e : (e && e.name));
    // A lower-layer entry that is a PER_RUN artifact is INVISIBLE (upper-only reads ⇒ listing it would be a dangling name).
    const lowVisible = (low || []).filter((e: any) => classifyRel(path.join(x.rel!, nameOf(e))) !== "PER_RUN");
    for (const e of [...(up || []), ...lowVisible]) { const n = nameOf(e); if (!seen.has(n)) { seen.add(n); res.push(e); } }
    return res;
  };

  F.readFileSync = (p: any, ...a: any[]) => O.readFileSync(rd(p), ...a);
  F.existsSync = (p: any) => O.existsSync(rd(p));
  F.statSync = (p: any, ...a: any[]) => O.statSync(rd(p), ...a);
  F.lstatSync = (p: any, ...a: any[]) => O.lstatSync(rd(p), ...a);
  F.accessSync = (p: any, ...a: any[]) => O.accessSync(rd(p), ...a);
  F.realpathSync = Object.assign((p: any, ...a: any[]) => O.realpathSync(rd(p), ...a), { native: O.realpathSync.native });
  F.readdirSync = (p: any, ...a: any[]) => { const r = merge(p, a, O.readdirSync); return r === null ? O.readdirSync(p, ...a) : r; };
  F.writeFileSync = (p: any, ...a: any[]) => O.writeFileSync(wr(p), ...a);
  F.appendFileSync = (p: any, ...a: any[]) => O.appendFileSync(wr(p), ...a);
  F.mkdirSync = (p: any, ...a: any[]) => O.mkdirSync(wrDir(p), ...a);
  F.rmSync = (p: any, ...a: any[]) => O.rmSync(wrDir(p), ...a);
  F.unlinkSync = (p: any, ...a: any[]) => O.unlinkSync(wrDir(p), ...a);
  F.utimesSync = (p: any, ...a: any[]) => O.utimesSync(wrDir(p), ...a);
  F.renameSync = (a: any, b: any) => O.renameSync(wrDir(a), wr(b));
  F.copyFileSync = (a: any, b: any, ...r: any[]) => O.copyFileSync(rd(a), wr(b), ...r);
  F.openSync = (p: any, flags?: any, ...a: any[]) => O.openSync(isWriteFlag(flags) ? wr(p) : rd(p), flags, ...a);
  P.readFile = (p: any, ...a: any[]) => OP.readFile(rd(p), ...a);
  P.stat = (p: any, ...a: any[]) => OP.stat(rd(p), ...a);
  P.access = (p: any, ...a: any[]) => OP.access(rd(p), ...a);
  P.readdir = async (p: any, ...a: any[]) => { const r = merge(p, a, O.readdirSync); return r === null ? OP.readdir(p, ...a) : r; };
  P.writeFile = (p: any, ...a: any[]) => OP.writeFile(wr(p), ...a);
  P.appendFile = (p: any, ...a: any[]) => OP.appendFile(wr(p), ...a);
  P.mkdir = (p: any, ...a: any[]) => OP.mkdir(wrDir(p), ...a);
  P.rm = (p: any, ...a: any[]) => OP.rm(wrDir(p), ...a);
  P.unlink = (p: any, ...a: any[]) => OP.unlink(wrDir(p), ...a);
  P.rename = (a: any, b: any) => OP.rename(wrDir(a), wr(b));
  g[INSTALLED] = ctx;
  return ctx;
}

/* childEnv — the env odg-run hands to its stage children in isolated mode: pins the root, preloads this module in
 * every node descendant, disables git's OPTIONAL index lock (concurrent `git status` on one repo never contends). */
function childEnv(env: Record<string, string | undefined>, ctx: Ctx, selfPath: string): Record<string, string | undefined> {
  const pre = `--require ${selfPath}`;
  const prior = typeof env.NODE_OPTIONS === "string" && env.NODE_OPTIONS.trim() ? env.NODE_OPTIONS : "";
  return { ...env, [ENV_DIR]: ctx.out, [ENV_ROOT]: ctx.root, GIT_OPTIONAL_LOCKS: "0", NODE_OPTIONS: prior.indexOf(pre) >= 0 ? prior : (prior ? prior + " " + pre : pre) };
}

module.exports = { ENV_DIR, ENV_ROOT, SHARED_STATE, PER_RUN_ARTIFACTS, PER_RUN_DIRS, resolveConfig, classifyRel, mapPath, withExclusiveLock, isActive, install, childEnv };

// Preload entry: `node --require <this file>` installs the overlay as soon as the descendant starts (no-op when unset).
if (isActive()) { try { install(); } catch (e: any) { console.error("STOP: run-output isolation refused —", e && e.message); process.exit(1); } }

// Module-scope marker (repo dual-export convention; adds NO runtime export).
export {};
