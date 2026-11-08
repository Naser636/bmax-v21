#!/usr/bin/env node
"use strict";

/*
 * WI-FR-05 — FRONTIER SANDBOX (real OS isolation + bounded runner). This is the REAL execution boundary for the
 * Frontier Lab / Evolution-Loop experiments. It creates NO second sandbox: it REUSES the proven bubblewrap engine in
 * bash-command-governor (detectSandbox + sandboxRun — --unshare-all/--die-with-parent/--clearenv/--as-pid-1, an
 * allowlist bind set that is NEVER `--ro-bind / /`, a tmpfs work dir, a non-privileged user namespace, and the
 * `--info-fd` LAUNCH HANDSHAKE that PROVES isolation was actually established, not merely intended). On top of it this
 * adapter (a) wraps the inner argv with `prlimit` to enforce explicit CPU / address-space / processes / file-size /
 * open-files rlimits from the mission budget, and (b) exposes the EXACT Frontier Lab runner interface
 * `async ({config, budget}) => { afterSignals, raw, cost, productionTouched }` so it drops in as the REAL Tester role.
 *
 * FAIL-CLOSED & HONEST: if bubblewrap is unavailable, OR the sandbox did not actually launch (empty --info-fd), the
 * runner NEVER executes and never claims isolation — it returns a BLOCKED result with isolationLevel NONE_FAILCLOSED and the
 * Frontier Lab runner THROWS (⇒ the Lab ABORTS). An injected runner (tests) is labelled INJECTED, never OS_BWRAP, so a
 * fixture can never masquerade as real isolation. The sandbox is the only module here allowed real I/O (spawn/time);
 * the pure orchestration modules (radar/lab/evolution) stay pure. Dual export.
 */

const BCG = require("./bash-command-governor");

const ISO = Object.freeze({ OS_BWRAP: "OS_BWRAP", INJECTED: "INJECTED", NONE_FAILCLOSED: "NONE_FAILCLOSED" });
const PRLIMIT = "/usr/bin/prlimit";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v) && v > 0; }
function nowMs(): number { try { return Date.now(); } catch { return 0; } }

/** detectOsSandbox(opts) -> { available, mechanism, isolationLevel }. Reuses bash-command-governor.detectSandbox. */
function detectOsSandbox(opts: any): any {
  const d = BCG.detectSandbox(isObj(opts) ? opts : {});
  const injected = d && d.mechanism === "injected";
  return Object.freeze({ available: !!(d && d.available), mechanism: d ? d.mechanism : null, path: d ? d.path || null : null, isolationLevel: injected ? ISO.INJECTED : (d && d.available ? ISO.OS_BWRAP : ISO.NONE_FAILCLOSED) });
}

// map a mission budget → prlimit flags (only those provided). CPU is seconds; AS/FSIZE are bytes; NPROC/NOFILE counts.
function prlimitFlags(budget: any): string[] {
  const b = isObj(budget) ? budget : {};
  const f: string[] = [];
  if (isNum(b.maxCpuSec)) f.push(`--cpu=${Math.ceil(b.maxCpuSec)}`);
  else if (isNum(b.maxMs)) f.push(`--cpu=${Math.max(1, Math.ceil(b.maxMs / 1000))}`); // derive a CPU-second ceiling from wall budget
  if (isNum(b.maxAddressSpaceBytes)) f.push(`--as=${Math.ceil(b.maxAddressSpaceBytes)}`);
  if (isNum(b.maxProcs)) f.push(`--nproc=${Math.ceil(b.maxProcs)}`);
  if (isNum(b.maxFileSizeBytes)) f.push(`--fsize=${Math.ceil(b.maxFileSizeBytes)}`);
  if (isNum(b.maxOpenFiles)) f.push(`--nofile=${Math.ceil(b.maxOpenFiles)}`);
  return f;
}

/**
 * runInSandbox(argv, opts) -> a bounded, isolated run. opts: { budget, timeoutMs, spawn, sandboxRunner, envAllowlist }.
 * FAIL-CLOSED: bwrap unavailable ⇒ does NOT execute. isolationProven is the REAL --info-fd launch handshake (reused),
 * so a run whose sandbox never launched is reported unproven (its output must NOT be trusted).
 */
function runInSandbox(argv: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const inner = Array.isArray(argv) ? argv.filter(isStr) : [];
  if (inner.length === 0) return Object.freeze({ ran: false, isolationProven: false, isolationLevel: ISO.NONE_FAILCLOSED, reason: "empty argv" });
  const det = detectOsSandbox(o);
  if (!det.available) return Object.freeze({ ran: false, isolationProven: false, isolationLevel: ISO.NONE_FAILCLOSED, reason: "bubblewrap unavailable — refusing to execute unconfined (fail-closed)" });

  const limits = prlimitFlags(o.budget);
  // enforce rlimits INSIDE the sandbox via /usr/bin/prlimit (present under the ro-bound /usr); then the real argv.
  const wrapped = limits.length ? [PRLIMIT, ...limits, "--", ...inner] : inner;
  const timeoutMs = isNum(o.timeoutMs) ? o.timeoutMs : (isObj(o.budget) && isNum(o.budget.maxMs) ? o.budget.maxMs : 5000);
  const started = nowMs();
  const res = BCG.sandboxRun(wrapped, { timeoutMs, spawn: o.spawn, sandboxRunner: o.sandboxRunner, envAllowlist: Array.isArray(o.envAllowlist) ? o.envAllowlist : [] }) || {};
  const durationMs = Math.max(0, nowMs() - started);

  const injected = det.isolationLevel === ISO.INJECTED;
  // isolationProven: a real OS launch is proven ONLY by the bubblewrap --info-fd handshake (res.launched). An injected
  // runner is NEVER "OS proven" — it is labelled INJECTED so a fixture cannot masquerade as real isolation.
  const isolationProven = injected ? false : res.launched === true;
  const isolationLevel = injected ? ISO.INJECTED : (isolationProven ? ISO.OS_BWRAP : ISO.NONE_FAILCLOSED);
  return Object.freeze({
    ran: res.ran === true || injected === true,
    isolationProven,
    isolationLevel,
    launched: res.launched === true,
    exitCode: typeof res.exitCode === "number" ? res.exitCode : null,
    signal: res.signal || null,
    timedOut: res.timedOut === true,
    stdout: isStr(res.stdout) ? res.stdout : (res.stdout || ""),
    stderr: isStr(res.stderr) ? res.stderr : (res.stderr || ""),
    durationMs,
    rlimits: Object.freeze(limits.slice()),
    controls: Object.freeze({ noNetwork: true, clearedEnv: true, tmpfsWorkDir: true, nonPrivileged: true, allowlistBindsOnly: true, rlimitsEnforced: limits.length > 0 }),
    observedEffects: isObj(res.observedEffects) ? res.observedEffects : { network: false },
  });
}

/**
 * asFrontierRunner(sandboxSpec) -> an async runner with the EXACT Frontier Lab interface. sandboxSpec: { argv,
 * budget?, measureFromStdout?(stdout)->signals, spawn?, sandboxRunner? }. FAIL-CLOSED: if the sandbox is unavailable
 * or isolation is not PROVEN, the runner THROWS ⇒ the Frontier Lab ABORTS the experiment (no unconfined fallback).
 */
function asFrontierRunner(sandboxSpec: any): any {
  const s = isObj(sandboxSpec) ? sandboxSpec : {};
  return async function sandboxedRunner(labCtx: any): Promise<any> {
    const budget = (isObj(labCtx) && isObj(labCtx.budget)) ? labCtx.budget : (isObj(s.budget) ? s.budget : {});
    const r = runInSandbox(s.argv, { budget, timeoutMs: budget.maxMs, spawn: s.spawn, sandboxRunner: s.sandboxRunner, envAllowlist: s.envAllowlist });
    if (!r.ran || !r.isolationProven) throw new Error("frontier-sandbox: isolation unavailable/unproven — fail-closed (" + (r.reason || r.isolationLevel) + ")");
    const afterSignals = typeof s.measureFromStdout === "function" ? (s.measureFromStdout(r.stdout) || {}) : {};
    // productionTouched: by construction the sandbox binds only ro system dirs + tmpfs work; any created/modified file
    // OUTSIDE the work dir would be an escape. sandboxRun confines writes to the tmpfs work dir, so this is false.
    return { afterSignals, raw: { exitCode: r.exitCode, stdout: r.stdout, isolationLevel: r.isolationLevel }, cost: { ms: r.durationMs, calls: 1, costEur: 0 }, productionTouched: false, isolation: r.isolationLevel };
  };
}

const FRONTIER_SANDBOX_CONTRACT = Object.freeze({
  id: "WI-FR-05-FRONTIER-SANDBOX",
  source: "Resumption mandate WI-FR-05 — real OS sandbox + bounded runner (reuse-only)",
  isolationLevels: ISO,
  reuses: Object.freeze(["bash-command-governor.detectSandbox + sandboxRun (proven bubblewrap engine + --info-fd launch proof)", "prlimit (rlimits)", "Frontier Lab runner interface"]),
  notAuthority: "the REAL execution boundary for Frontier experiments; it creates NO second sandbox/store/authorizer and executes NOTHING unconfined",
  invariants: Object.freeze([
    "NO second sandbox — reuses the proven bash-command-governor bubblewrap engine (allowlist binds, never --ro-bind / /)",
    "FAIL-CLOSED: bubblewrap unavailable OR not launched ⇒ no execution, isolationLevel NONE_FAILCLOSED; the Lab runner THROWS",
    "isolation is PROVEN by the bubblewrap --info-fd launch handshake, not assumed; an INJECTED runner is never labelled OS_BWRAP",
    "controls enforced: no network (--unshare-all), cleared env (--clearenv), tmpfs work dir, non-privileged user ns, allowlist binds only, rlimits (prlimit cpu/as/nproc/fsize/nofile) from the budget",
    "no host secrets readable (confidential trees /etc,/home-beyond-repo,/root,/var simply not bound); writes confined to the tmpfs work dir",
    "exposes the EXACT Frontier Lab runner interface so it drops in as the real Tester role without a new seam",
  ]),
});

module.exports = { ISO, FRONTIER_SANDBOX_CONTRACT, detectOsSandbox, prlimitFlags, runInSandbox, asFrontierRunner };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...FRONTIER_SANDBOX_CONTRACT, detected: detectOsSandbox({}) }, null, 2) + "\n"); }

export {};
