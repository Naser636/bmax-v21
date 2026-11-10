#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V40 LOT L — NATIVE ENGINEERING CALIBRATION CAMPAIGN. Drives the EXISTING native-engineering-cycle +
 * native-project-builder + local-model-generator over a DIVERSE corpus of DISTINCT tasks (not repetitions) with a genuine
 * difficulty gradient, so real failures arise from task difficulty — NEVER fabricated. Gathers >=20 independent verified
 * attempts for a class, then applies the UNCHANGED native-engineering-readiness thresholds (reliability>=0.8, MIN_OBS=20,
 * bias/degraded guards). It reports honestly whether a class EARNS ATTEMPT_NATIVE. Local only; no VPS/push.
 * Run: `npx tsx runtime/bin/odg-native-calibrate.ts [model] [outPath]`.
 */

const CYCLE = require("../core/native-engineering-cycle.js");
const BUILDER = require("../core/native-project-builder.js");
const GEN = require("../core/local-model-generator.js");
const NBO = require("../core/native-build-outcome.js");
const READY = require("../core/native-engineering-readiness.js");
const LEDGER = require("../core/mission-outcome-ledger.js");
const CAL = require("../core/calibration.js");
const DP = require("../core/decomposition-planner.js");
const CORPUS = require("./native-calibrate-corpus.js");
const fs = require("fs");
const path = require("path");

const MODEL = process.argv[2] || "qwen2.5-coder:3b";
const OUT = process.argv[3] || path.join(__dirname, "..", "..", "docs", "odg", "native-calibration-simple.json");

const T: any[] = CORPUS.SIMPLE_TASKS;

function nowIso(): string { return new Date().toISOString(); }

(async () => {
  const gen = GEN.makeLocalGenerator({ model: MODEL, timeoutMs: 180000, numPredict: 768, temperature: 0.1 });
  const buildSeam = async (s: any) => BUILDER.buildProject(s, { generateFile: gen, maxRepair: 1 });
  const started = nowIso(); const tStart = Date.now();
  let ledger: any[] = [];
  const records: any[] = [];

  for (let k = 0; k < T.length; k++) {
    const task = T[k];
    const architecture = [
      { path: "helper.js", role: `primitive for ${task.id}`, contract: task.helper },
      { path: "main.js", role: `${task.id} using the helper`, contract: task.main, dependsOn: ["helper.js"] },
    ];
    const spec = { name: `simple-${task.id}`, architecture, independentTest: (m: any) => { try { return task.test(m["main.js"]) === true; } catch { return false; } } };
    const t0 = Date.now(); let bo: any = null, err: any = null, cyc: any = null;
    try {
      cyc = await CYCLE.runNativeCycle(spec, ledger, { build: async (sp: any) => { bo = await buildSeam(sp); return bo; } }, { mode: "explore", exploreAuthorized: true, attempt: 1 });
      ledger = cyc.outcomes || ledger;
    } catch (e: any) { err = String((e && e.message) || e); }
    const ms = Date.now() - t0; const b = bo || {};
    const rec = { taskId: task.id, taskKind: "independent-task", family: "simple-helper-consumer", model: MODEL, complexity: "SIMPLE", strategy: DP.chooseStrategy(spec).strategy,
      filesGenerated: b.filesGenerated ?? 0, buildOk: b.buildOk === true, repairs: b.repairs ?? null,
      independentVerdict: err ? "BLOCKED" : (b.accepted === true ? "ACCEPT" : "REJECT"), accepted: b.accepted === true,
      falseSuccess: b.buildOk === true && b.verified === false && b.accepted === false, verifyError: b.verifyError || null, buildError: b.buildError || null, error: err, durationMs: ms, at: nowIso() };
    records.push(rec);
    process.stdout.write(`[${k + 1}/${T.length} ${rec.taskId}] ${rec.independentVerdict} buildOk=${rec.buildOk} repairs=${rec.repairs} false=${rec.falseSuccess} ${ms}ms\n`);
  }

  // CALIBRATION over the real ledger (UNCHANGED thresholds). Class for all = MONOLITHIC:SIMPLE.
  const rel = NBO.nativeReliabilityByClass(ledger);
  const sample = LEDGER.buildCalibrationSample(ledger, { basis: "attempt" });
  const cls = rel.byClass["MONOLITHIC:SIMPLE"] || { attempts: 0, successes: 0, failures: 0, reliability: null };
  const est = CAL.calibratedEstimate({ p: cls.reliability, observations: cls.attempts, successes: cls.successes, failures: cls.failures, source: "native-build:MONOLITHIC:SIMPLE" });
  const readiness = READY.assessReadiness({ name: "x", architecture: [{ path: "a.js" }, { path: "b.js", dependsOn: ["a.js"] }] }, ledger, {});
  const falseSuccesses = records.filter((r) => r.falseSuccess).length;

  const dataset = {
    "//": "CTO V40 LOT L — REAL native-engineering calibration campaign. Local model via 127.0.0.1:11434. NOT synthetic. Thresholds UNCHANGED. VERIFIED in-repo != DEPLOYED.",
    model: MODEL, host: "http://127.0.0.1:11434", mode: "EXPLORE + CALIBRATION (externally authorized — owner delegation 2026-11-10)",
    startedAt: started, finishedAt: nowIso(), totalDurationMs: Date.now() - tStart,
    class: "MONOLITHIC:SIMPLE",
    independence: "20 DISTINCT functional tasks (distinct contracts+tests), but one shared structural TEMPLATE (helper+consumer) => a correlated FAMILY. These are NOT 20 statistically-independent structures; reported as 20 distinct-task attempts within one family.",
    attempts: cls.attempts, successes: cls.successes, failures: cls.failures, reliability: cls.reliability,
    falseSuccesses, calibration: { quality: est.quality, uncertainty: est.uncertainty, reason: est.reason },
    readiness: { verdict: readiness.verdict, recommendProvider: readiness.recommendProvider, reason: readiness.reason },
    calibrationSample: sample,
    records,
    honesty: "every verdict decided by the INDEPENDENT verifier; failures are real task failures (difficulty gradient), never fabricated; thresholds (reliability>=0.8, MIN_OBS=20, bias/degraded) were NOT reduced; a correction proven on one case is NOT generalized.",
  };
  fs.writeFileSync(OUT, JSON.stringify(dataset, null, 2) + "\n");
  process.stdout.write(`\n=== CALIBRATION DATASET: ${OUT} ===\n`);
  process.stdout.write(JSON.stringify({ attempts: cls.attempts, successes: cls.successes, failures: cls.failures, reliability: cls.reliability, falseSuccesses, quality: est.quality, readiness: readiness.verdict, totalMs: dataset.totalDurationMs }, null, 2) + "\n");
})();

export {};
