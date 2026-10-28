#!/usr/bin/env node
/**
 * repair-workflow — V46 §4/§5: the first REAL end-to-end, bounded, isolated, acceptance-gated code-change loop.
 *
 * This is the EXECUTOR-level harness the mandate calls for: it reproduces a failure, applies a BOUNDED change
 * inside an ISOLATED workspace, runs the REAL toolchain/tests, INDEPENDENTLY verifies PRE-DECLARED acceptance
 * criteria, and ROLLS BACK (leaving the workspace exactly as found) on anything short of acceptance. It makes
 * ACTUAL code changes — not a syntax check — and only ACCEPTS when a predeclared acceptance command that FAILED
 * at baseline PASSES after the change, with no regression.
 *
 * It COMPOSES existing runtime pieces (no new orchestrator / no new primitive):
 *   - local-fixers        — the pure deterministic transform registry (change source: "fixers")
 *   - code-execution      — its bounded argv-array runner (defaultRunner) is reused for acceptance execution
 * Change sources, honestly distinguished (mandate §4 "do not disguise templates as general code-gen"):
 *   - "edits"      — caller-supplied full-file replacements        (DETERMINISTIC; models any codegen output)
 *   - "fixers"     — named local-fixers transforms over targets    (DETERMINISTIC)
 *   - "generative" — a model-produced change via provider-sandbox  (PROVIDER-DEPENDENT; BLOCKED unless an
 *                    authorized ODG_LOCAL_MODEL_CMD is configured — never faked)
 *
 * SAFETY: operates ONLY on the caller-provided workspaceDir (never the live repo); snapshots it (fs.cpSync) for
 * exact rollback; a change touching any path OUTSIDE the authorized writeSet is REJECTED before apply AND the
 * post-apply diff is re-checked (defense in depth); acceptance runs via argv array (no shell), timeout, output
 * cap, minimal env, no network; bounded attempts (no unbounded retry); any thrown error ⇒ rollback. Fail-closed.
 *
 * Outcomes: ACCEPTED | ABSTAINED | REJECTED | BLOCKED | NO_REPAIR_NEEDED | INVALID_INPUT.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const EXEC = require("./code-execution.js");   // reuse the bounded argv-array runner (no shell, timeout, caps)
const FIXERS = require("./local-fixers.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function truncate(s: any, n = 1200): string { const str = String(s == null ? "" : s); return str.length > n ? str.slice(0, n) + "…[truncated]" : str; }

/** Run the predeclared acceptance command (argv array) inside the workspace; classify PASS/FAIL/BLOCKED. */
function runAcceptance(workspaceDir: string, command: string[], runner: Function, timeoutMs: number): any {
  if (!Array.isArray(command) || command.length === 0 || command.some((c) => typeof c !== "string")) {
    return { status: "BLOCKED", reason: "acceptance.command must be a non-empty string[] (argv array, no shell)" };
  }
  const [bin, ...args] = command;
  const r = runner(bin, args, { cwd: workspaceDir, timeoutMs, maxBytes: 4_000_000 });
  if (!r || r.spawnError) return { status: "BLOCKED", reason: `acceptance spawn error: ${r && r.spawnError}` };
  if (r.timedOut) return { status: "BLOCKED", reason: "acceptance command timed out" };
  const passed = r.exitCode === 0;
  return { status: passed ? "PASS" : "FAIL", exitCode: r.exitCode, output: truncate(String(r.stdout || "") + String(r.stderr || "")) };
}

/** Normalize a writeSet to repo-relative prefixes; returns a predicate "is rel path authorized?". */
function makeWriteSetGuard(writeSet: any): (rel: string) => boolean {
  const prefixes = (Array.isArray(writeSet) ? writeSet : [])
    .filter((p) => typeof p === "string" && p.length > 0)
    .map((p) => path.normalize(p).replace(/\/+$/, ""));
  return (rel: string): boolean => {
    const norm = path.normalize(rel);
    if (norm.startsWith("..") || path.isAbsolute(norm)) return false;        // never escape the workspace
    return prefixes.some((pre) => norm === pre || norm.startsWith(pre + path.sep) || pre === ".");
  };
}

/** Resolve the change source into a concrete {targets, write(workspaceDir)} plan, or a BLOCKED/REJECTED verdict. */
function resolveChange(change: any, authorized: (rel: string) => boolean): any {
  if (!isObj(change) || typeof change.source !== "string") {
    return { verdict: { status: "INVALID_INPUT", reason: "change.source required" } };
  }
  if (change.source === "generative") {
    // Provider-dependent. Honestly BLOCKED unless an authorized sandboxed model command is configured.
    const cmd = process.env.ODG_LOCAL_MODEL_CMD;
    if (!cmd) {
      return { verdict: {
        status: "BLOCKED",
        reason: "generative change source requires an authorized local-model provider (ODG_LOCAL_MODEL_CMD is unset) — execution not faked",
        unblock: "configure + authorize a sandboxed local-model command (runtime/core/provider-sandbox); owner approval required before activation",
      } };
    }
    // Even when configured, model invocation is out of this lot's scope — surface as a declared seam, not a fake apply.
    return { verdict: { status: "BLOCKED", reason: "generative provider configured but model-invocation integration is not implemented in this lot", unblock: "implement provider-sandbox→proposal→edits adapter (next lot)" } };
  }
  if (change.source === "edits") {
    const edits = Array.isArray(change.edits) ? change.edits : [];
    if (edits.length === 0) return { verdict: { status: "INVALID_INPUT", reason: "change.edits[] required for source=edits" } };
    const targets: string[] = [];
    for (const e of edits) {
      if (!isObj(e) || typeof e.path !== "string" || typeof e.content !== "string") {
        return { verdict: { status: "INVALID_INPUT", reason: "each edit needs { path:string, content:string }" } };
      }
      if (!authorized(e.path)) return { verdict: { status: "REJECTED", reason: `edit target '${e.path}' is outside the authorized writeSet`, code: "WRITE_SET_VIOLATION" } };
      targets.push(path.normalize(e.path));
    }
    return { targets, write: (ws: string) => {
      for (const e of edits) {
        const abs = path.join(ws, path.normalize(e.path));
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, e.content);
      }
    } };
  }
  if (change.source === "fixers") {
    const fixerTargets = Array.isArray(change.targets) ? change.targets : [];
    const names = Array.isArray(change.fixers) ? change.fixers : [];
    if (fixerTargets.length === 0 || names.length === 0) return { verdict: { status: "INVALID_INPUT", reason: "change.targets[] and change.fixers[] required for source=fixers" } };
    const known = new Set(FIXERS.names());
    for (const n of names) if (!known.has(n)) return { verdict: { status: "INVALID_INPUT", reason: `unknown fixer: ${n}` } };
    for (const t of fixerTargets) if (!authorized(t)) return { verdict: { status: "REJECTED", reason: `fixer target '${t}' is outside the authorized writeSet`, code: "WRITE_SET_VIOLATION" } };
    return { targets: fixerTargets.map((t: string) => path.normalize(t)), write: (ws: string) => {
      for (const t of fixerTargets) {
        const abs = path.join(ws, path.normalize(t));
        const before = fs.readFileSync(abs, "utf8");
        const after = FIXERS.run(before, names);
        if (after !== before) fs.writeFileSync(abs, after);
      }
    } };
  }
  return { verdict: { status: "INVALID_INPUT", reason: `unknown change.source '${change.source}'` } };
}

/**
 * runRepairWorkflow(task, opts?): the bounded, isolated, acceptance-gated repair loop.
 * task = { workspaceDir, acceptance:{command:string[], timeoutMs?}, writeSet:string[], change:{source,...} }
 * opts.runner (injectable) defaults to code-execution's bounded argv runner. Returns a reproducible evidence record.
 */
function runRepairWorkflow(task: any, opts: any = {}): any {
  if (!isObj(task)) return { ok: false, status: "INVALID_INPUT", reason: "task object required" };
  const workspaceDir = task.workspaceDir;
  if (typeof workspaceDir !== "string" || !fs.existsSync(workspaceDir) || !fs.statSync(workspaceDir).isDirectory()) {
    return { ok: false, status: "INVALID_INPUT", reason: "task.workspaceDir must be an existing directory (isolated workspace)" };
  }
  const acceptance = isObj(task.acceptance) ? task.acceptance : {};
  if (!Array.isArray(acceptance.command)) return { ok: false, status: "INVALID_INPUT", reason: "task.acceptance.command (string[]) required — the PRE-DECLARED acceptance criterion" };
  const runner = typeof opts.runner === "function" ? opts.runner : EXEC.defaultRunner;
  const timeoutMs = Number(acceptance.timeoutMs) > 0 ? Number(acceptance.timeoutMs) : 30000;
  const authorized = makeWriteSetGuard(task.writeSet);

  // Resolve the change FIRST (fail-closed on write-set/provider before touching anything).
  const resolved = resolveChange(task.change, authorized);
  if (resolved.verdict) return { ok: resolved.verdict.status !== "INVALID_INPUT", ...resolved.verdict, acceptanceCommand: acceptance.command };

  // Snapshot the workspace for exact rollback.
  const snapshot = workspaceDir.replace(/\/+$/, "") + ".snapshot-" + path.basename(workspaceDir);
  const changed: string[] = [];
  let baseline: any = null, post: any = null, applied = false;
  try {
    fs.rmSync(snapshot, { recursive: true, force: true });
    fs.cpSync(workspaceDir, snapshot, { recursive: true });

    // 1) Reproduce the baseline (reproduce-before-modify). A repair target must FAIL at baseline.
    baseline = runAcceptance(workspaceDir, acceptance.command, runner, timeoutMs);
    if (baseline.status === "BLOCKED") return finalize("BLOCKED", `baseline acceptance could not run: ${baseline.reason}`);
    if (baseline.status === "PASS") return finalize("NO_REPAIR_NEEDED", "acceptance already passes at baseline — no change applied");

    // 2) Apply the bounded change inside the workspace only.
    const beforeSet = fileHashes(workspaceDir, resolved.targets);
    resolved.write(workspaceDir);
    applied = true;

    // 3) Diff inspection (defense in depth): nothing outside the authorized write-set may have changed.
    const afterSet = fileHashes(workspaceDir, resolved.targets);
    for (const t of resolved.targets) if (beforeSet[t] !== afterSet[t]) changed.push(t);
    const strayed = scanForStrayChanges(workspaceDir, snapshot, authorized);
    if (strayed) return finalize("REJECTED", `change touched a path outside the writeSet: ${strayed}`, "WRITE_SET_VIOLATION");

    // 4) Independently verify the PRE-DECLARED acceptance criterion.
    post = runAcceptance(workspaceDir, acceptance.command, runner, timeoutMs);
    if (post.status === "PASS") return finalize("ACCEPTED", "baseline FAILED → acceptance PASSES after bounded change; no stray edits", null, /*keep*/ true);
    return finalize("ABSTAINED", `change did not satisfy acceptance (post status ${post.status}) — rolled back`);
  } catch (e: any) {
    return finalize("BLOCKED", `workflow error: ${(e && e.message) || e}`);
  }

  function finalize(status: string, reason: string, code?: any, keep?: boolean): any {
    // ACCEPTED keeps the workspace changed; everything else rolls it back to the snapshot exactly.
    try {
      if (!keep && applied && fs.existsSync(snapshot)) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
        fs.cpSync(snapshot, workspaceDir, { recursive: true });
      }
    } catch { /* leave snapshot in place for forensic recovery */ }
    try { fs.rmSync(snapshot, { recursive: true, force: true }); } catch { /* best effort */ }
    const rec: any = {
      ok: status === "ACCEPTED" || status === "NO_REPAIR_NEEDED",
      status, reason,
      acceptanceCommand: acceptance.command,
      changeSource: task.change && task.change.source,
      baseline: baseline ? { status: baseline.status, exitCode: baseline.exitCode } : null,
      post: post ? { status: post.status, exitCode: post.exitCode } : null,
      changedFiles: status === "ACCEPTED" ? changed : [],
      rolledBack: !keep && applied,
      note: "A repair is ACCEPTED only when a PRE-DECLARED acceptance command that FAILED at baseline PASSES after a BOUNDED change with no stray edits. Change sources are honestly typed (edits/fixers=deterministic; generative=provider-dependent, BLOCKED unless authorized). This is a real code-change loop, not synthesis of arbitrary programs.",
    };
    if (code) rec.code = code;
    return rec;
  }
}

/** sha1-free content hash (length+content) of each target relative path, for change detection. */
function fileHashes(root: string, targets: string[]): Record<string, string> {
  const crypto = require("crypto");
  const out: Record<string, string> = {};
  for (const t of targets) {
    const abs = path.join(root, t);
    try { out[t] = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex"); }
    catch { out[t] = "<absent>"; }
  }
  return out;
}

/** Walk the workspace vs its snapshot; return the first changed/added path NOT authorized by the write-set, else null. */
function scanForStrayChanges(workspaceDir: string, snapshot: string, authorized: (rel: string) => boolean): string | null {
  const crypto = require("crypto");
  function walk(dir: string, acc: string[]): string[] {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.isDirectory()) walk(abs, acc);
      else acc.push(path.relative(workspaceDir, abs));
    }
    return acc;
  }
  const files = walk(workspaceDir, []);
  for (const rel of files) {
    const cur = path.join(workspaceDir, rel);
    const snap = path.join(snapshot, rel);
    let same = false;
    try {
      if (fs.existsSync(snap)) {
        same = crypto.createHash("sha256").update(fs.readFileSync(cur)).digest("hex")
             === crypto.createHash("sha256").update(fs.readFileSync(snap)).digest("hex");
      }
    } catch { same = false; }
    if (!same && !authorized(rel)) return rel;
  }
  return null;
}

export { runRepairWorkflow, runAcceptance, resolveChange, makeWriteSetGuard };
module.exports = { runRepairWorkflow, runAcceptance, resolveChange, makeWriteSetGuard };
