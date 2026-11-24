#!/usr/bin/env node
"use strict";
/*
 * V17.5 NB2 (owner CTO directive 2026-11-24 « REPRISE DE SESSION ET ACCÉLÉRATION ODG » §E; owner record
 * docs/odg/V175_OWNER_AUTHORIZATION_NATIVE_BUILD.json « développer et tester la boucle d'ingénierie native d'ODG ») —
 * ODG NATIVE DESIGN PIPELINE: the SHARED stages of ODG's native-engineering loop. NB1's runner
 * (runtime/bin/odg-v175-native-build-run.ts) was refactored to use the plumbing stages below (guard / transpile /
 * typecheck / diff / apply-check); NB2's runner (runtime/bin/odg-v175-native-design-run.ts) composes ALL of them.
 * NO second engine: generation+repair stays native-project-builder.buildProject, execution stays
 * odg-native-build-sandbox.runIsolated (bwrap), impact stays change-impact-graph.impactOf, memory stays
 * memory-taxonomy (lessons are memory records carried in the run records — no new store).
 *
 * STAGES (each output records WHO authored it — the AUTHORSHIP LEDGER):
 *   S1 PROBLEM   deriveProblem — PROB-1: execute the CURRENT module and the in-repo REFERENCE on a corpus; the failing
 *                cases (output ≠ reference) ARE the problem. The statement given to the model is rendered ONLY from those
 *                cases (input → expected / actual) + the current source: no provider-written algorithm text.
 *   S2 IMPACT    analyseImpact — IMP-1 change-impact-graph.impactOf (consumers, closure, hazards) + IMP-2 test files that
 *                reference the module by name (impactOf's impactedTests scans *.test.js only — stated, supplemented).
 *   S3 DESIGN    designPrompt / parseDesigns — the LOCAL MODEL proposes ≥2 short designs (JSON plans).
 *   S4 SELECT    scoreCandidate / selectDesign — every design is implemented once by the local model and measured by
 *                ODG: write-set conformity, oracle cases passed IN THE SANDBOX, strict typecheck, callers affected
 *                (export-surface change × consumers), diff size. SEL-1 picks lexicographically (mechanical, no model).
 *   S5 BUILD     the chosen implementation enters buildProject's bounded repair (shown failing case as the hint) +
 *                strict typecheck — acceptance only by the host-graded held-out oracle.
 *   S6 LEARN     deriveLessons / collectLessons — lessons (memory-taxonomy records, family "engineering") recorded in the
 *                run record and READ by the next run: their hints enter the prompts and their case kinds are forced
 *                into the shown examples (reuse is mechanical and visible in the prompt).
 * PROMPT HYGIENE: every prompt is built from SEGMENTS { kind: TEMPLATE | EVIDENCE, text }. TEMPLATE text is fixed
 * provider plumbing (format instructions) and must contain none of ALGORITHM_HINT_DENYLIST (tested); EVIDENCE text is
 * rendered by ODG rules from executed observations, the current source, the impact report, model designs, lessons.
 *
 * Deterministic for a fixed transport (temperature 0, seed fixed); host executes only repo code (reference + the CURRENT
 * integrated module) in fresh vm contexts; model code executes only in the bwrap sandbox. Writes nothing.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const cp = require("child_process");
const NBS = require("./odg-native-build-sandbox.js");
const GEN = require("./local-model-generator.js");
const CIG = require("./change-impact-graph.js");
const MEM = require("./memory-taxonomy.js");
let TS_LIB: any = null;
function tsLib(): any { if (!TS_LIB) TS_LIB = require("typescript"); return TS_LIB; }   // loaded once, on first use

const sha256 = (s: any): string => crypto.createHash("sha256").update(String(s)).digest("hex");
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/* =========================== shared plumbing (moved from the NB1 runner; behaviour unchanged) =========================== */
const OLLAMA = Object.freeze({ protocol: "http:", host: "127.0.0.1", port: "11434" });
const OLLAMA_URL = `http://${OLLAMA.host}:${OLLAMA.port}/api/generate`;

/* makeGuard(transport, caps) — exact loopback allowlist + call/wall caps + per-prompt sha record. */
function makeGuard(transport: any, caps: any): any {
  const st: any = { modelCalls: 0, warmupCalls: 0, refused: [] as any[], prompts: [] as any[], capHit: null as any, deadline: Date.now() + caps.wallMs };
  const fetchImpl = async (url: any, init: any = {}): Promise<any> => {
    let u: any = null; try { u = new URL(String(url)); } catch { /* refused */ }
    if (!u || u.protocol !== OLLAMA.protocol || u.hostname !== OLLAMA.host || u.port !== OLLAMA.port || u.pathname !== "/api/generate") {
      st.refused.push(String(url).slice(0, 200));
      throw new Error("V175 network guard: only http://127.0.0.1:11434/api/generate is allowed");
    }
    if (st.modelCalls >= caps.maxModelCalls) { st.capHit = st.capHit || "maxModelCalls"; throw new Error("V175 cap: maxModelCalls"); }
    if (Date.now() > st.deadline) { st.capHit = st.capHit || "wallMs"; throw new Error("V175 cap: wallMs"); }
    const body = init && typeof init.body === "string" ? JSON.parse(init.body) : {};
    // V17.6 ADAPT-1: the warm-up call (rate measurement) has its OWN cap (maxWarmupCalls) and num_predict (warmupNumPredict);
    // it never consumes the work budget maxModelCalls. Same allowlist, same deadline.
    const warm = !!(init && init.odgWarmup === true);
    if (warm) {
      if (st.warmupCalls >= (Number(caps.maxWarmupCalls) || 0)) { st.capHit = st.capHit || "maxWarmupCalls"; throw new Error("V176 cap: maxWarmupCalls"); }
      if (Date.now() > st.deadline) { st.capHit = st.capHit || "wallMs"; throw new Error("V175 cap: wallMs"); }
      body.options = { ...(body.options || {}), seed: caps.seed, temperature: caps.temperature, num_predict: caps.warmupNumPredict };
      st.warmupCalls++;
      st.prompts.push({ i: "W" + st.warmupCalls, model: body.model, promptSha256: sha256(body.prompt || ""), promptChars: String(body.prompt || "").length, warmup: true });
      const { odgWarmup, ...rest } = init;
      return transport(String(url), { ...rest, body: JSON.stringify(body) });
    }
    body.options = { ...(body.options || {}), seed: caps.seed, temperature: caps.temperature, num_predict: caps.numPredict };
    st.modelCalls++;
    st.prompts.push({ i: st.modelCalls, model: body.model, promptSha256: sha256(body.prompt || ""), promptChars: String(body.prompt || "").length });
    return transport(String(url), { ...init, body: JSON.stringify(body) });
  };
  return { st, fetchImpl };
}

/* transpile(tsSrc) — TypeScript → CommonJS JavaScript (a build step; no semantic change). */
function transpile(tsSrc: string): any {
  const ts = tsLib();
  const r = ts.transpileModule(tsSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, reportDiagnostics: true });
  const diags = (r.diagnostics || []).map((d: any) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  return { js: r.outputText, syntaxErrors: diags };
}
/* typecheck(tsSrc, fileName?) — strict + isolatedModules in-memory program; CommonJS globals declared `any`. */
function typecheck(tsSrc: string, fileName: string = "odg-canonical-json.ts"): any {
  const ts = tsLib();
  const F = "/odg-v175/" + path.basename(fileName), A = "/odg-v175/ambient.d.ts";
  const mem: any = { [F]: tsSrc, [A]: "declare var module: any;\ndeclare var require: any;\ndeclare var exports: any;\n" };
  const options = { strict: true, noEmit: true, isolatedModules: true, target: ts.ScriptTarget.ES2020, lib: ["lib.es2020.d.ts"], types: [], skipLibCheck: true };
  const host = ts.createCompilerHost(options);
  const gsf = host.getSourceFile.bind(host);
  host.getSourceFile = (n: string, lv: any, ...rest: any[]) => mem[n] !== undefined ? ts.createSourceFile(n, mem[n], lv) : gsf(n, lv, ...rest);
  const fe = host.fileExists.bind(host); host.fileExists = (n: string) => mem[n] !== undefined || fe(n);
  const rf = host.readFile.bind(host); host.readFile = (n: string) => mem[n] !== undefined ? mem[n] : rf(n);
  const prog = ts.createProgram([F, A], options, host);
  const diags = ts.getPreEmitDiagnostics(prog).map((d: any) => (d.file ? path.basename(d.file.fileName) + (d.start !== undefined ? ":" + (d.file.getLineAndCharacterOfPosition(d.start).line + 1) : "") + " " : "") + ts.flattenDiagnosticMessageText(d.messageText, " "));
  return { ok: diags.length === 0, diagnostics: diags.slice(0, 10) };
}
function newFileDiff(rel: string, content: string): string {
  const body = content.endsWith("\n") ? content : content + "\n";
  const ls = body.slice(0, -1).split("\n");
  return [`diff --git a/${rel} b/${rel}`, "new file mode 100644", "--- /dev/null", `+++ b/${rel}`, `@@ -0,0 +1,${ls.length} @@`, ...ls.map((l) => "+" + l)].join("\n") + "\n" + (content.endsWith("\n") ? "" : "\\ No newline at end of file\n");
}
/* replaceFileDiff(rel, old, new) — one whole-file hunk (old lines removed, new lines added); git apply accepts it. */
function replaceFileDiff(rel: string, oldContent: string, newContent: string): string {
  const side = (c: string, sign: string): string[] => { const nl = c.endsWith("\n"); const ls = (nl ? c.slice(0, -1) : c).split("\n").map((l) => sign + l); if (!nl) ls.push("\\ No newline at end of file"); return ls; };
  const n = (c: string) => (c.endsWith("\n") ? c.slice(0, -1) : c).split("\n").length;
  return [`diff --git a/${rel} b/${rel}`, `--- a/${rel}`, `+++ b/${rel}`, `@@ -1,${n(oldContent)} +1,${n(newContent)} @@`, ...side(oldContent, "-"), ...side(newContent, "+")].join("\n") + "\n";
}
function gitApplyCheck(root: string, diff: string): any {
  const r = cp.spawnSync("git", ["-C", root, "apply", "--check", "-"], { input: diff, encoding: "utf8", timeout: 30000 });
  return { ok: r.status === 0, stderr: String(r.stderr || "").slice(0, 500) };
}
function headOf(root: string): string | null { try { return String(cp.execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim(); } catch { return null; } }

/* changedLines(a, b) — lines removed + lines added under an LCS alignment (the DIFF-SIZE metric of SEL-1). */
function changedLines(a: string, b: string): number {
  const x = String(a).split("\n"), y = String(b).split("\n");
  const m = x.length, n = y.length; const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  return (m - dp[0][0]) + (n - dp[0][0]);
}
/* exportedNames(tsSrc) — names in `module.exports = { a, b: c }` (TypeScript PARSE only — model code is never executed on the host). */
function exportedNames(tsSrc: string): string[] | null {
  const ts = tsLib();
  let sf: any; try { sf = ts.createSourceFile("x.ts", String(tsSrc), ts.ScriptTarget.ES2020, true); } catch { return null; }
  let names: string[] | null = null;
  const visit = (n: any) => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && n.left.getText(sf) === "module.exports" && ts.isObjectLiteralExpression(n.right)) {
      names = n.right.properties.map((p: any) => (p.name ? p.name.getText(sf) : "?")).sort();
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

/* ollamaGenerate(fetchImpl, { model, prompt, timeoutMs }) -> { ok, response, ms, evalCount, respondedModel, reason } */
async function ollamaGenerate(fetchImpl: any, o: any): Promise<any> {
  const t0 = Date.now();
  try {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), Number(o.timeoutMs) || 300000);
    let res: any; try { res = await fetchImpl(OLLAMA_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: o.model, prompt: o.prompt, stream: false }), signal: ctl.signal, ...(o.warmup === true ? { odgWarmup: true } : {}) }); } finally { clearTimeout(timer); }
    if (!res || res.ok !== true) return { ok: false, ms: Date.now() - t0, reason: `HTTP ${res && res.status}` };
    const j = await res.json();
    const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return { ok: true, ms: Date.now() - t0, response: String((j && j.response) || ""), evalCount: (j && j.eval_count) || null, respondedModel: (j && j.model) || null,
      timings: { evalCount: num(j && j.eval_count), evalDurationNs: num(j && j.eval_duration), promptEvalCount: num(j && j.prompt_eval_count), promptEvalDurationNs: num(j && j.prompt_eval_duration), loadDurationNs: num(j && j.load_duration), totalDurationNs: num(j && j.total_duration) } };
  } catch (e: any) { return { ok: false, ms: Date.now() - t0, reason: String((e && e.message) || e).slice(0, 300) }; }
}

/* =========================== V17.6 run conditions: ADAPT-1 (per-call timeout) + HOST-1 (idle host) =========================== */
/* Reason (PROBE 3): the S3 design call hit a FIXED 300 s timeout while a concurrent full test run loaded the host — the
 * timeout was not derived from the model's measured speed, and the run started on a busy host (coordination confound). */
const WARMUP_PROMPT = "Reply with the single word: ready";   // TEMPLATE plumbing (denylist-clean, tested)
/* measureRate(g) — tokens/s from Ollama's own counters of ONE warm-up call (eval_count / eval_duration; prompt_eval_count /
 * prompt_eval_duration). load_duration (model load) is excluded by construction. Missing / non-positive ⇒ null (not measured).
 * A tiny prompt under-states prompt-eval throughput (batching) ⇒ the derived estimate errs long (conservative). */
function measureRate(g: any): any {
  const t = g && g.ok && g.timings ? g.timings : null;
  if (!t) return null;
  const gen = t.evalCount && t.evalDurationNs ? t.evalCount / (t.evalDurationNs / 1e9) : null;
  if (!(typeof gen === "number" && Number.isFinite(gen) && gen > 0)) return null;
  const pr = t.promptEvalCount && t.promptEvalDurationNs ? t.promptEvalCount / (t.promptEvalDurationNs / 1e9) : null;
  const promptOk = typeof pr === "number" && Number.isFinite(pr) && pr > 0;
  return Object.freeze({ genTokPerS: gen, promptTokPerS: promptOk ? pr : gen, promptRateSource: promptOk ? "prompt_eval_count/prompt_eval_duration" : "FALLBACK gen rate (prompt counters absent)", wallMs: g.ms, loadDurationNs: t.loadDurationNs, timings: t });
}
const ADAPT_RULE = "ADAPT-1: estimateMs = 1000·(ceil(promptChars/charsPerToken)/promptTokPerS + numPredict/genTokPerS) from ONE warm-up call on the same model; timeoutMs = clamp(ceil(safetyFactor·estimateMs) + overheadMs, minMs, maxMs); estimateMs > maxMs ⇒ the call is NOT sent (NOT_MEASURED: the cap cannot cover the predicted duration)";
/* adaptiveTimeout({ promptChars, numPredict, rate, policy }) -> { estimateMs, timeoutMs, clamped, predictedOverCap, rule } */
function adaptiveTimeout(x: any): any {
  const p = x.policy, r = x.rate;
  if (!r) return Object.freeze({ estimateMs: null, timeoutMs: null, clamped: null, predictedOverCap: null, rule: ADAPT_RULE, reason: "rate not measured" });
  const promptTokens = Math.ceil(Number(x.promptChars) / p.charsPerToken);
  const estimateMs = Math.ceil(1000 * (promptTokens / r.promptTokPerS + Number(x.numPredict) / r.genTokPerS));
  const raw = Math.ceil(p.safetyFactor * estimateMs) + p.overheadMs;
  const timeoutMs = Math.min(p.maxMs, Math.max(p.minMs, raw));
  return Object.freeze({ promptTokensEstimate: promptTokens, estimateMs, timeoutMs, clamped: timeoutMs !== raw, predictedOverCap: estimateMs > p.maxMs, rule: ADAPT_RULE });
}
const HOST_RULE = "HOST-1: loadavg-1m and nproc are recorded before EVERY model call (warm-up included); the run refuses to START (NOT_MEASURED, no model call) when loadavg-1m > nproc×idleFactor. A later reading above the threshold is recorded (hostLoadAboveThreshold) but does not stop the run: the model server's own inference raises loadavg-1m, so a mid-run reading cannot separate ODG's load from a concurrent one";
/* hostLoad(idleFactor, probe?) — probe() -> { loadavg:[1m,5m,15m], nproc } (injectable; default os) */
function hostLoad(idleFactor: number, probe?: any): any {
  const os = require("os");
  const s = probe ? probe() : { loadavg: os.loadavg(), nproc: typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length };
  const nproc = Number(s.nproc) || 1; const la = arr(s.loadavg).map(Number);
  const threshold = nproc * idleFactor;
  return Object.freeze({ at: new Date().toISOString(), load1: la[0], load5: la[1], load15: la[2], nproc, idleFactor, threshold, aboveThreshold: !(la[0] <= threshold) });
}

/* =========================== V17.6 DIGEST-1: bounded lesson digest =========================== */
/* Reason (PROBE 3): every CONSOLIDATED lesson's full hint was injected verbatim (4 lessons, ~750 chars) — the prompt grows
 * with every run. The digest is deterministic: newest-first (lesson.at = its run's startedAt; ties id asc), dedup by
 * (kind, case kinds) keeping the newest, each line ≤ maxLineChars (cut + "…"), the WHOLE segment ≤ budgetChars; lessons
 * that do not fit are listed as omitted (ids recorded — never silently dropped). */
const LESSON_DIGEST = Object.freeze({ budgetChars: 600, maxLineChars: 200, rule: "DIGEST-1: newest-first (run startedAt desc, id asc), dedup by (kind, caseKinds) keeping the newest, each line ≤ maxLineChars, whole segment ≤ budgetChars; non-fitting lessons recorded as omitted" });
function lessonDigest(lessons: any[], budget: any = LESSON_DIGEST): any {
  const sorted = [...arr(lessons)].sort((a, b) => (String(b.at || "") < String(a.at || "") ? -1 : String(b.at || "") > String(a.at || "") ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seen = new Set<string>(); const unique: any[] = []; const deduped: string[] = [];
  for (const l of sorted) { const k = l.kind + "|" + arr(l.caseKinds).slice().sort().join(","); if (seen.has(k)) { deduped.push(l.id); continue; } seen.add(k); unique.push(l); }
  const head = (n: number) => `Lessons from ODG's previous native builds (newest first, ${n} of ${unique.length}):`;
  const lines: string[] = []; const included: string[] = []; const omitted: string[] = [];
  for (const l of unique) {
    let h = String(l.hint); const room = budget.maxLineChars - 4;
    if (h.length > room) h = h.slice(0, room - 1) + "…";
    const line = "  - " + h;
    const next = [head(included.length + 1), ...lines, line].join("\n");
    if (omitted.length === 0 && next.length <= budget.budgetChars) { lines.push(line); included.push(l.id); } else omitted.push(l.id);
  }
  const text = included.length ? [head(included.length), ...lines].join("\n") : "";
  return Object.freeze({ rule: budget.rule, budgetChars: budget.budgetChars, chars: text.length, text, included, omitted, deduped, considered: arr(lessons).length });
}

/* =========================== S1 PROBLEM (PROB-1) =========================== */
/* loadModuleExport(tsSrc, exportName) — transpile a REPO module and evaluate it in a fresh vm context with a denied
 * require (repo code only — the integrated module or a reference; never model output). */
function loadModuleExport(tsSrc: string, exportName: string): any {
  const js = transpile(tsSrc).js;
  const m: any = { exports: {} };
  const ctx = Object.assign(Object.create(null), { module: m, exports: m.exports, require: () => { throw new Error("require denied (host evaluation of a repo module)"); } });
  vm.runInNewContext(js, ctx, { timeout: 1000 });
  const f = m.exports && m.exports[exportName];
  return typeof f === "function" ? f : null;
}
/* call(f, src) — evaluate the input LITERAL source in a fresh context and apply f (repo function). */
function callOn(f: any, src: string): any {
  try { return { ok: true, value: vm.runInNewContext("f(" + src + ")", Object.assign(Object.create(null), { f }), { timeout: 1000 }) }; }
  catch (e: any) { return { ok: false, threw: String((e && e.message) || e).slice(0, 200) }; }
}
/* kindOf(src) — structural tags of an input (computed, not hand-labelled): where `undefined` occurs, toJSON-bearing
 * objects, negative zero, non-finite numbers, nesting. Deterministic. */
function kindOf(src: string): string {
  const v = vm.runInNewContext("(" + src + ")", Object.create(null), { timeout: 1000 });
  const tags = new Set<string>();
  const walk = (x: any, where: string, depth: number) => {
    if (x === undefined) { tags.add("undefined@" + where); return; }
    if (typeof x === "number") { if (Object.is(x, -0)) tags.add("negative-zero"); if (!Number.isFinite(x)) tags.add("non-finite"); return; }
    if (x === null || typeof x !== "object") return;
    if (depth >= 2) tags.add("nested");
    if (typeof x.toJSON === "function") tags.add("toJSON");
    if (Array.isArray(x)) { x.forEach((e: any) => walk(e, "array", depth + 1)); return; }
    for (const k of Object.keys(x)) walk(x[k], "object", depth + 1);
  };
  walk(v, "top", 0);
  return tags.size ? [...tags].sort().join("+") : "json";
}

/**
 * deriveProblem({ targetPath, exportName, currentSource, referenceFn, corpus:[src], lessonKinds?:[kind] }) -> PROB-1.
 *  expected = reference(input) (executed); actual = current(input) (executed). Cases whose reference output is not a
 *  string that JSON.parse accepts are EXCLUDED (reference behaviour undefined there — never asserted). failing = actual ≠
 *  expected. SHOWN = the first failing case of each kind (plus, per kind tag a prior LESSON names, one more failing case with that tag);
 *  everything else is HELD OUT (its expected value never enters a prompt or the sandbox).
 */
function deriveProblem(item: any): any {
  const cur = loadModuleExport(item.currentSource, item.exportName);
  const cases: any[] = []; const excluded: any[] = [];
  arr(item.corpus).forEach((src: string) => {
    const e = callOn(item.referenceFn, src);
    let validJson = false; if (e.ok && typeof e.value === "string") { try { JSON.parse(e.value); validJson = true; } catch { validJson = false; } }
    if (!validJson) { excluded.push({ src, reason: e.ok ? "reference output is not valid JSON text (reference behaviour undefined here)" : "reference threw: " + e.threw }); return; }
    const a = cur ? callOn(cur, src) : { ok: false, threw: "current module has no export " + item.exportName };
    const actual = a.ok ? (a.value === undefined ? "<undefined>" : typeof a.value === "string" ? a.value : "<" + typeof a.value + ">") : "<threw: " + a.threw + ">";
    cases.push({ i: cases.length, src, kind: kindOf(src), expect: e.value, actual, failing: !(a.ok && a.value === e.value) });
  });
  const failing = cases.filter((c) => c.failing);
  const shownIdx = new Set<number>(); const seenKinds = new Set<string>();
  for (const c of failing) if (!seenKinds.has(c.kind)) { seenKinds.add(c.kind); shownIdx.add(c.i); }
  // lesson reuse: for every case kind a prior lesson names, one MORE failing case carrying that tag is shown (if any)
  for (const k of arr(item.lessonKinds)) { const c = failing.find((x) => !shownIdx.has(x.i) && String(x.kind).split("+").includes(k)); if (c) shownIdx.add(c.i); }
  const shown = cases.filter((c) => shownIdx.has(c.i));
  const heldOut = cases.filter((c) => !shownIdx.has(c.i));
  const evidenceDigest = sha256(JSON.stringify(cases.map((c) => [c.src, c.expect, c.actual])));
  return Object.freeze({
    rule: "PROB-1: execute the CURRENT module and the in-repo REFERENCE on the corpus; failing = output ≠ reference; reference output not valid JSON ⇒ excluded; SHOWN = first failing case per kind (+ one more per lesson kind tag), rest HELD OUT",
    targetPath: item.targetPath, exportName: item.exportName, currentSourceSha256: sha256(item.currentSource),
    defect: failing.length > 0, cases, failing: failing.map((c) => c.i), shown: shown.map((c) => c.i), heldOut: heldOut.map((c) => c.i),
    excluded, kinds: [...new Set(failing.map((c) => c.kind))].sort(), evidenceDigest,
  });
}

/* =========================== S2 IMPACT (IMP-1 + IMP-2) =========================== */
function analyseImpact(root: string, targetPath: string): any {
  const name = path.basename(targetPath).replace(/\.(ts|js)$/, "");
  let imp: any; try { imp = CIG.impactOf(root, name); } catch (e: any) { imp = { module: name, exists: false, error: String((e && e.message) || e) }; }
  const tests: string[] = [];
  for (const dir of ["runtime/core", "runtime/bin"]) {
    let files: string[] = []; try { files = fs.readdirSync(path.join(root, dir)); } catch { continue; }
    for (const f of files.sort()) {
      if (!f.endsWith(".test.ts")) continue;
      let src = ""; try { src = fs.readFileSync(path.join(root, dir, f), "utf8"); } catch { continue; }
      if (src.includes("/" + name + ".js") || src.includes("/" + name + "\"") || src.includes("/" + name + "'")) tests.push(`${dir}/${f}`);
    }
  }
  return Object.freeze({
    rule: "IMP-1 change-impact-graph.impactOf (consumers / closure / hazards) + IMP-2 *.test.ts in runtime/core|bin that require the module (impactOf.impactedTests scans *.test.js only)",
    module: name, exists: imp.exists === true, consumers: arr(imp.consumers), directDeps: arr(imp.directDeps),
    closureHazards: imp.closureHazards || null, impactedTestsImpactOf: arr(imp.impactedTests), impactedTestsTs: tests,
  });
}

/* =========================== prompts (SEGMENTS) =========================== */
/* Algorithm hints a provider would otherwise write into a prompt. TEMPLATE segments must match none (tested). */
const ALGORITHM_HINT_DENYLIST: ReadonlyArray<RegExp> = Object.freeze([
  /\bfilter/i, /\bomit/i, /\bskip/i, /\bdrop/i, /\bremov/i, /\bexclud/i, /\breplac/i, /\bignor/i, /\bsubstitut/i,
  /[!=]==?\s*undefined/, /typeof\s+\S+\s*[!=]==?/, /undefined\s*(->|→|=>|becomes|to|as|into)\s*null/i, /\bnull\b/i, /\bundefined\b/i,
  /JSON\.stringify/, /Object\.keys/, /\.sort\s*\(/, /\btoJSON\b/, /\brecurs/i, /\bsorted\b/i, /\bnegative zero\b|-0\b/i,
]);
const T = (text: string) => ({ kind: "TEMPLATE", text });
const E = (text: string, source: string) => ({ kind: "EVIDENCE", source, text });
function renderPrompt(segments: any[]): string { return segments.map((s) => s.text).join("\n"); }
function denylistHits(segments: any[]): any[] {
  const hits: any[] = [];
  segments.forEach((s: any, i: number) => { if (s.kind !== "TEMPLATE") return; for (const re of ALGORITHM_HINT_DENYLIST) if (re.test(s.text)) hits.push({ segment: i, pattern: String(re), text: s.text.slice(0, 120) }); });
  return hits;
}
/* outputs are rendered as JavaScript string LITERALS (the function returns a string): the text null and the string "null"
 * must not look alike (live PROBE 1 finding: an unquoted `expected null` was read as the value null). */
function renderOut(v: any): string { return v === "<undefined>" ? "undefined (no string returned)" : /^<threw: /.test(String(v)) ? String(v).slice(1, -1) : JSON.stringify(v); }
function renderCase(c: any, withExpected: boolean): string {
  return `  input: ${c.src}\n    current return value:  ${renderOut(c.actual)}` + (withExpected ? `\n    expected return value: ${renderOut(c.expect)}` : "");
}
function evidenceBlocks(problem: any, currentSource: string, impact: any, lessons: any[]): any[] {
  const shown = problem.cases.filter((c: any) => problem.shown.includes(c.i));
  const failingHeld = problem.cases.filter((c: any) => c.failing && !problem.shown.includes(c.i)).length;
  const passing = problem.cases.filter((c: any) => !c.failing).length;
  const segs = [
    E(`File: ${problem.targetPath} (exports ${problem.exportName})`, "PROB-1 target"),
    E("Current source:\n<<<SOURCE\n" + currentSource.replace(/\s+$/, "") + "\nSOURCE>>>", "repository file (current integrated module)"),
    E(`Observed on ${problem.cases.length} inputs: ${problem.failing.length} produce a wrong output (${failingHeld} of them are not shown); ${passing} are correct today and must stay correct.`, "PROB-1 counts"),
    E("Wrong outputs (executed):\n" + shown.map((c: any) => renderCase(c, true)).join("\n"), "PROB-1 shown failing cases (expected = in-repo reference, executed)"),
    E(`Dependents of this module: ${impact.consumers.length ? impact.consumers.join(", ") : "none"}; tests that load it: ${[...impact.impactedTestsImpactOf, ...impact.impactedTestsTs].join(", ") || "none"}.`, "IMP-1/IMP-2"),
  ];
  const dg = lessonDigest(lessons);
  if (dg.text) segs.push(E(dg.text, "LESSON-1 (memory-taxonomy CONSOLIDATED records) via DIGEST-1 (bounded)"));
  return segs;
}
/* S3 design prompt */
function designPromptSegments(problem: any, currentSource: string, impact: any, lessons: any[], n: number): any[] {
  return [
    T("You are a software engineer working in a strict TypeScript repository that uses CommonJS modules."),
    T("A module below gives wrong outputs for some inputs. The evidence is its current source and executed input/output observations."),
    ...evidenceBlocks(problem, currentSource, impact, lessons),
    T(`Task: propose ${n} DIFFERENT designs that would correct the module while keeping every currently-correct output unchanged. Do not write the code.`),
    T("Answer with ONLY a JSON array, no prose, no markdown. Each element: {\"summary\": \"one sentence\", \"steps\": [\"short step\", ...at most 5], \"changesExportedApi\": true|false, \"files\": [\"paths you would change\"]}."),
  ];
}
/* S4/S5 implementation prompt (the chosen or candidate design) */
function implementPromptSegments(problem: any, currentSource: string, impact: any, lessons: any[], design: any, hint: any): any[] {
  const segs = [
    T("You are writing exactly ONE TypeScript source file for a strict TypeScript repository that uses CommonJS."),
    T("Output ONLY the complete TypeScript source of the file. No explanation, no markdown fences, no prose."),
    T("Requirements: no import statements; annotate every parameter and return type (use `any` for the value); keep the same exported names; put `export {};` as the LAST line of the file."),
    ...evidenceBlocks(problem, currentSource, impact, lessons),
    E("Design to implement:\n" + JSON.stringify({ summary: design.summary, steps: design.steps }, null, 1), `S3 design ${design.id} (LOCAL MODEL)`),
  ];
  // V17.5 NB2 (PROBE 1+2 diagnosis): the repair prompt must show the FAILED ATTEMPT itself — without it the model only sees
  // the original source + the same hint, and at temperature 0 regenerates the identical attempt (NO_PROGRESS stop).
  if (hint && typeof hint.attemptSource === "string" && hint.attemptSource.trim()) segs.push(E("Previous attempt (this exact code was executed):\n<<<ATTEMPT\n" + hint.attemptSource.replace(/\s+$/, "") + "\nATTEMPT>>>", "the failed generation (LOCAL MODEL output), as executed in the sandbox"));
  if (hint && hint.buildError) segs.push(T("A previous attempt FAILED to build with this error:"), E("  " + String(hint.buildError), "sandbox build error"));
  if (hint && hint.verifyError) segs.push(T("A previous attempt BUILT but still gives a wrong output:"), E("  " + String(hint.verifyError), "sandbox observation (shown case)"));
  if (hint && hint.typeError) segs.push(T("A previous attempt was correct but FAILED the strict TypeScript typecheck:"), E("  " + String(hint.typeError), "typecheck diagnostics"));
  segs.push(T("Now output only the code:"));
  return segs;
}
/* parseDesigns(text) — the first JSON array in the answer; each design normalized; ids D1..Dn assigned by ODG (order). */
function parseDesigns(text: string, max: number = 3): any[] {
  const s = String(text || ""); const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a < 0 || b <= a) return [];
  let j: any; try { j = JSON.parse(s.slice(a, b + 1)); } catch { return []; }
  return arr(j).filter((d: any) => isObj(d) && typeof d.summary === "string" && d.summary.trim()).slice(0, max).map((d: any, i: number) => Object.freeze({
    id: "D" + (i + 1), summary: String(d.summary).slice(0, 300), steps: arr(d.steps).filter((x: any) => typeof x === "string").slice(0, 5).map((x: string) => x.slice(0, 200)),
    changesExportedApi: d.changesExportedApi === true, files: arr(d.files).filter((x: any) => typeof x === "string").slice(0, 10),
  }));
}

/* =========================== sandbox oracle (ODG-rules harness) =========================== */
const HARNESS_FILE = "odg-native-oracle-harness.js";
/* harnessSource(sandboxModule, exportName, corpus) — JS authored by ODG RULES: builds input i from its literal and calls the
 * module's export. Lets non-JSON inputs (undefined, Date, -0) cross the sandbox boundary as SOURCE, not as data. */
function harnessSource(sandboxModule: string, exportName: string, srcs: string[]): string {
  return ["\"use strict\";", `var M = require(${JSON.stringify("./" + sandboxModule)});`, "var INPUTS = [", ...srcs.map((s) => `  function () { return (${s}); },`), "];",
    `module.exports = function (i) { return M[${JSON.stringify(exportName)}](INPUTS[i]()); };`, ""].join("\n");
}
/* oracleRun(files, problem, runner?) — run ALL cases in the sandbox (observations only), grade on the host. */
function oracleRun(files: any, problem: any, runner?: any): any {
  const r = NBS.runIsolated(files, { kind: "none" }, { runner, repair: { entry: HARNESS_FILE, examples: problem.cases.map((c: any) => ({ args: [c.i] })) } });
  if (r.status !== "EXECUTED") return { executed: false, reason: r.reason, passed: 0, total: problem.cases.length, failingIdx: [] };
  if (!r.buildOk) return { executed: true, buildOk: false, buildError: r.buildError, passed: 0, total: problem.cases.length, failingIdx: problem.cases.map((c: any) => c.i) };
  const obs = arr(r.repairObservations); const failingIdx: number[] = [];
  problem.cases.forEach((c: any, k: number) => { let o: any = null; try { o = JSON.parse(String(obs[k])); } catch { o = null; } if (!(o && o.ok === true && o.undef !== true && o.value === c.expect)) failingIdx.push(c.i); });
  return { executed: true, buildOk: true, passed: problem.cases.length - failingIdx.length, total: problem.cases.length, failingIdx };
}

/* =========================== S4 SELECT (SEL-1) =========================== */
function writeSetOk(design: any, writeSet: string[]): any {
  const allowed = new Set(writeSet.map((p) => path.basename(p)));
  const files = arr(design.files);
  if (!files.length) return { ok: true, defaulted: true };
  const bad = files.filter((f: string) => !allowed.has(path.basename(String(f).trim())));
  return { ok: bad.length === 0, outside: bad };
}
/* scoreCandidate — every field measured by ODG (sandbox / typecheck / parse), none taken from the model's claims except
 * the declared files (checked against the write set) and changesExportedApi (counted, never trusted to LOWER impact). */
function scoreCandidate(x: any): any {
  const ws = writeSetOk(x.design, x.writeSet);
  const curNames = exportedNames(x.currentSource) || [];
  const newNames = x.tsSource ? exportedNames(x.tsSource) : null;
  const apiChanged = x.design.changesExportedApi === true || newNames === null || JSON.stringify(newNames) !== JSON.stringify(curNames);
  const callersAffected = apiChanged ? x.impact.consumers.length + x.impact.impactedTestsTs.length : 0;
  return Object.freeze({
    design: x.design.id, generated: !!x.tsSource, writeSetOk: ws.ok && !!x.tsSource, writeSetOutside: ws.outside || [], filesDefaulted: ws.defaulted === true,
    oraclePassed: x.oracle ? x.oracle.passed : 0, oracleTotal: x.oracle ? x.oracle.total : 0, oracleExecuted: !!(x.oracle && x.oracle.executed),
    typecheckOk: !!(x.typecheck && x.typecheck.ok), apiChanged, callersAffected, diffLines: x.tsSource ? changedLines(x.currentSource, x.tsSource) : null,
  });
}
const SELECTION_RULE = "SEL-1 lexicographic: writeSetOk desc → oraclePassed desc → typecheckOk desc → callersAffected asc → diffLines asc → design id asc (mechanical; no model judgement)";
function selectDesign(scores: any[]): any {
  const ok = scores.filter((s) => s.generated && s.oracleExecuted);
  if (!ok.length) return { chosen: null, rule: SELECTION_RULE, ranking: [] };
  const ranked = [...ok].sort((a, b) => (Number(b.writeSetOk) - Number(a.writeSetOk)) || (b.oraclePassed - a.oraclePassed) || (Number(b.typecheckOk) - Number(a.typecheckOk)) || (a.callersAffected - b.callersAffected) || ((a.diffLines ?? 1e9) - (b.diffLines ?? 1e9)) || (a.design < b.design ? -1 : a.design > b.design ? 1 : 0));
  return { chosen: ranked[0].writeSetOk ? ranked[0].design : null, rule: SELECTION_RULE, ranking: ranked.map((s) => s.design) };
}

/* =========================== S6 LEARN (memory-taxonomy records) =========================== */
/* deriveLessons(record) — LESSON-1 rules over a run record (NB1 result shape or NB2 result shape). A lesson is CONSOLIDATED
 * only when its run's sandbox actually EXECUTED (observed facts), with provenance = the record. Hints are rule text over
 * case KINDS and counts — never model text, never an algorithm. */
function deriveLessons(record: any, provenance: string): any[] {
  if (!isObj(record)) return [];
  const out: any[] = [];
  const executed = arr(record.rounds).some((r: any) => r.executionStatus === "EXECUTED") || (isObj(record.selection) && arr(record.selection.scores).some((s: any) => s.oracleExecuted));
  const target = (record.problem && record.problem.targetPath) || "runtime/core/odg-canonical-json.ts";
  const mk = (kind: string, value: any, hint: string) => ({ id: `lesson:${record.scenario || "?"}:${kind}:${sha256(JSON.stringify(value)).slice(0, 12)}`, family: "engineering", provenance, consolidated: executed && record.verdict !== "NOT_MEASURED", value: { kind, ...value, hint } });
  const repairs = arr(record.rounds).reduce((a: number, r: any) => a + (Number(r.repairs) || 0), 0);
  const kindsFirstFail = arr(record.repairTrace).map((t: any) => t.kind).filter(Boolean);
  if (repairs > 0) out.push(mk("REPAIR_NEEDED", { target, repairs, caseKinds: [...new Set(kindsFirstFail)].sort() }, `A previous build of ${target} needed ${repairs} repair(s)` + (kindsFirstFail.length ? `; its first attempts were wrong on inputs of kind ${[...new Set(kindsFirstFail)].sort().join(", ")} — check those inputs.` : ".")));
  if (isObj(record.selection)) {
    const sc = arr(record.selection.scores);
    const rejected = sc.filter((s: any) => s.design !== record.selection.chosen && s.oracleTotal && s.oraclePassed < s.oracleTotal).length;
    if (rejected) out.push(mk("DESIGNS_REJECTED", { target, rejected, total: sc.length }, `In a previous build of ${target}, ${rejected} of ${sc.length} proposed designs did not reach every expected output; make each design cover every shown wrong output.`));
  }
  if (isObj(record.problem) && record.problem.defect && isObj(record.problem.priorAcceptance)) {
    out.push(mk("CORPUS_GAP", { target, caseKinds: record.problem.kinds, priorRun: record.problem.priorAcceptance.record }, `A module of ${target} accepted earlier (${record.problem.priorAcceptance.record}) was later wrong on inputs of kind ${record.problem.kinds.join(", ")}: an oracle without those input kinds was incomplete.`));
  }
  return out;
}
/* collectLessons(records:[{record, provenance}]) — memory-taxonomy retrieve(family engineering, CONSOLIDATED) over the
 * lessons carried by (or derived from) prior run records. Returns { lessons, considered, reusedIds, kinds }. */
function collectLessons(sources: any[]): any {
  const all: any[] = [];
  for (const s of arr(sources)) {
    if (!isObj(s) || !isObj(s.record)) continue;
    const ls = Array.isArray(s.record.lessons) ? s.record.lessons : deriveLessons(s.record, s.provenance);
    const at = isObj(s.record.run) && typeof s.record.run.startedAt === "string" ? s.record.run.startedAt : null;   // DIGEST-1 recency
    for (const l of ls) if (isObj(l)) all.push({ l, at });
  }
  const ok = new Set(MEM.retrieve(all.map((x) => x.l), { family: "engineering", consolidation: "CONSOLIDATED" }).map((c: any) => c.id));
  const byId = new Map<string, any>(); for (const x of all) if (ok.has(x.l.id) && !byId.has(x.l.id)) byId.set(x.l.id, x);
  const lessons = [...byId.values()].sort((a, b) => (a.l.id < b.l.id ? -1 : 1)).map(({ l, at }) => ({ id: l.id, provenance: l.provenance, at, kind: l.value.kind, hint: String(l.value.hint), caseKinds: arr(l.value.caseKinds) }));
  const kinds = [...new Set(lessons.flatMap((l) => l.caseKinds))].sort();
  return Object.freeze({ rule: "LESSON-1: memory-taxonomy.retrieve(family engineering, CONSOLIDATED) over prior run records' lessons", considered: all.length, lessons, reusedIds: lessons.map((l) => l.id), kinds, digest: lessonDigest(lessons) });
}

/* =========================== AUTHORSHIP LEDGER =========================== */
function authorshipLedger(x: any): any {
  return Object.freeze({
    problem: { by: "ODG_RULES", rule: "PROB-1 (executed current module vs in-repo reference REF-1)", providerAlgorithmTextInPrompts: x.denylistHits.length === 0 ? false : "VIOLATION", denylistHits: x.denylistHits.length },
    corpus: { by: "PROVIDER", note: "the ORC-2 input literals (inputs only; expected values are computed by executing the reference)" },
    impact: { by: "ODG_RULES", rule: "IMP-1 change-impact-graph + IMP-2" },
    design: { by: x.designsBy, model: x.model, designs: x.designCount },
    selection: { by: "ODG_RULES", rule: SELECTION_RULE, chosen: x.chosen },
    implementation: { by: x.implementedBy, model: x.model, generation: x.generation },
    testsOracle: { by: "ODG_RULES", rule: "oracle = reference outputs (REF-1) on ORC-2; harness + test file generated by rules" },
    repair: { by: x.repairs > 0 ? "LOCAL_MODEL (hint = ODG-observed shown failing case)" : "NONE", repairs: x.repairs },
    plumbing: { by: "PROVIDER", note: "runner, pipeline, prompt TEMPLATE text (format only; scanned against ALGORITHM_HINT_DENYLIST)" },
    integration: { by: x.integratedBy || "NOT_INTEGRATED", note: "a PASS produces a branch-ready diff; integration is a PR under normal controls" },
  });
}

const NATIVE_DESIGN_PIPELINE_CONTRACT = Object.freeze({
  id: "V175-NATIVE-DESIGN-PIPELINE",
  stages: Object.freeze(["S1 PROBLEM (PROB-1)", "S2 IMPACT (IMP-1/IMP-2)", "S3 DESIGN (local model, ≥2)", "S4 SELECT (SEL-1, sandbox-measured)", "S5 BUILD (buildProject bounded repair + strict typecheck)", "S6 LEARN (LESSON-1, memory-taxonomy)"]),
  reuses: Object.freeze(["native-project-builder.buildProject", "odg-native-build-sandbox.runIsolated", "change-impact-graph.impactOf", "memory-taxonomy.retrieve", "local-model-generator.extractCode"]),
  invariants: Object.freeze([
    "the problem statement is rendered only from executed observations + the current source; TEMPLATE text carries no ALGORITHM_HINT_DENYLIST term",
    "held-out expected values never enter a prompt or the sandbox; acceptance = host-graded oracle + strict typecheck",
    "design selection is mechanical (SEL-1) over ODG-measured scores; model claims never lower a measured impact",
    "model code runs only in the bwrap sandbox; the host executes only repo code (reference + integrated module)",
    "lessons are memory-taxonomy records in the run records (no new store); only CONSOLIDATED (executed) lessons are reused",
    "lessons enter prompts only through DIGEST-1 (deterministic, bounded to LESSON_DIGEST.budgetChars; omitted ids recorded)",
    "per-call timeouts follow ADAPT-1 from a measured warm-up rate (bounded by the declared caps); a run never starts on a busy host (HOST-1 ⇒ NOT_MEASURED)",
  ]),
});

module.exports = {
  renderOut, OLLAMA, OLLAMA_URL, makeGuard, transpile, typecheck, newFileDiff, replaceFileDiff, gitApplyCheck, headOf, changedLines, exportedNames, ollamaGenerate, sha256,
  loadModuleExport, callOn, kindOf, deriveProblem, analyseImpact,
  ALGORITHM_HINT_DENYLIST, renderPrompt, denylistHits, designPromptSegments, implementPromptSegments, parseDesigns,
  HARNESS_FILE, harnessSource, oracleRun, writeSetOk, scoreCandidate, selectDesign, SELECTION_RULE,
  deriveLessons, collectLessons, authorshipLedger, NATIVE_DESIGN_PIPELINE_CONTRACT, extractCode: GEN.extractCode,
  WARMUP_PROMPT, measureRate, adaptiveTimeout, ADAPT_RULE, hostLoad, HOST_RULE, LESSON_DIGEST, lessonDigest,
};
export {};
