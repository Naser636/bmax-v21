#!/usr/bin/env node
/**
 * coding-executor — V49 Lot C (register C-08): the EXECUTOR-side CONSUMER of a coding-resolution. It turns the
 * resolver's routing decision into an actual, bounded execution OUTCOME, honouring the four routes exactly:
 *
 *   EXECUTE           — run the REAL code-execution checker over the in-scope source files (bounded, isolated) and
 *                       return VERIFIED only if every checked file PASSES. EXECUTE ≠ success until verified.
 *   ROUTE_UNSUPPORTED — do NOT launch an executor (no faked run) → NOT_EXECUTED/UNSUPPORTED.
 *   ABSTAIN           — produce NO modification and NO execution → NOT_EXECUTED/ABSTAIN.
 *   BLOCKED           — preserve the cause + unblock action → NOT_EXECUTED/BLOCKED.
 *
 * HONEST SCOPE: for EXECUTE the deterministic action available WITHOUT an authorized generative provider is a
 * syntax/type CHECK (it does not synthesize or repair code — that stays BLOCKED, see register C-04). This is the
 * real "executor consumes coding-resolution" consumer the pipeline needs; wiring it as a live pipeline STAGE is the
 * remaining step. Reuses code-execution (no new primitive); bounded, read-only over a workspace, fail-closed.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const EXEC = require("./code-execution.js");

const EXT_BY_LANG: Record<string, string[]> = { JavaScript: [".js", ".cjs", ".mjs"], TypeScript: [".ts", ".tsx"], Python: [".py"] };
const FILE_CAP = 50;   // bounded: never check an unbounded number of files in one execution

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** List in-scope source files for the resolved language under the workspace (bounded, read-only, skips junk dirs). */
function inScopeSources(workspaceDir: string, writeSet: string[], exts: string[]): string[] {
  const out: string[] = [];
  function walk(absDir: string, depth: number): void {
    if (out.length >= FILE_CAP || depth > 6) return;
    let entries: any[]; try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= FILE_CAP) return;
      if (e.isDirectory()) { if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith(".")) continue; walk(path.join(absDir, e.name), depth + 1); }
      else if (e.isFile() && exts.includes(path.extname(e.name))) out.push(path.join(absDir, e.name));
    }
  }
  for (const w of (Array.isArray(writeSet) ? writeSet : [])) {
    const base = String(w).replace(/\\/g, "/").replace(/\/?\*\*.*$/, "").replace(/\/?\*.*$/, "").replace(/\/+$/, "");
    const abs = path.resolve(workspaceDir, base || ".");
    if (!abs.startsWith(path.resolve(workspaceDir))) continue;
    try { const st = fs.statSync(abs); if (st.isDirectory()) walk(abs, 0); else if (st.isFile() && exts.includes(path.extname(abs))) out.push(abs); } catch { /* absent */ }
  }
  return Array.from(new Set(out));
}

/**
 * executeCodingResolution(resolution, opts?): consume a coding-resolution and produce a bounded execution outcome.
 * opts: { workspaceDir, runner (injected checker), toolchainAvailable }. Returns a reproducible evidence record.
 */
function executeCodingResolution(resolution: any, opts: any = {}): any {
  if (!isObj(resolution) || typeof resolution.route !== "string") return { ok: false, code: "INVALID_INPUT", reason: "coding-resolution with a route required" };
  const route = resolution.route;

  if (route === "ROUTE_UNSUPPORTED") return { ok: true, route, executed: false, status: "UNSUPPORTED", changed: false, reason: resolution.reason || "no executable ODG checker/toolchain for the detected stack", nextAction: resolution.nextAction || "route to axis-D subcontracting (no faked execution)" };
  if (route === "ABSTAIN") return { ok: true, route, executed: false, status: "ABSTAIN", changed: false, reason: resolution.reason || "ambiguous/unknown repo — no modification" };
  if (route === "BLOCKED") return { ok: true, route, executed: false, status: "BLOCKED", changed: false, reason: resolution.reason || "blocked", unblock: resolution.unblock || resolution.nextAction || "resolve the dependency/authorization" };
  if (route !== "EXECUTE") return { ok: true, route, executed: false, status: "NOT_A_CODING_MISSION", changed: false, reason: resolution.reason || `route ${route} is not executable here` };

  // EXECUTE: run the REAL checker over the in-scope source files. EXECUTE is NOT success until verified.
  const workspaceDir = typeof opts.workspaceDir === "string" ? opts.workspaceDir : null;
  if (!workspaceDir || !fs.existsSync(workspaceDir)) return { ok: false, code: "INVALID_INPUT", reason: "EXECUTE needs an existing workspaceDir" };
  const language = resolution.language;
  // TypeScript WITH a project tsconfig ⇒ use the SOUND project-mode checker (imports/config honoured), not the
  // per-file syntax check (which is unsound for files with imports). BLOCKED/FAIL are never converted to VERIFIED.
  if (language === "TypeScript" && typeof opts.tsconfig === "string" && opts.tsconfig && fs.existsSync(path.join(workspaceDir, opts.tsconfig))) {
    const TSP = require("./ts-project-check.js");
    const pr = TSP.checkTsProject({ projectDir: workspaceDir, tsconfig: opts.tsconfig, ...(typeof opts.tsRunner === "function" ? { runner: opts.tsRunner } : {}) });
    const mapped = pr.status === "PASS" ? "VERIFIED" : (pr.status === "FAIL" ? "FAILED" : "BLOCKED");
    return {
      ok: true, route, executed: pr.status === "PASS" || pr.status === "FAIL", changed: false,
      status: mapped, mode: "typescript-project", language, errorCount: pr.errorCount,
      filesChecked: 1, results: [{ file: opts.tsconfig, status: pr.status }], detail: pr.detail || pr.reason,
      note: "EXECUTE ran a SOUND project-mode TypeScript check (imports/tsconfig honoured). VERIFIED only on a real PASS; BLOCKED (tool absent/timeout/no-tsconfig) is never VERIFIED.",
    };
  }
  const exts = EXT_BY_LANG[language];
  if (!exts) return { ok: true, route, executed: false, status: "UNSUPPORTED", changed: false, reason: `no checker for language '${language}'` };
  const writeSet = (resolution.plan && Array.isArray(resolution.plan.writeSet)) ? resolution.plan.writeSet : [];
  const files = inScopeSources(workspaceDir, writeSet, exts);
  if (files.length === 0) return { ok: true, route, executed: false, status: "NO_SOURCES", changed: false, reason: `no ${language} source files under the authorized write-set` };

  const runner = typeof opts.runner === "function" ? opts.runner : undefined;
  const results: any[] = [];
  let allPass = true;
  for (const f of files) {
    let content: string; try { content = fs.readFileSync(f, "utf8"); } catch { results.push({ file: path.relative(workspaceDir, f), status: "BLOCKED", reason: "unreadable" }); allPass = false; continue; }
    const r = EXEC.runSyntaxCheck({ language, content, filename: path.basename(f), ...(runner ? { runner } : {}), ...(typeof opts.toolchainAvailable === "boolean" ? { toolchainAvailable: opts.toolchainAvailable } : {}) });
    results.push({ file: path.relative(workspaceDir, f), status: r.status });
    if (r.status !== "PASS") allPass = false;
  }
  const checked = results.filter((r) => r.status === "PASS" || r.status === "FAIL").length;
  return {
    ok: true, route, executed: true, changed: false,     // a CHECK makes no modification
    status: checked === 0 ? "BLOCKED" : (allPass ? "VERIFIED" : "FAILED"),
    language, filesChecked: results.length, results,
    note: "EXECUTE ran a REAL syntax/type CHECK over in-scope files (verification, not synthesis/repair). VERIFIED only if every checked file passed. Repair/synthesis remains BLOCKED pending an authorized provider (register C-04).",
  };
}

export { executeCodingResolution, inScopeSources, EXT_BY_LANG };
module.exports = { executeCodingResolution, inScopeSources, EXT_BY_LANG };
