#!/usr/bin/env node
"use strict";
/*
 * V15.0 §41.7 / §45 scenario L — ADAPTIVE CONCURRENCY, MEASURED. Runs the SAME real hermetic workload (a fixed list of
 * non-hazard test suites, classified by the existing odg-test-report) at several concurrency levels, measures wall time and
 * failures per level (repeated), and CHOOSES the level from the measurements: the smallest level whose median time is within
 * `minGain` of the fastest failure-free level (diminishing returns ⇒ fewer resources). Reuses odg-test-report.runSuites /
 * runSuitesParallel / suiteIsHazard / summarize — no second scheduler. Writes nothing unless --write <file>.
 * Usage: npx tsx runtime/bin/odg-concurrency-calibrate.ts [--levels 1,2,4,8] [--repeats 2] [--suites N] [--min-gain 0.10] [--write <file>]
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");

function median(xs: number[]): number { const s = xs.slice().sort((a, b) => a - b); const n = s.length; return n === 0 ? NaN : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }

/* chooseLevel(measurements, {minGain}) — PURE. measurements: [{level, wallMs[], failures}] (failures = FAIL+BLOCKED+NOT_RUN
 * summed over repeats). A level with any failure is ineligible (speed never bought with failures). Returns the smallest
 * eligible level whose median wall time ≤ (1+minGain) × the best eligible median, with the per-level table and reason. */
function chooseLevel(measurements: any[], opts?: any): any {
  const minGain = opts && typeof opts.minGain === "number" && opts.minGain >= 0 ? opts.minGain : 0.10;
  const rows = (Array.isArray(measurements) ? measurements : []).map((m: any) => ({ level: m.level, medianMs: median(m.wallMs || []), failures: m.failures || 0, runs: (m.wallMs || []).length }))
    .sort((a: any, b: any) => a.level - b.level);
  const eligible = rows.filter((r: any) => r.failures === 0 && r.runs > 0 && Number.isFinite(r.medianMs));
  if (!eligible.length) return Object.freeze({ chosen: null, reason: "NO_FAILURE_FREE_LEVEL", rows });
  const best = Math.min(...eligible.map((r: any) => r.medianMs));
  const chosen = eligible.find((r: any) => r.medianMs <= best * (1 + minGain));
  const base = rows.find((r: any) => r.level === 1);
  return Object.freeze({ chosen: chosen.level, bestMedianMs: best, chosenMedianMs: chosen.medianMs, speedupVsSerial: base && Number.isFinite(base.medianMs) ? +(base.medianMs / chosen.medianMs).toFixed(2) : null,
    reason: "smallest failure-free level within " + Math.round(minGain * 100) + "% of the fastest (diminishing returns ⇒ fewer resources)", rows });
}

async function main(argv: string[]): Promise<void> {
  const arg = (k: string, d: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const TR = require(path.join(ROOT, "runtime", "bin", "odg-test-report.ts"));
  const levels = arg("--levels", "1,2,4,8").split(",").map((x: string) => parseInt(x, 10)).filter((n: number) => n >= 1 && n <= 32);
  const repeats = Math.max(1, Math.min(5, parseInt(arg("--repeats", "2"), 10) || 2));
  const nSuites = Math.max(2, Math.min(200, parseInt(arg("--suites", "24"), 10) || 24));
  const out = arg("--write", "");
  const core = path.join(ROOT, "runtime", "core");
  const candidates = fs.readdirSync(core).filter((f: string) => f.endsWith(".test.ts")).sort().map((f: string) => path.join(core, f))
    .filter((f: string) => !TR.suiteIsHazard(f))   // suiteIsHazard takes the PATH
    // self-contained only: suites that need a compiled runtime/dist (built by CI, absent in a fresh worktree) or a live
    // patch-execution artefact would fail for ENVIRONMENT reasons and make every level ineligible.
    .filter((f: string) => { const t = fs.readFileSync(f, "utf8"); return !/runtime\/dist|patch-execution\.json|-live\.test/.test(t + f); }).slice(0, nSuites + 8);
  // PREFLIGHT (environment qualification): run the candidate set once serially and keep only suites that PASS here, so a
  // suite broken by the ENVIRONMENT (e.g. needs a built runtime/dist) cannot make every level ineligible. Excluded suites
  // are recorded with their class — never hidden.
  const pre = TR.runSuites(candidates);
  const excluded = pre.filter((x: any) => x.cls !== "PASS").map((x: any) => ({ suite: path.relative(ROOT, x.file), cls: x.cls }));
  const files = pre.filter((x: any) => x.cls === "PASS").map((x: any) => x.file).slice(0, nSuites);
  if (files.length === 0) throw new Error("empty workload — refusing to report a measurement of nothing");
  const measurements: any[] = [];
  for (const level of levels) {
    const wallMs: number[] = []; let failures = 0;
    for (let r = 0; r < repeats; r++) {
      const t0 = Date.now();
      const results = level > 1 ? await TR.runSuitesParallel(files, level) : TR.runSuites(files);
      wallMs.push(Date.now() - t0);
      const c = TR.summarize(results).counts; failures += (c.FAIL || 0) + (c.BLOCKED_BY_ISOLATION || 0) + (c.NOT_RUN || 0);
      if (results.length !== files.length) throw new Error("runner returned " + results.length + " results for " + files.length + " suites");
    }
    measurements.push({ level, wallMs, failures });
    process.stderr.write(`[concurrency] level ${level}: ${wallMs.join("/")} ms, failures ${failures}\n`);
  }
  const decision = chooseLevel(measurements, { minGain: parseFloat(arg("--min-gain", "0.10")) });
  const report = { scenario: "V15.0 §45 L — adaptive concurrency (measured)", host: { cpus: os.cpus().length, totalMemGb: Math.round(os.totalmem() / 1e9) },
    workload: { suites: files.length, list: files.map((f: string) => path.relative(ROOT, f)), excludedByPreflight: excluded, hermetic: "non-hazard core suites (odg-test-report.suiteIsHazard false), excluding suites that need runtime/dist or live artefacts" }, repeats, measurements, decision,
    limits: ["one host, one workload class (test suites) — the chosen level is valid for this workload/host only", "wall time includes tsx start-up per suite", "no model/provider calls measured here"] };
  const text = JSON.stringify(report, null, 2) + "\n";
  if (out) fs.writeFileSync(path.resolve(ROOT, out), text); else process.stdout.write(text);
}
module.exports = { chooseLevel, median };
if (require.main === module) main(process.argv.slice(2)).catch((e: any) => { process.stderr.write(String(e && e.stack || e) + "\n"); process.exit(1); });
export {};
