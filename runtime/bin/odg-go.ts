#!/usr/bin/env node
"use strict";
/*
 * V16.4 §2 "ODG GO" — CLI over runtime/core/odg-go-cycle.ts (ONE bounded governed cycle; see the core header).
 *
 * Usage:
 *   npx tsx runtime/bin/odg-go.ts [--dry] [--execute] [--repo <dir>] [--out <dir>] [--max-steps N] [--deadline-ms MS]
 *                                 [--scratch <isolated git worktree>] [--step-delay-ms MS] [--resume]
 *   npx tsx runtime/bin/odg-go.ts --scenario-evidence --repo <dir> --out <dir> [--evidence-out <file>]   (real I/J harness)
 *   npx tsx runtime/bin/odg-go.ts --check --repo <dir>          (re-run a dry cycle; compare its decisions digest with
 *                                                               docs/odg/evidence/V164_GO_CYCLE.json — host-dependent)
 *
 *  --allow-unsandboxed-target  explicit opt-in (recorded in the trace) to run a contract-DECLARED scoped dispatch target
 *                  on the host: scratch writes are confined (git status --ignored ⊆ target writeSet), out-of-scratch
 *                  writes are NOT (no bwrap). Absent ⇒ UNSANDBOXED_TARGET_NOT_OPTED_IN, nothing dispatched (GO-DT-1).
 *  --dry (DEFAULT) plan-only: every step runs, schedulerStep's dispatch is a recorder (nothing executed).
 *  --execute       dispatch allowed ONLY for a canonically authorized NATIVE mission in the isolated --scratch worktree
 *                  (odg-run there, bounded, SIGKILL on timeout). PROVIDER/HYBRID ⇒ delegation record only. No commit/merge.
 *  --repo          the repository whose STATE is read (READ-ONLY) and Truth-Locked; default = this code tree.
 *  --out           trace/summary directory (default <os.tmpdir()>/odg-go). REFUSED inside the main checkout (its
 *                  runtime/generated + runtime/dist feed the live root timer) and inside any runtime/governance.
 *  --resume        V16.9: if the last cycle in <out>/go-trace.jsonl ended STOPPED (deadline/signal/STOP file) before all
 *                  steps, resume at its first incomplete step ONLY if the state digest (runId) is unchanged — completed
 *                  steps re-derived and checked identical, a completed EXECUTE carried over (never re-dispatched); else a
 *                  fresh cycle, the RESUME trace entry says why. Default deadline 900000 ms (was 120000; see DEADLINE_HISTORY).
 *  STOP            touch <out>/STOP, send SIGINT/SIGTERM, or set ODG_SCHEDULER_STOP=1 — checked between every step.
 * Exit codes: 0 cycle ran · 2 refused at startup (out dir / Truth-Lock) · 3 STOPPED · 4 REFUSED mid-run (a confined
 *              write was refused, e.g. --out swapped for a symlink after validation — see GO-WR-1) · 1 unexpected error.
 * No network, no model, no provider call, no git write.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const GO = require("../core/odg-go-cycle.js");
const { truthLockGate } = require("../core/truth-lock-gate.js");
const LEDGER = require("../core/mission-ledger.js");
const MAL = require("../core/mission-attempt-log.js");
const POL = require("../core/odg-local-model-execution-policy.js");
const K = require("../core/odg-knowledge-intelligence.js");
const SS = require("./odg-strategic-select.ts");
const SMR = require("./odg-strategy-mode-run.ts");
const KR = require("./odg-v160-practices-knowledge-run.ts");
const SG = require("./odg-v160-scenario-g-run.ts");

const EVIDENCE_REL = "docs/odg/evidence/V164_GO_CYCLE.json";
const F = Object.freeze({
  REGISTER: "docs/odg/evidence/V164_STRATEGIC_REGISTER.json",
  STRATEGY: "docs/odg/evidence/V164_STRATEGY_MODE_SELECTION.json",
  ADMISSION: "docs/odg/evidence/V164_RADAR_SOURCE_ADMISSION.json",
  GRANT: "docs/odg/V164_RESEARCH_GRANT_BROAD_ADMISSION.json",
  MEASURED: "docs/odg/evidence/V155_OLLAMA_CAPABILITY_REGISTRY.json",
  COLLECTION: "docs/odg/evidence/V160_PRACTICES_COLLECTION.json",
  COLLECTION_REGISTRY: "docs/odg/evidence/COLLECTION_REGISTRY.json",
});
/* V166 scoped-authorization evidence (odg-authorization-scope): committed records ONLY; absent ⇒ null (nothing derived). */
const AUTH_EVIDENCE = require("../core/odg-authorization-evidence-paths.js").AUTH_EVIDENCE;   // V17.5: single shared map (GO + register)
/* V17.4 GO-ORD-1 owner ORDER-decision records (fixed declared list; committed records ONLY; absent ⇒ skipped). They only
 * resolve an actionable DECISION_REQUIRED tie whose tiedSet equals theirs — never authorization, never scores. */
const OWNER_ORDER_DECISIONS = Object.freeze(["docs/odg/V174_OWNER_DECISION_ORDER_G2_J2.json", "docs/odg/V178_OWNER_DECISION_ORDER_P1.json", "docs/odg/V19_OWNER_DECISION_ORDER_P4.json", "docs/odg/V19_OWNER_DECISION_ORDER_P4_INT.json", "docs/odg/V19_OWNER_DECISION_ORDER_P1R.json", "docs/odg/V19_OWNER_DECISION_ORDER_EXP_B.json", "docs/odg/V19_OWNER_DECISION_ORDER_MEM.json", "docs/odg/V19_OWNER_DECISION_ORDER_P2_NB3.json", "docs/odg/V19_OWNER_DECISION_ORDER_P5_NB3.json"]);
/* V17.4 GO-ORD-2 owner SELECTION-decision records (fixed declared list; committed records ONLY; absent ⇒ skipped). They only
 * resolve an actionable DECISION_REQUIRED that is NOT a tie (uncertainty) for their own item + contract sha, max 1 dispatch. */
const OWNER_SELECTION_DECISIONS = Object.freeze(["docs/odg/V174_OWNER_DECISION_SELECT_J2.json", "docs/odg/V175_OWNER_DECISION_SELECT_NB1.json", "docs/odg/V176_OWNER_DECISION_SELECT_NB2.json", "docs/odg/V19_OWNER_DECISION_SELECT_NB3.json"]);
const UNIT_SYSTEM = "/etc/systemd/system/odg-mission-runner.service";
const UNIT_REPO = "deploy/odg-mission-runner.service";
const MAX_STEP_DELAY_MS = 5000;
const DISPATCH_TIMEOUT_MS = GO.DISPATCH_TIMEOUT_DEFAULT_MS;   // plain odg-run dispatch (600000)
/* GO-DTO-1: a declared target's timeout comes from the core's contract-cap derivation (ctx.dispatchTimeoutMs, recorded in
 * the EXECUTE trace, already Math.ceil'ed); re-validated here — not a positive integer ≤ the hard ceiling ⇒ null ⇒ the
 * dispatch is REFUSED (never a silent fallback to 600000). */
function targetTimeoutMs(c: any): number | null { const t = c && c.dispatchTimeoutMs; return Number.isInteger(t) && t > 0 && t <= GO.DISPATCH_TIMEOUT_CEILING_MS ? t : null; }
const KILL_GRACE_MS = 10000;
const GROUP_EXIT_WAIT_MS = 30000;
function groupAlive(pgid: number): boolean { try { process.kill(-pgid, 0); return true; } catch (e: any) { return !!e && e.code === "EPERM"; } }
/* runGroup(cmd, args, o) — GO-DTO-1 process-group dispatch: the child is its OWN process group (detached), so npx → tsx →
 * node and every grandchild are signalled together. Timeout or o.stopRequested() (polled) ⇒ SIGTERM to the group, grace,
 * SIGKILL to the group. A group that outlives its leader is terminated the same way. Resolves only after the group is gone
 * (or after a bounded wait, recorded groupGone=false). Bounded: no unbounded loop. */
function runGroup(cmd: string, args: string[], o: { cwd: string; timeoutMs: number; graceMs?: number; pollMs?: number; stopRequested?: () => any }): Promise<any> {
  const graceMs = o.graceMs === undefined ? KILL_GRACE_MS : o.graceMs; const pollMs = o.pollMs || 500;
  return new Promise((resolve) => {
    const t0 = Date.now();
    let ch: any;
    try { ch = cp.spawn(cmd, args, { cwd: o.cwd, env: process.env, stdio: "ignore", detached: true }); } catch (e: any) { resolve({ status: null, signal: null, killedBy: null, reason: `spawn failed: ${(e && e.message) || e}`, groupGone: true, pid: null, durationMs: 0 }); return; }
    const pgid = ch.pid;
    let killedBy: string | null = null, reason: string | null = null, exit: any = null, termAt = 0, killSent = false, done = false;
    const signalGroup = (sig: string) => { try { process.kill(-pgid, sig as any); } catch { /* already gone */ } };
    const startKill = (by: string, why: string) => { if (termAt) return; killedBy = by; reason = why; termAt = Date.now(); signalGroup("SIGTERM"); };
    const finish = (groupGone: boolean) => { if (done) return; done = true; clearInterval(tick); resolve({ status: exit ? exit.code : null, signal: exit ? exit.signal : null, killedBy, reason, termSignal: termAt ? "SIGTERM" : null, killSignalSent: killSent, graceMs, groupGone, pid: pgid, durationMs: Date.now() - t0 }); };
    ch.on("error", (e: any) => { if (!exit) exit = { code: null, signal: null, error: String(e && e.message) }; });
    ch.on("exit", (code: any, signal: any) => { exit = { code, signal }; });
    const tick = setInterval(() => {
      const now = Date.now();
      if (!termAt) {
        if (exit) { if (!groupAlive(pgid)) return finish(true); startKill("ORPHANED_GROUP", "leader exited, group members still alive ⇒ terminated"); return; }
        if (now - t0 >= o.timeoutMs) return startKill("TIMEOUT", `dispatch timeout ${o.timeoutMs} ms (GO-DTO-1)`);
        let s: any = null; try { s = o.stopRequested ? o.stopRequested() : null; } catch { s = null; }
        if (s) return startKill("STOP", `${s.reason || "STOP"}: ${s.source || ""}`);
        return;
      }
      if (!groupAlive(pgid) && exit) return finish(true);
      if (!killSent && now - termAt >= graceMs) { killSent = true; signalGroup("SIGKILL"); }
      if (now - termAt >= graceMs + GROUP_EXIT_WAIT_MS) finish(!groupAlive(pgid));
    }, pollMs);
  });
}

// ---- PRE-REGISTERED pass criteria (V16.4 §10 I and J) — fixed in this file BEFORE the first real run; do not edit after.
const PRE_REGISTERED = Object.freeze({
  registeredIn: "runtime/bin/odg-go.ts (same commit as the first evidence write; precedence over the results is asserted, not cryptographically provable)",
  I: Object.freeze({
    scenario: "V16.4 §10 I — ODG sélectionne et prépare la mission suivante",
    criteria: Object.freeze([
      { id: "I1", test: "the real dry cycle's SELECT step is mission-priority-selector.selectNextExplained over odg-strategic-register built from the real repo state; decision SELECTED or TIE_EXPLAINED (tiedSet + resolvedBy recorded) — never an id pick; the selected item is not owner-gated" },
      { id: "I2", test: "the selected item is PREPARED: NEXT_SELECTION.preparedMission carries the contract (objective, write_set, acceptance_criteria), the decomposition-planner verdict, the strategy-mode-selector verdict and an explicit authorizationNeeded when unauthorized" },
      { id: "I3", test: "consistency: the SELECT decision equals the committed V164_STRATEGIC_REGISTER decisionRecord and the STRATEGY verdict equals the committed V164_STRATEGY_MODE_SELECTION entry for that item" },
      { id: "I4", test: "the selector's next choice after the current item is recorded (NEXT_SELECTION.nextAfterCurrent)" },
    ]),
    gradingRule: "FAIL if I1 fails or an owner-gated item is selected; PASS iff I1–I4 pass; otherwise PARTIAL (a DECISION_REQUIRED that is explained ⇒ PARTIAL)",
  }),
  J: Object.freeze({
    scenario: "V16.4 §10 J — le bouton GO déclenche réellement ce cycle, avec traces et possibilité d'arrêt",
    criteria: Object.freeze([
      { id: "J1", test: "a real `odg-go` run (child process) on the real repo state performs the 10 steps in order, each STEP trace entry carrying step, inputsSha256, decision, rationale, decidedBy, startedAt, endedAt" },
      { id: "J2", test: "unauthorized work halts at the authorization gate: AUTHORIZE stops the intelligence loop at PROPOSED for the unauthorized selected item, and EXECUTE records NOTHING_EXECUTED (or the run is HALTED_DECISION_REQUIRED)" },
      { id: "J3", test: "nothing unauthorized executed: dispatchCalls=0 and providerLaunched=0 in every run whose selected item is unauthorized; every file written by every run is inside its --out dir; the main checkout's git status and mission-ledger sha256 are unchanged" },
      { id: "J4", test: "a STOP file created mid-cycle (after ≥3 steps) stops the real run before step 10 with a STOP trace entry and CYCLE_END status STOPPED" },
      { id: "J5", test: "SIGTERM sent mid-cycle (after ≥3 steps) stops the real run cleanly: STOP trace entry + CYCLE_END STOPPED, process exit code 3" },
      { id: "J6", test: "canonical emergency stop ODG_SCHEDULER_STOP=1 ⇒ STOPPED with trace; --max-steps and --deadline-ms bounds ⇒ STOPPED (MAX_STEPS / DEADLINE) with trace" },
      { id: "J7", test: "re-running the same dry cycle on the same state is idempotent: same runId + same decisionsDigest, CYCLE_END.idempotent=true (duplicateOf recorded), no dispatch" },
      { id: "J8", test: "EXECUTE path proven for real: an `--execute` run dispatches a canonically authorized NATIVE mission in an isolated scratch worktree and records its verified outcome — NOT_MEASURED when no canonically authorized native mission exists (an authorization is never created to make it pass)" },
    ]),
    gradingRule: "FAIL if any of J1–J7 fails; PASS iff J1–J7 pass AND J8 passes; J8 NOT_MEASURED ⇒ PARTIAL (the governed cycle and its stop are proven; the execution leg is not)",
  }),
});

function sha256File(p: string): string | null { try { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); } catch { return null; } }
function readJson(p: string): any { return JSON.parse(fs.readFileSync(p, "utf8")); }
function git(dir: string, args: string[]): string | null { try { return String(cp.execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim(); } catch { return null; } }
function arg(argv: string[], name: string): string | null { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null; }
function numArg(argv: string[], name: string, d: number): number { const v = arg(argv, name); const n = v === null ? NaN : Number(v); return Number.isFinite(n) ? n : d; }

/* the main checkout of a repo = parent of its git common dir (worktrees share it). null if not a git repo. */
function mainCheckoutOf(dir: string): string | null {
  const c = git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return c ? path.dirname(c) : null;
}
/* PHYSICAL path confinement (realpath, never lexical only). A symlink anywhere in the out-dir path is refused; the
 * physical out dir is realpath(nearest existing ancestor) + the not-yet-existing tail. */
function realOr(p: string): string { try { return fs.realpathSync(p); } catch { return path.resolve(p); } }
function symlinkComponent(p: string): string | null {
  const abs = path.resolve(p); const parts = abs.split(path.sep).filter(Boolean);
  let cur = path.sep;
  for (const part of parts) {
    cur = path.join(cur, part);
    let st: any; try { st = fs.lstatSync(cur); } catch { return null; }   // first missing component: nothing below exists
    if (st.isSymbolicLink()) return cur;
  }
  return null;
}
function physicalPath(p: string): string {
  let cur = path.resolve(p); const tail: string[] = [];
  while (!fs.existsSync(cur)) { const up = path.dirname(cur); if (up === cur) break; tail.unshift(path.basename(cur)); cur = up; }
  return path.join(realOr(cur), ...tail);
}
const insideP = (a: string, b: string) => a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep);
/* forbidden (compared by realpath): every main checkout (incl. runtime/generated|dist|governance), the state repo, the code tree. */
/* GO-ORD-2 one-shot claim store: a FIXED directory, independent of --out — <git common dir of --repo>/odg-go-claims (not
 * tracked; shared by every worktree of the repo). Claims are created with O_EXCL ('wx') and NEVER deleted by GO. */
function claimDirOf(repo: string): string | null { const c = git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]); return c ? path.join(c, "odg-go-claims") : null; }
function makeClaimStore(dir: string | null, opts: any = {}): any {
  const experimentOf = opts.experimentOf || ((item: string) => (AUTH_EVIDENCE as any)[item] ? (AUTH_EVIDENCE as any)[item].experiment : null);
  const fileOf = (key: string) => { if (!dir || !/^[0-9a-f]{16}-[A-Za-z0-9._-]{1,64}$/.test(key)) return null; return path.join(dir, `${key}.claim`); };
  return {
    dir,
    exists: (key: string) => { const f = fileOf(key); if (!f) return { error: "invalid claim key or no claim dir" }; try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e: any) { return e && e.code === "ENOENT" ? null : { error: String((e && e.message) || e) }; } },
    claim: (q: any) => {
      const f = fileOf(q && q.key); if (!f) return { ok: false, code: "GO-ORD-2_NO_CLAIM_STORE", reason: "invalid claim key or no claim dir" };
      const rel = experimentOf(q.item);
      if (!rel) return { ok: false, code: "GO-ORD-2_NO_EXPERIMENT_PATH", reason: `no declared experiment record path for ${q.item}` };
      if (q.workspace && fs.existsSync(path.join(q.workspace, rel))) return { ok: false, code: "GO-ORD-2_SCRATCH_EXPERIMENT_PRESENT", reason: `scratch ${q.workspace} already contains ${rel}` };
      if (symlinkComponent(dir as string)) return { ok: false, code: "GO-ORD-2_CLAIM_ERROR", reason: "claim dir path has a symlink component" };
      try { fs.mkdirSync(dir as string, { recursive: true }); } catch (e: any) { return { ok: false, code: "GO-ORD-2_CLAIM_ERROR", reason: String(e && e.message) }; }
      let fd: number;
      try { fd = fs.openSync(f, "wx", 0o644); } catch (e: any) { return e && e.code === "EEXIST" ? { ok: false, code: "GO-ORD-2_ALREADY_CLAIMED", reason: `claim ${path.basename(f)} already exists`, path: f } : { ok: false, code: "GO-ORD-2_CLAIM_ERROR", reason: String(e && e.message) }; }
      try { fs.writeSync(fd, JSON.stringify(q.data || {}, null, 2) + "\n"); } finally { fs.closeSync(fd); }
      return { ok: true, path: f };
    },
  };
}
function forbiddenRoots(repo: string): string[] {
  const out = new Set<string>();
  for (const r of [mainCheckoutOf(repo), mainCheckoutOf(ROOT), path.resolve(repo), ROOT]) if (r) {
    for (const x of [r, path.join(r, "runtime", "generated"), path.join(r, "runtime", "dist"), path.join(r, "runtime", "governance")]) out.add(realOr(x));
  }
  return [...out];
}
function validateOutDir(outDir: string, repo: string): { ok: boolean; reason: string; physical?: string } {
  const link = symlinkComponent(outDir);
  if (link) return { ok: false, reason: `out dir path has a symlink component ${link} (refused: check and write must resolve the same physical path)` };
  const od = physicalPath(outDir);
  for (const f of forbiddenRoots(repo)) if (insideP(od, f)) return { ok: false, reason: `out dir ${od} is inside protected ${f} (main checkout / state repo / code tree)` };
  return { ok: true, reason: "confined", physical: od };
}
/* GO-WR-1 (provider-authored rule, Claude Code; V167 §4 correction of #930 inspection LOWs). */
const WRITE_REFUSED_EXIT = 4;
const WRITE_REFUSAL_RULE = "GO-WR-1 (provider rule): any refusal by safeWrite mid-run (e.g. --out swapped for a symlink after validation) is a clean fail-closed stop — status REFUSED, exit 4, no stack trace; a final CYCLE_END REFUSED trace entry + summary are attempted ONLY if the out dir still validates (no symlink component, same physical path as validated at startup), otherwise nothing more is written and a one-line REFUSED reason goes to stderr. KNOWN RESIDUAL (stated, not hidden): safeWrite realpaths the parent then opens the final component with O_NOFOLLOW; O_NOFOLLOW covers only the FINAL component, so an attacker able to swap a parent directory in the sub-microsecond window between realpath(parent) and open() could redirect the write. Node exposes no openat()/dir-fd API to close this; no further mechanism is added.";
function writeRefusal(e: any): Error { const err: any = e instanceof Error ? e : new Error(String(e)); err.goWriteRefused = true; return err; }
/* safeWrite — the ONE write primitive: lexical check (core assertConfinedWrite) + realpath(parent) must equal the
 * physical out dir + lstat(final) must not be a symlink + open with O_NOFOLLOW (the opened file IS the checked path). */
function safeWrite(target: string, data: string, mode: "append" | "truncate" | "exclusive", physOut: string, forb: string[]): void {
  try { safeWriteInner(target, data, mode, physOut, forb); } catch (e: any) { throw writeRefusal(e); }   // every refusal is tagged (GO-WR-1)
}
function safeWriteInner(target: string, data: string, mode: "append" | "truncate" | "exclusive", physOut: string, forb: string[]): void {
  GO.assertConfinedWrite(target, physOut, forb, path);
  const parent = fs.realpathSync(path.dirname(path.resolve(target)));
  if (parent !== physOut) throw new Error(`WRITE_PARENT_NOT_OUT_DIR: ${parent} ≠ ${physOut}`);
  const final = path.join(parent, path.basename(target));
  for (const f of forb) if (insideP(final, f)) throw new Error(`FORBIDDEN_WRITE: ${final} inside ${f}`);
  try { if (fs.lstatSync(final).isSymbolicLink()) throw new Error(`SYMLINK_TARGET_REFUSED: ${final}`); } catch (e: any) { if (e && e.code !== "ENOENT") throw e; }
  const C = fs.constants;
  const flags = C.O_WRONLY | C.O_CREAT | C.O_NOFOLLOW | (mode === "append" ? C.O_APPEND : mode === "exclusive" ? C.O_EXCL : C.O_TRUNC);
  const fd = fs.openSync(final, flags, 0o644);
  try { fs.writeSync(fd, data); } finally { fs.closeSync(fd); }
}

/* allowlist: the INSTALLED unit is authoritative (else the repo unit template); env ODG_CANARY_ALLOWLIST may only
 * NARROW it (intersection), never widen. */
function readAllowlist(o: any = {}): any {
  const units: any[] = o.unitPaths || [[UNIT_SYSTEM, `${UNIT_SYSTEM} (installed live unit, read-only)`], [path.join(ROOT, UNIT_REPO), `${UNIT_REPO} (repo unit template)`]];
  const env = o.env || process.env;
  const parse = (v: string) => v.split(",").map((x: string) => x.trim()).filter(Boolean);
  let base: string[] = []; let source = "no unit found ⇒ empty (deny-by-default)";
  for (const [p, label] of units) { try { const m = /^Environment=ODG_CANARY_ALLOWLIST=(.*)$/m.exec(fs.readFileSync(p, "utf8")); if (m) { base = parse(m[1]); source = label; break; } } catch { /* next */ } }
  if (env.ODG_CANARY_ALLOWLIST === undefined) return { ids: base, source };
  const want = parse(env.ODG_CANARY_ALLOWLIST);
  return { ids: base.filter((id) => want.includes(id)), source: `${source} ∩ env ODG_CANARY_ALLOWLIST (env may only narrow)`, refusedWidening: want.filter((id) => !base.includes(id)) };
}

/* dispatchArgv(next, ctx) — npx argv: the contract-declared target for a scoped execution step, else odg-run <id>. */
function dispatchArgv(next: any, c: any): string[] {
  const t = c && c.dispatchTarget;
  return t ? ["tsx", String(t.command), ...(Array.isArray(t.args) ? t.args.map(String) : [])] : ["tsx", "runtime/bin/odg-run.ts", next.mission];
}
/* rawGit — like git() but WITHOUT trimming (porcelain -z output starts with a significant status column). */
function rawGit(dir: string, args: string[]): string | null { try { return String(cp.execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })); } catch { return null; } }
/* parsePorcelainZ(raw) — every path of `git status --porcelain=v1 -z` (rename/copy ⇒ new AND original path). */
function parsePorcelainZ(raw: string): string[] {
  const parts = raw.split("\0"); const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i]; if (e.length < 4) continue;
    const xy = e.slice(0, 2); out.push(e.slice(3));
    if (/[RC]/.test(xy) && i + 1 < parts.length && parts[i + 1]) { out.push(parts[i + 1]); i++; }
  }
  return out;
}
/* targetWriteConfinement(workspace, target) — every changed/untracked path in the scratch ⊆ target.writeSet. */
function targetWriteConfinement(ws: string, target: any): any {
  // EVERY entry — modified, untracked AND gitignored (runtime/generated, dist, .next …) — counts; renames: both sides
  const raw = rawGit(ws, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored"]);
  if (raw === null) return { ok: false, reason: "WRITE_CONFINEMENT_UNVERIFIABLE: git status failed" };
  const allowed = (Array.isArray(target.writeSet) ? target.writeSet : []).map(String);
  const changed = parsePorcelainZ(raw);
  const outside = changed.filter((p: string) => !allowed.some((w: string) => p === w || (w.endsWith("/") && p.startsWith(w))));
  return outside.length ? { ok: false, reason: `WRITE_OUTSIDE_TARGET_WRITE_SET: ${outside.join(", ")}` } : { ok: true, changed };
}
/* isolationCheck — the --execute scratch worktree must be FRESH and UNSHARED: a registered LINKED worktree (not a main
 * checkout, not the state repo, not this code tree), detached HEAD (no branch = nobody's working branch), clean status
 * incl. untracked, no runtime/generated (never used by a run), no symlink in its path, and the mission is runnable there. */
function isolationCheck(scratch: string | null, missionId: string, repo: string, dispatchTarget?: any): any {
  if (!scratch) return { ok: false, reason: "no --scratch isolated worktree given" };
  if (symlinkComponent(scratch)) return { ok: false, reason: "scratch path has a symlink component" };
  const s = realOr(scratch);
  if (git(s, ["rev-parse", "--is-inside-work-tree"]) !== "true") return { ok: false, reason: "not a git worktree" };
  const top = realOr(git(s, ["rev-parse", "--show-toplevel"]) || "");
  if (top !== s) return { ok: false, reason: "scratch is not the top of a worktree" };
  const main = mainCheckoutOf(s);
  if (!main || realOr(main) === s) return { ok: false, reason: "scratch is a MAIN checkout, not a linked worktree" };
  if ([realOr(repo), ROOT, ...[mainCheckoutOf(repo), mainCheckoutOf(ROOT)].filter(Boolean).map((x: any) => realOr(x))].includes(s)) return { ok: false, reason: "scratch is the state repo, the code tree or a main checkout" };
  const listed = (git(s, ["worktree", "list", "--porcelain"]) || "").split("\n").filter((l: string) => l.startsWith("worktree ")).map((l: string) => realOr(l.slice(9)));
  if (!listed.includes(s)) return { ok: false, reason: "scratch is not a registered worktree" };
  if (git(s, ["symbolic-ref", "-q", "HEAD"]) !== null) return { ok: false, reason: "scratch HEAD is on a branch (an active working worktree) — a fresh detached scratch is required" };
  const st = git(s, ["status", "--porcelain", "--untracked-files=all"]);
  if (st === null || st !== "") return { ok: false, reason: "scratch worktree is not clean (shared/used)" };
  if (fs.existsSync(path.join(s, "runtime", "generated"))) return { ok: false, reason: "scratch already has runtime/generated (used by a previous run) — not fresh" };
  // GO-DT-1: a scoped execution step runs ONLY its contract-declared runner (never runtime/missions/<id>.json via odg-run)
  if (dispatchTarget && rawGit(s, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored"]) !== "") return { ok: false, reason: "scratch is not pristine (ignored/untracked entries present) — target write confinement would not be exact" };
  if (dispatchTarget) return fs.existsSync(path.join(s, String(dispatchTarget.command))) && !symlinkComponent(path.join(s, String(dispatchTarget.command))) ? { ok: true, workspace: s } : { ok: false, reason: `NOT_RUNNABLE: declared dispatch target ${dispatchTarget.command} absent in the scratch worktree` };
  if (!fs.existsSync(path.join(s, "runtime", "missions", `${missionId}.json`))) return { ok: false, reason: `NOT_RUNNABLE: no runtime/missions/${missionId}.json in the scratch worktree` };
  return { ok: true, workspace: s };
}

/* registerSources(src) — the register input of the canonical bin: every key of SS.loadSources except `inputs`. */
function registerSources(src: any): any { const { inputs: _inputs, ...rest } = src; return rest; }

/* readState(repo) — canonical evidence + registers + ledger/attempt-log, all READ-ONLY. */
function readState(repo: string): any {
  const src = SS.loadSources(repo);
  const inputs = src.inputs.slice();
  const add = (rel: string) => { const p = path.join(repo, rel); const h = sha256File(p); inputs.push({ source: rel, sha256: h }); return h ? readJson(p) : null; };
  const registerEvidence = add(F.REGISTER);
  const strategyEvidence = add(F.STRATEGY);
  const admission = add(F.ADMISSION);
  const grant = add(F.GRANT);
  const optional = (rel: string) => { const p = path.join(repo, rel); const h = sha256File(p); inputs.push({ source: rel, sha256: h }); if (!h) return null; try { return { ...readJson(p), recordPath: rel }; } catch { return null; } };
  const authorizationEvidence: any = {};
  // V16.9 Phase 1b — R7 proof-currency probes: the SAME read-only local-git probe object the canonical loader built for this repo.
  for (const [sc, files] of Object.entries(AUTH_EVIDENCE) as any) authorizationEvidence[sc] = { inspection: optional(files.inspection), experiment: optional(files.experiment), validation: optional(files.validation), probes: src.proofProbes };
  const ownerOrderDecisions = OWNER_ORDER_DECISIONS.map((rel: string) => optional(rel)).filter(Boolean);
  // OWN-1-CLR-1: committed OWNER OWN-1 clearance records (fixed reviewed list; absent ⇒ skipped; sha recorded in inputs)
  const ownerOwn1Clearances = require("../core/odg-owner-own1-clearance.js").CLEARANCE_RECORDS.map((rel: string) => optional(rel)).filter(Boolean);
  const ownerSelectionDecisions = OWNER_SELECTION_DECISIONS.map((rel: string) => optional(rel)).filter(Boolean);
  inputs.push({ source: F.MEASURED, sha256: sha256File(path.join(repo, F.MEASURED)) });
  let ledgerPayload: any = null;
  try { ledgerPayload = readJson(path.join(repo, "runtime", "generated", "mission-ledger.json")); } catch { ledgerPayload = null; }
  const entries = ledgerPayload ? (Array.isArray(ledgerPayload) ? ledgerPayload : (ledgerPayload.entries || ledgerPayload.missions || [])) : [];
  const proven = [...new Set(entries.filter((x: any) => x && x.proven === true).map((x: any) => String(x.mission)))].sort();
  let integrity: any = { ok: false, reason: "ledger absent" };
  if (ledgerPayload) { try { const v = LEDGER.verifyLedger(ledgerPayload); integrity = { ok: v.ok === true, total: v.total, verified: v.verified, legacyUnsealed: v.legacyUnsealed, deepSealed: v.deepSealed, legacyShallowSeal: v.legacyShallowSeal, sealStatus: v.sealStatus, reason: v.reason || null }; } catch (e: any) { integrity = { ok: false, reason: String(e && e.message) }; } }
  const att = MAL.readAttempts(path.join(repo, "runtime", "generated", "mission-attempt-log.jsonl"));
  const last = att.length ? att[att.length - 1] : null;
  const smr = SMR.loadSources();   // canonical strategy-mode evaluation instant (code tree; parity recorded below)
  const parity = (Object.values(F) as string[]).concat(["docs/odg/evidence/V159_MEASURED_MODEL_POLICY.json", "docs/odg/evidence/V161_SCENARIO_J.json"]).map((rel: string) => ({ file: rel, codeTreeEqualsRepo: sha256File(path.join(ROOT, rel)) === sha256File(path.join(repo, rel)) }));
  return {
    // EXACTLY the canonical loader's sources (odg-strategic-select.loadSources minus its inputs list, which is merged above):
    // no hand-picked subset, so LAND-1 laterEvidence and the BLK-2/REL-2/DEP-2 benefitEvidence reach the in-cycle register.
    repo, inputs, sources: registerSources(src),
    registerEvidence, strategyEvidence, radar: { grant, admission }, authorizationEvidence, ownerOrderDecisions, ownerSelectionDecisions, ownerOwn1Clearances,
    ledger: { proven, integrity }, attempts: { count: att.length, last: last ? { mission: last.mission, status: last.status, recordedAt: last.recordedAt } : null },
    allowlist: readAllowlist(), measured: POL.loadMeasuredRegistry(F.MEASURED, { root: repo }), strategyNow: smr.now, codeTreeParity: parity,
  };
}

/* knowledge(repo, useAt) — the scenario-G canonical path (attestCollection → assessClaim → toMemory → usableFor) on the
 * pinned collection, plus admissible() (admission AS FACT). No network. */
function knowledge(repo: string, useAt: number, mem?: any): any {
  const col = readJson(path.join(repo, F.COLLECTION)); const reg = readJson(path.join(repo, F.COLLECTION_REGISTRY));
  const pins = (reg.collections || []).filter((c: any) => c.path === F.COLLECTION).map((c: any) => c.sha256);
  const collection = K.attestCollection(col, { pinnedDigests: pins });
  if (!collection.attested) return { ok: false, collection: F.COLLECTION, reason: "collection NOT authenticated against COLLECTION_REGISTRY", claims: [] };
  const asOf = Date.parse(col.consultedDate + "T12:00:00Z");
  const memories: any[] = [];
  const claims = SG.CLAIMS.map((id: string) => {
    const cy = (col.cycles || []).find((c: any) => String(c.query).endsWith(":: " + id)); const st = KR.STRUCT[id];
    if (!cy || !st) return { id, status: "NOT_FOUND" };
    const a = K.assessClaim({ ...st, nature: "OFFICIAL_DOCUMENTATION", text: cy.claim, sources: (cy.support || []).map((sp: any) => ({ url: sp.url, citation: sp.quote, structured: st })) }, { asOfEpochMs: asOf, collection, quarantined: [], missionAuthorization: "DESIGN_PROPOSAL" });
    const mem = K.toMemory(a, asOf);
    const use = K.usableFor(mem, "DESIGN_PROPOSAL", useAt, { assessment: a });
    const adm = K.admissible(mem, useAt, { assessment: a });
    memories.push(mem);
    return { id, epistemic: a.dimensions.epistemic, isFact: a.isFact === true, useAuthorization: use.authorization, useReason: use.reason, admissible: { trusted: adm.trusted === true, verdict: adm.verdict } };
  });
  const out: any = { ok: claims.every((c: any) => c.useAuthorization === "DESIGN_PROPOSAL"), collection: F.COLLECTION, claims };
  // V19-MEM-2 (REPRO-1): internal REAL observations corroborated by independent reproduction, from the fixed list of committed
  // ODG run records (sha recorded); emitted in the canonical memory shape so memory-trust-gate decides FACT vs not.
  const obs = observationMemories(repo, useAt);
  out.observations = obs.summary;
  memories.push(...obs.records);
  if (!mem) return out;
  // MEM-INT-1 (V19 P4 operational): the canonical memory records (toMemory) are indexed into the derived per-tenant hybrid
  // index — through memory-architecture.semanticRetrieval, which trust-gates via accessMemory (only VERIFIED + fresh +
  // attributed records are indexed). Embedding failure ⇒ memory NOT_MEASURED, the cycle continues (fail-soft, never PASS).
  return (async () => {
    try {
      const H = require("../core/memory-architecture.js").semanticRetrieval();
      const [probe] = await mem.embed(["dimension probe"]);
      const ix = H.openIndex({ dir: mem.dir, tenant: mem.tenant, dims: probe.length });
      const sync = await H.syncIndex(ix, memories, { asOf: useAt, trustedAuthors: ["ODG"], contextTier: true }, mem.embed);   // TIER-1: FACT = trust-gated; CONTEXT = SUPPORTED/unverified (never a fact)
      mem.ix = ix; mem.records = new Map(memories.map((r: any) => [String(r.id), r]));
      out.memory = { status: "INDEXED", tenant: mem.tenant, index: path.basename(ix.file), dims: probe.length, ...sync, records: memories.length };
    } catch (e: any) { out.memory = { status: "NOT_MEASURED", reason: String((e && e.message) || e) }; }
    return out;
  })();
}

/* observationMemories(repo, asOf) — V19-MEM-2: REPRO-1 over OBSERVATION_SOURCES (committed records; absent ⇒ skipped). */
const OBSERVATION_SOURCES = Object.freeze(["docs/odg/evidence/V178_P1_MULTI_CANDIDATE_RESULT.json", "docs/odg/evidence/V178_P1R_RUN1_INCIDENT_RESULT.json", "docs/odg/evidence/V178_P1R_AGREEMENT_RESULT.json"]);
function observationMemories(repo: string, asOf: number): any {
  const OC = require("../core/odg-observation-corroboration.js");
  const all: any[] = []; const read: any[] = [];
  for (const rel of OBSERVATION_SOURCES) { const p = path.join(repo, rel); const sha = sha256File(p); if (!sha) { read.push({ path: rel, sha256: null }); continue; } read.push({ path: rel, sha256: sha }); all.push(...OC.extractT0Observations(readJson(p), { path: rel, sha256: sha })); }
  const c = OC.corroborate(all);
  const records = c.results.map((r: any) => OC.toMemory(r, asOf));
  return { records, summary: { rule: OC.RULE, sources: read, observations: all.length, ...c.tally, facts: records.filter((r: any) => r.isFact).map((r: any) => r.id) } };
}

/* memoryPort(physOut, embed) — MEM-INT-1: the GO memory port (index under the confined GO out dir; tenant odg-go). */
function memoryPort(physOut: string, embed?: any): any {
  const H = () => require("../core/memory-architecture.js").semanticRetrieval();
  const m: any = { dir: path.join(physOut, "memory-index"), tenant: "odg-go", embed: embed || H().ollamaEmbed(), ix: null, records: null };
  m.recall = async (q: string) => {
    if (!m.ix) return { status: "NOT_MEASURED", reason: "no index (knowledge step did not index)" };
    const hits = await H().query(m.ix, q, m.embed, { k: 3 });
    // owner TIER-1: a recalled record keeps its status, provenance, dates, source and confidence (read from the canonical record)
    const prov = hits.map((h: any) => { const r = m.records && m.records.get(String(h.id)); return { id: h.id, family: h.family, tier: h.tier, score: Math.round(h.score * 1e6) / 1e6, ranks: h.ranks,
      ...(r ? { status: r.status, epistemic: r.epistemic, provenance: r.provenance, learnedAt: r.learnedAt, validUntil: r.validUntil, confidence: r.confidence } : {}) }; });
    return { status: "RECALLED", query: q, facts: prov.filter((h: any) => h.tier === "FACT"), context: prov.filter((h: any) => h.tier === "CONTEXT_UNVERIFIED"),
      contextNote: "CONTEXT_UNVERIFIED = SUPPORTED, not corroborated: usable as context only, NEVER as a fact (not admissible, not evidence)",
      rule: "MEM-INT-1 + TIER-1: hybrid FTS5 + vector RRF over canonical memory records; FACT tier = memory-architecture.accessMemory trusted only" };
  };
  return m;
}

/* experienceRecall(repo) — EXP-B-1 (EXPERIENCE INTELLIGENCE incr. B): episodes DERIVED from the committed register's closed
 * items + their criteria-validation records + contracts, recorded in the canonical decision-precedent store; read-only. */
const CONTRACTS_FILE = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
function experienceRecall(repo: string): (mission: any) => any {
  const EXP = require("../core/odg-experience-episode.js");
  let store: any = null;
  return (mission: any) => {
    if (!store) {
      const register = readJson(path.join(repo, F.REGISTER)).register;
      const contracts = readJson(path.join(repo, CONTRACTS_FILE)).contracts;
      const readRecord = (rel: string) => { const p = path.join(repo, rel); const sha = sha256File(p); return sha ? { json: readJson(p), sha256: sha } : null; };
      store = EXP.toPrecedentStore(EXP.buildEpisodes({ register, contracts, readRecord, contractSha256: require("../core/odg-authorization-scope.js").contractSha256 }));
    }
    return EXP.recallForMission(store, mission);
  };
}

/* buildPorts — every effect of a real cycle; all writes go through the confined writer. */
function buildPorts(o: any): any {
  const { repo, outDir, scratch, stepDelayMs, signalState } = o;
  const forb = forbiddenRoots(repo);
  const physOut = fs.realpathSync(outDir);   // validated + created by the caller; no symlink component
  const writes: string[] = [];
  const w = (p: string, data: string, mode: "append" | "truncate" | "exclusive") => { safeWrite(p, data, mode, physOut, forb); if (!writes.includes(path.resolve(p))) writes.push(path.resolve(p)); };
  const tracePath = path.join(physOut, "go-trace.jsonl");
  const stopPath = path.join(physOut, "STOP");
  const last: any = { runId: null, cycleSeq: null };
  return {
    writes,
    last,
    now: () => Date.now(),
    truthLock: () => truthLockGate({ mutating: true, enforce: true, exec: (args: string[]) => git(repo, args) }),
    readState: () => readState(repo),
    knowledge: () => knowledge(repo, Date.now(), o.memory || undefined),
    ...(o.memory ? { memoryRecall: (q: string) => o.memory.recall(q) } : {}),
    experienceRecall: experienceRecall(repo),
    stopRequested: () => {
      if (signalState.signal) return { stop: true, reason: "SIGNAL", source: signalState.signal };
      if (fs.existsSync(stopPath)) return { stop: true, reason: "STOP_FILE", source: stopPath };
      return { stop: false };
    },
    trace: {
      append: (e: any) => { if (e && e.runId) { last.runId = e.runId; last.cycleSeq = e.cycleSeq; } w(tracePath, JSON.stringify(e) + "\n", "append"); },
      readPrior: () => { try { return fs.readFileSync(tracePath, "utf8").split("\n").filter(Boolean).map((l: string) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } },
    },
    writeSummary: (s: any) => { const p = path.join(physOut, "go-cycle.json"); const tmp = `${p}.tmp-${process.pid}`; w(tmp, JSON.stringify(s, null, 2) + "\n", "exclusive"); try { GO.assertConfinedWrite(p, physOut, forb, path); } catch (e: any) { throw writeRefusal(e); } try { if (fs.lstatSync(p).isSymbolicLink()) throw writeRefusal(new Error(`SYMLINK_TARGET_REFUSED: ${p}`)); } catch (e: any) { if (e && e.code !== "ENOENT") { fs.rmSync(tmp, { force: true }); throw writeRefusal(e); } } fs.renameSync(tmp, p); if (!writes.includes(p)) writes.push(p); },
    isolation: (next: any) => isolationCheck(scratch, next.mission, repo, next.dispatchTarget),
    claims: o.claims || makeClaimStore(claimDirOf(repo)),
    dispatchNative: (next: any, c: any) => {
      if (c && c.dispatchTarget) {
        if (c.allowUnsandboxedTarget !== true) return { verified: false, detail: "UNSANDBOXED_TARGET_NOT_OPTED_IN: refused (out-of-scratch writes not confined)" };
        // GO-DT-1: exactly the contract-declared runner, no shell, bounded; writes confined to the target writeSet
        const tmo = targetTimeoutMs(c);
        if (tmo === null) return { verified: false, detail: `GO-DTO-1_TIMEOUT_MISMATCH: dispatchTimeoutMs ${JSON.stringify(c.dispatchTimeoutMs)} is not a positive integer ≤ ${GO.DISPATCH_TIMEOUT_CEILING_MS} ⇒ dispatch refused (not run)`, process: { refused: "GO-DTO-1_TIMEOUT_MISMATCH" } };
        return runGroup("npx", dispatchArgv(next, c), { cwd: c.workspace, timeoutMs: tmo, stopRequested: c.stopRequested }).then((r: any) => {
          const conf = targetWriteConfinement(c.workspace, c.dispatchTarget);   // AFTER the whole process group is gone
          return { verified: r.status === 0 && !r.killedBy && conf.ok, process: r, detail: `declared target ${c.dispatchTarget.command} exit ${r.status}${r.signal ? ` signal ${r.signal}` : ""}${r.killedBy ? ` killed (${r.killedBy}: ${r.reason})` : ""} (timeout ${tmo} ms, GO-DTO-1) in ${c.workspace}; ${conf.ok ? "writes ⊆ target writeSet" : conf.reason}` };
        });
      }
      // governed pipeline in the ISOLATED worktree only (never the main checkout); bounded; nothing committed/merged.
      return runGroup("npx", dispatchArgv(next, c), { cwd: c.workspace, timeoutMs: DISPATCH_TIMEOUT_MS, stopRequested: c && c.stopRequested }).then((r: any) => {
        let report: any = null; try { report = readJson(path.join(c.workspace, "runtime", "generated", "mission-report.json")); } catch { report = null; }
        const verified = r.status === 0 && !r.killedBy && !!report && report.mission === next.mission && report.validated === true && report.status === "SUCCESS";
        return { verified, process: r, detail: (report ? `odg-run status ${report.status} (exit ${r.status}) in ${c.workspace}` : `odg-run exit ${r.status} (no report) in ${c.workspace}`) + (r.killedBy ? `; killed (${r.killedBy}: ${r.reason})` : "") };
      });
    },
    pause: () => new Promise((res) => setTimeout(res, Math.max(0, Math.min(MAX_STEP_DELAY_MS, stepDelayMs || 0)))),
  };
}

async function runOnce(argv: string[]): Promise<{ code: number; result: any; writes: string[] }> {
  const repo = path.resolve(arg(argv, "--repo") || ROOT);
  const outDir = path.resolve(arg(argv, "--out") || path.join(os.tmpdir(), "odg-go"));
  const v = validateOutDir(outDir, repo);
  if (!v.ok) { process.stderr.write(`REFUSED: ${v.reason}\n`); return { code: 2, result: null, writes: [] }; }
  fs.mkdirSync(outDir, { recursive: true });
  if (symlinkComponent(outDir) || fs.realpathSync(outDir) !== v.physical) { process.stderr.write("REFUSED: out dir changed between check and use (symlink race)\n"); return { code: 2, result: null, writes: [] }; }
  const signalState: any = { signal: null };
  const onSig = (s: string) => () => { signalState.signal = s; };
  const hInt = onSig("SIGINT"), hTerm = onSig("SIGTERM");
  process.on("SIGINT", hInt); process.on("SIGTERM", hTerm);
  const ports = buildPorts({ repo, outDir, scratch: arg(argv, "--scratch"), stepDelayMs: numArg(argv, "--step-delay-ms", 0), signalState, memory: argv.includes("--memory-index") ? memoryPort(fs.realpathSync(outDir)) : null });
  try {
    const result = await GO.runGoCycle({ mode: argv.includes("--execute") ? "EXECUTE" : "DRY", allowUnsandboxedTarget: argv.includes("--allow-unsandboxed-target"), maxSteps: numArg(argv, "--max-steps", GO.DEFAULTS.maxSteps), ...(arg(argv, "--deadline-ms") !== null ? { deadlineMs: numArg(argv, "--deadline-ms", GO.DEFAULTS.deadlineMs) } : {}), resume: argv.includes("--resume") }, ports);
    const code = result.status === "STARTUP_REFUSED" ? 2 : result.status === "STOPPED" ? 3 : 0;
    return { code, result, writes: ports.writes };
  } catch (e: any) {
    if (!(e && e.goWriteRefused)) throw e;   // not a write refusal ⇒ unchanged (exit 1)
    return writeRefusedStop(e, { outDir, repo, physical: v.physical as string, ports });
  } finally { process.removeListener("SIGINT", hInt); process.removeListener("SIGTERM", hTerm); }
}

/* writeRefusedStop — GO-WR-1: clean fail-closed stop after a mid-run write refusal. The final record is attempted
 * ONLY when the out dir still validates exactly as at startup; never through a swapped path. */
function writeRefusedStop(e: any, o: { outDir: string; repo: string; physical: string; ports: any }): { code: number; result: any; writes: string[] } {
  const reason = String((e && e.message) || e).split("\n")[0];
  const still = (() => { try { const v2 = validateOutDir(o.outDir, o.repo); return v2.ok && !symlinkComponent(o.outDir) && fs.realpathSync(o.outDir) === o.physical; } catch { return false; } })();
  const result: any = { status: "REFUSED", runId: o.ports.last.runId, cycleSeq: o.ports.last.cycleSeq, reason, rule: WRITE_REFUSAL_RULE, outDirStillValid: still, finalRecord: still ? "attempted" : "skipped (out dir no longer validates — nothing written through it)" };
  if (still) {
    const end = { kind: "CYCLE_END", status: "REFUSED", runId: result.runId, cycleSeq: result.cycleSeq, reason, rule: WRITE_REFUSAL_RULE, endedAt: new Date().toISOString() };
    try { safeWrite(path.join(o.physical, "go-trace.jsonl"), JSON.stringify(end) + "\n", "append", o.physical, forbiddenRoots(o.repo)); const p = path.join(o.physical, "go-trace.jsonl"); if (!o.ports.writes.includes(p)) o.ports.writes.push(p); result.traceWritten = true; } catch { result.traceWritten = false; }
    try { o.ports.writeSummary({ ...result, writes: o.ports.writes }); result.summaryWritten = true; } catch { result.summaryWritten = false; }
  }
  process.stderr.write(`REFUSED: write refused mid-run (${reason}); ${still ? "final record attempted in the still-valid out dir" : "out dir no longer validates — nothing more written"} (exit ${WRITE_REFUSED_EXIT})\n`);
  return { code: WRITE_REFUSED_EXIT, result: Object.freeze(result), writes: o.ports.writes };
}

/* redact(text, pairs) — host paths → placeholders (longest first), then any leftover /home/… or /tmp/… path. */
function redact(text: string, pairs: string[][]): string {
  let t = text;
  for (const [from, to] of pairs.filter(([f]) => f && f.length > 1).sort((a, b) => b[0].length - a[0].length)) t = t.split(from).join(to);
  return t.replace(/\/(?:home|tmp)\/[^"\s,)]*/g, "<redacted-path>");
}

// ---- real scenario harness (child processes of this very CLI) -----------------------------------------------------
function childArgs(extra: string[]): string[] { return [...process.execArgv, __filename, ...extra]; }
function readTrace(dir: string): any[] { try { return fs.readFileSync(path.join(dir, "go-trace.jsonl"), "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l)); } catch { return []; } }
function lastCycle(trace: any[]): any[] { let i = -1; trace.forEach((e, k) => { if (e.kind === "CYCLE_START") i = k; }); return i >= 0 ? trace.slice(i) : []; }
function runChild(extra: string[], env: any = {}): Promise<any> {
  return new Promise((resolve) => {
    const ch = cp.spawn(process.execPath, childArgs(extra), { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    ch.stdout.on("data", (d: any) => { out += d; }); ch.stderr.on("data", (d: any) => { err += d; });
    const kill = setTimeout(() => ch.kill("SIGKILL"), 300000);
    ch.on("close", (code: number) => { clearTimeout(kill); resolve({ code, out, err }); });
  });
}
/* start a child with a step delay, wait (bounded) until ≥ minSteps STEP entries are traced, then act. */
function runChildInterrupted(extra: string[], outDir: string, minSteps: number, act: (ch: any) => void): Promise<any> {
  return new Promise((resolve) => {
    const ch = cp.spawn(process.execPath, childArgs(extra), { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", acted: any = null; const t0 = Date.now();
    ch.stdout.on("data", (d: any) => { out += d; });
    const poll = setInterval(() => {
      const n = lastCycle(readTrace(outDir)).filter((e) => e.kind === "STEP").length;
      if (!acted && n >= minSteps) { acted = { afterSteps: n, at: new Date().toISOString() }; act(ch); }
      if (Date.now() - t0 > 120000) { clearInterval(poll); ch.kill("SIGKILL"); }
    }, 50);
    ch.on("close", (code: number) => { clearInterval(poll); resolve({ code, out, acted }); });
  });
}
function summarizeRun(dir: string, child: any): any {
  const cyc = lastCycle(readTrace(dir));
  const end = cyc.find((e) => e.kind === "CYCLE_END") || null;
  let final: any = null; try { final = JSON.parse(String(child.out).trim().split("\n").pop() || "null"); } catch { final = null; }
  return { exitCode: child.code, status: end && end.status, stepsRun: end && end.stepsRun, stop: (cyc.find((e) => e.kind === "STOP") || null), runId: end && end.runId, decisionsDigest: end && end.decisionsDigest, idempotent: end && end.idempotent, duplicateOf: end && end.duplicateOf, dispatchCalls: end && end.dispatchCalls, providerLaunched: end && end.providerLaunched, writes: final && final.writes, writesConfined: !!(final && Array.isArray(final.writes) && final.writes.every((w: string) => w.startsWith(path.resolve(dir) + path.sep))), traceEntries: cyc.length, acted: child.acted || null };
}

function gradeI(dry: any[], st: any): any {
  const by = (s: string) => dry.find((e) => e.kind === "STEP" && e.step === s);
  const sel = by("SELECT"), next = by("NEXT_SELECTION"), strat = by("STRATEGY");
  const d = sel && sel.decision;
  const I1 = !!d && (d.decision === "SELECTED" || (d.decision === "TIE_EXPLAINED" && d.tiedSet.length > 1 && !!d.resolvedBy)) && !!d.selected && !d.ownerAuthorizationRequired.includes(d.selected);
  const pm = next && next.decision && next.decision.preparedMission;
  const I2 = !!pm && !!pm.contract && !!pm.contract.objective && Array.isArray(pm.contract.write_set) && Array.isArray(pm.contract.acceptance_criteria) && !!pm.decomposition && !!pm.strategy && (pm.authorizationNeeded !== undefined);
  const I3 = !!d && d.consistentWithCommittedRegisterEvidence === true && !!strat && strat.decision.consistentWithCommittedStrategyEvidence === true;
  const I4 = !!next && !!next.decision.nextAfterCurrent && typeof next.decision.nextAfterCurrent.decision === "string";
  const res = { I1: I1 ? "PASS" : "FAIL", I2: I2 ? "PASS" : "FAIL", I3: I3 ? "PASS" : "FAIL", I4: I4 ? "PASS" : "FAIL" };
  const grade = !I1 ? "FAIL" : (I2 && I3 && I4) ? "PASS" : "PARTIAL";
  return { results: res, grade, rule: PRE_REGISTERED.I.gradingRule, selection: d ? { decision: d.decision, selected: d.selected, tiedSet: d.tiedSet, resolvedBy: d.resolvedBy } : null, preparedMission: pm || null, nextAfterCurrent: next ? next.decision.nextAfterCurrent : null, stateNote: st };
}

async function scenarioEvidence(argv: string[]): Promise<number> {
  const repo = path.resolve(arg(argv, "--repo") || ROOT);
  const base = path.resolve(arg(argv, "--out") || path.join(os.tmpdir(), "odg-go-scenario"));
  const v = validateOutDir(base, repo); if (!v.ok) { process.stderr.write(`REFUSED: ${v.reason}\n`); return 2; }
  fs.mkdirSync(base, { recursive: true });
  if (symlinkComponent(base) || fs.realpathSync(base) !== v.physical) { process.stderr.write("REFUSED: out dir changed between check and use\n"); return 2; }
  const evOut = path.resolve(arg(argv, "--evidence-out") || path.join(ROOT, EVIDENCE_REL));
  const evDir = realOr(path.join(ROOT, "docs", "odg", "evidence"));
  if (symlinkComponent(path.dirname(evOut)) || realOr(path.dirname(evOut)) !== evDir || !/^V164_GO_CYCLE[A-Z0-9_]*\.json$/.test(path.basename(evOut))) { process.stderr.write(`REFUSED: --evidence-out must be docs/odg/evidence/V164_GO_CYCLE*.json in this code tree\n`); return 2; }
  const main = mainCheckoutOf(repo);
  const ledgerPath = main ? path.join(main, "runtime", "generated", "mission-ledger.json") : null;
  const before = { gitStatus: main ? git(main, ["status", "--porcelain"]) : null, head: main ? git(main, ["rev-parse", "HEAD"]) : null, ledgerSha256: ledgerPath ? sha256File(ledgerPath) : null };
  const dir = (n: string) => { const d = path.join(base, n); fs.rmSync(d, { recursive: true, force: true }); return d; };
  const runs: any = {};
  // R0 fail-closed startup on this code tree (feature branch ⇒ Truth-Lock refuses)
  const d0 = dir("r0-truthlock-codetree"); runs.truthLockOnCodeTree = summarizeRun(d0, await runChild(["--repo", ROOT, "--out", d0]));
  // R1 dry, R2 dry re-run (idempotence) on the real repo state
  const d1 = dir("r1-dry"); runs.dry = summarizeRun(d1, await runChild(["--repo", repo, "--out", d1]));
  runs.dryRerun = summarizeRun(d1, await runChild(["--repo", repo, "--out", d1]));
  // R3 --execute (no --scratch is needed to SHOW the gate; one is passed when a canonically authorized native mission exists)
  const d3 = dir("r3-execute"); runs.execute = summarizeRun(d3, await runChild(["--execute", "--repo", repo, "--out", d3]));
  // R4 STOP file mid-cycle, R5 SIGTERM mid-cycle
  const d4 = dir("r4-stopfile"); runs.stopFile = summarizeRun(d4, await runChildInterrupted(["--repo", repo, "--out", d4, "--step-delay-ms", "700"], d4, 3, () => fs.writeFileSync(path.join(d4, "STOP"), "stop requested by harness\n")));
  const d5 = dir("r5-sigterm"); runs.sigterm = summarizeRun(d5, await runChildInterrupted(["--repo", repo, "--out", d5, "--step-delay-ms", "700"], d5, 3, (ch: any) => ch.kill("SIGTERM")));
  // R6 canonical emergency stop, R7 max-steps, R8 deadline
  const d6 = dir("r6-emergency"); runs.emergencyStop = summarizeRun(d6, await runChild(["--repo", repo, "--out", d6], { ODG_SCHEDULER_STOP: "1" }));
  const d7 = dir("r7-maxsteps"); runs.maxSteps = summarizeRun(d7, await runChild(["--repo", repo, "--out", d7, "--max-steps", "4"]));
  const d8 = dir("r8-deadline"); runs.deadline = summarizeRun(d8, await runChild(["--repo", repo, "--out", d8, "--deadline-ms", "1500", "--step-delay-ms", "600"]));
  const after = { gitStatus: main ? git(main, ["status", "--porcelain"]) : null, head: main ? git(main, ["rev-parse", "HEAD"]) : null, ledgerSha256: ledgerPath ? sha256File(ledgerPath) : null };

  const dryTrace = lastCycle(readTrace(d1).slice(0, readTrace(d1).findIndex((e: any) => e.kind === "CYCLE_END") + 1));
  const steps = dryTrace.filter((e) => e.kind === "STEP");
  const execTrace = lastCycle(readTrace(d3));
  const stepOf = (t: any[], s: string) => t.find((e) => e.kind === "STEP" && e.step === s);
  const fields = ["step", "inputsSha256", "decision", "rationale", "decidedBy", "startedAt", "endedAt"];
  const J1 = runs.dry.status !== "STARTUP_REFUSED" && steps.length === 10 && steps.every((e, i) => e.step === GO.STEPS[i] && fields.every((f) => e[f] !== undefined && e[f] !== null));
  const auth = stepOf(dryTrace, "AUTHORIZE"), ex = stepOf(dryTrace, "EXECUTE"), exX = stepOf(execTrace, "EXECUTE");
  const selAuthorized = !!(auth && auth.decision.selectedAuthorized);
  const J2 = runs.dry.status === "HALTED_DECISION_REQUIRED" || (!selAuthorized && auth && auth.decision.intelligenceLoop && auth.decision.intelligenceLoop.stage === "AUTHORIZE" && auth.decision.intelligenceLoop.proposedOnly === true && ex && ex.status === "NOTHING_EXECUTED" && exX && exX.status === "NOTHING_EXECUTED");
  const allRuns = Object.values(runs) as any[];
  const J3 = !selAuthorized && allRuns.every((r) => (r.dispatchCalls || 0) === 0 && (r.providerLaunched || 0) === 0 && (r.writes === null || r.writes === undefined || r.writesConfined)) && before.gitStatus === after.gitStatus && before.ledgerSha256 === after.ledgerSha256;
  const midStop = (r: any, reason: string) => r.status === "STOPPED" && !!r.stop && r.stop.reason === reason && Array.isArray(r.stepsRun) && r.stepsRun.length >= 3 && r.stepsRun.length < 10;
  const J4 = midStop(runs.stopFile, "STOP_FILE");
  const J5 = midStop(runs.sigterm, "SIGNAL") && runs.sigterm.exitCode === 3;
  const J6 = runs.emergencyStop.status === "STOPPED" && runs.emergencyStop.stop && runs.emergencyStop.stop.reason === "EMERGENCY_STOP" && runs.maxSteps.status === "STOPPED" && runs.maxSteps.stop && runs.maxSteps.stop.reason === "MAX_STEPS" && runs.maxSteps.stepsRun.length === 4 && runs.deadline.status === "STOPPED" && runs.deadline.stop && runs.deadline.stop.reason === "DEADLINE";
  const J7 = runs.dryRerun.runId === runs.dry.runId && runs.dryRerun.decisionsDigest === runs.dry.decisionsDigest && runs.dryRerun.idempotent === true && (runs.dryRerun.dispatchCalls || 0) === 0;
  const J8 = selAuthorized ? (exX && /^EXECUTED_PASS/.test(exX.status) ? "PASS" : "FAIL") : "NOT_MEASURED";
  const P = (b: any) => (b ? "PASS" : "FAIL");
  const jr: any = { J1: P(J1), J2: P(J2), J3: P(J3), J4: P(J4), J5: P(J5), J6: P(J6), J7: P(J7), J8 };
  const jFail = ["J1", "J2", "J3", "J4", "J5", "J6", "J7"].some((k) => jr[k] === "FAIL");
  const J = { results: jr, grade: jFail ? "FAIL" : J8 === "PASS" ? "PASS" : "PARTIAL", rule: PRE_REGISTERED.J.gradingRule };
  const elig = auth ? auth.decision.schedulerEligibility : [];
  const I = gradeI(dryTrace, null);

  const ev = {
    schema: "V164_GO_CYCLE_EVIDENCE/1",
    directive: "owner V16.4 §2 ODG GO + §7 close the loop + §10 scenarios I and J",
    component: GO.GO_CYCLE_CONTRACT,
    preRegistration: PRE_REGISTERED,
    host: { stateRepo: repo, mainCheckout: main, codeTreeHead: git(ROOT, ["rev-parse", "HEAD"]), stateRepoHead: before.head, generatedAt: new Date().toISOString() },
    mainCheckoutUntouched: { before, after, equal: before.gitStatus === after.gitStatus && before.ledgerSha256 === after.ledgerSha256 && before.head === after.head },
    runs,
    realDryCycleTrace: dryTrace,
    executeRunExecuteStep: exX || null,
    executionCandidates: { selectedItem: I.selection && I.selection.selected, selectedAuthorized: selAuthorized, schedulerEligibility: elig, finding: selAuthorized ? "an authorized item exists" : "NO canonically authorized native mission exists: the selected item is PROPOSED with authorizedBy=null (every A–P contract is PROPOSED); the canonical pre-authorized allowlist (live unit ODG_CANARY_ALLOWLIST) holds only already-proven read-only canaries ⇒ --execute dispatched nothing; no authorization was created" },
    scenarioI: I,
    scenarioJ: J,
    decidedByOdgVsProvider: {
      odgComponents: ["truth-lock-gate (startup verdict)", "odg-strategic-register + mission-priority-selector.selectNextExplained (selection, tie resolution)", "decomposition-planner.chooseStrategy", "odg-strategy-mode-selector.selectStrategyMode (mode + M0 DECISION_REQUIRED)", "intelligence-loop.runCycle (halt at PROPOSED)", "mission-scheduler.evaluateEligibility/schedulerStep (allowlist, proven dedup, emergency stop, dispatch gate)", "odg-knowledge-intelligence.usableFor/admissible", "mission-ledger.verifyLedger"],
      providerRules: ["the 10-step order and the composition itself (odg-go-cycle.ts)", GO.SPEC_RULE, "stop rules (STOP file, signals, deadline, max steps) and the out-dir confinement", "the state reader (which files are canonical inputs) and the allowlist source order (env → installed unit → repo unit)", "the pre-registered I/J criteria and this harness", "the decisions-digest definition (excludes TRUTH_LOCK git details and the volatile attempt-log size)"],
    },
    providerCalls: 0, modelCalls: 0, networkCalls: 0, commits: 0,
    honestLimits: [
      "J8 NOT_MEASURED: no canonically authorized NATIVE mission exists, so the dispatch leg (odg-run in an isolated scratch worktree) was never exercised for real — it is covered only by offline tests with injected ports",
      "the selected item and its preparation are a PROPOSAL; ODG did not (and cannot) authorize it; whether the prepared mission would succeed is not measured",
      "state is read from the main checkout READ-ONLY (Truth-Lock passes there); the code runs from the feature worktree, whose own Truth-Lock refuses (branch ≠ main) — recorded as run truthLockOnCodeTree; loaders that read the code tree (strategy-mode evaluation instant) are parity-checked against the state repo (STATE_READ codeTreeParity)",
      "the canonical allowlist was read from the installed systemd unit file (read-only); in CI/another host the source and therefore runId differ — --check is host-dependent",
      "stop is cooperative between steps; a running dispatch is bounded by its timeout and (V17.4 GO-DTO-1) interrupted by STOP/SIGTERM/ODG_SCHEDULER_STOP via its process group (SIGTERM, 10 s grace, SIGKILL)",
      "the live root timer appends to the attempt-log independently; its size is recorded as volatile and excluded from the decisions digest",
      "pre-registration is in the same commit as the first evidence write; its precedence is asserted, not cryptographically provable",
    ],
  };
  const text = redact(JSON.stringify(ev, null, 2) + "\n", [[base, "<scratch>"], [ROOT, "<codeTree>"], [main || "", "<mainCheckout>"], [repo, "<stateRepo>"], [os.tmpdir(), "<tmp>"], [os.homedir(), "<home>"]]);
  try { if (fs.lstatSync(evOut).isSymbolicLink()) { process.stderr.write("REFUSED: evidence target is a symlink\n"); return 2; } } catch { /* absent */ }
  const fd = fs.openSync(evOut, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o644); try { fs.writeSync(fd, text); } finally { fs.closeSync(fd); }
  process.stdout.write(JSON.stringify({ evidence: evOut, I: I.grade, Iresults: I.results, J: J.grade, Jresults: jr, dry: { status: runs.dry.status, steps: runs.dry.stepsRun }, selection: I.selection }, null, 1) + "\n");
  return 0;
}

async function check(argv: string[]): Promise<number> {
  const evp = path.resolve(arg(argv, "--evidence-out") || path.join(ROOT, EVIDENCE_REL));
  let ev: any; try { ev = readJson(evp); } catch { process.stdout.write("CHECK FAILED: evidence unreadable\n"); return 1; }
  const repo = path.resolve(arg(argv, "--repo") || mainCheckoutOf(ROOT) || ROOT);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-check-"));
  const r = await runOnce(["--repo", repo, "--out", tmp]);
  const ok = !!r.result && r.result.decisionsDigest === ev.runs.dry.decisionsDigest && r.result.runId === ev.runs.dry.runId;
  process.stdout.write(ok ? `CHECK OK (runId ${r.result.runId}, digest ${r.result.decisionsDigest.slice(0, 12)})\n` : `CHECK FAILED: re-run ${r.result ? r.result.status + " " + r.result.decisionsDigest : "refused"} ≠ committed ${ev.runs.dry.decisionsDigest} (state or host changed)\n`);
  return ok ? 0 : 1;
}

module.exports = { memoryPort, experienceRecall, observationMemories, OBSERVATION_SOURCES, makeClaimStore, claimDirOf, runGroup, groupAlive, targetTimeoutMs, DISPATCH_TIMEOUT_MS, OWNER_ORDER_DECISIONS, OWNER_SELECTION_DECISIONS, WRITE_REFUSED_EXIT, WRITE_REFUSAL_RULE, registerSources, parsePorcelainZ, dispatchArgv, targetWriteConfinement, PRE_REGISTERED, runOnce, readState, knowledge, safeWrite, physicalPath, symlinkComponent, isolationCheck, redact, buildPorts, validateOutDir, forbiddenRoots, mainCheckoutOf, readAllowlist, gradeI, EVIDENCE_REL };

/* CLI flag validation: --help/-h ⇒ usage on stdout, exit 0, no cycle; any unknown flag (or a value flag missing its
 * value) ⇒ usage on stderr, exit 2, no cycle. Never starts a cycle on a mistyped flag. */
const VALUE_FLAGS = ["--repo", "--out", "--max-steps", "--deadline-ms", "--scratch", "--step-delay-ms", "--evidence-out"];
const BOOL_FLAGS = ["--dry", "--execute", "--resume", "--allow-unsandboxed-target", "--scenario-evidence", "--check", "--memory-index"];
const USAGE = [
  "Usage:",
  "  npx tsx runtime/bin/odg-go.ts [--dry] [--execute] [--repo <dir>] [--out <dir>] [--max-steps N] [--deadline-ms MS]",
  "                                [--scratch <isolated git worktree>] [--step-delay-ms MS] [--resume] [--allow-unsandboxed-target]",
  "  npx tsx runtime/bin/odg-go.ts --scenario-evidence --repo <dir> --out <dir> [--evidence-out <file>]",
  "  npx tsx runtime/bin/odg-go.ts --check --repo <dir> [--evidence-out <file>]",
  "  npx tsx runtime/bin/odg-go.ts --help | -h",
  "Exit codes: 0 cycle ran (or --help) · 2 refused at startup (unknown flag / out dir / Truth-Lock) · 3 STOPPED · 4 REFUSED mid-run · 1 unexpected error.",
].join("\n") + "\n";
function parseCliFlags(argv: string[]): { help: boolean; error: string | null } {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true, error: null };
    if (BOOL_FLAGS.includes(a)) continue;
    if (VALUE_FLAGS.includes(a)) { if (i + 1 >= argv.length) return { help: false, error: `flag ${a} requires a value` }; i++; continue; }
    return { help: false, error: `unknown argument: ${a}` };
  }
  return { help: false, error: null };
}
module.exports.parseCliFlags = parseCliFlags;
module.exports.USAGE = USAGE;

if (require.main === module) {
  const argv = process.argv.slice(2);
  const flags = parseCliFlags(argv);
  if (flags.help) { process.stdout.write(USAGE); process.exit(0); }
  if (flags.error) { process.stderr.write(`odg-go: ${flags.error}\n${USAGE}`); process.exit(2); }
  const p = argv.includes("--scenario-evidence") ? scenarioEvidence(argv) : argv.includes("--check") ? check(argv) : runOnce(argv).then((r) => {
    if (r.result) process.stdout.write(JSON.stringify({ status: r.result.status, runId: r.result.runId, cycleSeq: r.result.cycleSeq, stepsRun: r.result.stepsRun, stop: r.result.stop || null, idempotent: r.result.idempotent, dispatchCalls: r.result.dispatchCalls, writes: r.writes }) + "\n");
    return r.code;
  });
  p.then((c: number) => { process.exitCode = c; }, (e: any) => { process.stderr.write(`odg-go error: ${(e && e.stack) || e}\n`); process.exitCode = 1; });
}
export {};
