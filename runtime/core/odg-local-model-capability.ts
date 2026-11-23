#!/usr/bin/env node
"use strict";

/*
 * V247 §3/§4/§5 — LOCAL-MODEL CAPABILITY QUALIFICATION + DENY-BY-DEFAULT TOOL GATE. PURE, deterministic. It answers the
 * directive's precondition: qualify the local model from REAL measurements BEFORE trusting it with engineering, and make
 * a model's output powerless to act on its own ("a valid JSON output is NOT an authorization").
 *
 * The qualification data (MEASURED_RESULTS) is REAL: qwen2.5-coder:3b was invoked on the host (CPU, 2.2GB, 4096 ctx) on
 * 2026-11-16 via the Ollama /api/generate API. Findings: it CAN follow structured instructions, emit schema-shaped JSON
 * and fix a trivial syntactic bug (return a-b → a+b), but it WRAPS JSON in markdown fences (format discipline imperfect)
 * and it MISJUDGED a destructive table-deletion as "LOW" risk (judgment unreliable). ⇒ the model is a bounded PROPOSER
 * for verifiable deterministic-checkable transforms, NOT a trusted judge — ODG's deterministic executor + independent
 * tests must verify everything (directive §12: proposing a patch ≠ verifying/integrating it safely).
 *
 * The TOOL GATE composes delegate-isolation.validateScope for the file-scope check — no second scheduler/engine. Dual export.
 */

const DI = require("./delegate-isolation.js");   // validateScope — reuse the canonical write-set scope check

const VERDICT = Object.freeze(["NATIVE_CAPABLE", "PARTIAL", "DELEGATE"]);
// REAL measured tasks (2026-11-16, qwen2.5-coder:3b, temperature 0). correct = deterministically verified by ODG.
const MEASURED_RESULTS = Object.freeze([
  { task: "schema-json", desc: "emit exact compact JSON to a schema", correct: true, formatClean: true, tokens: 10, ms: 7818, note: "exact {\"ok\":true,\"lang\":\"typescript\"}" },
  { task: "ts-bug-fix", desc: "fix a trivial TS bug (a-b → a+b) as structured JSON", correct: true, formatClean: false, tokens: 38, ms: 3140, note: "correct fix but markdown-fenced ⇒ ODG must strip fences" },
  { task: "risk-judgment", desc: "classify destructive change risk (delete DB table)", correct: false, formatClean: false, tokens: 76, ms: 5443, note: "called a destructive table-deletion LOW risk — WRONG; judgment NOT trusted" },
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// the model fences JSON in ```…``` — ODG strips before parsing (never trusts raw model text as a value).
function stripFences(s: any): string { return typeof s !== "string" ? "" : s.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/i, "").trim(); }

/*
 * admitToolCall(call, policy) -> DENY-BY-DEFAULT admission of a model-proposed tool call. A valid JSON output is NOT an
 * authorization. policy: { allowedTools:[], writeSet:[], forbidden:[] }. Deterministic.
 */
function admitToolCall(call: any, policy: any): any {
  const c = isObj(call) ? call : {};
  const p = isObj(policy) ? policy : {};
  const allowed = arr(p.allowedTools).map(String);
  const deny = (reason: string) => Object.freeze({ allow: false, reason, selfAuthorized: false });

  if (typeof c.tool !== "string" || !allowed.includes(c.tool)) return deny("tool '" + c.tool + "' not in the explicit allowlist (deny-by-default)");
  // a model cannot touch governance/permissions/evaluations.
  const path = typeof c.filePath === "string" ? c.filePath : null;
  const roPath = arr(p.readOnlyTools).map(String).includes(c.tool); // read-only tools may omit a target
  if (path === null && !c.command && !roPath) return deny("no target (filePath/command) to authorize against scope ⇒ DENY (fail-closed)");
  if (path !== null) {
    if (path.startsWith("/") || path.includes("..") || path.includes("\0")) return deny("path escapes the workspace (absolute / traversal / null) ⇒ DENY");
    const scope = DI.validateScope([{ rel: path }], arr(p.writeSet).map(String));
    if (scope.ok !== true) return deny("path '" + path + "' outside the authorized write-set ⇒ DENY");
  }
  const cmd = typeof c.command === "string" ? c.command : "";
  if (arr(p.forbidden).some((f: any) => typeof f === "string" && cmd.includes(f))) return deny("command contains a forbidden token ⇒ DENY");
  if (c.command && !allowed.includes("exec")) return deny("shell command proposed but 'exec' not allowed ⇒ DENY (model has no arbitrary shell)");
  return Object.freeze({ allow: true, reason: "tool allowed + path in write-set + no forbidden token (ODG's executor, not the model, authorized this)", selfAuthorized: false });
}

// verdict per measured task: correct + clean ⇒ NATIVE_CAPABLE; correct-but-messy ⇒ PARTIAL (ODG post-processes/verifies); wrong ⇒ DELEGATE.
function verdictOf(r: any): string { return r.correct !== true ? "DELEGATE" : (r.formatClean === true ? "NATIVE_CAPABLE" : "PARTIAL"); }

/* qualify(results) -> the honest capability matrix + overall conclusion. */
function qualify(results?: any): any {
  const rows = arr(results && results.length ? results : MEASURED_RESULTS).map((r) => Object.freeze({ task: r.task, desc: r.desc, verdict: verdictOf(r), correct: r.correct === true, formatClean: r.formatClean === true, tokens: r.tokens, ms: r.ms, note: r.note }));
  const count = (v: string) => rows.filter((x) => x.verdict === v).length;
  return Object.freeze({
    model: "qwen2.5-coder:3b", runtime: "CPU-only, ~2.2GB RAM, 4096 ctx", measuredOn: "2026-11-16",
    tasks: rows, nativeCapable: count("NATIVE_CAPABLE"), partial: count("PARTIAL"), delegate: count("DELEGATE"),
    overall: "PROPOSER_ONLY",
    conclusion: "the local model is a BOUNDED PROPOSER for verifiable deterministic-checkable transforms (code it can fix, schema it can shape) — ODG verifies by tests and must STRIP its markdown fences; it is NOT a trusted judge (it rated a destructive table-deletion LOW risk). A model that proposes a patch is NOT an engine that verifies/corrects/integrates it safely — that remains ODG's deterministic executor + independent evaluation. Judgment/risk tasks DELEGATE or verify.",
  });
}

function demonstrate(): any { return qualify(); }

const LOCAL_MODEL_CAPABILITY_CONTRACT = Object.freeze({
  id: "V247-LOCAL-MODEL-CAPABILITY",
  purpose: "§3/§4/§5 — qualify the local model from REAL measurements + deny-by-default tool gate (a valid JSON output is NOT an authorization)",
  verdicts: VERDICT,
  invariants: Object.freeze([
    "capability is from REAL measured runs (qwen2.5-coder:3b, 2026-11-16) — a failure is recorded as DELEGATE, never reframed as success",
    "DENY-BY-DEFAULT tool gate: a model's output cannot act — tool must be allowlisted, path in the write-set (no absolute/traversal), no forbidden token; the model has no arbitrary shell",
    "the model is a bounded PROPOSER, not a trusted judge; ODG's deterministic executor + independent tests verify every output; markdown fences are stripped",
    "composes delegate-isolation.validateScope for scope — no second scheduler/engine, no 10th primitive; proposing a patch ≠ safely integrating it",
  ]),
});

// ---- V155 Step 5 — MEASURED CAPABILITY REGISTRY (extends this canonical qualifier; no second registry). ---------------
// buildCapabilityRegistry aggregates a REAL benchmark run (odg-local-model-benchmark.runBenchmark output) into one entry
// per model. Every metric is { value, passes, n } — a metric with no measured trial is { value:null, status:"NOT_MEASURED" }
// (never 0, never assumed). Per-class status is QUALIFIED / PROBATION / DEMOTED / NOT_MEASURED from the measured pass rate
// against explicit thresholds; demotion events are derived from the APPENDED qualification history (not overwritten).

const REGISTRY_SCHEMA = "ODG_LOCAL_MODEL_CAPABILITY_REGISTRY_V1";
const CLASS_STATUS = Object.freeze({ QUALIFIED: "QUALIFIED", PROBATION: "PROBATION", DEMOTED: "DEMOTED", NOT_MEASURED: "NOT_MEASURED" });
const DEFAULT_THRESHOLDS = Object.freeze({ minPassRate: 0.67, demoteBelow: 0.5 });
const CODE_CLASSES = Object.freeze(["implement", "bugfix", "repair", "refactor", "test-writing"]);
const REPAIR_CLASSES = Object.freeze(["bugfix", "repair"]);

function r3(x: number): number { return Math.round(x * 1000) / 1000; }
function metric(passes: number, n: number): any { return n > 0 ? Object.freeze({ value: r3(passes / n), passes, n }) : Object.freeze({ value: null, passes: 0, n: 0, status: "NOT_MEASURED" }); }
function nums(xs: any[]): number[] { return xs.filter((x) => typeof x === "number" && Number.isFinite(x)); }
function stats(xs: any[]): any {
  const v = nums(xs).slice().sort((a, b) => a - b);
  if (!v.length) return Object.freeze({ status: "NOT_MEASURED", n: 0 });
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / v.length);
  const p50 = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return Object.freeze({ n: v.length, mean: Math.round(mean * 10) / 10, p50: Math.round(p50 * 10) / 10, min: v[0], max: v[v.length - 1], stdev: Math.round(sd * 10) / 10 });
}
function classStatus(m: any, t: any): string {
  if (!m || m.n === 0 || m.value === null) return CLASS_STATUS.NOT_MEASURED;
  if (m.value >= t.minPassRate) return CLASS_STATUS.QUALIFIED;
  if (m.value < t.demoteBelow) return CLASS_STATUS.DEMOTED;
  return CLASS_STATUS.PROBATION;
}

/**
 * buildCapabilityRegistry(run, opts?) -> frozen registry { schema, meta, thresholds, models:[entry], classes }. run = the
 * runBenchmark output { meta, models:[info], trials:[record], coldLoads, taskSet }. opts: { thresholds?, history? }.
 * Trials whose grade.measured === false are EXCLUDED from every denominator (NOT_MEASURED, never counted as pass/fail).
 */
function buildCapabilityRegistry(run: any, opts: any = {}): any {
  const R = isObj(run) ? run : {};
  const t = { ...DEFAULT_THRESHOLDS, ...(isObj(opts.thresholds) ? opts.thresholds : {}) };
  const trials = arr(R.trials).filter((x: any) => isObj(x) && isObj(x.grade));
  const classes = [...new Set(arr(R.taskSet && R.taskSet.tasks).map((x: any) => x.taskClass))].sort();
  const models = arr(R.models).map((info: any) => {
    const mine = trials.filter((x: any) => x.model === info.id && x.grade.measured !== false);
    const unmeasured = trials.filter((x: any) => x.model === info.id && x.grade.measured === false).length;
    const pass = (xs: any[]) => xs.filter((x: any) => x.grade.passed === true).length;
    const code = mine.filter((x: any) => CODE_CLASSES.includes(x.taskClass));
    const compileApplicable = mine.filter((x: any) => x.grade.compile && x.grade.compile.applicable);
    const structApplicable = mine.filter((x: any) => x.grade.structured && x.grade.structured.applicable);
    const strictApplicable = mine.filter((x: any) => x.grade.strict && x.grade.strict.applicable);
    const repair = mine.filter((x: any) => REPAIR_CLASSES.includes(x.taskClass));
    const perClass: any = {};
    for (const c of classes) {
      const xs = mine.filter((x: any) => x.taskClass === c);
      const m = metric(pass(xs), xs.length);
      perClass[c] = Object.freeze({ passRate: m, status: info.available === false ? "UNAVAILABLE" : classStatus(m, t), totalMs: stats(xs.map((x: any) => x.totalMs)) });
    }
    const taskIds = [...new Set(mine.map((x: any) => x.taskId))];
    const perTask = taskIds.map((id) => {
      const xs = mine.filter((x: any) => x.taskId === id);
      const p = pass(xs) / xs.length;
      return Object.freeze({ taskId: id, taskClass: xs[0].taskClass, trials: xs.length, passes: pass(xs), passRate: r3(p), passVariance: r3(p * (1 - p)), distinctOutputs: new Set(xs.map((x: any) => x.outputSha256 || "∅")).size, totalMs: stats(xs.map((x: any) => x.totalMs)) });
    });
    const mixed = perTask.filter((x: any) => x.passes > 0 && x.passes < x.trials).length;
    const cvs = perTask.map((x: any) => (x.totalMs && x.totalMs.mean ? x.totalMs.stdev / x.totalMs.mean : null)).filter((x: any) => x !== null) as number[];
    const knownLimits = classes.filter((c) => perClass[c].status === CLASS_STATUS.DEMOTED).map((c) => `${c}: measured pass rate ${perClass[c].passRate.value} < ${t.demoteBelow}`);
    const domains = classes.filter((c) => perClass[c].status === CLASS_STATUS.QUALIFIED);
    const failedGen = trials.filter((x: any) => x.model === info.id && x.generated === false);
    if (failedGen.some((x: any) => x.timedOut)) knownLimits.push(`timeouts on ${failedGen.filter((x: any) => x.timedOut).length} trial(s)`);
    return Object.freeze({
      id: info.id, available: info.available !== false, unavailableReason: info.available === false ? info.reason || "unavailable" : null,
      digest: info.digest || null, sizeBytes: Number.isFinite(info.sizeBytes) ? info.sizeBytes : null, quantization: info.quantization || null,
      parameterSize: info.parameterSize || null, parameterCount: Number.isFinite(info.parameterCount) ? info.parameterCount : null,
      contextLength: Number.isFinite(info.contextLength) ? info.contextLength : null,
      trialsMeasured: mine.length, trialsNotMeasured: unmeasured,
      resources: Object.freeze({ cpuAvgPct: stats(mine.map((x: any) => x.cpuAvgPct)), cpuPeakPct: stats(mine.map((x: any) => x.cpuPeakPct)), rssPeakMb: stats(mine.map((x: any) => x.rssPeakMb)), note: "sampled from the Ollama runner process via /proc during each trial (CPU% may exceed 100 on multi-core)" }),
      latency: Object.freeze({ ttftMs: stats(mine.map((x: any) => x.ttftMs)), totalMs: stats(mine.map((x: any) => x.totalMs)), coldLoad: isObj(R.coldLoads) && isObj(R.coldLoads[info.id]) ? R.coldLoads[info.id] : Object.freeze({ status: "NOT_MEASURED" }) }),
      speed: Object.freeze({ tokPerSec: stats(mine.map((x: any) => x.tokPerSec)), basis: "eval_count / eval_duration (daemon counters)" }),
      quality: Object.freeze({
        overallPassRate: metric(pass(mine), mine.length),
        compileRate: metric(compileApplicable.filter((x: any) => x.grade.compile.ok).length, compileApplicable.length),
        testPassRate: metric(pass(code), code.length),
        repairQuality: metric(pass(repair), repair.length),
        strictContractAdherence: metric(strictApplicable.filter((x: any) => x.grade.strict.ok).length, strictApplicable.length),
        structuredOutputRate: metric(structApplicable.filter((x: any) => x.grade.structured.ok).length, structApplicable.length),
      }),
      perClass: Object.freeze(perClass), perTask: Object.freeze(perTask),
      stability: Object.freeze({ trialsPerTask: perTask.length ? Math.min(...perTask.map((x: any) => x.trials)) : 0, tasksWithMixedOutcomes: mixed, maxPassVariance: perTask.length ? Math.max(...perTask.map((x: any) => x.passVariance)) : null, deterministicOutputTasks: perTask.filter((x: any) => x.distinctOutputs === 1).length, tasks: perTask.length, latencyCvMean: cvs.length ? r3(cvs.reduce((a, b) => a + b, 0) / cvs.length) : null }),
      knownLimits: Object.freeze(knownLimits), domains: Object.freeze(domains),
    });
  });
  const reg: any = { schema: REGISTRY_SCHEMA, meta: isObj(R.meta) ? R.meta : {}, thresholds: Object.freeze(t), classes: Object.freeze(classes), models: Object.freeze(models) };
  if (Array.isArray(opts.history)) reg.demotions = Object.freeze(detectDemotions(appendQualificationRecord(opts.history, reg, isObj(opts.record) ? opts.record : {})));
  return Object.freeze(reg);
}

/** appendQualificationRecord(history, registry, rec) -> NEW history (append-only; the input is never mutated). */
function appendQualificationRecord(history: any, registry: any, rec: any = {}): any[] {
  const perModel: any = {};
  for (const m of arr(registry && registry.models)) {
    const pc: any = {};
    for (const [c, v] of Object.entries(isObj(m.perClass) ? m.perClass : {})) pc[c] = Object.freeze({ passRate: (v as any).passRate.value, n: (v as any).passRate.n, status: (v as any).status });
    perModel[m.id] = Object.freeze({ available: m.available, digest: m.digest, perClass: Object.freeze(pc) });
  }
  const r = Object.freeze({ runId: typeof rec.runId === "string" ? rec.runId : "run-" + (arr(history).length + 1), at: typeof rec.at === "string" ? rec.at : null, head: typeof rec.head === "string" ? rec.head : null, taskSetVersion: registry && registry.meta ? registry.meta.taskSetVersion || null : null, perModel: Object.freeze(perModel) });
  return [...arr(history), r];
}

/** detectDemotions(history) -> [{ model, taskClass, from, to, passRate, runId }] — a class whose status FELL to DEMOTED in
 *  the latest record vs the previous one (or was DEMOTED on its first measurement: from=null). */
function detectDemotions(history: any): any[] {
  const h = arr(history); if (!h.length) return [];
  const last = h[h.length - 1]; const prev = h.length > 1 ? h[h.length - 2] : null;
  const out: any[] = [];
  for (const [model, v] of Object.entries(isObj(last.perModel) ? last.perModel : {})) {
    for (const [c, s] of Object.entries(isObj((v as any).perClass) ? (v as any).perClass : {})) {
      if ((s as any).status !== CLASS_STATUS.DEMOTED) continue;
      const before = prev && prev.perModel && prev.perModel[model] && prev.perModel[model].perClass && prev.perModel[model].perClass[c] ? prev.perModel[model].perClass[c].status : null;
      if (before === CLASS_STATUS.DEMOTED) continue;
      out.push(Object.freeze({ model, taskClass: c, from: before, to: CLASS_STATUS.DEMOTED, passRate: (s as any).passRate, runId: last.runId }));
    }
  }
  return out;
}

module.exports = { MEASURED_RESULTS, stripFences, admitToolCall, qualify, demonstrate, verdictOf, LOCAL_MODEL_CAPABILITY_CONTRACT, REGISTRY_SCHEMA, CLASS_STATUS, DEFAULT_THRESHOLDS, buildCapabilityRegistry, appendQualificationRecord, detectDemotions };
export {};
