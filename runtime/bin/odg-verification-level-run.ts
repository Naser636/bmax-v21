#!/usr/bin/env node
"use strict";
/*
 * V15.7 — verification-level CLI. Computes the changed files of base...head (git diff --name-only -z), asks
 * runtime/core/odg-verification-level for the plan and prints it. With --run it EXECUTES the selected L1/L2 suites
 * (bounded parallel workers via odg-test-report.runSuitesParallel — the existing HYPER-SPEED runner, hazard suites still
 * serial) plus the typecheck, and reports wall-clock timings. L3 / REINFORCED is never executed here: it prints the full
 * gate to run and exits 2 (NOT a green result). Mandatory pre-merge CI is never lowered.
 *
 * Usage: tsx runtime/bin/odg-verification-level-run.ts [--base origin/main] [--head HEAD] [--files a,b] [--run]
 *          [--measure L1,L2] [--workers N] [--skip-typecheck] [--json]
 *   --measure L1,L2  run those tiers' selections even when the chosen level differs (for baselining); implies --run.
 * Exit: 0 plan printed / selected suites + typecheck green; 1 a suite FAIL/BLOCKED/NOT_RUN or tsc failure or diff error;
 *       2 level is L3 (full gate required — not executed by this tool) under --run.
 */
const os = require("os");
const path = require("path");
const cp = require("child_process");
const VL = require("../core/odg-verification-level.js");

const ROOT = process.cwd();
function arg(name: string, def: any = null): any { const i = process.argv.indexOf(name); return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def; }
function flag(name: string): boolean { return process.argv.includes(name); }
function git(args: string[]): { ok: boolean; out: string; code: number | null } {
  const r = cp.spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout || "", code: r.status };
}

/** changedFilesOf(base, head, cwd) — the change-set. --no-renames: a rename is reported as delete(old) + add(new), so BOTH
 *  paths are classified (a `git mv` of a control-surface file can never hide behind its new, innocuous name). */
function changedFilesOf(base: string, head: string, cwd: string = ROOT): { ok: boolean; files: string[]; error: string | null } {
  const r = cp.spawnSync("git", ["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return { ok: false, files: [], error: `git diff ${base}...${head} failed (exit ${r.status}) ⇒ empty change-set ⇒ L3 (fail closed)` };
  return { ok: true, files: (r.stdout || "").split("\0").filter((x: string) => x.length), error: null };
}

/** exitFor(plan, ctx) — PURE exit policy. An L3 plan is NEVER exit < 2, even when L1/L2 were measured (--measure is
 *  MEASUREMENT_ONLY, not a pass). A suite failure / tsc failure / diff error / an executed tier with 0 suites ⇒ ≥ 1. */
function exitFor(plan: any, ctx: any): { code: number; status: string } {
  let code = ctx.errors ? 1 : 0; let status = ctx.errors ? "ERROR" : "PLAN_ONLY";
  if (ctx.executed) status = "EXECUTED";
  if (ctx.failed) { code = Math.max(code, 1); status = "FAILED"; }
  if (ctx.noTestsSelected) { code = Math.max(code, 1); status = "NO_TESTS_SELECTED"; }
  if (ctx.run && plan.level === "L3") { code = Math.max(code, 2); status = ctx.measuring ? "MEASUREMENT_ONLY_PLAN_IS_L3 (not a pass)" : "L3_FULL_GATE_REQUIRED (not executed here)"; }
  return { code, status };
}

async function main(): Promise<number> {
  const base = arg("--base", "origin/main"), head = arg("--head", "HEAD");
  let files: string[] = []; const errors: string[] = [];
  const explicit = arg("--files");
  if (explicit) files = explicit.split(",").filter((x: string) => x.length);
  else {
    const d = changedFilesOf(base, head);
    if (!d.ok) errors.push(d.error as string);
    files = d.files;
  }
  let pkg: any = null;
  if (!explicit) {
    const mb = git(["merge-base", base, head]);
    const b = mb.ok ? git(["show", mb.out.trim() + ":package.json"]) : { ok: false, out: "" };
    const h = git(["show", head + ":package.json"]);
    pkg = { base: b.ok ? b.out : null, head: h.ok ? h.out : null };
  }
  const plan = VL.chooseLevel(files, { root: ROOT, packageJson: pkg || undefined });
  const headSha = git(["rev-parse", head]); const treeSha = git(["rev-parse", "HEAD"]);
  const out: any = { base, head, headSha: headSha.ok ? headSha.out.trim() : "UNRESOLVED", graphTreeSha: treeSha.ok ? treeSha.out.trim() : "UNRESOLVED",
    treeNote: headSha.ok && treeSha.ok && headSha.out.trim() === treeSha.out.trim() ? "graph/test selection computed on the head tree" : "graph/test selection computed on the CHECKED-OUT tree (not the head ref) — a later tree may differ",
    changedFiles: files.length, errors, plan };

  const measure = (arg("--measure", "") as string).split(",").filter(Boolean);
  const run = flag("--run") || measure.length > 0;
  let failed = false, noTestsSelected = false, executed = false;
  if (run) {
    const tiers = measure.length ? measure.filter((t) => t === "L1" || t === "L2") : (plan.level === "L1" || plan.level === "L2" ? [plan.level] : []);
    if (!measure.length && plan.level === "L3") { out.run = { executed: false, reason: "L3" + (plan.reinforced ? " REINFORCED" : "") + ": run the full gate (build:runtime, tsc, anchor, test:report) + mandatory independent inspection — not executed by this tool" }; }
    if (!measure.length && plan.level === "DOCS_ONLY") {
      const bad: string[] = [];
      for (const f of (plan.steps.find((s: any) => s.step === "doc-lint") || { files: [] }).files) { try { JSON.parse(require("fs").readFileSync(path.join(ROOT, f), "utf8")); } catch { bad.push(f); } }
      out.run = { executed: true, docLint: { checked: plan.steps[0].files.length, invalidJson: bad } }; executed = true; if (bad.length) failed = true;
    }
    if (tiers.length) {
      const TR = require("./odg-test-report.ts");
      const cpus = (() => { try { return os.cpus().length || 1; } catch { return 1; } })();
      const req = parseInt(arg("--workers", String(Math.min(4, cpus))), 10);
      const workers = TR.computeWorkers(Number.isFinite(req) ? req : 1, cpus, os.freemem() / (1024 * 1024), 900).workers;
      const runs: any = {};
      if (!flag("--skip-typecheck")) {
        const t0 = Date.now(); const r = cp.spawnSync(path.join(ROOT, "node_modules", ".bin", "tsc"), ["--noEmit", "-p", "tsconfig.json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
        runs.typecheck = { exitCode: r.status, wallMs: Date.now() - t0 }; if (r.status !== 0) failed = true;   // exit code unmasked
      } else runs.typecheck = "NOT_MEASURED (--skip-typecheck)";
      for (const t of tiers) {
        const list: string[] = plan.tests[t];
        if (!list.length) { runs[t] = { suites: 0, wallMs: 0, note: "no suites selected for this tier (nothing executed — not a pass of anything)" }; noTestsSelected = true; continue; }
        const abs = list.map((f) => path.join(ROOT, f));
        const t0 = Date.now();
        const results = workers > 1 ? await TR.runSuitesParallel(abs, workers) : TR.runSuites(abs);
        const wallMs = Date.now() - t0;
        const s = TR.summarize(results);
        if (results.length !== abs.length) { failed = true; errors.push(`runner returned ${results.length} results for ${abs.length} suites`); }
        if (TR.overallExit(s) !== 0) failed = true;
        runs[t] = { suites: list.length, workers, wallMs, counts: s.counts, failing: results.filter((r: any) => r.cls !== "PASS" && r.cls !== "SKIPPED").map((r: any) => ({ suite: path.relative(ROOT, r.file), cls: r.cls, reason: r.reason })) };
      }
      executed = true;
      out.run = { executed: true, measuredAt: new Date().toISOString(), loadavg: os.loadavg().map((x: number) => +x.toFixed(2)), cpus, runs };
    }
  }
  const ex = exitFor(plan, { errors: errors.length > 0, run, measuring: measure.length > 0, failed, noTestsSelected, executed });
  out.status = ex.status; out.exitCode = ex.code;
  if (flag("--json")) process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  else {
    const p = plan;
    const L = [`verification level: ${p.level}${p.reinforced ? " REINFORCED" : ""}  (mandatory pre-merge CI: yes; independent inspection: ${p.independentInspection})`, `changed files: ${files.length}  base=${base} head=${head}`, "reasons:", ...p.reasons.map((r: string) => "  - " + r)];
    for (const s of p.steps) L.push(`step ${s.step}${s.cmd ? ": " + s.cmd : ""}${s.files ? " (" + s.files.length + " files)" : ""}${s.detail ? " — " + s.detail : ""}`);
    if (p.level === "L1" || p.level === "L2") for (const t of p.tests[p.level]) L.push("  test " + t);
    if (p.adversarialChecklist) { L.push("adversarial checklist:"); for (const c of p.adversarialChecklist) L.push("  [ ] " + c); }
    if (out.run) L.push("run: " + JSON.stringify(out.run));
    for (const e of errors) L.push("ERROR: " + e);
    L.push(`status: ${ex.status} (exit ${ex.code})`);
    process.stdout.write(L.join("\n") + "\n");
  }
  return ex.code;
}

// process.exitCode (not process.exit): a piped --json larger than the pipe buffer must DRAIN before the process ends.
if (require.main === module) main().then((c) => { process.exitCode = c; }, (e) => { process.stderr.write(String(e && e.stack || e) + "\n"); process.exitCode = 1; });
module.exports = { main, changedFilesOf, exitFor };
export {};
