#!/usr/bin/env node
"use strict";

/*
 * V155 Step 5 — CLI: run the versioned local-model benchmark against the LOCAL Ollama daemon (loopback only) and write the
 * MEASURED capability registry + per-class selection + a live fallback probe to docs/odg/evidence/
 * V155_OLLAMA_CAPABILITY_REGISTRY.json. One model at a time. No pull/delete, no external provider, no API key.
 * The qualification history is APPENDED from the previous evidence file (never overwritten).
 *
 *   npx tsx runtime/bin/odg-local-model-benchmark.ts [--models a,b] [--trials 3] [--only taskId,..] [--out file] [--think false|true]
 *
 * V17.8 P2 MEASUREMENT PROFILE (contract V178-P2, docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json; owner record
 * docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json):
 *   npx tsx runtime/bin/odg-local-model-benchmark.ts --v178-measure --out docs/odg/evidence/V178_P2_MODEL_MEASUREMENT.json
 *     the SAME harness (runBenchmark) with the pre-registered P2 budgets (3 installed models, task set v2, 3 trials, loadCeiling,
 *     maxCalls, wallMs); writes ONLY its --out record (exactly P2_OUT — the V155 evidence file is never written by this mode);
 *     refused unless odg-authorization-scope derives RUN_CONTROLLED_EXPERIMENTS for V178-P2 (inspection ACCEPT bound to the
 *     contract sha) and the contract budgets equal P2_BUDGETS; an existing record ⇒ ALREADY_RECORDED; a busy host or an
 *     unreachable daemon BEFORE the first work call ⇒ NOT_MEASURED (no model call).
 *   npx tsx runtime/bin/odg-local-model-benchmark.ts --v178-measure-selftest   offline (fake daemon, fake sandbox), writes nothing.
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

/* =========================== V17.8 P2 measurement profile =========================== */
const P2_SCENARIO = "V178-P2";
const P2_OUT = "docs/odg/evidence/V178_P2_MODEL_MEASUREMENT.json";
const P2_INSPECTION = "docs/odg/evidence/V178_P2_CONTRACT_INSPECTION.json";
const P2_SELF = "runtime/bin/odg-local-model-benchmark.ts";
// GO-DT-1 dispatches POSITIONAL args only (no token may start with '-'): the measure mode is reachable as `v178-measure <OUT>`
const P2_ARGS = Object.freeze(["v178-measure", P2_OUT]);
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const P2_BUDGETS = Object.freeze({ models: Object.freeze(DEFAULT_MODELS.slice()), taskSetFile: "runtime/core/odg-local-model-benchmark-tasks.v2.json", trials: 3, options: B.DEFAULT_OPTIONS, keepAlive: "10m", perCallTimeoutMs: 240000,
  maxCalls: 105, wallMs: 3600000, hostIdleFactor: 0.75, loadCeilingFactor: 0.75, note: "maxCalls = 3 models × (1 warm-up + 11 tasks × 3 trials) = 102 + 3 slack; loadCeiling = nproc × loadCeilingFactor (same factor as HOST-1)" });
function p2Gate(root: string, contract: any): any {
  const AS = require("../core/odg-authorization-scope");
  const OCUR = require("../core/odg-observation-currency");
  if (!contract) return { ok: false, reason: `contract ${P2_SCENARIO} not found` };
  const AScanon = AS.canon;
  if (!contract.WORK_ITEM_CONTRACT || AScanon(contract.WORK_ITEM_CONTRACT.budgets) !== AScanon(P2_BUDGETS)) return { ok: false, reason: "contract budgets ≠ P2_BUDGETS (pre-registration enforced)" };
  let insp: any = null; try { insp = { ...JSON.parse(fs.readFileSync(path.join(root, P2_INSPECTION), "utf8")), recordPath: P2_INSPECTION }; } catch { insp = null; }
  const sc = AS.deriveAuthorizationScope(contract, { inspection: insp, probes: OCUR.localGitProbes(root) });
  if (!sc.applicable) return { ok: false, reason: `authorization scope not applicable: ${sc.reason}` };
  if (sc.currentStep !== "RUN_CONTROLLED_EXPERIMENTS" || sc.executionAuthorized !== true) return { ok: false, reason: `current step ${sc.currentStep} not execution-authorized: ${sc.reason}` };
  const t = contract.authorization && contract.authorization.dispatchTargets ? contract.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS : null;
  if (!t || t.command !== P2_SELF || JSON.stringify(t.args) !== JSON.stringify(P2_ARGS) || JSON.stringify(t.writeSet) !== JSON.stringify([P2_OUT])) return { ok: false, reason: "declared dispatch target is not this CLI with args [v178-measure P2_OUT] / writeSet [P2_OUT]" };
  return { ok: true, contractSha256: sc.contractSha256 };
}
/* p2CheckOut(argv) — the --out discipline of the measure mode: required, exactly P2_OUT (so never the V155 file). */
function p2CheckOut(argv: string[]): any {
  const i = argv.indexOf("--out"); const out = i >= 0 ? argv[i + 1] : null;
  if (!out) return { ok: false, code: 3, reason: "REFUSED: --v178-measure requires --out " + P2_OUT };
  if (path.resolve(out) === path.resolve(DEFAULT_OUT) || /V155_OLLAMA_CAPABILITY_REGISTRY\.json$/.test(out)) return { ok: false, code: 3, reason: "REFUSED: the V155 evidence file is never written by the measure mode" };
  if (out !== P2_OUT) return { ok: false, code: 3, reason: "REFUSED: --out must be the declared writeSet entry " + P2_OUT };
  return { ok: true, out };
}
/* runMeasurement(cfg) — injectable seams: provider, codeRunner, samplerFactory, loadavg, hostProbe ({loadavg,nproc}), nowMs. */
async function runMeasurement(cfg: any = {}): Promise<any> {
  const os = require("os");
  const prov = cfg.provider || P;
  const t0 = Date.now();
  const host = cfg.hostProbe ? cfg.hostProbe() : { loadavg: os.loadavg(), nproc: os.cpus().length };
  const threshold = host.nproc * P2_BUDGETS.hostIdleFactor;
  const base: any = { schema: "odg-v178-p2-measurement/1", scenario: P2_SCENARIO, label: cfg.label || null, contractSha256: cfg.contractSha256 || null, head: git(["rev-parse", "HEAD"]), startedAt: new Date(t0).toISOString(), budgets: P2_BUDGETS, rule: B.MEASURE_RULE,
    host: { nproc: host.nproc, loadavgAtStart: host.loadavg, idleThreshold: threshold, loadCeiling: host.nproc * P2_BUDGETS.loadCeilingFactor } };
  const finish = (x: any) => ({ ...base, ...x, outcome: x.verdict, wallMs: Date.now() - t0 });
  if (!(Number(host.loadavg[0]) <= threshold)) return finish({ verdict: "NOT_MEASURED", reason: `HOST-1: host busy at start (loadavg-1m ${host.loadavg[0]} > ${threshold}); no model call made` });
  const listed = await prov.listModels();
  if (!listed || listed.ok !== true) return finish({ verdict: "NOT_MEASURED", reason: "Ollama daemon not reachable before the first work call; no model call made" });
  const ts = B.loadTaskSet(cfg.taskSetFile);
  const run = await B.runBenchmark({ models: P2_BUDGETS.models, taskSet: ts, trials: P2_BUDGETS.trials, options: P2_BUDGETS.options, keepAlive: P2_BUDGETS.keepAlive, provider: prov, codeRunner: cfg.codeRunner, samplerFactory: cfg.samplerFactory, loadavg: cfg.loadavg, log: cfg.log, timeoutMs: P2_BUDGETS.perCallTimeoutMs, loadCeiling: base.host.loadCeiling, maxCalls: P2_BUDGETS.maxCalls, wallMs: P2_BUDGETS.wallMs, nowMs: cfg.nowMs });
  if (!run.ok) return finish({ verdict: "NOT_MEASURED", reason: "benchmark refused: " + run.reason });
  const summary = B.summarizeMeasurement(run);
  const anyGenerated = run.trials.some((t: any) => t.generated);
  return finish({ verdict: anyGenerated ? "MEASURED" : "FAIL", reason: anyGenerated ? "measurement recorded (every metric with n = 0 is NOT_MEASURED)" : "no trial generated after the first work call", meta: run.meta, models: run.models, coldLoads: run.coldLoads, summary,
    trials: run.trials.map((t: any) => ({ model: t.model, taskId: t.taskId, taskClass: t.taskClass, trial: t.trial, generated: t.generated, passed: !!(t.grade && t.grade.passed), measured: !(t.grade && t.grade.measured === false), tokPerSec: t.tokPerSec ?? null, promptTokPerSec: t.promptTokPerSec ?? null, totalMs: t.totalMs ?? null, loadMs: t.loadMs ?? null, hostLoad1m: t.hostLoad1m ?? null, contended: t.contended === true, rssPeakMb: t.rssPeakMb ?? null, resourceSamples: t.resourceSamples ?? 0, error: t.error || null })),
    honesty: ["host-specific numbers (shared host; CONTENDED trials excluded from speed stats, kept raw)", "temperature 0 + fixed seed: trials repeat near-deterministically — per-class pass rate n is small", "the V155 record is untouched; comparisons to it are LEARN-1's job (AC5), not this record's"] });
}
async function measureMain(argv: string[]): Promise<number> {
  const root = path.resolve(__dirname, "..", "..");
  const o = p2CheckOut(argv);
  if (!o.ok) { process.stdout.write(o.reason + "\n"); return o.code; }
  if (fs.existsSync(path.join(root, P2_OUT))) { process.stdout.write(`ALREADY_RECORDED: ${P2_OUT} exists — one execution only\n`); return 4; }
  let d: any = null; try { d = JSON.parse(fs.readFileSync(path.join(root, CONTRACTS), "utf8")); } catch { d = null; }
  const c = d ? (d.contracts || []).find((x: any) => x && x.scenario === P2_SCENARIO) : null;
  const g = p2Gate(root, c);
  if (!g.ok) { process.stdout.write(`NOT_AUTHORIZED: ${g.reason}\n`); return 2; }
  const r = await runMeasurement({ label: "NATIVE (ODG GO dispatch)", contractSha256: g.contractSha256, log: (s: string) => process.stderr.write(s + "\n") });
  fs.writeFileSync(path.join(root, P2_OUT), JSON.stringify(r, null, 2) + "\n");
  process.stdout.write(`P2 verdict ${r.verdict} → ${P2_OUT}\n`);
  return r.verdict === "MEASURED" ? 0 : 1;
}
/* fake daemon (test fixture — NOT a measurement) */
function fakeProvider(o: any = {}): any {
  const calls: any[] = [];
  return { calls, ollamaVersion: async () => ({ ok: true, version: "fake" }), listModels: async () => o.down ? { ok: false } : ({ ok: true, models: P2_BUDGETS.models.map((id: string) => ({ id, digest: "d", sizeBytes: 1, parameterSize: "1B", quantization: "Q" })) }),
    showModel: async () => ({ ok: false }), unloadModel: async () => ({ ok: true }),
    generateMeasured: async (x: any) => { calls.push(x.model); return { ok: true, text: "```js\nfunction chunk(a, s) { return []; }\n```", ttftMs: 5, totalMs: 100, evalCount: 50, evalDurationNs: 1e9, promptEvalCount: 200, promptEvalDurationNs: 5e8, loadDurationNs: calls.length === 1 ? 2e9 : 1e6, tokPerSec: 50, doneReason: "stop" }; } };
}
async function measureSelftest(): Promise<number> {
  let f = 0; const check = (n: string, c: boolean) => { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; };
  const fp = fakeProvider();
  const sampler = () => ({ start() {}, stop() { return { cpuAvgPct: null, cpuPeakPct: null, rssPeakMb: null, samples: 0, pids: [] }; } });
  const r = await runMeasurement({ provider: fp, codeRunner: () => ({ ran: false, reason: "selftest: no sandbox" }), samplerFactory: sampler, loadavg: () => 0.1, hostProbe: () => ({ loadavg: [0.1, 0.1, 0.1], nproc: 8 }) });
  check("offline: MEASURED with a fake daemon; prompt tok/s = 200 / 0.5 s = 400; RSS NOT_MEASURED (no /proc sample); no sandbox ⇒ JS code trials NOT_MEASURED; cold load from the warm-up", r.verdict === "MEASURED" && r.summary.models["qwen2.5-coder:7b"].speed.promptTokPerSec.mean === 400 && r.summary.models["qwen2.5-coder:7b"].rssPeakMb === null && r.trials.filter((t: any) => t.taskId === "impl-chunk").every((t: any) => t.measured === false) && r.summary.models["qwen2.5-coder:7b"].coldLoadMs === 2000);
  check("offline: calls within maxCalls", fp.calls.length <= P2_BUDGETS.maxCalls);
  return f;
}

async function main(): Promise<number> {
  if (process.argv.includes("--v178-measure-selftest")) return (await measureSelftest()) === 0 ? 0 : 1;
  if (process.argv[2] === "v178-measure") return measureMain(["--v178-measure", "--out", ...process.argv.slice(3, 4)]);   // positional form (GO-DT-1)
  if (process.argv.includes("--v178-measure")) return measureMain(process.argv.slice(2));
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

  const thinkRaw = arg("think", "");   // THINK-1: --think false|true (absent ⇒ unchanged V155 behaviour)
  if (thinkRaw !== "" && thinkRaw !== "true" && thinkRaw !== "false") { log("REFUSED: --think must be true or false"); return 3; }
  const run = await B.runBenchmark({ models, trials, onlyTasks: only, log, timeoutMs: 240000, ...(thinkRaw === "" ? {} : { think: thinkRaw === "true" }) });
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

module.exports = { main, runMeasurement, measureMain, measureSelftest, p2Gate, p2CheckOut, fakeProvider, P2_BUDGETS, P2_OUT, P2_ARGS, P2_SELF, P2_SCENARIO, P2_INSPECTION, DEFAULT_OUT, DEFAULT_MODELS };
export {};
