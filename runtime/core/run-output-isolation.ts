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
 *   - SHARED_STATE (mission-ledger.json + .tmp-*, and its fleet-bridge generation claims fleet/locks/mission-ledger.lock.*)
 *     passes through to the real shared file; the ledger stage serializes its read-modify-write on EVERY path with
 *     mission-ledger.withLedgerClaim (reuses fleet-bridge tryClaim/releaseClaim — no second lock design here).
 * Relative paths resolve against process.cwd() of the calling process (the pinned root only identifies WHICH directory
 * is the shared runtime/generated). Every path-taking fs API is covered (sync, callback and promises) — see PATCHED_APIS;
 * a test scans the odg-run stage closure and fails on any fs API used there that is neither patched nor path-free.
 * Directory listings merge both layers (upper wins on a name clash). Deletes/renames only ever touch the upper layer.
 *
 * DEFAULT UNCHANGED: with ODG_RUN_OUTPUT_DIR unset nothing here is loaded by odg-run, no fs function is patched, no
 * NODE_OPTIONS is set and the stage spawn argv/env are byte-identical to before.
 *
 * LIMITS (stated, not hidden): non-node descendants (git, grep, sh) are not redirected (they only read in a read-only
 * canary run); a write to shared learning state (e.g. autonomy/patch-memory.json) by an ISOLATED run is captured in
 * the per-run layer and NOT propagated to the shared file (no lost-update, but no shared learning either — read-only
 * canaries perform none, measured); only string paths are mapped (Buffer/URL/fd arguments pass through unchanged);
 * the git-based Clean-Workspace observation sees the physical workspace, so its transient-candidate list differs; a
 * linkSync whose SOURCE is a shared input creates a per-run hard link to the SHARED inode (none in the stage closure).
 */
"use strict";

import * as fs from "fs";
import * as url from "url";
import * as path from "path";

const ENV_DIR = "ODG_RUN_OUTPUT_DIR";
const ENV_ROOT = "ODG_RUN_OUTPUT_ROOT";   // pinned repo root, so a descendant with another cwd maps only the REAL generated dir
const INSTALLED = Symbol.for("odg.runOutputIsolation.installed");

/* Shared state that MUST stay shared (other runs + the scheduler's proven-dedup read it). Serialized by the ledger claim. */
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
  for (const s of SHARED_STATE) if (norm === s || norm.startsWith(s + ".tmp-")) return "SHARED";
  if (norm.startsWith("fleet/locks/mission-ledger.lock")) return "SHARED";   // the ledger's fleet-bridge generation claims
  for (const a of PER_RUN_ARTIFACTS) if (norm === a || norm.startsWith(a + ".tmp-")) return "PER_RUN";
  if (PER_RUN_DIRS.indexOf(base) >= 0) return "PER_RUN";
  return "INPUT";
}

/* mapPath — PURE: (path, ctx, cwd) → the layer + upper/lower physical paths. Relative ⇒ resolved against cwd. */
function mapPath(p: string, ctx: Ctx, cwd: string = process.cwd()): { kind: Kind; rel?: string; upper?: string; lower?: string } {
  const abs = path.resolve(cwd, p);
  if (isWithin(abs, ctx.out) || !isWithin(abs, ctx.gen)) return { kind: "OUTSIDE" };
  const rel = path.relative(ctx.gen, abs);
  const kind: Kind = rel === "" ? "INPUT" : classifyRel(rel);
  return { kind, rel, upper: rel === "" ? ctx.out : path.join(ctx.out, rel), lower: abs };
}

function isActive(env: Record<string, string | undefined> = process.env): boolean {
  return typeof env[ENV_DIR] === "string" && env[ENV_DIR]!.trim() !== "";
}

/* API coverage. Roles per argument position: r = read path, w = written file (parent auto-created), d = mutated
 * path (no parent creation), o = open(path, flags) ⇒ w|r by flags, L = directory listing (layers merged), - = untouched. */
const SYNC_APIS: Record<string, string> = {
  readFileSync: "r", existsSync: "r", statSync: "r", lstatSync: "r", accessSync: "r", readlinkSync: "r", opendirSync: "r",
  createReadStream: "r", watch: "r", watchFile: "r", unwatchFile: "r", statfsSync: "r",
  readdirSync: "L", writeFileSync: "w", appendFileSync: "w", truncateSync: "w", createWriteStream: "w", mkdtempSync: "w",
  mkdirSync: "d", rmSync: "d", rmdirSync: "d", unlinkSync: "d", utimesSync: "d", lutimesSync: "d", chmodSync: "d", lchmodSync: "d",
  chownSync: "d", lchownSync: "d", renameSync: "dw", copyFileSync: "rw", cpSync: "rw", linkSync: "rw", symlinkSync: "-w", openSync: "o",
  realpathSync: "r",
};
const CALLBACK_APIS: Record<string, string> = {
  readFile: "r", exists: "r", stat: "r", lstat: "r", access: "r", readlink: "r", opendir: "r", realpath: "r", statfs: "r",
  readdir: "L", writeFile: "w", appendFile: "w", truncate: "w", mkdtemp: "w",
  mkdir: "d", rm: "d", rmdir: "d", unlink: "d", utimes: "d", lutimes: "d", chmod: "d", lchmod: "d", chown: "d", lchown: "d",
  rename: "dw", copyFile: "rw", cp: "rw", link: "rw", symlink: "-w", open: "o",
};
const PROMISE_APIS: Record<string, string> = {
  readFile: "r", stat: "r", lstat: "r", access: "r", readlink: "r", opendir: "r", realpath: "r", statfs: "r", watch: "r",
  readdir: "L", writeFile: "w", appendFile: "w", truncate: "w", mkdtemp: "w",
  mkdir: "d", rm: "d", rmdir: "d", unlink: "d", utimes: "d", lutimes: "d", chmod: "d", lchmod: "d", chown: "d", lchown: "d",
  rename: "dw", copyFile: "rw", cp: "rw", link: "rw", symlink: "-w", open: "o",
};
/* fs APIs that take NO path (fd / constants / classes) — safe by construction. */
const PATH_FREE_APIS: readonly string[] = Object.freeze(["closeSync", "close", "writeSync", "write", "readSync", "read", "fstatSync", "fstat",
  "ftruncateSync", "ftruncate", "fsyncSync", "fsync", "fdatasyncSync", "fdatasync", "futimesSync", "futimes", "fchmodSync", "fchmod",
  "fchownSync", "fchown", "writevSync", "readvSync", "constants", "promises", "Dirent", "Stats", "ReadStream", "WriteStream"]);
const PATCHED_APIS = Object.freeze({ sync: Object.keys(SYNC_APIS), callback: Object.keys(CALLBACK_APIS), promises: Object.keys(PROMISE_APIS) });

/* install — patch the shared `fs` module object (sync + callback) and fs.promises in THIS process. Idempotent. */
function install(env: Record<string, string | undefined> = process.env): Ctx | null {
  const g: any = globalThis as any;
  if (g[INSTALLED]) return g[INSTALLED];
  const ctx = resolveConfig(env);
  if (!ctx) return null;
  const F: any = require("fs");
  const P: any = F.promises;
  const O: any = {};
  for (const k of ["existsSync", "mkdirSync", "readdirSync"]) O[k] = F[k];
  O.mkdirSync(ctx.out, { recursive: true });

  const asStr = (p: any): string | null => (typeof p === "string" ? p : p instanceof URL && p.protocol === "file:" ? url.fileURLToPath(p) : Buffer.isBuffer(p) ? p.toString() : null);
  const m = (p: any) => { const s2 = asStr(p); return s2 === null ? { kind: "OUTSIDE" as Kind } : mapPath(s2, ctx); };
  const exists = (p: string) => O.existsSync(p);
  const mkParent = (t: string) => { try { O.mkdirSync(path.dirname(t), { recursive: true }); } catch { /* surfaced by the op */ } };
  // read target: upper when present; upper-only for PER_RUN; else the shared lower layer (read-only fall-through).
  const rd = (p: any): any => { const x = m(p); if (x.kind === "OUTSIDE" || x.kind === "SHARED") return p; if (exists(x.upper!)) return x.upper; return x.kind === "PER_RUN" ? x.upper : x.lower; };
  const wrDir = (p: any): any => { const x = m(p); return x.kind === "OUTSIDE" || x.kind === "SHARED" ? p : x.upper; };
  const wr = (p: any): any => { const x = m(p); if (x.kind === "OUTSIDE") return p; const t = x.kind === "SHARED" ? x.lower! : x.upper!; mkParent(t); return x.kind === "SHARED" ? p : t; };
  const isWriteFlag = (f: any) => typeof f === "number" ? (f & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT)) !== 0 : typeof f === "string" && /[wa+]/.test(f);
  const merged = (p: any, a: any[]): any => {
    const x = m(p);
    if (x.kind === "OUTSIDE" || x.kind === "SHARED") return null;
    const up = exists(x.upper!) ? O.readdirSync(x.upper!, ...a) : null;
    const low = x.kind !== "PER_RUN" && exists(x.lower!) ? O.readdirSync(x.lower!, ...a) : null;
    if (!up && !low) return O.readdirSync(x.kind === "PER_RUN" ? x.upper! : x.lower!, ...a); // natural ENOENT
    const nameOf = (e: any) => String(typeof e === "string" ? e : (e && e.name));
    // A lower-layer entry that is a PER_RUN artifact is INVISIBLE (upper-only reads ⇒ listing it would be a dangling name).
    const lowVisible = (low || []).filter((e: any) => classifyRel(path.join(x.rel!, nameOf(e))) !== "PER_RUN");
    const seen = new Set<string>(); const res: any[] = [];
    for (const e of [...(up || []), ...lowVisible]) { const n = nameOf(e); if (!seen.has(n)) { seen.add(n); res.push(e); } }
    return res;
  };
  const mapArgs = (roles: string, a: any[]): any[] => {
    const b = a.slice();
    if (roles === "o") { b[0] = isWriteFlag(b[1]) ? wr(b[0]) : rd(b[0]); return b; }
    for (let i = 0; i < roles.length && i < b.length; i++) {
      const r = roles[i];
      if (r === "r" || r === "L") b[i] = rd(b[i]); else if (r === "w") b[i] = wr(b[i]); else if (r === "d") b[i] = wrDir(b[i]);
    }
    return b;
  };
  const patch = (obj: any, name: string, roles: string, kind: "sync" | "cb" | "promise") => {
    const orig = obj && obj[name];
    if (typeof orig !== "function") return;
    let fn: any;
    if (roles === "L" && kind === "sync") fn = function (this: any, p: any, ...a: any[]) { const r = merged(p, a); return r === null ? orig.call(this, p, ...a) : r; };
    else if (roles === "L" && kind === "promise") fn = async function (this: any, p: any, ...a: any[]) { const r = merged(p, a); return r === null ? orig.call(this, p, ...a) : r; };
    else if (roles === "L" && kind === "cb") fn = function (this: any, p: any, ...a: any[]) {
      const cb = typeof a[a.length - 1] === "function" ? a.pop() : null;
      let r: any; try { r = merged(p, a); } catch (e) { if (cb) { process.nextTick(cb, e); return; } throw e; }
      if (r === null) return orig.call(this, p, ...a, ...(cb ? [cb] : []));
      if (cb) process.nextTick(cb, null, r);
    };
    else fn = function (this: any, ...a: any[]) { return orig.apply(this, mapArgs(roles, a)); };
    for (const k of Object.keys(orig)) { try { fn[k] = orig[k]; } catch { /* read-only prop */ } }   // e.g. realpathSync.native
    if (orig.native) fn.native = function (this: any, ...a: any[]) { return orig.native.apply(this, mapArgs(roles, a)); };
    obj[name] = fn;
  };
  for (const [k, r] of Object.entries(SYNC_APIS)) patch(F, k, r, "sync");
  for (const [k, r] of Object.entries(CALLBACK_APIS)) patch(F, k, r, "cb");
  for (const [k, r] of Object.entries(PROMISE_APIS)) patch(P, k, r, "promise");
  g[INSTALLED] = ctx;
  return ctx;
}

/* childEnv — the env odg-run hands to its stage children in isolated mode: pins the root, preloads this module in
 * every node descendant (path QUOTED for NODE_OPTIONS), disables git's OPTIONAL index lock. */
function childEnv(env: Record<string, string | undefined>, ctx: Ctx, selfPath: string): Record<string, string | undefined> {
  const pre = `--require ${JSON.stringify(selfPath)}`;
  const prior = typeof env.NODE_OPTIONS === "string" && env.NODE_OPTIONS.trim() ? env.NODE_OPTIONS : "";
  return { ...env, [ENV_DIR]: ctx.out, [ENV_ROOT]: ctx.root, GIT_OPTIONAL_LOCKS: "0", NODE_OPTIONS: prior.indexOf(pre) >= 0 ? prior : (prior ? prior + " " + pre : pre) };
}

module.exports = { ENV_DIR, ENV_ROOT, SHARED_STATE, PER_RUN_ARTIFACTS, PER_RUN_DIRS, PATCHED_APIS, PATH_FREE_APIS, resolveConfig, classifyRel, mapPath, isActive, install, childEnv };

// Preload entry: `node --require <this file>` installs the overlay as soon as the descendant starts (no-op when unset).
if (isActive()) { try { install(); } catch (e: any) { console.error("STOP: run-output isolation refused —", e && e.message); process.exit(1); } }

// Module-scope marker (repo dual-export convention; adds NO runtime export).
export {};
