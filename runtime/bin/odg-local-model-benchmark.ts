#!/usr/bin/env node
"use strict";

/*
 * V155 Step 5 — CLI: run the versioned local-model benchmark against the LOCAL Ollama daemon (loopback only) and write the
 * MEASURED capability registry + per-class selection + a live fallback probe to docs/odg/evidence/
 * V155_OLLAMA_CAPABILITY_REGISTRY.json. One model at a time. No pull/delete, no external provider, no API key.
 * The qualification history is APPENDED from the previous evidence file (never overwritten).
 *
 *   npx tsx runtime/bin/odg-local-model-benchmark.ts [--models a,b] [--trials 3] [--only taskId,..] [--out file]
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const P = require("../core/ollama-provider");
const B = require("../core/odg-local-model-benchmark");
const CAP = require("../core/odg-local-model-capability");
const ROUTER = require("../core/odg-model-router");

const DEFAULT_MODELS = ["qwen2.5-coder:7b", "qwen2.5-coder:3b", "qwen2.5:0.5b"];
const DEFAULT_OUT = "docs/odg/evidence/V155_OLLAMA_CAPABILITY_REGISTRY.json";
const ABSENT_PROBE_MODEL = "qwen2.5-coder:14b"; // deliberately NOT installed — proves real unavailable-model fallback

function arg(name: string, def: any): any { const i = process.argv.indexOf("--" + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def; }
function git(args: string[]): string | null { const r = spawnSync("git", args, { encoding: "utf8" }); return r.status === 0 ? String(r.stdout).trim() : null; }

async function main(): Promise<number> {
  const models = String(arg("models", DEFAULT_MODELS.join(","))).split(",").map((s: string) => s.trim()).filter(Boolean);
  const trials = Number(arg("trials", 3));
  const only = arg("only", "") ? String(arg("only", "")).split(",") : [];
  const out = path.resolve(arg("out", DEFAULT_OUT));
  let prev: any = null; try { prev = JSON.parse(fs.readFileSync(out, "utf8")); } catch { prev = null; }
  const history = prev && Array.isArray(prev.qualificationHistory) ? prev.qualificationHistory : [];
  const head = git(["rev-parse", "HEAD"]);
  const startedAt = new Date().toISOString();
  const startLoad = require("os").loadavg().map((x: number) => Math.round(x * 100) / 100);
  const log = (s: string) => process.stderr.write(s + "\n");

  const run = await B.runBenchmark({ models, trials, onlyTasks: only, log, timeoutMs: 240000 });
  if (!run.ok) { log("benchmark refused: " + run.reason); return 1; }
  const record = { runId: "v155-" + startedAt, at: startedAt, head };
  const registry = CAP.buildCapabilityRegistry(run, { history, record });
  const newHistory = CAP.appendQualificationRecord(history, registry, record);

  const live = await P.listModels();
  const available = live.ok ? live.models.map((m: any) => m.id) : [];
  const selection: any = {};
  for (const c of registry.classes) {
    selection[c] = {
      qualityFirst: ROUTER.selectMeasured({ taskClass: c, registry, available }),
      underBudget30s: ROUTER.selectMeasured({ taskClass: c, registry, available, latencyBudgetMs: 30000, qualityTolerance: 0.1 }),
    };
  }

  // LIVE fallback probe: an absent model first ⇒ the daemon answers "not found" ⇒ UNAVAILABLE ⇒ next model.
  const probeTask = run.taskSet.tasks.find((t: any) => t.id === "judgment-risk-drop-table");
  const full = B.loadTaskSet().tasks.find((t: any) => probeTask && t.id === probeTask.id);
  const primary = selection.judgment && selection.judgment.qualityFirst.model ? selection.judgment.qualityFirst.model : models[models.length - 1];
  const fallbackProbe = full ? await ROUTER.runWithFallback({ decision: "LOCAL", requiresAuthorization: false, model: ABSENT_PROBE_MODEL, fallbackOrder: [primary] }, async (m: string) => {
    const g = await P.generateMeasured({ model: m, prompt: full.prompt, options: run.meta.options, timeoutMs: 120000 });
    if (!g.ok) return g;
    const grade = B.gradeTrial(full, g.text);
    return { ok: true, passed: grade.passed, totalMs: g.totalMs };
  }) : { outcome: "NOT_MEASURED", reason: "probe task not in the run" };
  await P.unloadModel(primary);

  // LIVE grader self-test in the REAL sandbox (the #898 inspection attacks): every probe must FAIL to pass.
  const add = { id: "selftest-add", taskClass: "selftest", lang: "js", grader: "hidden-test", fnName: "add", cases: [{ args: [1, 2], expect: 3 }, { args: [2, 2], expect: 4 }] };
  const probes: any = {
    correctCandidatePasses: "function add(a, b) { return a + b; }",
    assertNeuter: "require('assert').strictEqual = () => {}; function add(a, b) { return a - b; }",
    stderrMarkerExit3: "function add(a, b) { return 0; } process.stderr.write('\\n__ODG_RESULT__{\"pass\":true}\\n'); process.exit(3);",
    constructorEscape: "const p = this.constructor.constructor('return typeof process')(); function add(a, b) { return p === 'object' ? a + b : -999; }",
    memoryBomb: "const b = []; for (let i = 0; i < 40; i++) b.push(new Uint8Array(256 * 1024 * 1024)); function add(a, b) { return a + b; }",
    infiniteLoop: "while (true) {} function add(a, b) { return a + b; }",
  };
  const graderSelfTest: any = {};
  for (const [k, code] of Object.entries(probes)) { const t0 = Date.now(); const g = B.gradeTrial(add, code); graderSelfTest[k] = { passed: g.passed, measured: g.measured, ms: Date.now() - t0, reason: String(g.reason).slice(0, 140) }; }
  const t0b = Date.now(); const PSB = require("../core/provider-sandbox");
  const bomb = PSB.runProvider("const b = []; for (let i = 0; i < 40; i++) b.push(Buffer.alloc(256 * 1024 * 1024)); console.log('ALLOCATED');", { command: "node -", timeoutMs: 60000, memoryLimitBytes: B.CODE_MEMORY_LIMIT_BYTES });
  graderSelfTest.bufferBombRawSandbox = { launched: bomb.launched, ok: bomb.ok, ms: Date.now() - t0b, allocatedAll: /ALLOCATED/.test(String(bomb.text || "")) };
  log("grader self-test: " + JSON.stringify(graderSelfTest));

  const trialsSummary = run.trials.map((t: any) => ({ model: t.model, taskId: t.taskId, trial: t.trial, passed: t.grade.passed, measured: t.grade.measured !== false, compileOk: t.grade.compile.applicable ? t.grade.compile.ok : null, structuredOk: t.grade.structured.applicable ? t.grade.structured.ok : null, strictOk: t.grade.strict.applicable ? t.grade.strict.ok : null, reason: String(t.grade.reason || "").replace(/\s+/g, " ").slice(0, 140), ttftMs: t.ttftMs ?? null, totalMs: t.totalMs ?? null, tokPerSec: t.tokPerSec ?? null, evalCount: t.evalCount ?? null, hostLoad1m: t.hostLoad1m ?? null, cpuAvgPct: t.cpuAvgPct, rssPeakMb: t.rssPeakMb, outputSha256: t.outputSha256 || null, error: t.error || null }));
  const evidence = {
    schema: "V155_OLLAMA_CAPABILITY_REGISTRY_EVIDENCE",
    directive: "CTO V15.5 Step 5 — measured local-model capability registry",
    generatedAt: new Date().toISOString(), startedAt, head, branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    host: { cpus: require("os").cpus().length, memGb: Math.round(require("os").totalmem() / 1e9), gpu: "none assumed (CPU inference)", loadavgAtStart: startLoad, loadavgAtEnd: require("os").loadavg().map((x: number) => Math.round(x * 100) / 100), note: "the host is SHARED with other sessions; per-trial hostLoad1m is recorded so latency/throughput can be read against contention" },
    ollama: { version: run.meta.ollamaVersion, endpoint: "http://127.0.0.1:11434 (loopback only)", daemonUp: run.meta.daemonUp },
    options: run.meta.options, keepAlive: run.meta.keepAlive, parallelism: 1,
    taskSet: { file: "runtime/core/odg-local-model-benchmark-tasks.v2.json", version: run.taskSet.version, sha256: run.taskSet.sha256, tasks: run.taskSet.tasks },
    thresholds: registry.thresholds,
    registry: { schema: registry.schema, classes: registry.classes, models: registry.models },
    graderSelfTest,
    selection, fallbackProbe: { absentModel: ABSENT_PROBE_MODEL, ...fallbackProbe },
    demotions: registry.demotions || [],
    qualificationHistory: newHistory,
    trialsSummary,
    honesty: [
      "every number above comes from the trials in trialsSummary (this run); a metric with n=0 is NOT_MEASURED, never 0 or assumed",
      "graders are objective: hidden tests / mutation-killing / exact JSON / strict schema; candidate code ran only inside the bubblewrap provider sandbox",
      "temperature 0 + fixed seed ⇒ trials are near-deterministic; stability reports outcome variance AND distinct outputs, latency variance is real wall-clock",
      "the daemon-down path is proven by unit tests with an injected transport, NOT live (stopping Ollama is out of scope)",
      "small task set (11 tasks, 8 classes): it qualifies these task classes on this host only — not general model capability",
    ],
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n");
  log("wrote " + out);
  for (const m of registry.models) log(`${m.id}: overall=${m.quality.overallPassRate.value} compile=${m.quality.compileRate.value} test=${m.quality.testPassRate.value} repair=${m.quality.repairQuality.value} strict=${m.quality.strictContractAdherence.value} structured=${m.quality.structuredOutputRate.value} tps=${m.speed.tokPerSec.mean} ttftP50=${m.latency.ttftMs.p50} totalP50=${m.latency.totalMs.p50} rss=${m.resources.rssPeakMb.max}`);
  for (const c of registry.classes) log(`${c}: ${selection[c].qualityFirst.decision} ${selection[c].qualityFirst.model} fallback=${JSON.stringify(selection[c].qualityFirst.fallbackOrder)} | budget30s: ${selection[c].underBudget30s.model}`);
  log("fallback probe: " + JSON.stringify(fallbackProbe.attempts || fallbackProbe));
  return 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code), (e) => { process.stderr.write(String((e && e.stack) || e) + "\n"); process.exit(1); });
}

module.exports = { main };
export {};
