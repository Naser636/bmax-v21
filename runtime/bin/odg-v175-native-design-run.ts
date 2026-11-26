#!/usr/bin/env node
"use strict";
/*
 * V17.5 NB2 — NATIVE DESIGN RUNNER (contract docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#V175-NB2, owner V175 —
 * docs/odg/V175_OWNER_AUTHORIZATION_NATIVE_BUILD.json « développer et tester la boucle d'ingénierie native d'ODG » +
 * « modifier les composants et contrats internes concernés »; CTO directive 2026-11-24 « REPRISE DE SESSION ET
 * ACCÉLÉRATION ODG » §E). The next rung after NB1: ODG DESIGNS the change instead of receiving a provider-written
 * algorithm. Composes the shared stages of runtime/core/odg-native-design-pipeline.ts (also used by the NB1 runner):
 *
 *   S1 PROBLEM  NRI.designItem + PIPE.deriveProblem — failing cases of the INTEGRATED odg-canonical-json vs the in-repo
 *               reference canon (REF-1) on ORC-2 (undefined / nested undefined / toJSON / -0 / non-finite + ORC-1);
 *   S2 IMPACT   PIPE.analyseImpact (change-impact-graph + test scan);
 *   S3 DESIGN   the LOCAL MODEL proposes ≥2 designs (JSON plans);
 *   S4 SELECT   each design implemented once by the local model, measured by ODG in the bwrap sandbox + strict typecheck +
 *               export-surface × consumers + diff size; SEL-1 picks mechanically;
 *   S5 BUILD    the chosen implementation enters native-project-builder.buildProject (bounded repair, shown failing case
 *               as the hint, held-out oracle graded on the host) + strict typecheck (one more round on a type error);
 *   S6 LEARN    lessons (memory-taxonomy records) written INTO the run record; prior records' lessons are read first.
 * Produces a branch-ready diff (modified helper + ODG-rules test file) — writes into NO checkout.
 *
 * MODES:
 *   <out>                 NATIVE run (GO dispatch). Refused (exit 2) unless odg-authorization-scope derives
 *                         RUN_CONTROLLED_EXPERIMENTS as the current execution-authorized step of V175-NB2 (owner V175 +
 *                         committed independent inspection ACCEPT bound to the contract sha); <out> = declared writeSet (exit 3).
 *   --probe --out <abs> [--lessons-from <abs>]…   feasibility PROBE (label PROBE — never the native result); outputs
 *                         outside the repo realpath only.
 *   --emit-contract       print the contract ODG's rules derive from the CURRENT repo.
 *   --selftest            offline fake-Ollama behind the real loopback guard; real sandbox; nothing written.
 * NETWORK: exact http://127.0.0.1:11434/api/generate allowlist (PIPE.makeGuard over scenario F's loopbackFetch). 0 provider calls.
 */
const fs = require("fs");
const path = require("path");
const NRI = require("../core/odg-native-repair-item.js");
const PIPE = require("../core/odg-native-design-pipeline.js");
const BUILDER = require("../core/native-project-builder.js");
const NBS = require("../core/odg-native-build-sandbox.js");
const NE = require("../core/odg-native-engineering.js");
const AS = require("../core/odg-authorization-scope.js");
const OCUR = require("../core/odg-observation-currency.js");

const ROOT = path.resolve(__dirname, "..", "..");
const SELF = "runtime/bin/odg-v175-native-design-run.ts";
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const INSPECTION = "docs/odg/evidence/V175_NB2_CONTRACT_INSPECTION.json";   // written by an independent inspector, never here
const SCENARIO = "V175-NB2";
const STEP = "RUN_CONTROLLED_EXPERIMENTS";
const OUT = "docs/odg/evidence/V175_NB2_NATIVE_DESIGN_RESULT.json";
const NB1_RESULT = "docs/odg/evidence/V175_NATIVE_BUILD_RESULT.json";
const LESSON_SOURCES = Object.freeze([NB1_RESULT, OUT]);   // committed run records whose lessons the next run reads
const NATIVE_CLAIM = "a PASS means: from a problem DERIVED BY ODG RULES (executed failing cases vs the in-repo reference — no provider-written algorithm in any prompt), ODG's LOCAL MODEL proposed ≥2 designs, ODG selected one mechanically on sandbox-measured scores, the local model implemented it, and ODG tested/repaired/typechecked it. The INPUT corpus (ORC-2 literals), the prompt templates and the runner are provider-written";
/* V17.6 (PROBE 3 diagnosis): the fixed perCallTimeoutMs 300000 became ADAPT-1 (derived from a measured warm-up rate,
 * bounded by perCallTimeout.minMs/maxMs — maxMs = the former fixed cap, so no cap is loosened); + one warm-up call with
 * its own cap (never consumes maxModelCalls); + HOST-1 idle-host start precondition (hostIdleFactor × nproc). */
const BUDGETS = Object.freeze({ model: "qwen2.5-coder:7b", temperature: 0, seed: 42, numPredict: 900, designs: 3, minDesigns: 2, maxRepairPerRound: 3, maxRounds: 2, maxModelCalls: 12, wallMs: 1800000,
  perCallTimeout: Object.freeze({ rule: "ADAPT-1", minMs: 60000, maxMs: 300000, safetyFactor: 3, overheadMs: 15000, charsPerToken: 3 }),
  maxWarmupCalls: 1, warmupNumPredict: 16, warmupTimeoutMs: 180000, hostIdleFactor: 0.75, lessonDigestChars: PIPE.LESSON_DIGEST.budgetChars });
const sha256 = PIPE.sha256;
/* V17.6 NB3: the contract PROFILE a run executes under (scenario, output, budgets, lesson sources). NB2's profile reproduces
 * the V175-NB2 runner exactly (no diversity ⇒ every code path of the NB2 run unchanged). */
const NB2_PROFILE = Object.freeze({ scenario: SCENARIO, out: OUT, runner: SELF, budgets: BUDGETS, lessonSources: LESSON_SOURCES });

function readJson(p: string): any { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

/* the oracle test file — authored by ODG RULES from PROB-1 cases (inputs as literals; expected = executed reference) */
function oracleTestSource(item: any, problem: any): string {
  return [
    "#!/usr/bin/env node",
    "\"use strict\";",
    `/* GENERATED by ODG rules (V17.5 NB2: odg-native-design-pipeline PROB-1 over ${item.corpusRule.split(":")[0]}, corpus sha256 ${item.corpusSha256}).`,
    ` * Expected values computed by executing the in-repo reference canon() (REF-1, sha256 ${item.reference.sourceSha256}); inputs are`,
    " * the ORC-2 literals; reference outputs that are not valid JSON text are excluded. Not model-authored, not hand-written. */",
    `const M = require("./${path.basename(item.targetPath, ".ts")}.js");`,
    "const CASES: any[] = [",
    ...problem.cases.map((c: any) => `  { src: ${JSON.stringify(c.src)}, input: (): any => (${c.src}), expect: ${JSON.stringify(c.expect)} },`),
    "];",
    "let failures = 0;",
    `CASES.forEach((c: any, i: number) => { const got = M.${item.exportName}(c.input()); const ok = got === c.expect; process.stdout.write((ok ? "ok" : "NOT OK") + " - case " + i + " " + c.src + "\\n"); if (!ok) failures++; });`,
    "if (failures) { process.stdout.write(failures + \" failure(s)\\n\"); process.exit(1); }",
    "export {};",
    "",
  ].join("\n");
}

/* lessonSourcesFor(root, extra) — committed run records (+ probe records passed explicitly) */
function lessonSourcesFor(root: string, extra: any[] = [], sources: ReadonlyArray<string> = LESSON_SOURCES): any[] {
  const out: any[] = [];
  for (const rel of sources) { const r = readJson(path.join(root, rel)); if (r) out.push({ record: r, provenance: rel }); }
  for (const e of extra) if (e && e.record) out.push(e);
  return out;
}
/* priorAcceptance — the current target bytes equal a file a previous PASS run produced ⇒ that run accepted this module */
function priorAcceptance(root: string, item: any): any {
  const r = readJson(path.join(root, NB1_RESULT));
  const f = r && r.patch && Array.isArray(r.patch.files) ? r.patch.files.find((x: any) => x.path === item.targetPath) : null;
  return f && r.verdict === "PASS" && f.sha256 === sha256(item.currentSource) ? { record: NB1_RESULT, verdict: r.verdict, sha256: f.sha256 } : null;
}

async function runNativeDesign(opts: any): Promise<any> {
  const root = opts.root || ROOT;
  const P = opts.profile || NB2_PROFILE; const B = P.budgets;   // V17.6 NB3: the runner is parametrised by its contract profile
  const t0 = Date.now();
  const item = NRI.designItem(root);
  const base: any = { schema: "odg-native-design-result/1", label: opts.label, scenario: P.scenario, contractSha256: opts.contractSha256 || null, nativeClaim: NATIVE_CLAIM, run: { head: PIPE.headOf(root), startedAt: new Date(t0).toISOString(), runner: P.runner }, budgets: B };
  const finish = (x: any) => ({ ...base, ...x, outcome: x.verdict, wallMs: Date.now() - t0 });
  if (!item) return finish({ verdict: "NOT_MEASURED", reason: "no integrated target module or no in-repo reference" });
  const lessonsIn = PIPE.collectLessons(lessonSourcesFor(root, opts.extraLessons || [], P.lessonSources));
  const problem0 = PIPE.deriveProblem({ ...item, lessonKinds: lessonsIn.kinds });
  const problem = { ...problem0, corpusRule: item.corpusRule, corpusSha256: item.corpusSha256, reference: item.reference, priorAcceptance: priorAcceptance(root, item) };
  base.problem = problem; base.lessonsRead = lessonsIn;
  if (!problem.defect) return finish({ verdict: "NOT_MEASURED", reason: "no failing case: the module already matches the reference on the corpus (nothing to design)" });
  if (opts.expectedDigest && opts.expectedDigest !== problem.evidenceDigest) return finish({ verdict: "NOT_MEASURED", reason: `problem drift: fresh evidenceDigest ${problem.evidenceDigest} ≠ contract ${opts.expectedDigest}` });
  const impact = PIPE.analyseImpact(root, item.targetPath);
  base.impact = impact;

  const guard = PIPE.makeGuard(opts.transport, B.diversity ? { ...B, allowedCallOptions: PIPE.allowedCallOptions(B.diversity, B.model) } : B);
  const network = () => ({ modelCalls: guard.st.modelCalls, warmupCalls: guard.st.warmupCalls, refused: guard.st.refused, capHit: guard.st.capHit, providerCalls: 0 });
  // HOST-1: a reading before EVERY model call; the run refuses to START on a busy host (NOT_MEASURED, not FAIL)
  const hostReadings: any[] = [];
  const readHost = (before: string) => { const h = { before, ...PIPE.hostLoad(B.hostIdleFactor, opts.loadProbe) }; hostReadings.push(h); return h; };
  base.host = { rule: PIPE.HOST_RULE, readings: hostReadings };
  const h0 = readHost("W0 warm-up");
  if (h0.aboveThreshold) return finish({ verdict: "NOT_MEASURED", reason: `HOST-1: host busy at start — loadavg-1m ${h0.load1} > nproc ${h0.nproc} × ${B.hostIdleFactor} = ${h0.threshold}; no model call made`, network: network() });
  // ADAPT-1: one warm-up call on the same model measures tokens/s; every later timeout is derived from it
  const wg = await PIPE.ollamaGenerate(guard.fetchImpl, { model: B.model, prompt: PIPE.WARMUP_PROMPT, timeoutMs: B.warmupTimeoutMs, warmup: true });
  const rate = PIPE.measureRate(wg);
  base.warmup = { prompt: PIPE.WARMUP_PROMPT, promptSha256: sha256(PIPE.WARMUP_PROMPT), denylistHits: PIPE.denylistHits([{ kind: "TEMPLATE", text: PIPE.WARMUP_PROMPT }]).length, ok: wg.ok, ms: wg.ms, reason: wg.reason || null, timings: wg.timings || null, rate, timeoutMs: B.warmupTimeoutMs };
  if (guard.st.refused.length) return finish({ verdict: "NOT_MEASURED", reason: "non-loopback request refused", network: network() });
  if (!rate) return finish({ verdict: "NOT_MEASURED", reason: "ADAPT-1: the warm-up call did not yield a measurable rate (" + (wg.ok ? "Ollama eval counters absent" : wg.reason) + ") — no per-call timeout can be derived", network: network() });
  const halt: any = { reason: null }; const overCapFailures: any[] = [];
  const prompts: any[] = []; const generations: any[] = [];
  const ask = async (stage: string, segments: any[], callOpts: any = null): Promise<any> => {
    const prompt = PIPE.renderPrompt(segments);
    const hits = PIPE.denylistHits(segments);
    const rec: any = { i: prompts.length + 1, stage, promptSha256: sha256(prompt), promptChars: prompt.length, segments: segments.map((s: any) => ({ kind: s.kind, source: s.source || null, sha256: sha256(s.text) })), denylistHits: hits, prompt };
    prompts.push(rec);
    if (hits.length) { rec.refused = "TEMPLATE text matches ALGORITHM_HINT_DENYLIST — prompt not sent (fail-closed)"; return { ok: false, reason: rec.refused }; }
    if (halt.reason) { rec.refused = "run halted: " + halt.reason; return { ok: false, reason: rec.refused }; }
    rec.hostLoad = readHost(stage);
    rec.timeout = PIPE.adaptiveTimeout({ promptChars: prompt.length, numPredict: B.numPredict, rate, policy: B.perCallTimeout });
    if (rec.timeout.predictedOverCap) {
      const why = `ADAPT-1: predicted duration ${rec.timeout.estimateMs} ms of "${stage}" exceeds the cap ${B.perCallTimeout.maxMs} ms — call not sent`;
      // #986 inspection (MED): NOT_MEASURED only BEFORE the first work call (nothing observed yet). After it, the refused
      // call is a FAILED generation (counts towards FAIL, prediction recorded) — never a halt that would discard failures.
      if (guard.st.modelCalls === 0) { halt.reason = why; rec.refused = why; return { ok: false, reason: why }; }
      rec.refused = why + " — counted as a FAILED generation (after the first work call)"; rec.overCapFailure = true; overCapFailures.push({ stage, estimateMs: rec.timeout.estimateMs, capMs: B.perCallTimeout.maxMs });
      return { ok: false, reason: rec.refused };
    }
    if (callOpts) { rec.model = callOpts.model; rec.temperature = callOpts.temperature; rec.seed = callOpts.seed; }
    const g = await PIPE.ollamaGenerate(guard.fetchImpl, { model: callOpts ? callOpts.model : B.model, prompt, timeoutMs: rec.timeout.timeoutMs, ...(callOpts ? { callOptions: { temperature: callOpts.temperature, seed: callOpts.seed } } : {}) });
    rec.ok = g.ok; rec.ms = g.ms; rec.evalCount = g.evalCount || null; rec.timings = g.timings || null; rec.reason = g.reason || null; rec.responseSha256 = g.ok ? sha256(g.response) : null;
    return g;
  };
  const harness = PIPE.harnessSource(item.sandboxFile, item.exportName, problem.cases.map((c: any) => c.src));
  // V17.6 NB3 DIV-1: `point` = a pre-declared (model, temperature, seed) ladder point (null ⇒ the base budgets, NB2 behaviour).
  // An implement call whose (prompt, model, temperature 0, seed) was already SENT is not re-sent (deterministic ⇒ the earlier
  // generation is returned flagged notSent; diverseGenerate counts it as a stall and advances — no budget spent).
  const sentKeys = new Map<string, any>();
  const implement = async (stage: string, design: any, hint: any, point: any = null): Promise<any> => {
    const segs = PIPE.implementPromptSegments(problem, item.currentSource, impact, lessonsIn.lessons, design, hint);
    const model = point ? point.model : B.model, temperature = point ? point.temperature : B.temperature, seed = point ? point.seed : B.seed;
    const key = sha256(JSON.stringify([PIPE.renderPrompt(segs), model, temperature, seed]));
    if (B.diversity && temperature === 0 && sentKeys.has(key)) {
      const prev = sentKeys.get(key);
      const rec: any = { i: generations.length + 1, stage, design: design.id, promptI: null, ok: prev.ok, notSent: true, sameAsGeneration: prev.i, reason: "DIV-1: identical (prompt, model, temperature 0, seed) already sent ⇒ not re-sent", model, temperature, seed, point: point ? point.i : null, tsSource: prev.tsSource, tsSha256: prev.tsSha256, content: prev.content, sandboxContentSha256: prev.sandboxContentSha256 };
      generations.push(rec);
      return prev.ok ? rec : null;
    }
    const g = await ask(stage, segs, point ? { model, temperature, seed } : null);
    const rec: any = { i: generations.length + 1, stage, design: design.id, promptI: prompts.length, ok: false, model, temperature, seed, point: point ? point.i : null };
    generations.push(rec);
    if (!g.ok) { rec.reason = g.reason; return null; }
    const tsSrc = PIPE.extractCode(g.response);
    if (!tsSrc) { rec.reason = "no CommonJS module extracted"; rec.raw = String(g.response).slice(0, 2000); return null; }
    const t = PIPE.transpile(tsSrc);
    rec.ok = true; rec.tsSource = tsSrc; rec.tsSha256 = sha256(tsSrc); rec.syntaxErrors = t.syntaxErrors;
    rec.content = t.syntaxErrors.length ? tsSrc : t.js; rec.sandboxContentSha256 = sha256(rec.content);
    if (B.diversity) sentKeys.set(key, rec);
    return rec;
  };
  const strip = (gs: any[]) => gs.map(({ content, ...rest }: any) => rest);

  // S3 DESIGN
  const dg = await ask("S3 design", PIPE.designPromptSegments(problem, item.currentSource, impact, lessonsIn.lessons, B.designs));
  const designs = dg.ok ? PIPE.parseDesigns(dg.response, B.designs) : [];
  const designRecord = { by: "LOCAL_MODEL", model: B.model, count: designs.length, designs, rawSha256: dg.ok ? sha256(dg.response) : null, raw: dg.ok ? String(dg.response).slice(0, 4000) : null };
  const nm = () => guard.st.refused.length > 0 || !!halt.reason;
  const nmReason = () => halt.reason || "non-loopback request refused";
  if (nm()) return finish({ verdict: "NOT_MEASURED", reason: nmReason(), design: designRecord, prompts, generations: strip(generations), network: network() });
  if (designs.length < B.minDesigns) return finish({ verdict: "FAIL", reason: `S3: the local model proposed ${designs.length} parseable design(s) (< ${B.minDesigns})`, design: designRecord, prompts, generations: strip(generations), network: network() });

  // S4 SELECT — implement each design once, measure, select (SEL-1)
  const scores: any[] = []; const candidates: any = {};
  for (const d of designs) {
    if (halt.reason) break;
    const gen = await implement(`S4 implement ${d.id}`, d, null);
    const oracle = gen ? PIPE.oracleRun({ [item.sandboxFile]: gen.content, [PIPE.HARNESS_FILE]: harness }, problem, opts.sandboxRunner) : null;
    if (oracle && !oracle.executed) return finish({ verdict: "NOT_MEASURED", reason: "sandbox did not execute (NOT_RUN): " + oracle.reason, design: designRecord, prompts, generations: strip(generations), network: network() });
    const tc = gen ? PIPE.typecheck(gen.tsSource, item.targetPath) : null;
    if (gen) { gen.oracle = oracle ? { passed: oracle.passed, total: oracle.total, failing: oracle.failingIdx } : null; gen.typecheck = tc; }
    candidates[d.id] = gen;
    scores.push(PIPE.scoreCandidate({ design: d, writeSet: [item.targetPath], currentSource: item.currentSource, tsSource: gen ? gen.tsSource : null, oracle, typecheck: tc, impact }));
  }
  const sel = PIPE.selectDesign(scores);
  const selection = { rule: sel.rule, ranking: sel.ranking, chosen: sel.chosen, scores };
  if (nm()) return finish({ verdict: "NOT_MEASURED", reason: nmReason(), design: designRecord, selection, prompts, generations: strip(generations), network: network() });
  if (!sel.chosen) return finish({ verdict: "FAIL", reason: "S4: no design produced a write-set-conforming, sandbox-measured implementation", design: designRecord, selection, prompts, generations: strip(generations), network: network() });
  const chosenDesign = designs.find((d: any) => d.id === sel.chosen);

  // S5 BUILD — buildProject (bounded repair, held-out oracle graded host-side) + strict typecheck
  const repairTrace: any[] = [];
  const caseOfArgs = (msg: string): any => { const m = /with \((\d+)\)/.exec(String(msg || "")); return m ? problem.cases[Number(m[1])] : null; };
  const spec: any = {
    name: P.scenario + " odg-canonical-json (design " + sel.chosen + ")",
    architecture: [
      { path: item.sandboxFile, role: "module under repair (local model, design " + sel.chosen + ")", contract: chosenDesign.summary, dependsOn: [] },
      { path: PIPE.HARNESS_FILE, role: "oracle harness (ODG rules)", contract: "harness", dependsOn: [item.sandboxFile] },
    ],
    writeSet: [item.sandboxFile, PIPE.HARNESS_FILE], entry: PIPE.HARNESS_FILE,
    independentTestCases: problem.cases.map((c: any) => ({ entry: PIPE.HARNESS_FILE, member: null, args: [c.i], expect: c.expect })),
    repairExamples: problem.cases.filter((c: any) => problem.shown.includes(c.i)).map((c: any) => ({ args: [c.i], expect: c.expect })),
  };
  // V17.6 NB3 DIV-1 (only when the profile's budgets declare `diversity`): a STALL (content already seen) walks the ladder.
  const div = B.diversity ? PIPE.makeDiversityController(B.diversity, sel.ranking, B.model) : null;
  const seenContent = new Set<string>(Object.values(candidates).filter(Boolean).map((g: any) => g.sandboxContentSha256));
  const reusedS4 = new Set<string>();   // NB3-FIX-1: S4 implementations already reused in S5 (DESIGN_SWITCH reuse is reachable)
  const diversityEvents: any[] = [];
  const rounds: any[] = []; let accepted: any = null; let typeHint: any = null; let firstUse = true;
  const current: any = { gen: null };   // the last generation fed to the sandbox (its source is shown on repair)
  for (let round = 1; round <= B.maxRounds && !accepted && !halt.reason; round++) {
    const generateFile = async (fileSpec: any): Promise<any> => {
      if (fileSpec.path === PIPE.HARNESS_FILE) return { ok: true, content: harness };
      if (firstUse && !fileSpec.buildError && !fileSpec.verifyError) { firstUse = false; current.gen = candidates[sel.chosen]; return { ok: true, content: current.gen.content }; }   // S4's implementation of the chosen design (no new call)
      let hint: any = null;
      if (fileSpec.buildError) hint = { buildError: fileSpec.buildError };
      else if (fileSpec.verifyError) { const c = caseOfArgs(fileSpec.verifyError); hint = { verifyError: c ? `for input ${c.src} the return value is still wrong (expected return value ${PIPE.renderOut(c.expect)}).` + (/returned (.*) but the expected/.exec(fileSpec.verifyError) ? " It returned " + /returned (.*) but the expected/.exec(fileSpec.verifyError)![1] + "." : " It threw.") : String(fileSpec.verifyError).replace(/with \((\d+)\)/, "on a shown input") }; repairTrace.push({ round, kind: c ? c.kind : null, case: c ? c.i : null }); }
      else if (typeHint) hint = typeHint;
      if (hint && current.gen && typeof current.gen.tsSource === "string") hint = { ...hint, attemptSource: current.gen.tsSource };   // show the failed attempt
      const label = hint && hint.typeError ? "typefix" : hint ? "repair" : "implement";
      if (div) {
        // NB3-FIX-1: a generation for ANOTHER design than the attempt the hint describes never carries that attempt (its
        // verifyError / attemptSource belong to the previous design): it is a fresh implementation of the switched design.
        const hintDesign = current.gen && current.gen.design ? current.gen.design : sel.chosen;
        const r = await PIPE.diverseGenerate({ controller: div, seen: seenContent, reusedS4, events: diversityEvents, candidateFor: (id: string) => candidates[id] || null,
          generate: (pt: any) => implement(`S5 ${pt.design === hintDesign ? label : "implement"} ${pt.design} r${round} p${pt.i}`, designs.find((d: any) => d.id === pt.design), pt.design === hintDesign ? hint : null, pt) });
        if (!r.gen) return { ok: false };
        current.gen = r.gen; return { ok: true, content: r.gen.content };
      }
      const g = await implement(`S5 ${label} ${sel.chosen} r${round}`, chosenDesign, hint);
      if (!g) return { ok: false };
      current.gen = g; return { ok: true, content: g.content };
    };
    const out = await BUILDER.buildProject(spec, { generateFile, maxRepair: B.maxRepairPerRound, sandboxRunner: opts.sandboxRunner });
    const finalJs = out.files ? out.files[item.sandboxFile] : null;
    const gen = [candidates[sel.chosen], ...generations].reverse().find((g: any) => g && g.ok && !g.notSent && g.sandboxContentSha256 === (finalJs ? sha256(finalJs) : null));
    const r: any = { round, buildOk: out.buildOk, verified: out.verified, accepted: out.accepted, repairs: out.repairs, repairStopReason: out.repairStopReason, verifyError: out.verifyError, buildError: out.buildError, executionMode: out.executionMode, executionStatus: out.executionStatus, isolation: out.isolation, firstPass: out.firstPass, finalTsSha256: gen ? gen.tsSha256 : null, finalGeneration: gen ? gen.i : null };
    rounds.push(r);
    if (out.executionStatus !== "EXECUTED" || out.executionMode !== "SANDBOX") break;
    if (out.accepted && gen) { r.typecheck = PIPE.typecheck(gen.tsSource, item.targetPath); if (r.typecheck.ok) accepted = gen; else { typeHint = { typeError: r.typecheck.diagnostics.join(" | ") }; firstUse = false; } }
    if (guard.st.capHit) break;
    if (div && div.st.exhausted) break;   // DIV-1: ladder exhausted ⇒ no further round (never an extra call past the schedule)
  }
  const repairs = rounds.reduce((a: number, r: any) => a + (Number(r.repairs) || 0), 0);
  const allHits = prompts.reduce((a: number, p: any) => a + p.denylistHits.length, 0);
  const ledger = PIPE.authorshipLedger({ denylistHits: Array.from({ length: allHits }), designsBy: "LOCAL_MODEL", model: B.model, designCount: designs.length, chosen: sel.chosen, implementedBy: "LOCAL_MODEL", generation: accepted ? accepted.i : null, repairs, integratedBy: null });
  const provenance = { actor: "ODG", executionClass: NE.EXEC.LOCAL, providerEditedGeneratedCode: false, providerCalls: 0 };
  base.host.aboveThresholdDuringRun = hostReadings.filter((h: any) => h.aboveThreshold).length;   // context only (HOST_RULE); never re-grades the verdict
  const diversity = div ? { ...div.record(), events: diversityEvents, callsByPoint: generations.filter((g: any) => !g.notSent && g.point !== null && g.promptI !== null).map((g: any) => ({ generation: g.i, point: g.point, model: g.model, temperature: g.temperature, seed: g.seed })) } : undefined;
  const common: any = { overCapFailures, ...(diversity ? { diversity } : {}), design: designRecord, selection, rounds, repairTrace, prompts, generations: strip(generations), network: network(), provenance, authorship: ledger };
  const notMeasured = nm() || rounds.some((r: any) => r.executionStatus !== "EXECUTED" || r.executionMode !== "SANDBOX");
  const withLessons = (rec: any) => ({ ...rec, lessons: PIPE.deriveLessons(rec, opts.lessonProvenance || P.out) });
  if (notMeasured) return withLessons(finish({ verdict: "NOT_MEASURED", reason: nm() ? nmReason() : "sandbox did not execute (NOT_RUN) — no verdict", ...common }));
  if (!accepted) return withLessons(finish({ verdict: "FAIL", reason: `S5: the chosen design did not pass the held-out oracle + strict typecheck within ${B.maxRounds} rounds × (1 + ${B.maxRepairPerRound} repairs)${guard.st.capHit ? " (cap " + guard.st.capHit + ")" : ""}${div && div.st.exhausted ? " (DIV-1 ladder exhausted)" : ""}`, ...common }));
  const testSrc = oracleTestSource(item, problem);
  const diff = PIPE.replaceFileDiff(item.targetPath, item.currentSource, accepted.tsSource) + PIPE.newFileDiff(item.testPath, testSrc);
  const applyCheck = PIPE.gitApplyCheck(root, diff);
  const patch = { files: [{ path: item.targetPath, sha256: sha256(accepted.tsSource), authoredBy: "LOCAL_MODEL", design: accepted.design || sel.chosen, generation: accepted.i, change: "MODIFIED" }, { path: item.testPath, sha256: sha256(testSrc), authoredBy: "ODG_RULES", change: "ADDED" }], diff, diffSha256: sha256(diff), gitApplyCheck: applyCheck };
  return withLessons(finish({ verdict: applyCheck.ok ? "PASS" : "FAIL", reason: applyCheck.ok ? "S4 ≥2 designs measured + SEL-1 choice; S5 held-out oracle PASS in sandbox + strict typecheck PASS; git apply --check OK" : "diff does not apply", ...common, patch,
    integration: "OWNER_GATED via normal PR controls: apply patch.diff on a branch (this runner writes no checkout)" }));
}

/* ---------------- contract (ODG rules over the current repo) ---------------- */
function contractFor(root: string): any {
  const item = NRI.designItem(root);
  if (!item) return null;
  const p = PIPE.deriveProblem({ ...item, lessonKinds: [] });
  if (!p.defect) return null;
  return {
    scenario: SCENARIO,
    title: "ODG designs the change: repair odg-canonical-json's undefined handling from executed failing cases (local model proposes ≥2 designs, ODG selects/tests/repairs)",
    state: "PROPOSED", authorizedBy: null,
    origin: { detectedBy: "runtime/core/odg-native-design-pipeline.ts deriveProblem (PROB-1) over runtime/core/odg-native-repair-item.ts designItem (ORC-2, REF-1)", target: item.targetPath, evidenceDigest: p.evidenceDigest, failingCases: p.failing.length, totalCases: p.cases.length, failingKinds: p.kinds, excluded: p.excluded.length, reference: item.reference, corpusSha256: item.corpusSha256 },
    WORK_ITEM_CONTRACT: {
      objective: `Repair ${item.targetPath} so ${item.exportName} matches the in-repo reference on every ORC-2 input (${p.failing.length}/${p.cases.length} cases fail today: ${p.kinds.join("; ")}) — the problem DERIVED by ODG rules, the designs PROPOSED by ODG's local model, the choice made by SEL-1, the code written by the local model`,
      scope: "internal repo only; loopback Ollama 127.0.0.1:11434 only; model code executes only in the bwrap native-build sandbox; €0; 0 provider calls; the patch is a branch-ready diff in the result record — never written into any checkout by the runner; no other module is changed",
      write_set: [item.targetPath, item.testPath, SELF, OUT],
      nativePatchWriteSet: [item.targetPath, item.testPath],
      authorized_symbols: [item.exportName],
      invariants: [
        "no provider-written algorithm text in any prompt: TEMPLATE segments match no ALGORITHM_HINT_DENYLIST pattern (a matching prompt is not sent)",
        "the problem statement = executed failing cases (input → expected / current) + the current source; held-out expected values never enter a prompt or the sandbox",
        "≥2 designs from the local model; the selection is SEL-1 over ODG-measured scores (sandbox oracle, typecheck, callers affected, diff size, write set)",
        "the module content is authored by the local model only (sha256 of every generation recorded); the test file by ODG rules",
        "a FAIL is recorded as FAIL; criteria and budgets are not changed after observation",
      ],
      acceptance_criteria: [
        `AC1 problem reproduced at run time: fresh PROB-1 evidenceDigest equals origin.evidenceDigest (else NOT_MEASURED)`,
        `AC2 designs: ≥${BUDGETS.minDesigns} parseable designs from the local model, each implemented and measured in the sandbox; SEL-1 choice recorded with all scores`,
        `AC3 held-out oracle: all ${p.cases.length} PROB-1 cases PASS inside odg-native-build-sandbox (EXECUTED, SANDBOX) + strict typecheck 0 diagnostics`,
        `AC4 branch-ready: the diff modifies ${item.targetPath}, adds ${item.testPath}, passes git apply --check at the run HEAD`,
        "AC5 authorship ledger + provenance: per-stage authorship, every prompt sha256 + its segment kinds + denylist hits (0), every generation sha256, providerCalls 0",
        "AC6 learning: lessons read before the run (memory-taxonomy CONSOLIDATED) and lessons derived from this run are both in the record",
      ],
      stop_conditions: ["model call cap", "wall cap", "sandbox unavailable (NOT_RUN ⇒ NOT_MEASURED)", "any non-loopback request (refused ⇒ NOT_MEASURED)", "problem drift (AC1)", "a TEMPLATE denylist hit (prompt not sent)",
        `HOST-1 busy host at start: loadavg-1m > nproc × ${BUDGETS.hostIdleFactor} before the first model call ⇒ NOT_MEASURED (no model call)`,
        "ADAPT-1 warm-up yields no measurable tokens/s ⇒ NOT_MEASURED; a call whose predicted duration exceeds perCallTimeout.maxMs is not sent: BEFORE the first work call ⇒ NOT_MEASURED, AFTER it ⇒ a FAILED generation (counts towards FAIL, prediction recorded)"],
      rollback: "nothing is written into any checkout; discard the record",
      evidence_required: [OUT],
      budgets: BUDGETS,
      preRegistration: {
        metric: "verdict of runNativeDesign (PASS ⇔ AC2 ∧ AC3 ∧ AC4 within budgets)",
        baseline: `the integrated helper (NB1 PASS) fails ${p.failing.length}/${p.cases.length} PROB-1 cases; a provider-run PROBE of this runner (scratch, live Ollama) is context only, never the native result`,
        dataset: { corpusRule: "ORC-2", corpusSha256: item.corpusSha256, cases: p.cases.length, failing: p.failing.length, shown: p.shown.length, heldOut: p.heldOut.length, excluded: p.excluded.length, referenceSha256: item.reference.sourceSha256 },
        decisionRule: "outcome = runner verdict recorded verbatim (PASS / FAIL / NOT_MEASURED); one dispatch; no re-run to obtain a PASS",
        thresholds: { PASS: "≥2 designs measured AND all PROB-1 cases pass in the sandbox AND 0 strict typecheck diagnostics AND git apply --check OK", FAIL: "<2 designs, or budgets exhausted without PASS", NOT_MEASURED: "no sandbox verdict / network refusal / problem drift / HOST-1 busy host at start / ADAPT-1 rate not measured, or predicted call over cap BEFORE the first work call" },
        caps: { maxRunWallMs: BUDGETS.wallMs + BUDGETS.perCallTimeout.maxMs, maxModelCalls: BUDGETS.maxModelCalls, maxWarmupCalls: BUDGETS.maxWarmupCalls, perCallTimeoutMs: { min: BUDGETS.perCallTimeout.minMs, max: BUDGETS.perCallTimeout.maxMs }, basis: "no new model call after wallMs; one in-flight call may last at most perCallTimeout.maxMs; per-call timeout = ADAPT-1 from one warm-up call (own cap, not counted in maxModelCalls); lessons enter prompts via DIGEST-1 (≤ lessonDigestChars)" },
        honestLimits: "ORC-2 input literals, prompt templates and the runner are provider-written; the reference semantics are the in-repo canon() (REF-1), not an independent specification; a PASS means ODG's local model designed+implemented a repair of a defect ODG derived — not that ODG chose the corpus",
      },
    },
    authorization: {
      by: null,
      scope: ["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"],
      executionAuthorized: false,
      executionCondition: "isolated, reproducible, loopback-only local-model run at €0 with 0 provider calls; model code only in the bwrap sandbox; only after an independent inspection ACCEPT of this contract is recorded",
      dispatchTargets: { RUN_CONTROLLED_EXPERIMENTS: { command: SELF, args: [OUT], writeSet: [OUT] } },
    },
  };
}

/* ---------------- CLI ---------------- */
function readContract(root: string): any { const d = readJson(path.join(root, CONTRACTS)); return d ? (d.contracts || []).find((c: any) => c && c.scenario === SCENARIO) || null : null; }
function readInspection(root: string): any { const r = readJson(path.join(root, INSPECTION)); return r ? { ...r, recordPath: INSPECTION } : null; }
function gate(contract: any, inspection: any, probes: any, profile: any = NB2_PROFILE): any {
  const SCENARIO = profile.scenario, SELF = profile.runner, OUT = profile.out;   // V17.6 NB3: same gate, per contract profile
  if (!contract) return { ok: false, reason: `contract ${SCENARIO} not found in ${CONTRACTS}` };
  const sc = AS.deriveAuthorizationScope(contract, { inspection, probes });
  if (!sc.applicable) return { ok: false, reason: `authorization scope not applicable: ${sc.reason}` };
  if (sc.currentStep !== STEP || sc.executionAuthorized !== true) return { ok: false, reason: `current step ${sc.currentStep} not execution-authorized: ${sc.reason}` };
  const t = contract.authorization && contract.authorization.dispatchTargets ? contract.authorization.dispatchTargets[STEP] : null;
  if (!t || t.command !== SELF || JSON.stringify(t.args) !== JSON.stringify([OUT]) || JSON.stringify(t.writeSet) !== JSON.stringify([OUT])) return { ok: false, reason: "declared dispatch target is not this runner with args/writeSet [OUT]" };
  return { ok: true, contractSha256: sc.contractSha256, scope: sc };
}
function realOutside(out: string, root: string): boolean {
  try {
    const abs = path.resolve(out);
    const real = fs.existsSync(abs) ? fs.realpathSync(abs) : path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs));
    const r = fs.realpathSync(root);
    return real !== r && !real.startsWith(r + path.sep);
  } catch { return false; }
}
function loopbackTransport(): any { return require("./odg-v161-scenario-f-run.js").loopbackFetch; }

/* ---------------- selftest fixtures (FAKE model answers — test fixtures, NOT native results) ---------------- */
const FIX_WRONG = "function canonicalJson(value: any): string {\n  if (Array.isArray(value)) return '[' + value.map((v: any) => v === undefined ? 'null' : canonicalJson(v)).join(',') + ']';\n  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map((k: string) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';\n  return JSON.stringify(value);\n}\nmodule.exports = { canonicalJson };\nexport {};\n";
const FIX_RIGHT = "function canonicalJson(value: any): string {\n  if (value === undefined) return 'null';\n  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';\n  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().filter((k: string) => value[k] !== undefined).map((k: string) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';\n  return JSON.stringify(value);\n}\nmodule.exports = { canonicalJson };\nexport {};\n";
const FIX_DESIGNS = JSON.stringify([{ summary: "Design alpha: handle arrays only", steps: ["a"], changesExportedApi: false, files: ["runtime/core/odg-canonical-json.ts"] }, { summary: "Design beta: handle every position", steps: ["b"], changesExportedApi: false, files: ["runtime/core/odg-canonical-json.ts"] }]);
/* makeFake(plan) — plan: { designs?: string, impl: { [summarySubstring]: [answers in order] }, repair?: string,
 *   timings?: Ollama counters returned on EVERY answer (default: 32 tok/s generation, 200 tok/s prompt eval), noTimings?: true }.
 * The warm-up prompt is answered "ready" and recorded in `warmups` (not in `prompts`). */
const FAKE_TIMINGS = Object.freeze({ eval_count: 16, eval_duration: 5e8, prompt_eval_count: 10, prompt_eval_duration: 5e7, load_duration: 1e6, total_duration: 6e8 });
const IDLE = () => ({ loadavg: [0.1, 0.1, 0.1], nproc: 8 });   // test fixture: an idle 8-core host
function makeFake(plan: any): any {
  const seen: string[] = []; const prompts: string[] = []; const warmups: any[] = []; const used: any = {};
  const timings = plan.noTimings ? {} : (plan.timings || FAKE_TIMINGS);
  const fake = async (url: string, init: any) => {
    seen.push(url); const b = JSON.parse(init.body);
    if (b.prompt === PIPE.WARMUP_PROMPT) { warmups.push(b); return { ok: true, json: async () => ({ model: b.model, response: "ready", ...timings }) }; }
    prompts.push(b.prompt);
    let resp = "";
    if (/Task: propose/.test(b.prompt)) resp = plan.designs !== undefined ? plan.designs : FIX_DESIGNS;
    else if (/previous attempt/.test(b.prompt)) resp = plan.repair || FIX_RIGHT;
    else { const k = Object.keys(plan.impl).find((s) => b.prompt.includes(s)); const n = used[k as string] = (used[k as string] || 0) + 1; const list = k ? plan.impl[k] : [FIX_WRONG]; resp = "```ts\n" + list[Math.min(n, list.length) - 1] + "```"; }
    return { ok: true, json: async () => ({ model: b.model, eval_count: 1, ...timings, response: resp }) };
  };
  return { fake, seen, prompts, warmups };
}

async function selftest(): Promise<number> {
  let f = 0; const check = (n: string, c: boolean) => { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; };
  const probe = NBS.probeSandbox();
  const F = makeFake({ impl: { "Design alpha": [FIX_WRONG], "Design beta": [FIX_RIGHT] } });
  const r = await runNativeDesign({ root: ROOT, label: "SELFTEST", transport: F.fake, loadProbe: IDLE });
  if (!r.problem || !r.problem.defect) { process.stdout.write("note - the real tree no longer has the defect (NB2 integrated): selftest checks NOT_MEASURED\n"); check("integrated ⇒ NOT_MEASURED (nothing to design)", r.verdict === "NOT_MEASURED"); return f; }
  if (probe && probe.ok === true) {
    check("S3: 2 designs parsed; S4: SEL-1 chooses the design whose implementation passes the oracle (D2)", r.design.count === 2 && r.selection.chosen === "D2" && r.selection.scores.find((s: any) => s.design === "D1").oraclePassed < r.selection.scores.find((s: any) => s.design === "D2").oraclePassed);
    check("S5: PASS with the S4 implementation reused (3 model calls: 1 design + 2 implementations), 0 repairs", r.verdict === "PASS" && r.network.modelCalls === 3 && r.rounds[0].repairs === 0);
    check("ADAPT-1/HOST-1: 1 warm-up call (own cap, not in modelCalls) measured a rate; every sent prompt has a host reading + a derived timeout within the caps", r.network.warmupCalls === 1 && !!r.warmup.rate && r.prompts.every((p: any) => p.hostLoad && p.timeout && p.timeout.timeoutMs >= BUDGETS.perCallTimeout.minMs && p.timeout.timeoutMs <= BUDGETS.perCallTimeout.maxMs));
    check("diff modifies the helper + adds the ODG-rules test, applies", r.patch && /a\/runtime\/core\/odg-canonical-json\.ts/.test(r.patch.diff) && /b\/runtime\/core\/odg-canonical-json-extended\.test\.ts/.test(r.patch.diff) && r.patch.gitApplyCheck.ok === true);
    check("authorship: problem ODG_RULES (0 denylist hits), design/implementation LOCAL_MODEL, selection ODG_RULES, corpus PROVIDER", r.authorship.problem.by === "ODG_RULES" && r.authorship.problem.providerAlgorithmTextInPrompts === false && r.authorship.design.by === "LOCAL_MODEL" && r.authorship.implementation.by === "LOCAL_MODEL" && r.authorship.selection.by === "ODG_RULES" && r.authorship.corpus.by === "PROVIDER");
    check("only the loopback URL was requested", F.seen.every((u: string) => u === "http://127.0.0.1:11434/api/generate"));
  } else { process.stdout.write("SKIP - sandbox unavailable (" + String(probe && probe.reason) + ")\n"); check("no sandbox ⇒ NOT_MEASURED", r.verdict === "NOT_MEASURED"); }
  const one = await runNativeDesign({ root: ROOT, label: "SELFTEST", transport: makeFake({ designs: JSON.stringify([{ summary: "only one" }]), impl: {} }).fake, loadProbe: IDLE });
  check("fewer than 2 designs ⇒ FAIL (no implementation call)", one.verdict === "FAIL" && /S3/.test(one.reason) && one.network.modelCalls === 1);
  return f;
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === "--selftest") return (await selftest()) === 0 ? 0 : 1;
  if (argv[0] === "--emit-contract") { process.stdout.write(JSON.stringify(contractFor(ROOT), null, 2) + "\n"); return 0; }
  if (argv[0] === "--probe") {
    const i = argv.indexOf("--out"); const out = i >= 0 ? argv[i + 1] : null;
    const ri = argv.indexOf("--repo"); const root = ri >= 0 ? path.resolve(argv[ri + 1]) : ROOT;
    if (!out || !path.isAbsolute(out) || !realOutside(out, root) || !realOutside(out, ROOT)) { process.stdout.write("REFUSED: --probe needs --out <absolute path whose realpath is outside the repo>\n"); return 3; }
    const extra: any[] = []; argv.forEach((a, k) => { if (a === "--lessons-from") { const r = readJson(String(argv[k + 1])); if (r) extra.push({ record: r, provenance: "PROBE " + path.basename(String(argv[k + 1])) }); } });
    const r = await runNativeDesign({ root, label: "PROBE (provider-run feasibility probe — NOT the ODG-native GO result)", transport: loopbackTransport(), extraLessons: extra, lessonProvenance: "PROBE " + path.basename(out) });
    fs.writeFileSync(out, JSON.stringify(r, null, 2) + "\n");
    process.stdout.write(`PROBE verdict ${r.verdict} modelCalls ${r.network ? r.network.modelCalls : 0} chosen ${r.selection ? r.selection.chosen : null} repairs ${(r.rounds || []).reduce((a: number, x: any) => a + (x.repairs || 0), 0)} wallMs ${r.wallMs} → ${out}\n`);
    return 0;
  }
  const out = argv[0];
  if (out !== OUT) { process.stdout.write(`REFUSED: output path must be the declared writeSet entry ${OUT}\n`); return 3; }
  const c = readContract(ROOT);
  // V17.6 ONE-SHOT (incident 2026-11-24 19:24Z: a test invoked this runner directly with the declared output after the inspection
  // landed ⇒ an unintended second NATIVE start; it stopped NOT_MEASURED after 1 warm-up call). A NATIVE run never overwrites an
  // existing result record: the single execution is GO's (one-shot claim); a re-run needs a new owner decision.
  if (fs.existsSync(path.join(ROOT, OUT))) { process.stdout.write(`ALREADY_RECORDED: ${OUT} exists — a NATIVE run never overwrites a result (one execution only)\n`); return 4; }
  const g = gate(c, readInspection(ROOT), OCUR.localGitProbes(ROOT));
  if (!g.ok) { process.stdout.write(`NOT_AUTHORIZED: ${g.reason}\n`); return 2; }
  const r = await runNativeDesign({ root: ROOT, label: "NATIVE (ODG GO dispatch)", transport: loopbackTransport(), expectedDigest: c.origin && c.origin.evidenceDigest, contractSha256: g.contractSha256 });
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(r, null, 2) + "\n");
  process.stdout.write(`NATIVE verdict ${r.verdict} → ${OUT}\n`);
  return r.verdict === "PASS" ? 0 : 1;
}

module.exports = { runNativeDesign, NB2_PROFILE, FIX_DESIGNS, loopbackTransport, contractFor, gate, readContract, realOutside, oracleTestSource, lessonSourcesFor, makeFake, IDLE, FAKE_TIMINGS, FIX_WRONG, FIX_RIGHT, BUDGETS, SELF, OUT, CONTRACTS, INSPECTION, SCENARIO, STEP, NATIVE_CLAIM, LESSON_SOURCES };
if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stdout.write("ERROR " + String((e && e.stack) || e) + "\n"); process.exit(1); });
export {};
