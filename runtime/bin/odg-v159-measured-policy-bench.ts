#!/usr/bin/env node
"use strict";
/*
 * V15.9 §6 — BEFORE/AFTER MEASUREMENT of the measured model policy on the REAL local models, through the REAL wired caller
 * (odg-intelligent-native-cycle.runIntelligentCycle → policy seam → native-project-builder + independent verifier).
 *   BEFORE = calibrated policy only (no measured option — the pre-V15.9 call);
 *   AFTER  = same call + the committed V155 measured registry (loadMeasuredRegistry) for the MAPPED mission type.
 * Small reproducible set: 4 single-file missions, one per mapped code-build class (bugfix / repair / refactor /
 * implement), each with an INDEPENDENT test that is self-checked (reference solution passes, the original buggy/legacy
 * code fails) BEFORE any model run. Empty history ⇒ the calibrated policy is the PROBE tier (3b, maxRepair 1).
 * Local only: Ollama on 127.0.0.1:11434 (loopback guard on every request), temperature 0, seed 42, one request at a time,
 * runs grouped by model (one model loaded at a time; each group warmed once, then unloaded with keep_alive 0).
 * It never pulls/deletes models and calls no external provider. Model code runs in-process exactly as the existing
 * runtime/bin/odg-intelligent-native-run.ts does (native-project-builder's in-memory loader) — NOT in a sandbox.
 *
 * Usage: npx tsx runtime/bin/odg-v159-measured-policy-bench.ts [--trials N] [--write]
 */
const path = require("path");
const fs = require("fs");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const IC = require(path.join(ROOT, "runtime", "core", "odg-intelligent-native-cycle.js"));
const POL = require(path.join(ROOT, "runtime", "core", "odg-local-model-execution-policy.js"));
const GEN = require(path.join(ROOT, "runtime", "core", "local-model-generator.js"));
const BUILDER = require(path.join(ROOT, "runtime", "core", "native-project-builder.js"));

const HOST = "http://127.0.0.1:11434";
const OPTIONS = Object.freeze({ temperature: 0, seed: 42, num_predict: 400 });
const argv = process.argv.slice(2);
const TRIALS = Math.max(2, Number(argv[argv.indexOf("--trials") + 1]) || 2);
const WRITE = argv.includes("--write");

// loopback-only fetch: adds the fixed seed (local-model-generator sends temperature + num_predict only), refuses any
// non-loopback URL (fail-closed), and counts requests.
let requests = 0;
async function loopbackFetch(url: string, init: any): Promise<any> {
  if (!String(url).startsWith(HOST + "/")) throw new Error("non-loopback URL refused: " + url);
  requests++;
  if (!init || typeof init.body !== "string") return fetch(url, init);
  const body = JSON.parse(init.body);
  body.options = { ...(body.options || {}), seed: OPTIONS.seed, temperature: OPTIONS.temperature };
  return fetch(url, { ...init, body: JSON.stringify(body) });
}
const generatorFor = (model: string) => GEN.makeLocalGenerator({ model, host: HOST, timeoutMs: 180000, numPredict: OPTIONS.num_predict, temperature: OPTIONS.temperature }, loopbackFetch);

function loadSrc(src: string): any { const m = new (module as any).constructor("ref.js"); m._compile(src, "ref.js"); return m.exports; }
function safe(f: () => boolean): boolean { try { return f() === true; } catch { return false; } }
const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

const MISSIONS = [
  {
    id: "v159-bugfix-median", type: "bugfix",
    role: "Fix the bugs in this function: `module.exports = function median(xs) { const s = xs.sort(); return s[Math.floor(s.length / 2)]; }` — it sorts lexicographically (wrong for numbers like 10 vs 2), it mutates the caller's array, and it is wrong for even lengths.",
    contract: "module.exports = function median(xs) — xs is a non-empty array of numbers; return the median using NUMERIC order; for an even length return the mean of the two middle values; must NOT mutate xs.",
    test: (f: any) => typeof f === "function" && f([10, 2, 1]) === 2 && f([3, 1, 4, 2]) === 2.5 && f([-5, 100, 10]) === 10 && f([7]) === 7 && (() => { const a = [3, 1, 2]; f(a); return eq(a, [3, 1, 2]); })(),
    reference: "module.exports=function median(xs){const s=xs.slice().sort((a,b)=>a-b);const n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;}",
    original: "module.exports = function median(xs) { const s = xs.sort(); return s[Math.floor(s.length / 2)]; }",
  },
  {
    id: "v159-repair-total-length", type: "repair",
    role: "Repair this crashing function: `module.exports = (items) => items.reduce((a, x) => a + x.name.length)` — it has no initial accumulator, crashes on items without a name, and crashes on null/undefined input.",
    contract: "module.exports = function totalNameLength(items) — return the sum of item.name.length over the array; an item that is null or whose name is not a string counts 0; null/undefined/non-array input returns 0.",
    test: (f: any) => typeof f === "function" && f([{ name: "ab" }, { name: "cde" }]) === 5 && f([]) === 0 && f(null) === 0 && f(undefined) === 0 && f([{ name: "x" }, {}, null, { name: 7 }]) === 1 && f([{ name: "abcd" }]) === 4,
    reference: "module.exports=function(items){if(!Array.isArray(items))return 0;return items.reduce((a,x)=>a+(x&&typeof x.name==='string'?x.name.length:0),0);}",
    original: "module.exports = (items) => items.reduce((a, x) => a + x.name.length)",
  },
  {
    id: "v159-refactor-even-squares", type: "refactor",
    role: "Refactor this imperative code into a declarative equivalent WITHOUT any for/while loop (use filter/map): `module.exports = function evenSquares(xs) { var out = []; for (var i = 0; i < xs.length; i++) { if (xs[i] % 2 === 0) { out.push(xs[i] * xs[i]); } } return out; }`",
    contract: "module.exports = function evenSquares(xs) — return a NEW array with the squares of the even numbers of xs, in their original order; behaviour identical to the original; no for/while loops; must not mutate xs.",
    test: (f: any) => typeof f === "function" && eq(f([1, 2, 3, 4]), [4, 16]) && eq(f([]), []) && eq(f([-2, 5, 0]), [4, 0]) && !/\bfor\s*\(|\bwhile\s*\(/.test(String(f)) && (() => { const a = [2, 3]; f(a); return eq(a, [2, 3]); })(),
    reference: "module.exports=function evenSquares(xs){return xs.filter(x=>x%2===0).map(x=>x*x);}",
    original: "module.exports = function evenSquares(xs) { var out = []; for (var i = 0; i < xs.length; i++) { if (xs[i] % 2 === 0) { out.push(xs[i] * xs[i]); } } return out; }",
  },
  {
    id: "v159-implement-parse-range", type: "implement",
    role: "Implement a page-range parser.",
    contract: "module.exports = function parseRange(s) — s is a string like \"1-3,5,7-8\"; return the sorted array of UNIQUE integers it denotes (e.g. [1,2,3,5,7,8]); whitespace around parts is allowed; an empty string returns []; a reversed range (\"5-3\"), a non-integer part, or a negative number throws a RangeError.",
    test: (f: any) => typeof f === "function" && eq(f("1-3,5,7-8"), [1, 2, 3, 5, 7, 8]) && eq(f(" 2 , 1-2 "), [1, 2]) && eq(f(""), []) && eq(f("4"), [4]) && ["5-3", "a", "1-x", "-2", "1.5"].every((b) => { try { f(b); return false; } catch (e) { return e instanceof RangeError; } }),
    reference: "module.exports=function parseRange(s){if(s.trim()==='')return[];const out=new Set();for(const raw of s.split(',')){const p=raw.trim();let m;if(/^\\d+$/.test(p)){out.add(Number(p));}else if((m=p.match(/^(\\d+)\\s*-\\s*(\\d+)$/))){const a=Number(m[1]),b=Number(m[2]);if(a>b)throw new RangeError('reversed');for(let i=a;i<=b;i++)out.add(i);}else throw new RangeError('bad part '+p);}return [...out].sort((a,b)=>a-b);}",
    original: "module.exports = function parseRange(s) { return s.split(',').map(Number); }",
  },
];

function specOf(m: any): any {
  return { name: m.id, architecture: [{ path: "f.js", role: m.role, contract: m.contract }], independentTest: (mods: any) => safe(() => m.test(mods["f.js"])) };
}

async function ollama(pathname: string, body?: any): Promise<any> {
  const r = await loopbackFetch(HOST + pathname, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { method: "GET" } as any).catch((e: any) => ({ ok: false, error: e }));
  if (!r || r.ok !== true) return null;
  return r.json();
}
async function warm(model: string): Promise<number | null> { const t = Date.now(); const j = await ollama("/api/generate", { model, prompt: "ok", stream: false, options: { ...OPTIONS, num_predict: 1 }, keep_alive: "10m" }); return j ? Date.now() - t : null; }
async function unload(model: string): Promise<void> { await ollama("/api/generate", { model, prompt: "", stream: false, keep_alive: 0 }); }

(async () => {
  const startedAt = new Date().toISOString();
  const head = cp.execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  const version = await ollama("/api/version");
  const tags = await ollama("/api/tags");
  const installed = tags && Array.isArray(tags.models) ? tags.models.map((x: any) => x.name) : [];
  // independent-test self-check: the reference must PASS and the original must FAIL — otherwise the grader is invalid.
  const graderSelfTest = MISSIONS.map((m) => ({ id: m.id, referencePasses: safe(() => m.test(loadSrc(m.reference))), originalFails: !safe(() => m.test(loadSrc(m.original))) }));
  if (!graderSelfTest.every((g) => g.referencePasses && g.originalFails)) { process.stderr.write("grader self-test FAILED: " + JSON.stringify(graderSelfTest) + "\n"); process.exit(2); }
  const measured = POL.loadMeasuredRegistry();
  const now = Date.now();
  // plan every run with its policy first (pure), then execute grouped by model
  const plan: any[] = [];
  for (const m of MISSIONS) for (const condition of ["BEFORE_calibrated", "AFTER_measured"]) {
    const o = condition === "AFTER_measured" ? { measured, now } : {};
    const taskClass = IC.taskClassForMissionType(m.type);
    const pol = condition === "AFTER_measured" ? POL.chooseExecutionPolicy(m.type, [], { taskClass, measured, now }) : POL.chooseExecutionPolicy(m.type, []);
    for (let t = 1; t <= TRIALS; t++) plan.push({ mission: m, condition, trial: t, plannedModel: pol.model, opts: o });
  }
  const models = [...new Set(plan.map((p) => p.plannedModel))].sort();
  const runs: any[] = []; const warmMs: any = {};
  if (!version || !installed.length) { process.stderr.write("ollama not reachable on loopback — NOT_MEASURED\n"); }
  for (const model of models) {
    if (!installed.includes(model)) { for (const p of plan.filter((x) => x.plannedModel === model)) runs.push({ mission: p.mission.id, condition: p.condition, trial: p.trial, model, status: "NOT_MEASURED", reason: "model not installed" }); continue; }
    warmMs[model] = await warm(model);
    for (const p of plan.filter((x) => x.plannedModel === model)) {
      const r0 = requests; const t0 = Date.now();
      let r: any; let err: any = null;
      try { r = await IC.runIntelligentCycle({ mission: { id: p.mission.id, type: p.mission.type, spec: specOf(p.mission) }, history: [], generatorFor, deps: { buildProject: BUILDER.buildProject }, ...p.opts }); }
      catch (e: any) { err = String((e && e.message) || e); }
      const wallMs = Date.now() - t0;
      runs.push(r ? { mission: p.mission.id, type: p.mission.type, condition: p.condition, trial: p.trial, model: r.policy.model, maxRepair: r.policy.maxRepair, tier: r.policy.tier, accepted: r.accepted === true, cycleOutcome: r.cycleOutcome, escalateIfStillFails: r.policy.escalateIfStillFails === undefined ? null : r.policy.escalateIfStillFails, escalated: r.escalation.escalate === true, measured: r.policy.measured ? { status: r.policy.measured.status, taskClass: r.policy.measured.taskClass, decision: r.policy.measured.decision || null, qualifiedModel: r.policy.measured.qualifiedModel === undefined ? null : r.policy.measured.qualifiedModel, raised: !!r.policy.measured.raised, escalateSet: !!r.policy.measured.escalateSet } : null, generations: requests - r0, wallMs, status: "MEASURED" }
        : { mission: p.mission.id, condition: p.condition, trial: p.trial, model: p.plannedModel, status: "ERROR", error: err, wallMs });
      process.stderr.write(`${p.condition} ${p.mission.id} t${p.trial} ${model} accepted=${r && r.accepted} ${wallMs}ms\n`);
    }
    await unload(model);
  }
  const summarize = (cond: string) => {
    const xs = runs.filter((r) => r.condition === cond && r.status === "MEASURED");
    const per: any = {};
    for (const m of MISSIONS) {
      const ys = xs.filter((r) => r.mission === m.id);
      per[m.id] = ys.length ? { model: [...new Set(ys.map((y) => y.model))].join(","), passes: ys.filter((y) => y.accepted).length, n: ys.length, passRate: Math.round((ys.filter((y) => y.accepted).length / ys.length) * 1000) / 1000, wallMsMean: Math.round(ys.reduce((a, y) => a + y.wallMs, 0) / ys.length), escalatedOnFailure: ys.filter((y) => y.escalated).length } : { status: "NOT_MEASURED" };
    }
    const n = xs.length; const passes = xs.filter((y) => y.accepted).length;
    return { perMission: per, overall: n ? { passes, n, passRate: Math.round((passes / n) * 1000) / 1000, wallMsTotal: xs.reduce((a, y) => a + y.wallMs, 0) } : { status: "NOT_MEASURED" } };
  };
  const out = {
    schema: "V159_MEASURED_MODEL_POLICY_EVIDENCE", directive: "CTO V15.9 §6 — measured local-model registry ACTUALLY USED by the execution policy (monotone-safe overlay)",
    startedAt, generatedAt: new Date().toISOString(), head, note_head: "HEAD of the worktree when measured (the committed overlay code is the PR commit that includes this file)",
    ollama: { version: version ? version.version : "NOT_MEASURED", endpoint: HOST + " (loopback only)", installed },
    options: OPTIONS, trialsPerCondition: TRIALS, parallelism: 1, warmLoadMs: warmMs,
    host: { cpus: require("os").cpus().length, loadavgAtEnd: require("os").loadavg().map((x: number) => Math.round(x * 100) / 100), note: "shared host; wall time includes contention" },
    registry: measured.ok ? { source: measured.source, sha256: measured.sha256, generatedAt: measured.generatedAt, taskSetVersion: measured.taskSetVersion, evidenceHead: measured.head } : { status: "NOT_MEASURED", reason: measured.reason },
    mapping: IC.MISSION_TYPE_TO_TASK_CLASS, history: "empty ⇒ calibrated policy = PROBE (qwen2.5-coder:3b, maxRepair 1) for every mission (BEFORE)",
    missions: MISSIONS.map((m) => ({ id: m.id, type: m.type, taskClass: IC.taskClassForMissionType(m.type), contract: m.contract })),
    graderSelfTest, runs, before: summarize("BEFORE_calibrated"), after: summarize("AFTER_measured"),
    honesty: [
      "every number comes from the runs above (this host, this run); an absent measurement is NOT_MEASURED, never 0",
      "tiny set (4 missions × " + TRIALS + " trials per condition): it shows what the overlay changes on THESE missions only — not a general capability claim",
      "temperature 0 + seed 42 ⇒ near-deterministic outputs; wall time is real and includes shared-host contention and model warm state",
      "model-generated code ran in-process via native-project-builder (same path as runtime/bin/odg-intelligent-native-run.ts), NOT in the bwrap sandbox",
      "escalation on failure only CREATES a sovereign-delegation record (no provider was called)",
    ],
  };
  const json = JSON.stringify(out, null, 2) + "\n";
  if (WRITE) fs.writeFileSync(path.join(ROOT, "docs", "odg", "evidence", "V159_MEASURED_MODEL_POLICY.json"), json);
  process.stdout.write(JSON.stringify({ before: out.before, after: out.after }, null, 2) + "\n");
  process.exit(0);
})().catch((e) => { process.stderr.write("v159 bench error: " + String((e && e.message) || e) + "\n"); process.exit(1); });
export {};
