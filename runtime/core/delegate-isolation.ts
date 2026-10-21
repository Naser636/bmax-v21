#!/usr/bin/env node

/*
 * Delegate Isolation — EXPERIMENTAL provider isolation for `odg delegate` (PROVIDER_ISOLATION_E1_E4).
 *
 * The historical Delegate flow hands the provider the WHOLE working tree and trusts an after-the-fact
 * scope-conformance check (odg-delegate CM-1). This module adds an OPT-IN, FAIL-CLOSED alternative that
 * confines the provider to a disposable working COPY of ONLY the authorized files, inside a bubblewrap
 * sandbox with NO access to the real repository, its .git, the Docker socket, host secrets, or the
 * network. The provider's output is observed as a DIFF; ODG validates every changed path against the
 * EXACT write-set and refuses any out-of-scope file before anything may be applied to the real repo.
 *
 *   E1  materialize a working copy of ONLY the authorized files; run the provider in a bwrap sandbox
 *       bound to that copy alone (reusing the proven provider-sandbox bwrap argv — --unshare-all so no
 *       network, --clearenv so no secrets, never --ro-bind / / so the real repo/.git/docker are absent).
 *   E2  the provider never writes the real repo; its effect is read back as a diff of the working copy.
 *   E3  ODG validates the diff against the exact write-set; any out-of-scope file ⇒ the WHOLE proposal
 *       is refused (atomic); only a fully in-scope proposal may be applied to the real repo.
 *   E4  negative tests (delegate-isolation.test.ts) prove the restrictions on a disposable repo.
 *
 * FAIL-CLOSED everywhere: sandbox unavailable, launch not observed via the --info-fd handshake, a
 * boundary/glob write-set (not enumerable without the real repo), a path escaping the root, or an
 * out-of-scope change all REFUSE. There is NEVER a silent fallback to unisolated execution.
 *
 * Pure, injectable logic (resolveWriteSet / diffWorkingCopy / validateScope) is separated from the I/O
 * so it is unit-testable without a repo, and `opts.spawn` injects the launcher so the orchestration is
 * testable without real bwrap. This module does NOT modify provider-sandbox (η3-B124), the governance
 * kernel, or any policy; it only reuses provider-sandbox.buildBwrapArgs/parseCommand.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const sandbox: any = require("./provider-sandbox"); // reuse buildBwrapArgs/parseCommand (shared isolation substrate)
const bashGov: any = require("./bash-command-governor"); // reuse detectSandbox (observed bwrap availability)

// A write-set entry usable for isolation must name a CONCRETE file. Boundary globs (`runtime/**`) and
// directory prefixes cannot be enumerated without scanning the real repo — which the isolated path must
// NOT do — so they are REFUSED here (fail-closed), not silently expanded.
function isBoundary(p: string): boolean {
  return p.includes("*") || p.includes("?") || p.endsWith("/");
}

// Resolve the write-set to concrete, in-root, existing relative file paths. Fail-closed on a glob/
// boundary entry, a path escaping the root, or a missing file.
function resolveWriteSet(root: any, writeSet: any): any {
  if (typeof root !== "string" || !root) return { ok: false, error: "no root declared" };
  const list = Array.isArray(writeSet) ? writeSet : [];
  if (!list.length) return { ok: false, error: "empty write-set: isolation requires an explicit, concrete file list" };
  const files: string[] = [];
  const realRoot = path.resolve(root);
  for (const raw of list) {
    if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: `invalid write-set entry: ${JSON.stringify(raw)}` };
    const entry = raw.trim();
    if (isBoundary(entry)) {
      return { ok: false, error: `write-set entry '${entry}' is a glob/boundary; the isolated path requires concrete files (fail-closed)` };
    }
    const abs = path.resolve(realRoot, entry);
    const rel = path.relative(realRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return { ok: false, error: `write-set entry '${entry}' escapes the repository root` };
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return { ok: false, error: `write-set entry '${entry}' is not an existing file` };
    }
    files.push(rel.split(path.sep).join("/"));
  }
  return { ok: true, files: [...new Set(files)].sort() };
}

// Copy ONLY the authorized files into a fresh disposable work dir and snapshot their pristine content.
// The work dir is NOT a git repo (no .git is copied) and contains nothing else from the real tree.
function materializeWorkingCopy(root: any, files: any, io: any): any {
  const _io = io || fs;
  const realRoot = path.resolve(root);
  const workDir = (_io.mkdtempSync || fs.mkdtempSync)(path.join(os.tmpdir(), "odg-deleg-iso-"));
  const pristine: Record<string, string> = {};
  for (const rel of files) {
    const src = path.join(realRoot, rel);
    const dst = path.join(workDir, rel);
    (_io.mkdirSync || fs.mkdirSync)(path.dirname(dst), { recursive: true });
    const content = (_io.readFileSync || fs.readFileSync)(src, "utf8");
    (_io.writeFileSync || fs.writeFileSync)(dst, content);
    pristine[rel] = content;
  }
  return { workDir, pristine };
}

// Build the bwrap argv for an isolated provider run. Delegates to the proven provider-sandbox builder,
// binding the materialized work copy as the ONLY writable mount. The real repo/.git/docker/secrets are
// never passed, and --unshare-all (no net) + --clearenv (no secrets) come from provider-sandbox.
function buildIsolatedArgs(workDir: any, providerArgv: any): string[] {
  return sandbox.buildBwrapArgs({
    argv: providerArgv,
    work: "/tmp/work",
    realWork: workDir,
  });
}

// Recursively list relative file paths under a dir (POSIX-normalized). Pure over the injected reader.
function listFilesRel(dir: string, io: any): string[] {
  const _io = io || fs;
  const out: string[] = [];
  const walk = (abs: string, rel: string) => {
    let ents;
    try { ents = (_io.readdirSync || fs.readdirSync)(abs, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const childAbs = path.join(abs, e.name);
      const childRel = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) walk(childAbs, childRel);
      else if (e.isFile()) out.push(childRel);
    }
  };
  walk(dir, "");
  return out.sort();
}

// Observe the provider's effect as a set of file changes between the pristine snapshot and the work dir.
// kind ∈ {added, modified, deleted}. Pure over the injected content snapshot + reader.
function diffWorkingCopy(pristine: any, workDir: any, io: any): any[] {
  const _io = io || fs;
  const changes: any[] = [];
  const now = new Set(listFilesRel(workDir, _io));
  const before = new Set(Object.keys(pristine || {}));
  for (const rel of now) {
    const after = (_io.readFileSync || fs.readFileSync)(path.join(workDir, rel), "utf8");
    if (!before.has(rel)) changes.push({ rel, kind: "added", before: null, after });
    else if (after !== pristine[rel]) changes.push({ rel, kind: "modified", before: pristine[rel], after });
  }
  for (const rel of before) {
    if (!now.has(rel)) changes.push({ rel, kind: "deleted", before: pristine[rel], after: null });
  }
  return changes.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

// Validate every change against the EXACT write-set. A change to a path not in the authorized file set
// is out of scope. ADDED files are in scope ONLY if their path was explicitly authorized. Default-deny.
function validateScope(changes: any, writeSetFiles: any): any {
  const authorized = new Set(Array.isArray(writeSetFiles) ? writeSetFiles : []);
  const outOfScope = (Array.isArray(changes) ? changes : [])
    .filter((c: any) => !authorized.has(c.rel))
    .map((c: any) => c.rel);
  return outOfScope.length === 0
    ? { ok: true, detail: `all ${Array.isArray(changes) ? changes.length : 0} change(s) within the authorized write-set` }
    : { ok: false, detail: `out-of-scope change(s): ${outOfScope.join(", ")}`, outOfScope };
}

// Apply a FULLY-validated proposal to the real repo. Re-validates (defense in depth) and refuses to
// write anything if ANY change is out of scope (atomic: mixed authorized/forbidden ⇒ nothing applied).
function applyProposal(root: any, changes: any, writeSetFiles: any, io: any, opts?: any): any {
  const _io = io || fs;
  const scope = validateScope(changes, writeSetFiles);
  if (!scope.ok) return { ok: false, applied: [], refused: true, reason: `refusing to apply out-of-scope proposal — ${scope.detail}` };
  // IDENTITY PRE-WRITE GATE (opt-in) — before mutating the REAL tree, the canonical Truth-Lock repo-safety
  // policy must hold when enforcement is enabled. Covers the delegate-isolation write path (a mutation that
  // bypasses resolve()). Does NOT replace validateScope/scopeClean (both still run). Opt-in via
  // ODG_TRUTH_LOCK_ENFORCE (or opts.enforce) ⇒ default no-op/byte-identical; git facts read in `root` via an
  // injectable seam (opts.gitExec for tests). A refusal returns the existing refusal shape BEFORE any write
  // (atomic — no residual effect). Reuses the gate — no second policy.
  const enforce = (opts && opts.enforce === true) || process.env.ODG_TRUTH_LOCK_ENFORCE === "1" || process.env.ODG_TRUTH_LOCK_ENFORCE === "true";
  if (enforce && Array.isArray(changes) && changes.length > 0) {
    const { truthLockGate } = require("./truth-lock-gate");
    const exec = (opts && typeof opts.gitExec === "function")
      ? opts.gitExec
      : (args: string[]) => { try { return String(require("child_process").execFileSync("git", args, { cwd: path.resolve(root), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim(); } catch { return null; } };
    const tl = truthLockGate({ mutating: true, enforce: true, exec });
    if (tl.blocked) return { ok: false, applied: [], refused: true, reason: `refusing: Truth-Lock repo-safety — ${tl.verdict.detail}`, truthLock: tl.verdict };
  }
  const realRoot = path.resolve(root);
  const applied: string[] = [];
  for (const c of changes) {
    const abs = path.join(realRoot, c.rel);
    // Defense in depth: never let a crafted rel escape the root even after scope validation.
    const relCheck = path.relative(realRoot, abs);
    if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
      return { ok: false, applied, refused: true, reason: `refusing: change path '${c.rel}' escapes the repository root` };
    }
    if (c.kind === "deleted") {
      try { (_io.rmSync || fs.rmSync)(abs, { force: true }); } catch { /* best-effort */ }
    } else {
      (_io.mkdirSync || fs.mkdirSync)(path.dirname(abs), { recursive: true });
      (_io.writeFileSync || fs.writeFileSync)(abs, c.after);
    }
    applied.push(c.rel);
  }
  return { ok: true, applied, refused: false };
}

// PROVIDER SELECTION (E5) — the single, explicit decision of WHICH delegation path runs, from operator
// intent + contract. It NEVER silently downgrades to the historical (non-isolated) path when isolation
// was requested but cannot be guaranteed: an incompatible (network) provider, a missing command, an
// empty or glob write-set all return mode "refused". When isolation is NOT requested it returns mode
// "historical" with isolated=false — the historical provider has repo access and is explicitly NOT
// isolated. (Sandbox-availability and the --info-fd launch proof are enforced at run time by runIsolated;
// they likewise REFUSE, never fall back.) Pure/deterministic — no fs, no spawn.
function selectDelegateMode(opts: any): any {
  const o = opts || {};
  if (!o.isolationRequested) {
    return { mode: "historical", isolated: false, reason: "isolation not requested (ODG_DELEGATE_ISOLATION!=1); historical delegation — the provider has repository access and is NOT isolated" };
  }
  if (typeof o.command !== "string" || !o.command.trim()) {
    return { mode: "refused", isolated: false, reason: "isolation requested but no provider command (ODG_ISOLATED_PROVIDER_CMD unset)" };
  }
  if (o.declaredOffline !== true) {
    return { mode: "refused", isolated: false, reason: "provider not declared isolation-compatible — set ODG_ISOLATED_PROVIDER_OFFLINE=1 to assert an OFFLINE provider; a network provider (e.g. Claude Code) cannot run inside the no-network sandbox" };
  }
  const ws = Array.isArray(o.writeSet) ? o.writeSet : [];
  if (!ws.length) {
    return { mode: "refused", isolated: false, reason: "isolation requires an explicit, concrete write-set (contract authorized_paths is empty)" };
  }
  const globs = ws.filter((p: any) => typeof p === "string" && isBoundary(p));
  if (globs.length) {
    return { mode: "refused", isolated: false, reason: `isolation requires concrete files; glob/boundary write-set is not isolable: ${globs.join(", ")}` };
  }
  return { mode: "isolated", isolated: true, reason: "isolated local offline provider on a concrete write-set (no repo/.git/docker socket/host secrets/outbound network)" };
}

// Default git seam (read-only) for the acceptance gate — status + committed-diff + HEAD. Injectable
// (opts.git) so the gate is unit-testable without a real repo. NEVER commits / mutates anything.
function defaultGit(root: any): any {
  const { execFileSync } = require("child_process");
  const run = (args: string[]) => { try { return execFileSync("git", args, { cwd: root, encoding: "utf8" }); } catch { return ""; } };
  return {
    status: () => run(["status", "--porcelain"]).split(/\r?\n/).map((l: string) => l.slice(3).trim()).filter(Boolean),
    diffNames: (ref: string) => run(["diff", "--name-only", ref, "HEAD"]).split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean),
    head: () => run(["rev-parse", "HEAD"]).trim(),
  };
}

// ACCEPTANCE GATE (FINAL_GOVERNANCE_GATE) — the explicit HUMAN acceptance gate that resolves the
// apply↔verify↔converge deadlock WITHOUT weakening verify.gitClean. It mirrors mission-lifecycle's S4
// commit gate exactly (ODG never auto-commits; the human commit IS the acceptance) and REUSES the shared
// scope primitive (scope-observer.scopeClean) — no new scope logic. It performs ZERO git mutation, so a
// commit is impossible before human acceptance. Given a disposable repo + the exact write-set it returns:
//   BLOCKED                      — a change (working OR committed) lies OUTSIDE the write-set (ALWAYS blocks,
//                                  incl. an UNAUTHORIZED COMMIT of out-of-scope files). verify must NOT run.
//   PROPOSED_AWAITING_ACCEPTANCE — in-scope deliverable applied but NOT committed ⇒ verify would be red
//                                  (gitClean=false); STOP and await the human commit. ODG never commits.
//   NO_PROPOSAL                  — clean tree, nothing committed since baseline (nothing to accept).
//   ACCEPTED                     — clean tree AND the committed diff (baselineRef..HEAD) is wholly in-scope
//                                  ⇒ verify may now run on a clean tree (gitClean honestly true).
function acceptanceGate(opts: any): any {
  const o = opts || {};
  const git = o.git || defaultGit(o.root);
  const { scopeClean } = require("./scope-observer");
  const ws = Array.isArray(o.writeSet) ? o.writeSet : [];
  const working = git.status();
  const wScope = scopeClean(ws, working);
  if (!wScope.ok) return { state: "BLOCKED", ok: false, reason: `out-of-scope working-tree change — ${wScope.detail}`, outOfScope: wScope.outOfScope || [] };
  if (working.length > 0) return { state: "PROPOSED_AWAITING_ACCEPTANCE", ok: false, pending: working, reason: `in-scope deliverable applied but NOT committed (${working.length} path(s)); awaiting explicit human acceptance (commit) — ODG never auto-commits` };
  const committed = o.baselineRef ? git.diffNames(o.baselineRef) : [];
  if (committed.length === 0) return { state: "NO_PROPOSAL", ok: false, reason: "clean tree with no in-scope deliverable committed since baseline" };
  const cScope = scopeClean(ws, committed);
  if (!cScope.ok) return { state: "BLOCKED", ok: false, reason: `UNAUTHORIZED COMMIT — committed change(s) outside the authorized write-set — ${cScope.detail}`, outOfScope: cScope.outOfScope || [] };
  return { state: "ACCEPTED", ok: true, accepted: committed, reason: `in-scope deliverable accepted (committed, ${committed.length} path(s)); verify may proceed on a clean tree` };
}

// Orchestrate an isolated delegated run. FAIL-CLOSED: sandbox unavailable, unparseable command,
// unresolvable write-set, or an unobserved launch all REFUSE; there is no unisolated fallback.
//
// opts: { root, writeSet, command, spawn, io, timeoutMs, apply }
//   spawn — injected launcher (defaults to child_process.spawnSync) so tests need no real bwrap.
//   io    — injected fs-like object so the pure copy/diff is testable without touching a real repo.
//   apply — when true, a fully in-scope proposal is applied to the real repo; else it is only observed.
function runIsolated(opts: any): any {
  const options = opts || {};
  const _io = options.io || fs;

  const detect = bashGov.detectSandbox(options);
  if (!detect || !detect.available) {
    return { ok: false, refused: true, launched: false, reason: "sandbox unavailable (bubblewrap required); refusing unisolated delegation" };
  }

  const parsed = sandbox.parseCommand(options.command);
  if (!parsed.ok) {
    return { ok: false, refused: true, launched: false, reason: `invalid isolated provider command: ${parsed.error}` };
  }

  const resolved = resolveWriteSet(options.root, options.writeSet);
  if (!resolved.ok) {
    return { ok: false, refused: true, launched: false, reason: `write-set not isolable: ${resolved.error}` };
  }

  const { workDir, pristine } = materializeWorkingCopy(options.root, resolved.files, _io);
  let bwrapArgs: string[];
  try {
    bwrapArgs = buildIsolatedArgs(workDir, parsed.argv);
  } catch (e: any) {
    try { (_io.rmSync || fs.rmSync)(workDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    return { ok: false, refused: true, launched: false, reason: `invalid sandbox profile: ${String(e.message || e)}` };
  }

  const spawn = options.spawn || require("child_process").spawnSync;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 60000;
  const res = spawn("bwrap", bwrapArgs, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe", "pipe"],
  }) || {};

  // OBSERVED launch proof via --info-fd (the same handshake provider-sandbox/bash-governor trust): a
  // zero exit code is NEVER accepted as proof of isolation; only a child-pid payload is.
  const infoRaw = res && Array.isArray(res.output) && typeof res.output[3] === "string" ? res.output[3] : "";
  let launched = false;
  try { launched = !!(infoRaw && JSON.parse(infoRaw)["child-pid"]); } catch { launched = false; }

  if (!launched) {
    try { (_io.rmSync || fs.rmSync)(workDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    return { ok: false, refused: true, launched: false, reason: "sandbox did not launch (no --info-fd handshake); refusing to trust unisolated output", stderr: String(res.stderr || "").trim() };
  }

  const providerStatus = typeof res.status === "number" ? res.status : null;
  const changes = diffWorkingCopy(pristine, workDir, _io);
  const scope = validateScope(changes, resolved.files);

  let applied: any = { ok: false, applied: [], refused: false, reason: "not applied (apply=false or scope refused)" };
  if (scope.ok && options.apply === true) {
    applied = applyProposal(options.root, changes, resolved.files, _io);
  }

  try { (_io.rmSync || fs.rmSync)(workDir, { recursive: true, force: true }); } catch { /* best-effort */ }

  return {
    ok: scope.ok && providerStatus === 0,
    refused: !scope.ok,
    launched: true,
    providerStatus,
    writeSet: resolved.files,
    changes,
    scope,
    applied,
    isolation: { network: false, envCleared: true, wholeFsExposed: false, realRepoBound: false },
    reason: scope.ok ? (providerStatus === 0 ? "isolated provider run validated in-scope" : `provider exited ${providerStatus}`) : `OUT OF SCOPE — ${scope.detail}; nothing applied`,
    stdout: String(res.stdout || ""),
    stderr: String(res.stderr || "").trim(),
  };
}

module.exports = {
  isBoundary,
  resolveWriteSet,
  materializeWorkingCopy,
  buildIsolatedArgs,
  listFilesRel,
  diffWorkingCopy,
  validateScope,
  applyProposal,
  selectDelegateMode,
  acceptanceGate,
  runIsolated,
};

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
