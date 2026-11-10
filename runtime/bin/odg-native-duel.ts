#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V41 LOT N — 3B-vs-7B COMPLEX DUEL. Runs the SAME 8 diverse 4-file COMPLEX tasks through 4 SEPARATE cells:
 *   {3b, 7b} x {maxRepair 0, maxRepair 1}. Same specs / constraints / acceptance. The INDEPENDENT verifier
 * (native-project-builder) decides ACCEPT/REJECT; a false success may be repaired within the cell's bound. Samples are
 * kept strictly separate; repeated attempts are NOT treated as independent observations. Thresholds UNCHANGED. Model order
 * alternates per task (and every /api/generate call is stateless — no cross-call KV cache — so no systematic cache edge).
 * Local only; no VPS/push. Run: `npx tsx runtime/bin/odg-native-duel.ts [outPath]`.
 */

const BUILDER = require("../core/native-project-builder.js");
const GEN = require("../core/local-model-generator.js");
const NBO = require("../core/native-build-outcome.js");
const LEDGER = require("../core/mission-outcome-ledger.js");
const CAL = require("../core/calibration.js");
const { COMPLEX_TASKS } = require("./native-complex-corpus.js");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || path.join(__dirname, "..", "..", "docs", "odg", "native-duel-complex.json");
const MODELS: any = { "3b": "qwen2.5-coder:3b", "7b": "qwen2.5-coder:7b" };
const CELLS = [ { model: "3b", repair: 0 }, { model: "3b", repair: 1 }, { model: "7b", repair: 0 }, { model: "7b", repair: 1 } ];
const cellKey = (c: any) => `${c.model}-r${c.repair}`;

function archOf(task: any): any[] {
  return [
    { path: "parse.js", role: "parse the input", contract: task.parse },
    { path: "a.js", role: "metric A", contract: task.a, dependsOn: ["parse.js"] },
    { path: "b.js", role: "metric B", contract: task.b, dependsOn: ["parse.js"] },
    { path: "report.js", role: "combine A and B", contract: task.report, dependsOn: ["a.js", "b.js"] },
  ];
}
function nowIso(): string { return new Date().toISOString(); }

(async () => {
  const cells: any = {}; for (const c of CELLS) cells[cellKey(c)] = { model: MODELS[c.model], repair: c.repair, ledger: [], records: [] };
  const tStart = Date.now(); const started = nowIso();

  for (let i = 0; i < COMPLEX_TASKS.length; i++) {
    const task = COMPLEX_TASKS[i];
    const order = i % 2 === 0 ? CELLS : CELLS.slice().reverse();     // alternate model-first order per task (fairness)
    for (const c of order) {
      const key = cellKey(c); const cell = cells[key];
      const spec = { name: `complex-${task.id}`, architecture: archOf(task), independentTest: (m: any) => { try { return task.test(m["report.js"]) === true; } catch { return false; } } };
      const gen = GEN.makeLocalGenerator({ model: MODELS[c.model], timeoutMs: 240000, numPredict: 768, temperature: 0.1 });
      const t0 = Date.now(); let bo: any = null, err: any = null;
      try { bo = await BUILDER.buildProject(spec, { generateFile: gen, maxRepair: c.repair }); } catch (e: any) { err = String((e && e.message) || e); }
      const ms = Date.now() - t0; const b = bo || {};
      cell.ledger = NBO.recordNativeBuild(cell.ledger, b, { name: task.id, architecture: archOf(task) }, "DECOMPOSED", 1).outcomes;
      const rec = { taskId: task.id, model: MODELS[c.model], maxRepair: c.repair, filesGenerated: b.filesGenerated ?? 0, buildOk: b.buildOk === true, repairs: b.repairs ?? null,
        independentVerdict: err ? "BLOCKED" : (b.accepted === true ? "ACCEPT" : "REJECT"), accepted: b.accepted === true,
        falseSuccess: b.buildOk === true && b.verified === false && b.accepted === false, buildError: b.buildError || null, verifyError: b.verifyError || null, error: err, durationMs: ms, at: nowIso() };
      cell.records.push(rec);
      process.stdout.write(`[${key} ${task.id}] ${rec.independentVerdict} buildOk=${rec.buildOk} repairs=${rec.repairs} false=${rec.falseSuccess} ${ms}ms\n`);
    }
  }

  // per-cell calibration (UNCHANGED thresholds, SEPARATE samples). Computed over the cell's OWN verified outcomes
  // (type-agnostic via buildCalibrationSample) so the stats are robust to how assessComplexity keys the type.
  const readinessOf = (sample: any, est: any): string => {
    if (sample.n === 0 || est.quality === "UNKNOWN" || est.quality === "DEGRADED") return "INSUFFICIENT_DATA";
    if (est.quality === "BIASED") return "DEFER_TO_PROVIDER";
    const reliability = sample.n ? sample.successes / sample.n : 0;
    if (est.quality === "CALIBRATED" && reliability >= 0.8) return "ATTEMPT_NATIVE";
    return "DEFER_TO_PROVIDER";
  };
  const summary: any = {};
  for (const key of Object.keys(cells)) {
    const cell = cells[key];
    const sample = LEDGER.buildCalibrationSample(cell.ledger, { basis: "attempt" });
    const reliability = sample.n ? Number((sample.successes / sample.n).toFixed(4)) : null;
    const est = CAL.calibratedEstimate({ p: reliability, observations: sample.n, successes: sample.successes, failures: sample.failures, source: `native-build:${key}` });
    summary[key] = { model: cell.model, maxRepair: cell.repair, attempts: sample.n, accepted: cell.records.filter((r: any) => r.accepted).length,
      rejected: cell.records.filter((r: any) => r.independentVerdict === "REJECT").length, blocked: cell.records.filter((r: any) => r.independentVerdict === "BLOCKED").length,
      failures: sample.failures, reliability, falseSuccesses: cell.records.filter((r: any) => r.falseSuccess).length,
      repairsUsed: cell.records.filter((r: any) => r.repairs > 0).length, quality: est.quality, uncertainty: est.uncertainty, readiness: readinessOf(sample, est),
      avgMs: Math.round(cell.records.reduce((s: number, r: any) => s + r.durationMs, 0) / Math.max(1, cell.records.length)) };
  }

  const dataset = {
    "//": "CTO V41 LOT N — REAL 3B-vs-7B COMPLEX duel. Local models via 127.0.0.1:11434. NOT synthetic. Thresholds UNCHANGED. Samples SEPARATE. VERIFIED in-repo != DEPLOYED.",
    models: MODELS, class: "DECOMPOSED:COMPLEX", corpusSize: COMPLEX_TASKS.length,
    startedAt: started, finishedAt: nowIso(), totalDurationMs: Date.now() - tStart,
    structuralNote: "8 DISTINCT computations over a shared 4-file DAG shape (parse -> a,b -> report) => a correlated STRUCTURAL family, not 8 independent structures; and n=8 < MIN_OBS(20) => no cell can be CALIBRATED (reported honestly).",
    summaryByCell: summary,
    cells,
    honesty: "every verdict by the INDEPENDENT verifier; 3B and 7B samples kept SEPARATE; repeated attempts NOT treated as independent; thresholds NOT reduced; if all pass after repair, bias is declared and autonomy is NOT promoted.",
  };
  fs.writeFileSync(OUT, JSON.stringify(dataset, null, 2) + "\n");
  process.stdout.write(`\n=== DUEL DATASET: ${OUT} ===\n`);
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
})();

export {};
