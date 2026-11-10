#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V42 LOT O — HARD benchmark SLICE runner (visible foreground; NO background/monitor). Processes a slice of
 * the HARD corpus for ONE model and APPENDS the real outcomes to a persistent dataset, so the full 3B-vs-7B duel runs as
 * sequential visible chunks under the foreground time cap. One build per task x model with the existing repair policy
 * (maxRepair=1); the builder's firstPass instrumentation gives the INITIAL verdict and the final gives the post-repair
 * verdict. The INDEPENDENT verifier decides; the generator never self-accepts. Local only; no VPS/push.
 * Run: `npx tsx runtime/bin/odg-native-hardbench.ts <3b|7b> <startIdx> <endIdx> <datasetPath>`.
 */

const BUILDER = require("../core/native-project-builder.js");
const GEN = require("../core/local-model-generator.js");
const { HARD_TASKS } = require("./native-hard-corpus.js");
const fs = require("fs");

const MODELS: any = { "3b": "qwen2.5-coder:3b", "7b": "qwen2.5-coder:7b" };
const modelArg = String(process.argv[2] || "3b");
const start = Math.max(0, parseInt(process.argv[3] || "0", 10));
const end = Math.min(HARD_TASKS.length, parseInt(process.argv[4] || String(HARD_TASKS.length), 10));
const OUT = process.argv[5];
const MAX_REPAIR = Number.isFinite(parseInt(process.argv[6], 10)) ? parseInt(process.argv[6], 10) : 1;   // optional 6th arg: repair budget (default 1)
if (!MODELS[modelArg] || !OUT) { process.stderr.write("usage: odg-native-hardbench.ts <3b|7b> <startIdx> <endIdx> <datasetPath> [maxRepair]\n"); process.exit(2); }
const model = MODELS[modelArg];

function nowIso(): string { return new Date().toISOString(); }
function archOf(task: any): any[] { return task.files.map((f: any) => ({ path: f.path, role: f.path.replace(/\.js$/, ""), contract: f.contract, dependsOn: f.dependsOn || [] })); }

(async () => {
  const dataset: any = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { "//": "CTO V42 LOT O — REAL hard COMPLEX benchmark. Local qwen2.5-coder via 127.0.0.1:11434. NOT synthetic. Thresholds unchanged. One build/task/model, maxRepair=1. VERIFIED in-repo != DEPLOYED.", models: MODELS, records: [] };
  const gen = GEN.makeLocalGenerator({ model, timeoutMs: 300000, numPredict: 1024, temperature: 0.1 });

  for (let i = start; i < end; i++) {
    const task = HARD_TASKS[i];
    const spec = { name: `hard-${task.id}`, architecture: archOf(task), writeSet: task.files.map((f: any) => f.path), independentTest: (m: any) => { try { return task.test(m["report.js"]) === true; } catch { return false; } } };
    const t0 = Date.now(); let bo: any = null, err: any = null;
    try { bo = await BUILDER.buildProject(spec, { generateFile: gen, maxRepair: MAX_REPAIR }); } catch (e: any) { err = String((e && e.message) || e); }
    const ms = Date.now() - t0; const b = bo || {}; const fp = b.firstPass || {};
    const rec = {
      taskId: task.id, family: task.family, fileCount: task.files.length, model,
      firstPassAccepted: fp.buildOk === true && fp.verified === true,
      firstPassBuildOk: fp.buildOk === true, firstPassFalseSuccess: fp.buildOk === true && fp.verified === false, firstPassError: fp.error || null,
      repairs: b.repairs ?? null, finalAccepted: b.accepted === true,
      repairedToAccept: b.accepted === true && (b.repairs || 0) > 0,
      persistentFailure: !err && b.accepted !== true, finalFalseSuccess: b.buildOk === true && b.verified === false && b.accepted !== true,
      finalError: err || b.buildError || b.verifyError || null, filesGenerated: b.filesGenerated ?? 0, durationMs: ms, at: nowIso(),
    };
    // dedup by (taskId, model): a re-run overwrites the prior record (no duplicate inflation).
    dataset.records = dataset.records.filter((r: any) => !(r.taskId === rec.taskId && r.model === rec.model));
    dataset.records.push(rec);
    fs.writeFileSync(OUT, JSON.stringify(dataset, null, 2) + "\n");
    process.stdout.write(`[${modelArg} ${i + 1}/${HARD_TASKS.length} ${task.id} ${task.family} ${task.files.length}f] first=${rec.firstPassAccepted ? "ACC" : (rec.firstPassFalseSuccess ? "FALSE" : "FAIL")} final=${rec.finalAccepted ? "ACCEPT" : "REJECT"} repairs=${rec.repairs} ${ms}ms\n`);
  }
  process.stdout.write(`=== slice done: ${modelArg} [${start},${end}) -> ${OUT} (${dataset.records.length} total records) ===\n`);
})();

export {};
