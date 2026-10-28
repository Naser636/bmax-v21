#!/usr/bin/env node
/**
 * mission-coding-integration — V48 Lot A (register C-08): connects the coding RESOLVER to the REAL canonical mission
 * path. The mission-loader stage (the official producer of runtime/generated/mission-context.json) invokes this
 * best-effort, additive hook: it derives repo signals from a BOUNDED, read-only scan of the mission's authorizedPaths,
 * runs resolveCodingMission against the canonical MissionContext, and PERSISTS runtime/generated/coding-resolution.json
 * for the downstream stages — preserving the EXECUTE / ROUTE_UNSUPPORTED / ABSTAIN / BLOCKED distinctions and NEVER
 * marking a mission executed.
 *
 * WHY A SCAN HERE: the canonical RuntimeContext carries only file/dir COUNTS (no file list / manifests), so the
 * resolver cannot detect the stack from it. Rather than change RuntimeContext (a larger architecture lot), this hook
 * does a small, depth/size-capped, guarded, read-only scan of ONLY the authorizedPaths — no network, no writes to the
 * repo, no cost. Fully additive: any failure is swallowed (like the loader's existing MissionContext block) so the
 * pipeline never regresses. Full execution-REROUTING (the executor consuming this artifact) remains a separate lot.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const RESOLVER = require("./coding-mission-resolver.js");
const EXECUTOR = require("./coding-executor.js");

const MANIFEST_NAMES = ["package.json", "tsconfig.json", "requirements.txt", "pyproject.toml", "go.mod", "Cargo.toml", "pom.xml", "build.gradle"];
const SCAN_FILE_CAP = 500;   // hard cap: bounded, never a full-repo scan
const SCAN_DEPTH_CAP = 6;

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** baseDir(p): strip a glob tail (/**, /*, *) to a scannable directory prefix. */
function baseDir(p: string): string {
  let s = String(p || "").replace(/\\/g, "/");
  s = s.replace(/\/?\*\*.*$/, "").replace(/\/?\*.*$/, "");   // drop from first glob segment
  return s.replace(/\/+$/, "");
}

/**
 * scanRepoSignals(root, authorizedPaths): bounded read-only scan of ONLY the authorizedPaths under root.
 * Returns { files: string[] (repo-relative), manifests: Record<string,any> }. Guarded + capped; never throws.
 */
function scanRepoSignals(root: string, authorizedPaths: string[]): any {
  const files: string[] = [];
  const manifests: Record<string, any> = {};
  let count = 0;
  const seenDirs = new Set<string>();
  function walk(absDir: string, depth: number): void {
    if (count >= SCAN_FILE_CAP || depth > SCAN_DEPTH_CAP) return;
    let entries: any[];
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (count >= SCAN_FILE_CAP) return;
      const abs = path.join(absDir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith(".")) continue;
        walk(abs, depth + 1);
      } else if (e.isFile()) {
        const rel = path.relative(root, abs).replace(/\\/g, "/");
        files.push(rel); count++;
        if (MANIFEST_NAMES.includes(e.name) && !(e.name in manifests)) {
          try { const raw = fs.readFileSync(abs, "utf8"); manifests[e.name] = e.name.endsWith(".json") ? JSON.parse(raw) : {}; }
          catch { manifests[e.name] = {}; }
        }
      }
    }
  }
  for (const ap of (Array.isArray(authorizedPaths) ? authorizedPaths : [])) {
    const b = baseDir(ap);
    if (!b) continue;
    const abs = path.resolve(root, b);
    // Stay within the repo root; skip escapes.
    if (!abs.startsWith(path.resolve(root))) continue;
    if (seenDirs.has(abs)) continue; seenDirs.add(abs);
    try {
      const st = fs.statSync(abs);
      if (st.isDirectory()) walk(abs, 0);
      else if (st.isFile()) { const rel = path.relative(root, abs).replace(/\\/g, "/"); files.push(rel); count++; if (MANIFEST_NAMES.includes(path.basename(abs))) { try { manifests[path.basename(abs)] = JSON.parse(fs.readFileSync(abs, "utf8")); } catch { manifests[path.basename(abs)] = {}; } } }
    } catch { /* authorizedPath not present yet — skip */ }
  }
  // Repo-root manifests give the strongest stack signal; include them if present (bounded, read-only).
  for (const m of MANIFEST_NAMES) {
    if (m in manifests) continue;
    const abs = path.resolve(root, m);
    try { if (fs.statSync(abs).isFile()) manifests[m] = m.endsWith(".json") ? JSON.parse(fs.readFileSync(abs, "utf8")) : {}; } catch { /* absent */ }
  }
  return { files, manifests, scannedCount: count, capped: count >= SCAN_FILE_CAP };
}

/**
 * attachCodingResolution(mission, opts?): read the canonical mission-context.json, resolve the coding mission, and
 * persist coding-resolution.json. opts: { cwd, context (injected), repoSignals (injected), family, toolchain, write }.
 * Returns { ok, resolution } | { ok:false, code, reason }. Best-effort + fail-closed; never marks execution.
 */
function attachCodingResolution(mission: any, opts: any = {}): any {
  const cwd = typeof opts.cwd === "string" ? opts.cwd : process.cwd();
  let context = opts.context;
  if (!isObj(context)) {
    try { context = JSON.parse(fs.readFileSync(path.join(cwd, "runtime", "generated", "mission-context.json"), "utf8")); }
    catch (e: any) { return { ok: false, code: "NO_CONTEXT", reason: `mission-context.json not readable: ${e && e.message}` }; }
  }
  if (!isObj(context) || typeof context.mission !== "string") return { ok: false, code: "INVALID_CONTEXT", reason: "canonical MissionContext (with .mission) required" };

  // Only engineering (write-authorized) missions are candidate coding missions; others are not coding-routed here.
  if (context.requiresEngineering !== true) {
    const resolution = { mission: context.mission, codingMission: false, route: "NOT_A_CODING_MISSION", reason: "mission is read-only/non-engineering (no authorizedPaths)", persisted: false };
    return { ok: true, resolution };
  }

  const root = (context.runtime && context.runtime.root) || cwd;
  const repoSignals = isObj(opts.repoSignals) ? opts.repoSignals : scanRepoSignals(root, context.authorizedPaths || []);
  const resolved = RESOLVER.resolveCodingMission(context, repoSignals, { family: opts.family, toolchain: opts.toolchain });
  if (resolved.ok === false) return { ok: false, code: resolved.code || "RESOLVE_FAILED", reason: resolved.reason };

  const resolution = {
    mission: context.mission,
    codingMission: resolved.codingMission === true,
    route: resolved.route,                 // EXECUTE | ROUTE_UNSUPPORTED | ABSTAIN | BLOCKED
    language: resolved.language || null,
    plan: resolved.plan || null,
    fidelityContract: resolved.fidelityContract,
    reason: resolved.reason, nextAction: resolved.nextAction,
    signalsScanned: repoSignals.scannedCount != null ? repoSignals.scannedCount : (Array.isArray(repoSignals.files) ? repoSignals.files.length : 0),
    executed: false,                       // set true only after a real VERIFIED check (opt-in execute below)
    executionResult: null as any,
    note: "Advisory coding resolution persisted on the canonical loader path. A ROUTE_UNSUPPORTED/ABSTAIN/BLOCKED mission is NOT executed. With opt-in execute, an EXECUTE route runs a REAL bounded check whose result the Validation Engine gates on.",
  };

  // OPT-IN real execution (default OFF ⇒ zero change to existing missions). When enabled AND route===EXECUTE, run the
  // bounded coding-executor over in-scope files and record a REAL check result the VE gate consumes. Best-effort.
  const doExecute = opts.execute === true || (opts.execute !== false && process.env.ODG_CODING_EXECUTE === "1");
  if (doExecute && resolved.route === "EXECUTE") {
    try {
      const ex = EXECUTOR.executeCodingResolution(resolved, { workspaceDir: root, ...(opts.runner ? { runner: opts.runner } : {}), ...(typeof opts.toolchainAvailable === "boolean" ? { toolchainAvailable: opts.toolchainAvailable } : {}) });
      resolution.executionResult = { status: ex.status, executed: ex.executed === true, filesChecked: ex.filesChecked || 0, results: Array.isArray(ex.results) ? ex.results.slice(0, 50) : [] };
      (resolution as any).executed = ex.status === "VERIFIED";
    } catch (e: any) {
      resolution.executionResult = { status: "BLOCKED", executed: false, reason: (e && e.message) || "execution error" };
    }
  }

  if (opts.write !== false) {
    try {
      const out = path.join(cwd, "runtime", "generated", "coding-resolution.json");
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(resolution, null, 2));
      (resolution as any).persisted = true;
    } catch { (resolution as any).persisted = false; }
  }
  return { ok: true, resolution };
}

export { attachCodingResolution, scanRepoSignals, baseDir };
module.exports = { attachCodingResolution, scanRepoSignals, baseDir };
