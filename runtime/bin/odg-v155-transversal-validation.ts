#!/usr/bin/env node
"use strict";
/*
 * V15.5 STEP 6 — TRANSVERSAL VALIDATION HARNESS (reproducible; EXECUTES, never asserts).
 *
 * Runs scenarios A–L of the CTO V15.5 directive against the REAL system in a LINKED git worktree and classifies each as
 * REAL / SIMULATED / PARTIAL / FAIL / NOT_MEASURABLE from the facts it measured (classifyScenario is PURE, so the
 * committed evidence can be re-derived and re-checked by the test). It composes the existing pieces — no new scheduler,
 * supervisor, router or lock:
 *   - the real CLI tick runtime/dist/bin/odg-schedule-tick.js (default path and ODG_TICK_WAVE=1 wave path), spawned as a
 *     child with ODG_TRUTH_LOCK_ENFORCE=0 (process-scoped; the launcher's Truth-Lock refuses any branch ≠ main — that
 *     refusal is itself measured in A);
 *   - runtime/core/odg-agent-supervisor (assign / renew / snapshot / close) over the REAL wave children (pids found in
 *     /proc, write-set read from the child's own ODG_RUN_OUTPUT_DIR + its mission's declared write_set);
 *   - runtime/core/odg-model-router selectMeasured / runWithFallback over the COMMITTED registry evidence
 *     (docs/odg/evidence/V155_OLLAMA_CAPABILITY_REGISTRY.json) + ONE tiny live loopback Ollama call;
 *   - mission-ledger.verifyLedger and fleet-bridge.currentClaim (dist, the code the children run).
 *
 * SAFETY (fail-closed): refuses to run unless cwd is a LINKED worktree (never the main checkout — its runtime/generated
 * and runtime/dist are never touched); the only state it resets is <worktree>/runtime/generated (gitignored, checked to
 * be a real directory inside the worktree). No systemd / cron / sudo / deploy / provider key / network beyond loopback.
 *
 * Usage: npx tsx runtime/bin/odg-v155-transversal-validation.ts [--rounds 2] [--wave-max 3] [--kill-after-ms 1500]
 *        [--skip-claim-variant] [--skip-build] [--out docs/odg/evidence/V155_TRANSVERSAL_VALIDATION.json] [--no-write]
 * Exit 0 = harness ran to completion (verdicts are in the evidence, a FAIL verdict is data, not a crash); 1 = refused.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");

const VERDICTS = Object.freeze(["REAL", "SIMULATED", "PARTIAL", "FAIL", "NOT_MEASURABLE"]);
const SCENARIOS = Object.freeze(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]);
const DEFAULT_MISSIONS = Object.freeze(["M0001", "G10_READONLY_AUTONOMY_PROBE", "M0002", "RUNTIME_SELF_AUDIT", "QUAL_CLEAN_GATEB"]);
const ABSENT_MODEL = "qwen2.5-coder:14b";          // deliberately NOT installed (same probe model as #898)
const NO_QUALIFIED_CLASS = "implement";            // no QUALIFIED model in the committed registry (7b/3b PROBATION, 0.5b DEMOTED)
const ROADMAP = "docs/odg/v124-consolidated-roadmap.json";
const REGISTRY_EVIDENCE = "docs/odg/evidence/V155_OLLAMA_CAPABILITY_REGISTRY.json";
const DEFAULT_OUT = "docs/odg/evidence/V155_TRANSVERSAL_VALIDATION.json";
const STALE_MS = 2500;                             // supervisor staleness for this run (production default 15 min)
const RENEW_MS = 400;
const POLL_MS = 50;
const INSPECTOR = "odg-v155-transversal-inspector";
// files the tick process / children may legitimately write in the SHARED runtime/generated (outside run dirs)
const SHARED_ALLOWED = Object.freeze([/^mission-attempt-log\.jsonl$/, /^scheduler-audit-chain\.json$/, /^mission-ledger\.json$/, /^fleet\/locks\/mission-ledger\.lock\.\d+$/]);

// ---------------------------------------------------------------------------------------------------------------------
// PURE helpers (unit-tested with fixtures)
// ---------------------------------------------------------------------------------------------------------------------
/** covers(declared, rel): run-relative file inside the declared write-set (exact file or "dir/" prefix). Independent
 *  re-implementation (deliberately not the tick's writeSetCovers) so D's post-run check is a second opinion. */
function covers(declared: string[], rel: string): boolean {
  return Array.isArray(declared) && declared.some((d) => (d.endsWith("/") ? rel.startsWith(d) : rel === d));
}
/** intervalsOverlap: true iff ALL intervals share a common instant (max start < min end) — i.e. truly simultaneous. */
function intervalsOverlap(iv: { startedAt: number; endedAt: number }[]): boolean {
  if (!Array.isArray(iv) || iv.length < 2 || iv.some((x) => !Number.isFinite(x.startedAt) || !Number.isFinite(x.endedAt))) return false;
  return Math.max(...iv.map((x) => x.startedAt)) < Math.min(...iv.map((x) => x.endedAt));
}
/** ledgerPerId(payload): per-mission entry counts of a mission-ledger payload ({entries:[{mission}]}). */
function ledgerPerId(payload: any): { per: Record<string, number>; total: number } {
  const e = payload && Array.isArray(payload.entries) ? payload.entries : Array.isArray(payload) ? payload : [];
  const per: Record<string, number> = {};
  for (const x of e) { const id = x && typeof x.mission === "string" ? x.mission : "(no-id)"; per[id] = (per[id] || 0) + 1; }
  return { per, total: e.length };
}
/** sharedWriteViolations(before, after): files in the shared runtime/generated (outside run dirs / harness dir) that
 *  are new or changed and NOT in SHARED_ALLOWED. before/after = { relPath: "size:mtimeMs" }. */
function sharedWriteViolations(before: Record<string, string>, after: Record<string, string>): string[] {
  return Object.keys(after).filter((k) => before[k] !== after[k]).filter((k) => !SHARED_ALLOWED.some((re) => re.test(k))).sort();
}
/** isLinkedWorktree: git-dir differs from the common dir ⇒ a linked worktree (the main checkout has them equal). */
function isLinkedWorktree(gitDir: string | null, commonDir: string | null): boolean {
  return !!gitDir && !!commonDir && path.resolve(gitDir) !== path.resolve(commonDir);
}
function v(verdict: string, reasons: string[]): { verdict: string; reasons: string[] } { return { verdict, reasons }; }
const all = (xs: any[], f: (x: any) => boolean) => Array.isArray(xs) && xs.length > 0 && xs.every(f);

/**
 * classifyScenario(id, f) — PURE, strict. f = the facts measured for that scenario (see main()). Rules:
 *   - no facts / not executed ⇒ NOT_MEASURABLE;  f.injected ⇒ SIMULATED (an injected runner/fake never counts as REAL);
 *   - every required property held on every repeat ⇒ REAL; only some ⇒ PARTIAL; the core property failed ⇒ FAIL.
 */
function classifyScenario(id: string, f: any): { verdict: string; reasons: string[] } {
  if (!f || f.executed !== true) return v("NOT_MEASURABLE", [f && f.reason ? String(f.reason) : "not executed"]);
  if (f.injected === true) return v("SIMULATED", ["ran with an injected runner/fake — not the real system"]);
  switch (id) {
    case "A": {
      if (f.build.exitCode !== 0) return v("FAIL", [`npm run build:runtime exit ${f.build.exitCode}`]);
      if (!(f.defaultTick.exitCode === 0 && /\bPASS\b/.test(f.defaultTick.stdout || ""))) return v("FAIL", [`default tick exit ${f.defaultTick.exitCode}: ${f.defaultTick.stdout}`]);
      const r = ["dist built in the worktree", "real default (non-wave) tick PASS on reset state"];
      if (f.truthLockEnforced && f.truthLockEnforced.exitCode === 2) r.push("Truth-Lock-enforced tick STARTUP_REFUSED on the feature branch (expected; hence ODG_TRUTH_LOCK_ENFORCE=0 for the sandbox)");
      return v("REAL", r);
    }
    case "B": {
      const ok = (x: any) => x.admitted.length >= 2 && x.refused === 0 && x.physicalDisjoint === true && x.logicalDistinctPairs > 0;
      if (all(f.perRound, ok)) return v("REAL", [`every round admitted ${f.perRound.map((x: any) => x.admitted.length).join("/")} missions via the real gate chain; physical write-sets pairwise disjoint; logical declared sets distinct for ${f.perRound[0].logicalDistinctPairs}/${f.perRound[0].pairs} pairs (identical logical names are disjoint ONLY by run-dir isolation)`]);
      return f.perRound.some(ok) ? v("PARTIAL", ["admission held on some rounds only"]) : v("FAIL", ["admission of ≥2 missions with distinct write-sets not observed"]);
    }
    case "C": {
      const ok = (x: any) => x.wave.length >= 2 && x.wave.length === Math.min(x.cap, x.admitted) && x.contentions === 0 && x.deferred.length === x.admitted - x.wave.length;
      if (!all(f.perRound, ok)) return f.perRound.some(ok) ? v("PARTIAL", ["wave selection held on some rounds only"]) : v("FAIL", ["no write-safe parallel wave selected"]);
      if (!(f.contrast && f.contrast.isolatedWave >= 2 && f.contrast.nonIsolatedWave === 1)) return v("PARTIAL", ["real wave selected, but the non-isolated serialization contrast was not reproduced"]);
      return v("REAL", [`real CLI wave = cap ${f.perRound[0].cap} of ${f.perRound[0].admitted} admitted, 0 contentions, rest deferred; canonical selectWave contrast: isolated ${f.contrast.isolatedWave} vs non-isolated ${f.contrast.nonIsolatedWave} (shared runtime/generated ⇒ serialized)`]);
    }
    case "D": {
      const ok = (x: any) => x.overlap === true && x.maxConcurrentPids >= 2 && x.tickWriteSetOk === x.expectedOk && x.independentCheckOk === true && x.sharedViolations.length === 0;
      if (all(f.perTick, ok)) return v("REAL", [`${f.perTick.length} real waves: children simultaneous (common instant + ≥2 live pids), tick write-set enforcement OK for every completed child, independent post-run check OK, no undeclared shared write`]);
      return f.perTick.some(ok) ? v("PARTIAL", ["simultaneity / write isolation held on some waves only"]) : v("FAIL", ["simultaneous isolated execution not demonstrated"]);
    }
    case "E": {
      const ok = (x: any) => x.detected === x.waveSize && x.assigned === x.waveSize && x.renewedWhileAlive === x.waveSize && x.midRunRunning >= 2;
      if (!all(f.perTick, ok)) return f.perTick.some(ok) ? v("PARTIAL", ["supervision covered some waves only"]) : v("FAIL", ["wave children not registered / renewed / seen RUNNING"]);
      if (f.mode !== "repo") return v("PARTIAL", [`assign/renew/snapshot ran on every REAL child (real pid + write-set), but in the TEST-ONLY ctx.heartbeatOnly scope. Production repo-evidence mode was probed once: ${f.repoModeOutcome}${f.repoProbe ? ` (supervising worktree dirty paths: ${f.repoProbe.worktreeDirtyPaths}, ${f.repoProbe.ms} ms)` : ""} — a clean unowned live worktree has an UNKNOWN write-set ⇒ refused (fail-closed), a dirty one is approximated by its git-dirty paths only (gitignored runtime/generated writes invisible); a repo-mode assign is a ~1.1-1.3 s SYNC call. Heartbeats are emitted by the harness on each child's behalf: odg-run has no in-process heartbeat and the tick is not wired to the supervisor`]);
      return v("REAL", ["every real child assigned in production evidence mode, renewed, seen RUNNING"]);
    }
    case "F": {
      const ok = (x: any) => x.killedPidDead === true && x.killedLedgerAfterTick1 === 0 && x.attemptStatus === "FAIL" && x.supervisorState === "INTERRUPTED";
      if (all(f.perRound, ok)) return v("REAL", ["every round: SIGKILL mid-run ⇒ attempt FAIL (no false success) and the supervisor re-classified the child INTERRUPTED from evidence (dead pid + stale heartbeat)"]);
      return f.perRound.some(ok) ? v("PARTIAL", ["interruption classified on some rounds only"]) : v("FAIL", ["interruption not classified INTERRUPTED"]);
    }
    case "G": {
      const ok = (x: any) => x.reranInterrupted === true && x.reranCompleted.length === 0 && x.recoveredPass === true && x.ledgerEachOnce === true && x.ledgerSealOk === true && x.orphanClaimsAfter === 0;
      if (!all(f.perRound, ok)) return f.perRound.some(ok) ? v("PARTIAL", ["recovery held on some rounds only"]) : v("FAIL", ["recovery lost/duplicated ledger entries or re-ran completed work"]);
      const c = f.claimVariant;
      if (!(c && c.executed && c.killedWhileHolding === true && c.reclaimed === true && c.recoveredPass === true && c.ledgerEachOnce === true)) return v("PARTIAL", [`interrupted mission re-run alone, no ledger loss/duplication, seal OK; but dead-holder ledger-claim reclaim not demonstrated here (${c && c.reason ? c.reason : "variant skipped"})`]);
      return v("REAL", [`only the interrupted mission re-ran, each ledger id exactly once, seal OK, no orphan claim; dead-holder claim reclaimed at TTL (gen ${c.deadGen} → ${c.newGen}, ${c.reclaimAfterMs} ms after the kill)`]);
    }
    case "H": {
      if (!(f.selfRefused === true && f.parentRefused === true && f.distinctAccepted === true)) return v("FAIL", ["inspector-independence rule not enforced as specified"]);
      return v("PARTIAL", ["close() refused the owner and the parent as inspector and accepted a distinct inspector — but the inspector is a free-form STRING, not identity-bound: the same harness process supplied owner and inspector strings and an arbitrary string was accepted (independence is declared, not proven)"]);
    }
    case "I": {
      const sound = all(f.perClass, (x: any) => x.decision !== "LOCAL" || x.chosenStatus === "QUALIFIED");
      if (!sound) return v("FAIL", ["a LOCAL decision chose a non-QUALIFIED model"]);
      if (f.liveProbe !== true) return v("PARTIAL", ["selection computed over the committed registry, but live availability could not be probed"]);
      return v("REAL", [`${f.perClass.length} task classes routed by selectMeasured over the COMMITTED measured registry + live availability; ${f.perClass.filter((x: any) => x.decision === "LOCAL").length} LOCAL (QUALIFIED only), ${f.perClass.filter((x: any) => x.decision !== "LOCAL").length} not LOCAL (flagged). Task classes ≠ the read-only canary missions (those make no model call)`]);
    }
    case "J": {
      if (f.liveProbe !== true) return v("NOT_MEASURABLE", ["loopback Ollama not reachable"]);
      const a = f.fallback || {};
      const okFb = a.outcome === "OK" && a.attempts && a.attempts[0] && a.attempts[0].unavailable === true && a.attempts.length >= 2 && a.model !== ABSENT_MODEL;
      const okRef = f.noQualified && f.noQualified.decision === "NO_QUALIFIED_LOCAL_MODEL" && f.noQualified.run === "REFUSED";
      if (okFb && okRef) return v("REAL", [`live: ${ABSENT_MODEL} ⇒ unavailable (daemon 404) ⇒ ${a.model} answered; '${NO_QUALIFIED_CLASS}' ⇒ NO_QUALIFIED_LOCAL_MODEL ⇒ runWithFallback REFUSED. The primary=absent decision is constructed (the registry never selects an absent model)`]);
      return okFb || okRef ? v("PARTIAL", ["only one of fallback / refusal demonstrated"]) : v("FAIL", ["fallback and refusal both failed"]);
    }
    case "K": {
      const ok = (x: any) => x.deferredAfterInterrupt.length > 0 && x.deferredAfterInterrupt.every((m: string) => x.resumedPass.includes(m)) && x.finalIdle === true && x.humanInputs === 0;
      if (all(f.perRound, ok)) return v("REAL", ["after the interrupted wave, the next ticks admitted and PASSed the deferred independent missions with no human input, then went IDLE (all proven); tick cadence driven by the harness loop standing in for the (untouched) timer"]);
      return f.perRound.some(ok) ? v("PARTIAL", ["automatic resumption on some rounds only"]) : v("FAIL", ["remaining missions not resumed automatically"]);
    }
    case "L": {
      const r: string[] = [];
      if (!(f.historical && f.historical.verified === 928 && f.historical.missing === 0 && f.historical.changed === 0)) r.push(`verify-historical: ${f.historical ? f.historical.line : "not run"}`);
      if (f.roadmapUnchanged !== true) r.push("v124 roadmap differs from origin/main");
      if (f.mainCheckout && f.mainCheckout.ok !== true) r.push(`main checkout Truth-Lock: ${f.mainCheckout.detail}`);
      if (f.evidenceWritable !== true) r.push("evidence not written");
      return r.length ? v("FAIL", r) : v("REAL", ["evidence + checkpoint written; verify-historical verified=928 missing=0 changed=0; v124 roadmap byte-identical to origin/main; main checkout on main/origin/main and clean"]);
    }
    default: return v("NOT_MEASURABLE", [`unknown scenario ${id}`]);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------------------------------------------------
const ROOT: string = process.cwd();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function git(args: string[], cwd = ROOT): string | null { const r = cp.spawnSync("git", args, { cwd, encoding: "utf8" }); return r.status === 0 ? String(r.stdout).trim() : null; }
function sha256(buf: any): string { return crypto.createHash("sha256").update(buf).digest("hex"); }
function readJson(p: string): any { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function rel(p: string): string { return path.relative(ROOT, p).split(path.sep).join("/"); }
function listPids(): number[] { try { return fs.readdirSync("/proc").filter((n: string) => /^\d+$/.test(n)).map(Number); } catch { return []; } }
function ppidOf(pid: number): number | null { try { const s = fs.readFileSync(`/proc/${pid}/stat`, "utf8"); const f = s.slice(s.lastIndexOf(")") + 2).split(" "); return Number(f[1]); } catch { return null; } }
function cmdlineOf(pid: number): string[] { try { return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean); } catch { return []; } }
function envOf(pid: number): Record<string, string> { const o: Record<string, string> = {}; try { for (const kv of fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0")) { const i = kv.indexOf("="); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); } } catch { /* gone */ } return o; }
function descendants(root: number): number[] {
  const map = new Map<number, number[]>();
  for (const p of listPids()) { const pp = ppidOf(p); if (pp !== null) { if (!map.has(pp)) map.set(pp, []); map.get(pp)!.push(p); } }
  const out: number[] = []; const q = [root];
  while (q.length) { const x = q.shift()!; for (const c of map.get(x) || []) { out.push(c); q.push(c); } }
  return out;
}
// process start time (ms since epoch) from /proc/<pid>/stat field 22 (clock ticks since boot) + /proc/stat btime
const CLK_TCK = (() => { const r = cp.spawnSync("getconf", ["CLK_TCK"], { encoding: "utf8" }); const n = Number(String(r.stdout || "").trim()); return Number.isFinite(n) && n > 0 ? n : 100; })();
function startMsOf(pid: number): number | null {
  try {
    const bt = Number((fs.readFileSync("/proc/stat", "utf8").match(/^btime (\d+)$/m) || [])[1]);
    const s = fs.readFileSync(`/proc/${pid}/stat`, "utf8"); const f = s.slice(s.lastIndexOf(")") + 2).split(" ");
    const ticks = Number(f[19]); return Number.isFinite(bt) && Number.isFinite(ticks) ? bt * 1000 + (ticks / CLK_TCK) * 1000 : null;
  } catch { return null; }
}
function pidAlive(pid: number): boolean { try { process.kill(pid, 0); return ppidOf(pid) !== null && !/^\S+ \(\S*\) Z/.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8")); } catch { return false; } }
function walkFiles(dir: string, base = dir): string[] {
  let out: string[] = [];
  let names: string[] = []; try { names = fs.readdirSync(dir); } catch { return out; }
  for (const n of names) { const p = path.join(dir, n); let st: any; try { st = fs.lstatSync(p); } catch { continue; } if (st.isDirectory()) out = out.concat(walkFiles(p, base)); else out.push(path.relative(base, p).split(path.sep).join("/")); }
  return out.sort();
}
function sharedListing(gen: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const f of walkFiles(gen)) { if (f.startsWith("wave-runs/") || f.startsWith("v155-transversal/")) continue; try { const st = fs.statSync(path.join(gen, f)); o[f] = `${st.size}:${st.mtimeMs}`; } catch { /* raced */ } }
  return o;
}

function requireDist(relCore: string): any { return require(path.join(ROOT, "runtime", "dist", "core", relCore)); }

// ---------------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------------
function arg(name: string, def: any): any { const i = process.argv.indexOf("--" + name); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : def; }
function flag(name: string): boolean { return process.argv.includes("--" + name); }

async function main(): Promise<number> {
  const log = (s: string) => process.stderr.write(`[v155-transversal] ${s}\n`);
  const tStart = Date.now();
  // ---- SAFETY: linked worktree only; reset target must be a real dir inside it
  const gitDir = git(["rev-parse", "--absolute-git-dir"]);
  const commonDir = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const top = git(["rev-parse", "--show-toplevel"]);
  if (!isLinkedWorktree(gitDir, commonDir) || !top || path.resolve(top) !== path.resolve(ROOT)) { log(`REFUSED: cwd must be the top of a LINKED git worktree (git-dir ${gitDir}, common ${commonDir}, top ${top})`); return 1; }
  const MAIN_REPO = path.dirname(commonDir as string);
  const GEN = path.join(ROOT, "runtime", "generated");
  const resetState = () => {
    if (fs.existsSync(GEN)) { const st = fs.lstatSync(GEN); if (!st.isDirectory() || st.isSymbolicLink()) throw new Error("runtime/generated is not a plain directory — refusing to reset"); }
    if (!path.resolve(GEN).startsWith(path.resolve(ROOT) + path.sep) || path.resolve(GEN).startsWith(path.resolve(MAIN_REPO) + path.sep)) throw new Error("reset target outside the worktree — refusing");
    fs.rmSync(GEN, { recursive: true, force: true });
  };
  const rounds = Math.max(2, Number(arg("rounds", 2)) || 2);
  const waveMax = Math.max(2, Math.min(6, Number(arg("wave-max", 3)) || 3));
  const killAfterMs = Math.max(200, Number(arg("kill-after-ms", 1500)) || 1500);
  const out = path.resolve(arg("out", DEFAULT_OUT));
  const missions: string[] = String(arg("missions", DEFAULT_MISSIONS.join(","))).split(",").map((s: string) => s.trim()).filter(Boolean);
  const commands: string[] = [];
  const timings: Record<string, number> = {};
  const facts: any = {};
  const baseEnv: any = { ...process.env, ODG_TRUTH_LOCK_ENFORCE: "0" };
  for (const k of ["ODG_TICK_WAVE", "ODG_TICK_WAVE_MAX", "ODG_TICK_WAVE_ISOLATE", "ODG_RUN_OUTPUT_DIR", "ODG_RUN_OUTPUT_ROOT", "ODG_CANARY_ALLOWLIST"]) delete baseEnv[k];
  const TICK = "runtime/dist/bin/odg-schedule-tick.js";
  const declaredOf = (id: string): string[] => { const m = readJson(path.join(ROOT, "runtime", "missions", id + ".json")); return m && Array.isArray(m.write_set) ? m.write_set : []; };

  // ======== A: build + a real default tick ========
  let t = Date.now();
  if (!flag("skip-build")) {
    commands.push("npm run build:runtime");
    const b = cp.spawnSync("npm", ["run", "build:runtime"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    facts.A = { executed: true, build: { exitCode: b.status, tail: String(b.stdout || "").trim().split("\n").slice(-2) } };
  } else facts.A = { executed: true, build: { exitCode: fs.existsSync(path.join(ROOT, TICK)) ? 0 : 1, tail: ["--skip-build: existing worktree dist reused"] } };
  const runCli = (env: any): { exitCode: number | null; stdout: string; ms: number } => {
    const t0 = Date.now(); const r = cp.spawnSync("node", [TICK], { cwd: ROOT, env, encoding: "utf8", timeout: 700000 });
    return { exitCode: r.status, stdout: (String(r.stdout || "") + String(r.stderr || "")).trim().split("\n").slice(-3).join(" | "), ms: Date.now() - t0 };
  };
  resetState();
  commands.push("ODG_TRUTH_LOCK_ENFORCE=1 ODG_CANARY_ALLOWLIST=M0001 node " + TICK + "   (expected STARTUP_REFUSED off main)");
  facts.A.truthLockEnforced = runCli({ ...baseEnv, ODG_TRUTH_LOCK_ENFORCE: "1", ODG_CANARY_ALLOWLIST: "M0001" });
  resetState();
  commands.push("ODG_TRUTH_LOCK_ENFORCE=0 ODG_CANARY_ALLOWLIST=M0001 node " + TICK);
  facts.A.defaultTick = runCli({ ...baseEnv, ODG_CANARY_ALLOWLIST: "M0001" });
  timings.A = Date.now() - t;
  log(`A build=${facts.A.build.exitCode} truthLockEnforced=${facts.A.truthLockEnforced.exitCode} defaultTick=${facts.A.defaultTick.exitCode} ${facts.A.defaultTick.stdout}`);

  // ======== B–H, K: supervised real waves, repeated ========
  const SUP = require("../core/odg-agent-supervisor.js");
  const LEDGER = requireDist("mission-ledger.js");
  const FLEET = requireDist("fleet-bridge.js");
  const locksDir = path.join(GEN, "fleet", "locks");
  const ledgerPath = path.join(GEN, "mission-ledger.json");
  const supDirs = () => ({ heartbeatDir: path.join(GEN, "v155-transversal", "heartbeats"), locksDir: path.join(GEN, "v155-transversal", "locks") });
  const supCtx = () => ({ ...supDirs(), heartbeatOnly: true, staleMs: STALE_MS });
  const snap = () => { const d = supDirs(); const hbs = SUP.readHeartbeats(d.heartbeatDir); const pids = hbs.map((h: any) => h.pid).filter((x: any) => Number.isInteger(x)); return SUP.snapshot({ now: Date.now(), heartbeats: hbs, alivePids: pids.filter(pidAlive), claims: SUP.collectClaims(locksDir) }, { staleMs: STALE_MS }); };
  const stateOf = (s: any, id: string) => { const a = s.agents.find((x: any) => x.id === id); return a ? a.state : null; };
  // production repo-evidence mode probe (once, before the rounds; its heartbeat dir is wiped by the round reset)
  const tp = Date.now();
  const probe = SUP.assign({ id: "repo-mode-probe", workItem: "V155_TRANSVERSAL_REPO_MODE_PROBE", owner: "odg-v155-transversal-harness", writeSet: ["runtime/generated/v155-transversal/repo-probe"], pid: process.pid },
    { heartbeatDir: path.join(GEN, "v155-transversal", "probe-heartbeats"), locksDir: path.join(GEN, "v155-transversal", "probe-locks"), repo: MAIN_REPO, staleMs: STALE_MS });
  const repoModeOutcome: string = probe.outcome + (probe.conflicts ? " " + JSON.stringify(probe.conflicts.map((c: any) => `${c.with}:${c.reason}`)) : "");
  const repoProbe: any = { outcome: repoModeOutcome, ms: Date.now() - tp, worktreeDirtyPaths: (git(["status", "--porcelain"]) || "").split("\n").filter(Boolean).length };

  async function superviseTick(label: string, allow: string[], opts: { killMission?: string | null; round: number; tickIdx: number }): Promise<any> {
    const env = { ...baseEnv, ODG_CANARY_ALLOWLIST: allow.join(","), ODG_TICK_WAVE: "1", ODG_TICK_WAVE_MAX: String(waveMax) };
    commands.push(`[${label}] ODG_TRUTH_LOCK_ENFORCE=0 ODG_CANARY_ALLOWLIST=${allow.join(",")} ODG_TICK_WAVE=1 ODG_TICK_WAVE_MAX=${waveMax} node ${TICK}`);
    const before = sharedListing(GEN);
    const t0 = Date.now();
    const child = cp.spawn("node", [TICK], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let outText = ""; child.stdout.on("data", (b: any) => { outText += b; }); child.stderr.on("data", (b: any) => { outText += b; });
    let exited = false, exitCode: any = null;
    child.on("close", (c: any) => { exited = true; exitCode = c; });
    const agents: Record<string, any> = {};
    let maxConcurrent = 0, midSnapshot: any = null, killed: any = null, killWindowMissed: any = null;
    const ctx = supCtx();
    const register = (pid: number, mission: string) => {
      const firstSeen = startMsOf(pid) ?? Date.now();   // the child's REAL start (not when the loop got to it)
      const e = envOf(pid);
      const ta = Date.now();
      const assignMode = "heartbeatOnly";
      const runDir = e.ODG_RUN_OUTPUT_DIR || null;
      const declared = declaredOf(mission);
      const hbId = `r${opts.round}-t${opts.tickIdx}-${mission}`;
      const owner = `odg-run:${mission}`;
      const parentId = `odg-schedule-tick:${child.pid}`;
      const writeSet = runDir ? declared.map((p) => rel(runDir) + "/" + p) : [];
      const req = { id: hbId, workItem: mission, owner, parentId, writeSet, pid };
      let assign: any;
      // heartbeatOnly scope: production repo-evidence mode is probed separately (refused on a clean supervising worktree,
      // and ~1.1-1.3 s per SYNC assign — it would stall this single supervision loop and skew kill timing / renewals)
      assign = SUP.assign(req, ctx);
      agents[mission] = { mission, pid, runDir, hbId, owner, parentId, declared, firstSeen, assignMs: Date.now() - ta, assignMode, lastRenew: Date.now(), renewOk: 0, renewRefused: [], assign: assign.outcome, assignDetail: assign.outcome === "ASSIGNED" ? null : JSON.stringify(assign).slice(0, 300), ended: null, finalReport: null };
    };
    // child exited: record its final report on its heartbeat (a killed child never reports — it just stops heartbeating)
    const finish = (a: any) => {
      a.ended = Date.now();
      if (!(killed && killed.mission === a.mission) && a.assign === "ASSIGNED") {
        const rep = a.runDir ? readJson(path.join(a.runDir, "mission-report.json")) : null;
        a.finalReport = !!(rep && rep.mission === a.mission && rep.validated === true && rep.status === "SUCCESS");
        a.finalRenew = SUP.renew(a.hbId, ctx, { owner: a.owner, pid: a.pid, finalReport: a.finalReport }).outcome;
      }
    };
    while (!exited) {
      const kids = descendants(child.pid).filter((p) => { const c = cmdlineOf(p); return c.some((x) => x.endsWith("odg-run.js")) && ppidOf(p) === child.pid; });
      for (const p of kids) { const c = cmdlineOf(p); const m = c[c.length - 1]; if (m && !agents[m]) register(p, m); }
      const live = Object.values(agents).filter((a: any) => !a.ended && pidAlive(a.pid));
      maxConcurrent = Math.max(maxConcurrent, live.length);
      for (const a of live as any[]) {
        if (Date.now() - a.lastRenew >= RENEW_MS && a.assign === "ASSIGNED") { const r = SUP.renew(a.hbId, ctx, { owner: a.owner, pid: a.pid, progress: true }); if (r.outcome === "RENEWED") a.renewOk++; else a.renewRefused.push(r.outcome); a.lastRenew = Date.now(); }
      }
      if (!midSnapshot && live.length >= 2 && (live as any[]).every((a) => a.renewOk >= 1)) { const s = snap(); midSnapshot = { at: Date.now() - t0, states: (live as any[]).map((a) => ({ id: a.hbId, state: stateOf(s, a.hbId) })) }; }
      for (const a of Object.values(agents) as any[]) if (!a.ended && !pidAlive(a.pid)) finish(a);
      const tgt = opts.killMission ? agents[opts.killMission] : null;
      // MID-RUN only: after killAfterMs of real runtime AND before the child has a report or a ledger entry (else the kill
      // would land after the work is done — recorded as a missed window, never counted as an interruption)
      const done = tgt && tgt.runDir ? fs.existsSync(path.join(tgt.runDir, "mission-report.json")) || (ledgerPerId(readJson(ledgerPath)).per[tgt.mission] || 0) > 0 : false;
      if (tgt && !killed && !killWindowMissed && !tgt.ended && Date.now() - tgt.firstSeen >= killAfterMs && done) killWindowMissed = { mission: tgt.mission, atMs: Date.now() - tgt.firstSeen };
      if (tgt && !killed && !killWindowMissed && !tgt.ended && tgt.renewOk >= 1 && Date.now() - tgt.firstSeen >= killAfterMs) {
        const tree = [tgt.pid, ...descendants(tgt.pid)];
        const claim = FLEET.currentClaim({ locksDir }, "mission-ledger");
        const heldLedger = !!(claim && claim.holder && tree.includes(claim.holder.pid) && claim.mtimeMs !== 0);
        for (const p of tree) { try { process.kill(p, "SIGKILL"); } catch { /* gone */ } }
        const stage = readJson(path.join(tgt.runDir || "/nonexistent", "pipeline-checkpoint.json"));
        const doneStages = stage && Array.isArray(stage.stages) ? stage.stages.filter((x: any) => x.status === "DONE").map((x: any) => x.name) : [];
        killed = { mission: tgt.mission, pid: tgt.pid, tree, atMsAfterSpawn: Date.now() - tgt.firstSeen, heldLedgerClaim: heldLedger, stagesDoneAtKill: doneStages.length, lastStageDone: doneStages[doneStages.length - 1] || null };
        log(`${label}: SIGKILL ${tgt.mission} pid ${tgt.pid} (+${tree.length - 1} descendants) at ${killed.atMsAfterSpawn} ms`);
      }
      await sleep(POLL_MS);
    }
    const wallMs = Date.now() - t0;
    for (const a of Object.values(agents) as any[]) if (!a.ended) finish(a);   // exits the loop did not observe before the tick closed
    if (killed) killed.pidDeadAfter = !pidAlive(killed.pid);
    const after = sharedListing(GEN);
    const runBase = fs.existsSync(path.join(GEN, "wave-runs")) ? fs.readdirSync(path.join(GEN, "wave-runs")).filter((d: string) => d.endsWith("-" + child.pid)) : [];
    const summary = runBase.length ? readJson(path.join(GEN, "wave-runs", runBase[0], "wave-summary.json")) : null;
    return { label, exitCode, stdout: outText.trim().split("\n").slice(-2).join(" | "), wallMs, tickPid: child.pid, agents, maxConcurrent, midSnapshot, killed, killWindowMissed, summary, sharedViolations: sharedWriteViolations(before, after) };
  }

  const waveFacts = (tick: any, admitted: string[]) => {
    const s = tick.summary || { wave: [], deferred: [], contentions: [], refused: [], results: [] };
    const iv = (s.results || []).map((r: any) => ({ startedAt: r.startedAt, endedAt: r.endedAt }));
    const independent = (s.results || []).filter((r: any) => r.status === "PASS").every((r: any) => {
      const a = tick.agents[r.mission]; if (!a || !a.runDir) return false;
      const files = walkFiles(a.runDir); return files.length > 0 && files.every((f) => covers(a.declared, f));
    });
    const killedM = tick.killed ? tick.killed.mission : null;
    return {
      wave: s.wave, deferred: s.deferred, admitted: admitted.length, cap: waveMax, contentions: (s.contentions || []).length,
      overlap: intervalsOverlap(iv), maxConcurrentPids: tick.maxConcurrent,
      tickWriteSetOk: (s.results || []).filter((r: any) => r.mission !== killedM && r.writeSetCheck && r.writeSetCheck.status === "OK").length,
      expectedOk: (s.results || []).filter((r: any) => r.mission !== killedM).length,
      killedWriteSetCheck: killedM ? ((s.results || []).find((r: any) => r.mission === killedM) || {}).writeSetCheck : null,
      independentCheckOk: independent, sharedViolations: tick.sharedViolations, wallMs: tick.wallMs, results: (s.results || []).map((r: any) => ({ mission: r.mission, status: r.status, reason: r.reason, writeSetCheck: r.writeSetCheck ? r.writeSetCheck.status : null, ms: r.endedAt - r.startedAt })),
    };
  };

  t = Date.now();
  const roundFacts: any[] = [];
  for (let round = 1; round <= rounds; round++) {
    resetState();
    const rf: any = { round, ticks: [] };
    const killMission = missions[Math.min(waveMax, missions.length) - 1];   // last member of the first wave
    // ---- tick 1: wave with a mid-run SIGKILL
    const t1 = await superviseTick(`r${round}-tick1`, missions, { killMission, round, tickIdx: 1 });
    rf.ticks.push(t1);
    const admitted1 = [...((t1.summary && t1.summary.wave) || []), ...((t1.summary && t1.summary.deferred) || [])];
    // B: admission + distinct write-sets
    const decl = Object.fromEntries(admitted1.map((m) => [m, declaredOf(m)]));
    const phys = admitted1.map((m) => (t1.agents[m] && t1.agents[m].runDir ? decl[m].map((p: string) => rel(t1.agents[m].runDir) + "/" + p) : null)).filter(Boolean) as string[][];
    let pairs = 0, distinct = 0; for (let i = 0; i < admitted1.length; i++) for (let j = i + 1; j < admitted1.length; j++) { pairs++; if (JSON.stringify(decl[admitted1[i]].slice().sort()) !== JSON.stringify(decl[admitted1[j]].slice().sort())) distinct++; }
    let disjoint = phys.length >= 2; for (let i = 0; i < phys.length && disjoint; i++) for (let j = i + 1; j < phys.length; j++) if (phys[i].some((p) => phys[j].includes(p))) { disjoint = false; break; }
    rf.B = { admitted: admitted1, refused: ((t1.summary && t1.summary.refused) || []).length, pairs, logicalDistinctPairs: distinct, physicalDisjoint: disjoint, physicalCompared: phys.length };
    rf.C = waveFacts(t1, admitted1);
    // F: wait past staleness, then let the supervisor re-classify from evidence
    await sleep(STALE_MS + 300);
    let s = snap();
    const kA = t1.killed ? t1.agents[t1.killed.mission] : null;
    const attempt = t1.summary ? (t1.summary.results || []).find((r: any) => t1.killed && r.mission === t1.killed.mission) : null;
    rf.F = { killed: t1.killed, killWindowMissed: t1.killWindowMissed, killedLedgerAfterTick1: t1.killed ? (ledgerPerId(readJson(ledgerPath)).per[t1.killed.mission] || 0) : null, killedPidDead: !!(t1.killed && t1.killed.pidDeadAfter), attemptStatus: attempt ? attempt.status : null, attemptReason: attempt ? attempt.reason : null,
      supervisorState: kA ? stateOf(s, kA.hbId) : null, supervisorReasons: kA ? ((s.agents.find((a: any) => a.id === kA.hbId) || {}).reasons || []) : [], recoveryDecision: kA ? (s.recovery.find((x: any) => x.id === kA.hbId) || null) : null,
      completedStates: Object.values(t1.agents).filter((a: any) => !t1.killed || a.mission !== t1.killed.mission).map((a: any) => ({ id: a.hbId, state: stateOf(s, a.hbId) })) };
    // H: independent inspection on a completed child (owner / parent refused; distinct accepted)
    const done = Object.values(t1.agents).find((a: any) => (!t1.killed || a.mission !== t1.killed.mission) && a.finalReport === true) as any;
    if (done) {
      const self = SUP.close(done.hbId, { inspector: done.owner, verdict: "ACCEPT" }, supCtx());
      const parent = SUP.close(done.hbId, { inspector: done.parentId, verdict: "ACCEPT" }, supCtx());
      const ok = SUP.close(done.hbId, { inspector: INSPECTOR, verdict: "ACCEPT" }, supCtx());
      rf.H = { agent: done.hbId, state: stateOf(s, done.hbId), self: self.outcome + ": " + (self.reason || ""), parent: parent.outcome + ": " + (parent.reason || ""), distinct: ok.outcome };
      for (const a of Object.values(t1.agents) as any[]) if (a !== done && a.finalReport === true) SUP.close(a.hbId, { inspector: INSPECTOR, verdict: "ACCEPT" }, supCtx());
    }
    // G: recovery path through the supervisor, then the next tick
    if (kA) {
      const relaunch = SUP.assign({ id: kA.hbId + "-relaunch", workItem: kA.mission, owner: kA.owner, writeSet: ["runtime/generated/wave-runs/relaunch-probe"], relaunchOf: kA.hbId }, supCtx());
      const dup = SUP.assign({ id: kA.hbId + "-dup", workItem: kA.mission, owner: kA.owner, writeSet: ["runtime/generated/wave-runs/dup-probe"] }, supCtx());
      const cancel = SUP.renew(kA.hbId, supCtx(), { owner: kA.owner, pid: kA.pid, status: "CANCELLED", reason: "SIGKILLed mid-run by the V15.5 transversal harness (scenario F)" });
      const closeEarly = SUP.close(kA.hbId, { inspector: INSPECTOR, verdict: "REJECT" }, supCtx());   // renew() refreshed heartbeatAt ⇒ looks live
      await sleep(STALE_MS + 300);
      const closeK = SUP.close(kA.hbId, { inspector: INSPECTOR, verdict: "REJECT" }, supCtx());
      rf.Gsup = { relaunchOf: relaunch.outcome + ": " + (relaunch.reason || ""), duplicateAssign: dup.outcome, cancel: cancel.outcome, closeRightAfterCancel: closeEarly.outcome + (closeEarly.state ? " (state " + closeEarly.state + ")" : ""), close: closeK.outcome };
    }
    const ledger1 = ledgerPerId(readJson(ledgerPath));
    const claimGenBefore = (FLEET.currentClaim({ locksDir }, "mission-ledger") || {}).gen ?? null;
    // ---- tick 2..n: automatic resumption until IDLE (no human input)
    let tickIdx = 1, idle = false; const resumed: string[] = []; const rerun: string[] = [];
    while (!idle && tickIdx < 5) {
      tickIdx++;
      const tk = await superviseTick(`r${round}-tick${tickIdx}`, missions, { round, tickIdx });
      rf.ticks.push(tk);
      if (!tk.summary) { idle = tk.exitCode === 0 && /IDLE/.test(tk.stdout); break; }
      for (const r of tk.summary.results || []) { if (r.status === "PASS") resumed.push(r.mission); if ((ledger1.per[r.mission] || 0) > 0) rerun.push(r.mission); }
    }
    const ledgerEnd = readJson(ledgerPath);
    const perEnd = ledgerPerId(ledgerEnd);
    s = snap();
    const killedM = t1.killed ? t1.killed.mission : null;
    rf.G = { reranInterrupted: !!killedM && rf.ticks.slice(1).some((tk: any) => tk.summary && (tk.summary.wave || []).includes(killedM)), reranCompleted: rerun, recoveredPass: !!killedM && resumed.includes(killedM),
      ledgerAfterTick1: ledger1.per, ledgerEnd: perEnd.per, ledgerTotal: perEnd.total, ledgerEachOnce: missions.every((m) => perEnd.per[m] === 1) && perEnd.total === missions.length,
      ledgerSealOk: !!(ledgerEnd && LEDGER.verifyLedger(ledgerEnd).ok), killedHeldClaim: t1.killed ? t1.killed.heldLedgerClaim : null,
      claimGenBefore, claimGenAfter: (FLEET.currentClaim({ locksDir }, "mission-ledger") || {}).gen ?? null, orphanClaimsAfter: s.agents.filter((a: any) => a.kind === "CLAIM" && a.state === "ORPHAN").length, supervisor: rf.Gsup || null };
    rf.K = { deferredAfterInterrupt: (t1.summary && t1.summary.deferred) || [], resumedPass: resumed, finalIdle: idle, humanInputs: 0, ticks: rf.ticks.length };
    rf.D = rf.ticks.filter((tk: any) => tk.summary && (tk.summary.wave || []).length >= 2).map((tk: any) => ({ label: tk.label, ...waveFacts(tk, [...(tk.summary.wave || []), ...(tk.summary.deferred || [])]) }));
    rf.E = rf.ticks.filter((tk: any) => tk.summary && (tk.summary.wave || []).length >= 2).map((tk: any) => ({ label: tk.label, waveSize: tk.summary.wave.length, detected: Object.keys(tk.agents).length,
      assigned: Object.values(tk.agents).filter((a: any) => a.assign === "ASSIGNED").length, renewedWhileAlive: Object.values(tk.agents).filter((a: any) => a.renewOk >= 1).length,
      midRunRunning: tk.midSnapshot ? tk.midSnapshot.states.filter((x: any) => x.state === "RUNNING").length : 0, midSnapshot: tk.midSnapshot, renewRefused: Object.values(tk.agents).flatMap((a: any) => a.renewRefused), assignModes: Object.values(tk.agents).map((a: any) => a.assignMode), assignMs: Object.values(tk.agents).map((a: any) => a.assignMs), finalRenew: Object.values(tk.agents).map((a: any) => a.finalRenew || null), assignRefused: Object.values(tk.agents).filter((a: any) => a.assign !== "ASSIGNED").map((a: any) => a.assignDetail) }));
    rf.ticks = rf.ticks.map((tk: any) => ({ label: tk.label, exitCode: tk.exitCode, stdout: tk.stdout, wallMs: tk.wallMs, wave: tk.summary ? tk.summary.wave : [], deferred: tk.summary ? tk.summary.deferred : [], maxConcurrentPids: tk.maxConcurrent, killed: tk.killed ? { mission: tk.killed.mission, atMsAfterSpawn: tk.killed.atMsAfterSpawn, descendantsKilled: tk.killed.tree.length - 1, heldLedgerClaim: tk.killed.heldLedgerClaim, stagesDoneAtKill: tk.killed.stagesDoneAtKill, lastStageDone: tk.killed.lastStageDone } : null, killWindowMissed: tk.killWindowMissed,
      assignMs: Object.values(tk.agents).map((a: any) => a.assignMs) }));
    roundFacts.push(rf);
    log(`round ${round}: ticks ${rf.ticks.map((x: any) => x.exitCode + ":" + x.stdout.replace(/^.*\] /, "")).join(" || ")}`);
  }
  timings.wavesRounds = Date.now() - t;

  // C contrast: canonical selectWave on the same real mission definitions, isolated vs non-isolated projection
  const TICKMOD = require("./odg-schedule-tick.js");
  const REC = requireDist("odg-open-mission-recovery.js"), MO = requireDist("odg-mission-orchestrator.js");
  const loadMission = (id: string) => readJson(path.join(ROOT, "runtime", "missions", id + ".json"));
  const iso = TICKMOD.selectWave(missions, { REC, MO, loadMission, waveMax: 6, runnerSharedWriteSet: [], runnerWriteSetFor: (id: string) => ["runtime/generated/wave-runs/contrast/" + id], writeRootFor: (id: string) => "runtime/generated/wave-runs/contrast/" + id });
  const non = TICKMOD.selectWave(missions, { REC, MO, loadMission, waveMax: 6 });
  const contrast = { isolatedWave: iso.wave.length, nonIsolatedWave: non.wave.length, nonIsolatedContentions: (non.contentions || []).length };

  // Claim-holder variant (G lock reclaim): SIGKILL the ledger-claim HOLDER, then recover across the claim TTL
  t = Date.now();
  let claimVariant: any = { executed: false, reason: "--skip-claim-variant" };
  if (!flag("skip-claim-variant")) claimVariant = await claimHolderVariant();
  timings.claimVariant = Date.now() - t;

  async function claimHolderVariant(): Promise<any> {
    resetState();
    const m = "M0002";
    const env = { ...baseEnv, ODG_CANARY_ALLOWLIST: m, ODG_TICK_WAVE: "1", ODG_TICK_WAVE_MAX: "1" };
    commands.push(`[claim-variant] ODG_TRUTH_LOCK_ENFORCE=0 ODG_CANARY_ALLOWLIST=${m} ODG_TICK_WAVE=1 ODG_TICK_WAVE_MAX=1 node ${TICK}  (+ SIGSTOP/SIGCONT stepping, SIGKILL while holding the mission-ledger claim)`);
    const child = cp.spawn("node", [TICK], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let o1 = ""; child.stdout.on("data", (b: any) => { o1 += b; }); child.stderr.on("data", (b: any) => { o1 += b; });
    let exited = false; child.on("close", () => { exited = true; });
    let target: number | null = null, killedAt: number | null = null, deadGen: number | null = null, steps = 0;
    const deadline = Date.now() + 60000;
    while (!exited && Date.now() < deadline && killedAt === null) {
      if (target === null) { const k = descendants(child.pid).find((p) => cmdlineOf(p).some((x) => x.endsWith("odg-run.js"))); if (k) target = k; await sleep(20); continue; }
      if (!pidAlive(target)) break;
      const tree = [target, ...descendants(target)];
      for (const p of tree) { try { process.kill(p, "SIGSTOP"); } catch { /* gone */ } }
      steps++;
      const c = FLEET.currentClaim({ locksDir }, "mission-ledger");
      const all2 = [target, ...descendants(target)];
      if (c && c.holder && all2.includes(c.holder.pid) && c.mtimeMs !== 0) {
        for (const p of all2) { try { process.kill(p, "SIGKILL"); } catch { /* gone */ } }
        killedAt = Date.now(); deadGen = c.gen; break;
      }
      for (const p of all2) { try { process.kill(p, "SIGCONT"); } catch { /* gone */ } }
      await sleep(8);
    }
    while (!exited) await sleep(50);
    if (killedAt === null) return { executed: true, killedWhileHolding: false, steps, reason: "the claim was never observed held by the target subtree during stepping (window missed) — reclaim not exercised", tick1: o1.trim().split("\n").pop() };
    const lockFile = path.join(locksDir, `mission-ledger.lock.${deadGen}`);
    const lockMtime = fs.statSync(lockFile).mtimeMs;
    const orphanSeen = snap().agents.filter((a: any) => a.kind === "CLAIM" && a.state === "ORPHAN").map((a: any) => a.id);
    // within TTL: expect fail-closed (claim timeout), never a double/blind write
    const tW = Date.now(); const within = runCli(env); const withinMs = Date.now() - tW;
    const ttl = LEDGER.LEDGER_CLAIM_DEFAULTS.ttlMs;
    const waitMs = Math.max(0, lockMtime + ttl + 1500 - Date.now());
    log(`claim-variant: holder killed (gen ${deadGen}); within-TTL tick exit ${within.exitCode} in ${withinMs} ms; waiting ${waitMs} ms for TTL`);
    await sleep(waitMs);
    const tA = Date.now(); const across = runCli(env);
    const per = ledgerPerId(readJson(ledgerPath));
    const cur = FLEET.currentClaim({ locksDir }, "mission-ledger");
    return { executed: true, mission: m, steps, killedWhileHolding: true, deadGen, orphanClaimSeenBySupervisor: orphanSeen,
      withinTtlTick: { exitCode: within.exitCode, ms: withinMs, out: within.stdout }, acrossTtlTick: { exitCode: across.exitCode, ms: Date.now() - tA, out: across.stdout },
      newGen: cur ? cur.gen : null, reclaimed: !!(cur && cur.gen > (deadGen as number) && cur.mtimeMs === 0), reclaimAfterMs: tA - killedAt, recoveredPass: across.exitCode === 0 && /PASS/.test(across.stdout),
      ledgerEachOnce: per.per[m] === 1 && per.total === 1, ledgerSealOk: !!LEDGER.verifyLedger(readJson(ledgerPath)).ok, ttlMs: ttl };
  }

  // ======== I / J: measured model selection + live fallback ========
  t = Date.now();
  const ROUTER = require("../core/odg-model-router.js");
  const P = require("../core/ollama-provider.js");
  const regEv = readJson(path.join(ROOT, REGISTRY_EVIDENCE));
  const registry = regEv && regEv.registry;
  const live = await P.listModels({ timeoutMs: 5000 });
  const available = live.ok ? live.models.map((x: any) => x.id) : null;
  const perClass = (registry ? registry.classes : []).map((c: string) => {
    const d = ROUTER.selectMeasured({ taskClass: c, registry, available: available || [] });
    const ch = d.model ? d.considered.find((x: any) => x.id === d.model) : null;
    return { taskClass: c, decision: d.decision, model: d.model, chosenStatus: ch ? ch.status : null, passRate: d.passRate ?? null, fallbackOrder: d.fallbackOrder, requiresAuthorization: d.requiresAuthorization };
  });
  facts.I = registry ? { executed: true, liveProbe: !!live.ok, available, registryHeadOfEvidence: regEv.head, perClass } : { executed: false, reason: "committed registry evidence missing" };
  if (live.ok && registry) {
    const base = ROUTER.selectMeasured({ taskClass: "extract", registry, available });
    const decision = { decision: "LOCAL", requiresAuthorization: false, model: ABSENT_MODEL, fallbackOrder: [base.model, ...base.fallbackOrder] };
    const fb = await ROUTER.runWithFallback(decision, async (mdl: string) => {
      const g = await P.generateMeasured({ model: mdl, prompt: "Reply with exactly the single word: READY", options: { temperature: 0, seed: 7, num_predict: 8 }, timeoutMs: 120000 });
      if (!g.ok) return g;
      // the scenario is AVAILABILITY fallback: a non-empty answer = answered; correctness is recorded, not used to retry
      return { ok: g.text.trim().length > 0, correct: /READY/i.test(g.text), text: g.text.slice(0, 40), totalMs: g.totalMs, reason: g.text.trim().length > 0 ? null : "empty answer" };
    });
    try { await P.unloadModel(fb.model); } catch { /* best-effort */ }
    const nq = ROUTER.selectMeasured({ taskClass: NO_QUALIFIED_CLASS, registry, available });
    const nqRun = await ROUTER.runWithFallback(nq, async () => ({ ok: true }));
    facts.J = { executed: true, liveProbe: true, primaryClassForFallback: "extract", decision, fallback: { outcome: fb.outcome, model: fb.model, attempts: fb.attempts, result: fb.result ? { text: fb.result.text, correct: fb.result.correct, totalMs: fb.result.totalMs } : null },
      noQualified: { taskClass: NO_QUALIFIED_CLASS, decision: nq.decision, probationCandidates: nq.probationCandidates, run: nqRun.outcome, reason: nqRun.reason } };
  } else facts.J = { executed: true, liveProbe: false, reason: live.reason || "registry missing" };
  timings.IJ = Date.now() - t;

  // ======== aggregate per-scenario facts ========
  facts.B = { executed: true, perRound: roundFacts.map((r) => r.B) };
  facts.C = { executed: true, perRound: roundFacts.map((r) => r.C), contrast };
  facts.D = { executed: true, perTick: roundFacts.flatMap((r) => r.D) };
  const allAgents = roundFacts.flatMap((r) => r.E.flatMap((e: any) => e.assignModes));
  facts.E = { executed: true, mode: allAgents.length && allAgents.every((m: string) => m === "repo") ? "repo" : "heartbeatOnly", assignModes: allAgents, repoModeOutcome, repoProbe, staleMs: STALE_MS, perTick: roundFacts.flatMap((r) => r.E) };
  facts.F = { executed: true, perRound: roundFacts.map((r) => r.F) };
  facts.G = { executed: true, perRound: roundFacts.map((r) => r.G), claimVariant };
  facts.H = roundFacts.every((r) => r.H) ? { executed: true, perRound: roundFacts.map((r) => r.H), selfRefused: roundFacts.every((r) => /^REFUSED: inspector is the owner/.test(r.H.self)), parentRefused: roundFacts.every((r) => /^REFUSED: inspector is the owner\/parent/.test(r.H.parent)), distinctAccepted: roundFacts.every((r) => /^CLOSED_/.test(r.H.distinct)), identityBound: false } : { executed: false, reason: "no completed child to inspect" };
  facts.K = { executed: true, perRound: roundFacts.map((r) => r.K) };

  // ======== L: checkpoint + Truth Lock ========
  t = Date.now();
  const hist = cp.spawnSync("bash", [path.join(os.homedir(), "odg-preservation", "verify-historical.sh")], { encoding: "utf8" });
  const line = String(hist.stdout || "").trim().split("\n").filter((l: string) => /^verified=/.test(l)).pop() || `exit ${hist.status}`;
  const num = (k: string) => { const m = line.match(new RegExp(k + "=(\\d+)")); return m ? Number(m[1]) : null; };
  const originRoadmap = cp.spawnSync("git", ["show", "origin/main:" + ROADMAP], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).stdout;
  const wtRoadmap = fs.readFileSync(path.join(ROOT, ROADMAP));
  let mainRoadmap: any = null; try { mainRoadmap = fs.readFileSync(path.join(MAIN_REPO, ROADMAP)); } catch { mainRoadmap = null; }
  const mb = git(["rev-parse", "--abbrev-ref", "HEAD"], MAIN_REPO), mu = git(["rev-parse", "--abbrev-ref", "@{u}"], MAIN_REPO), ms = git(["status", "--porcelain"], MAIN_REPO);
  facts.L = { executed: true, historical: { line, exitCode: hist.status, verified: num("verified"), missing: num("missing"), changed: num("changed") },
    roadmap: { origin: sha256(originRoadmap), worktree: sha256(wtRoadmap), mainCheckout: mainRoadmap ? sha256(mainRoadmap) : null },
    roadmapUnchanged: sha256(originRoadmap) === sha256(wtRoadmap) && (!mainRoadmap || sha256(mainRoadmap) === sha256(originRoadmap)) && git(["diff", "--quiet", "origin/main", "--", ROADMAP]) !== null,
    mainCheckout: { ok: mb === "main" && mu === "origin/main" && ms === "", detail: `branch=${mb} upstream=${mu} dirty=${ms ? ms.split("\n").length : 0}`, head: git(["rev-parse", "HEAD"], MAIN_REPO) },
    evidenceWritable: !flag("no-write") };
  timings.L = Date.now() - t;
  if (flag("no-write")) { facts.L.executed = false; facts.L.reason = "--no-write"; }

  const scenarios: any = {};
  for (const id of SCENARIOS) scenarios[id] = { ...classifyScenario(id, facts[id]), facts: facts[id] };
  const tally: any = {}; for (const id of SCENARIOS) tally[scenarios[id].verdict] = (tally[scenarios[id].verdict] || 0) + 1;
  const evidence = {
    schema: "odg.evidence.v1", id: "V155_TRANSVERSAL_VALIDATION", directive: "CTO V15.5 Step 6 — transversal validation (scenarios A–L)",
    recordedAt: new Date().toISOString(), provider: "Claude Code (TECHNICAL_PROVIDER_ONLY) - not an authority; acceptance belongs to ODG governance / owner",
    base: { head: git(["rev-parse", "HEAD"]), originMain: git(["rev-parse", "origin/main"]), branch: git(["rev-parse", "--abbrev-ref", "HEAD"]), worktree: "linked git worktree (node_modules symlinked read-only from the main repo; dist built in-worktree)", mainRepo: MAIN_REPO },
    environment: { node: process.version, cpus: os.cpus().length, loadavgStart: os.loadavg().map((x: number) => Math.round(x * 100) / 100), truthLock: "ODG_TRUTH_LOCK_ENFORCE=0 process-scoped for sandbox ticks (the enforced launcher refuses any branch != main — measured in A)", state: "the worktree's OWN gitignored runtime/generated, reset before A, before each round and before the claim variant; the main repo's runtime/generated and runtime/dist were never written", ollama: available ? `loopback 127.0.0.1:11434 models=${available.join(",")}` : "not reachable" },
    parameters: { rounds, waveMax, killAfterMs, missions, staleMs: STALE_MS, renewMs: RENEW_MS, absentModel: ABSENT_MODEL, noQualifiedClass: NO_QUALIFIED_CLASS },
    commands, timingsMs: { ...timings, total: Date.now() - tStart },
    verdictRules: "classifyScenario (runtime/bin/odg-v155-transversal-validation.ts) — PURE; re-derived from facts by the test. injected fake ⇒ SIMULATED; partial coverage ⇒ PARTIAL; never inflated",
    tally, scenarios, rounds: roundFacts.map((r) => ({ round: r.round, ticks: r.ticks })),
  };
  if (!flag("no-write")) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n"); log("wrote " + rel(out)); }
  for (const id of SCENARIOS) log(`${id}: ${scenarios[id].verdict} — ${scenarios[id].reasons.join("; ").slice(0, 220)}`);
  process.stdout.write(JSON.stringify({ tally, verdicts: Object.fromEntries(SCENARIOS.map((id) => [id, scenarios[id].verdict])) }) + "\n");
  return 0;
}

module.exports = { VERDICTS, SCENARIOS, DEFAULT_MISSIONS, ABSENT_MODEL, NO_QUALIFIED_CLASS, SHARED_ALLOWED, covers, intervalsOverlap, ledgerPerId, sharedWriteViolations, isLinkedWorktree, classifyScenario };
if (require.main === module) {
  main().then((code) => process.exit(code), (e) => { process.stderr.write(String((e && e.stack) || e) + "\n"); process.exit(1); });
}
export {};
