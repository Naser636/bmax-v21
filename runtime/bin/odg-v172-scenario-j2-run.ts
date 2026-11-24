#!/usr/bin/env node
"use strict";
/*
 * V17.2 — SCENARIO J2, step RUN_CONTROLLED_EXPERIMENTS (contract docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#J2,
 * frozen sha256 893a809f…, owner V171 — docs/odg/V171_OWNER_AUTHORIZATION_PORTFOLIO.json; independent inspection record
 * docs/odg/evidence/V172_J2_CONTRACT_INSPECTION.json). This file is the contract's DECLARED dispatch target
 * authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS: ODG GO runs
 *   npx tsx runtime/bin/odg-v172-scenario-j2-run.ts docs/odg/evidence/V172_J2_EXPERIMENT.json
 * Provider (Claude Code) wrote this runner; the run itself is ODG GO's dispatch. The provider did NOT run it.
 *
 * Implements WORK_ITEM_CONTRACT.preRegistration LITERALLY (constants below are asserted against the live text by gate()):
 *   tasks: replication [rle-codec, csv-typed-validator, range-clamp-pipeline, v159-implement-parse-range] + held-out
 *   [number-stats-suite, word-metrics, grade-report, roman-codec, bank-ledger, voting-tally, temperature-pipeline] ·
 *   decoding temperature 0, num_predict 600, seeds 42 (primary) and 7 (A0 rerun-alone control) ·
 *   A0 = odg-intelligent-native-cycle.runIntelligentCycle exactly as J (J's own runDefault is reused) ·
 *   A1 = odg-decomposed-execution.runDecomposed (its OWN verified-file freezing), A0's model/maxRepair, generic hints only
 *        (NO repairExamples) — "no expected outputs in prompts", NOT equal-information (per-module task-author oracles) ·
 *   A2 = A1, then ONLY A1's first failing sub-problem re-run at qwen2.5-coder:7b / maxRepair 3 (generic hints only) ·
 *   A3 (report-only, never pooled) = A2 with structured repairExamples for ALL sub-problems — NOT equal-information ·
 *   A4 (report-only) = single-file 7b / maxRepair 3 on v159-implement-parse-range ·
 *   trigger: an alternative runs only after A0@same-seed ended with NO_PROGRESS_IDENTICAL_REGENERATION or
 *   REPAIR_BUDGET_EXHAUSTED recorded by native-project-builder (NO_QUALIFIED_LOCAL_MODEL = policy decision, never a stop) ·
 *   E = held-out tasks where A0@42 ended with an ODG stop and A2@42 is EXECUTED · grade = first matching of
 *   NOT_MEASURED, PASS, PARTIAL, FAIL (preRegistration.thresholds), evaluated mechanically on the recorded rows.
 *
 * GATE (fail-closed, before ANY model call or task build; exit 2 NOT_AUTHORIZED, NOTHING written):
 *   sha256(canon(live contract J2)) === PINNED_CONTRACT_SHA; odg-authorization-scope.deriveAuthorizationScope(contract,
 *   {inspection, probes: odg-observation-currency.localGitProbes(repo)}) authorizes RUN_CONTROLLED_EXPERIMENTS as the
 *   CURRENT step; runner constants equal the frozen preRegistration text; the declared dispatch target is this file with
 *   args [OUT] and writeSet [OUT].
 * WRITE CONFINEMENT: the output path comes from argv and must EQUAL the declared writeSet entry (else exit 3, nothing
 *   written); exactly one writeFileSync of OUT. Every generated file is retained (sha256 + source) INSIDE that record only.
 * NETWORK: model calls go only through guardedFetch (scenario F's node:http loopbackFetch behind an exact
 *   http://127.0.0.1:11434 allowlist); any other URL is REFUSED and RECORDED (⇒ C5 ⇒ NOT_MEASURED); globalThis.fetch is
 *   replaced by the same guard for the duration of the run. 0 provider calls; no delegation record past CREATED.
 * ISOLATION: model code executes ONLY in the bwrap native-build sandbox (native-project-builder SANDBOX mode,
 *   odg-native-build-sandbox.runIsolated); a build reporting any other executionMode makes its row NOT_MEASURED.
 * CAPS: perTrialWallMs 1 800 000, maxModelCallsTotal 600, maxRepairCeiling 3 — the guard refuses calls past a cap; the
 *   trial and every later trial are NOT_MEASURED (no unbounded loop).
 *
 * Usage:  <out-path>                       run + write the record (out-path must be the declared writeSet entry)
 *         --check <out-path>               re-derive E / counts / grade / leak / retention from the committed rows (no model)
 *         --check-at-run-head <out-path>   the record's OWN --check at record.run.head (odg-run-head-check, temp worktree)
 *         --selftest                       offline: injected fake-Ollama transport (no live model), nothing written
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");
const AS = require("../core/odg-authorization-scope.js");
const OCUR = require("../core/odg-observation-currency.js");
const RHC = require("../core/odg-run-head-check.js");
const DECOMP = require("../core/odg-decomposed-execution.js");
const BUILDER = require("../core/native-project-builder.js");
const NBS = require("../core/odg-native-build-sandbox.js");
const GEN = require("../core/local-model-generator.js");
const POL = require("../core/odg-local-model-execution-policy.js");
const J = require("./odg-v161-scenario-j-run.js");              // J's task definitions, recordReferenceCalls, runDefault (read, not modified)
const F = require("./odg-v161-scenario-f-run.js");              // scenario F's node:http loopbackFetch (127.0.0.1 only)
const { HARD_TASKS, HARD_TEST_PRELUDE } = require("./native-hard-corpus.js");

const ROOT = path.resolve(__dirname, "..", "..");
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const INSPECTION = "docs/odg/evidence/V172_J2_CONTRACT_INSPECTION.json";
const SELF = "runtime/bin/odg-v172-scenario-j2-run.ts";
const OUT = "docs/odg/evidence/V172_J2_EXPERIMENT.json";
const STEP = "RUN_CONTROLLED_EXPERIMENTS";
const OLLAMA = "http://127.0.0.1:11434";

/* ---- frozen pre-registration constants (verbatim from contract J2; asserted against the live text by gate()) ---- */
const PINNED_CONTRACT_SHA = "d5a8b0db7f776da69b11a45f470a871cfcb4b2ab4b543fbeda6fdb2eeb5bcc6b";   // V17.3 revision (owner V173): anti-leak rule
const PRE = Object.freeze({
  pins: Object.freeze({
    taskCorpus: Object.freeze({ file: "runtime/bin/native-hard-corpus.ts", sha256: "2ad9fca555d1678c3031f097c0e3929d846e80670209c4b2dadb37b34e18e250" }),
    heldOutBasis: Object.freeze({ file: "docs/odg/evidence/V159_NATIVE_BUILD_ISOLATION.json", sha256: "94c7eb999cea757443db398aef3721f95ae089b3c525468f34c08dbd3d650e8b" }),
    controlReference: Object.freeze({ file: "docs/odg/evidence/V161_SCENARIO_J.json", sha256: "11245ce051234b4218b8859e159307eef3652ebc59ce00e32b8782371e461bff" }),
    protocolSource: Object.freeze({ file: "docs/odg/evidence/V171_J_DIAGNOSIS.json", sha256: "c553a2ca0cdfe2b73c2b664c6656fcfc79824811b1a0d30488ac95cefa680be0" }),
  }),
  parseRangeTaskFile: "runtime/bin/odg-v161-scenario-j-run.ts",
  replication: Object.freeze(["rle-codec", "csv-typed-validator", "range-clamp-pipeline", "v159-implement-parse-range"]),
  heldOut: Object.freeze(["number-stats-suite", "word-metrics", "grade-report", "roman-codec", "bank-ledger", "voting-tally", "temperature-pipeline"]),
  decoding: Object.freeze({ temperature: 0, seeds: Object.freeze([42, 7]), num_predict: 600, primarySeed: 42 }),
  controlSeed: 7,
  odgStops: Object.freeze(["NO_PROGRESS_IDENTICAL_REGENERATION", "REPAIR_BUDGET_EXHAUSTED"]),
  policyDecisionNotAStop: "NO_QUALIFIED_LOCAL_MODEL",
  maxLocal: Object.freeze({ model: "qwen2.5-coder:7b", maxRepair: 3 }),
  caps: Object.freeze({ perTrialWallMs: 1800000, maxModelCallsTotal: 600, maxRepairCeiling: 3 }),
  leakMinLiteralLength: 4,
  /* V17.3 (owner V173, contract revision before any run): literals already in the frozen task-contract text given
   * identically to every arm are EXCLUDED from the prompt-leak check — exactly this listed static overlap (verified at run
   * time: computed overlap ≠ this list ⇒ NOT_MEASURED, never silently widened). */
  taskContractLiteralExclusions: Object.freeze({ "roman-codec": Object.freeze(["1994", "MCMXCIV"]), "rle-codec": Object.freeze(["a3b1", "aaab"]), "range-clamp-pipeline": Object.freeze(["[0,100]"]), "v159-implement-parse-range": Object.freeze(["[1,2,3,5,7,8]"]) }) as Record<string, readonly string[]>,
  minimumE: 4,
  passMinE: 2,
  loopback: Object.freeze({ host: "127.0.0.1", port: "11434", protocol: "http:" }),
});
const ARMS = Object.freeze({
  A0: "default (control): odg-intelligent-native-cycle.runIntelligentCycle exactly as J (J's runDefault reused)",
  A1: "canonical decomposed, NO EXPECTED OUTPUTS IN PROMPTS (generic hints only, no repairExamples) — NOT equal-information (per-module task-author oracles)",
  A2: "A1, then ONLY the first failing sub-problem re-run at qwen2.5-coder:7b / maxRepair 3 (generic hints only) — NOT equal-information (same reason as A1)",
  A3_reportOnly: "A2 + structured repairExamples for ALL sub-problems — NOT equal-information; reported separately, never pooled, never decisive",
  A4_reportOnly: "single-file qwen2.5-coder:7b / maxRepair 3 on v159-implement-parse-range only (RC-7) — never decisive",
});
const DECISIVE_ARMS = Object.freeze(["A0", "A1", "A2"]);   // the prompt-leak assertion applies to these

const sha256 = (b: any) => crypto.createHash("sha256").update(b).digest("hex");
const fileSha = (root: string, rel: string): string | null => { try { return sha256(fs.readFileSync(path.join(root, rel))); } catch { return null; } };

/* ================================================ gate ================================================ */
function readContract(root: string): any {
  const all = JSON.parse(fs.readFileSync(path.join(root, CONTRACTS), "utf8"));
  return (all.contracts || []).find((c: any) => c && c.scenario === "J2") || null;
}
function readInspection(root: string): any { try { return JSON.parse(fs.readFileSync(path.join(root, INSPECTION), "utf8")); } catch { return null; } }

/* gate(contract, inspection, probes?) — pure over its inputs (the CLI passes the live files + local git probes). */
function gate(contract: any, inspection: any, probes: any = OCUR.localGitProbes(ROOT)): any {
  if (!contract) return { ok: false, reason: "contract J2 not found" };
  const sha = AS.contractSha256(contract);
  if (sha !== PINNED_CONTRACT_SHA) return { ok: false, reason: `live contract sha256 ${sha} ≠ pinned ${PINNED_CONTRACT_SHA} (contract edited — inspection invalid)`, contractSha256: sha };
  const scope = AS.deriveAuthorizationScope(contract, { inspection, probes });
  if (!AS.isStepAuthorized(scope, STEP) || scope.currentStep !== STEP || scope.executionAuthorized !== true) return { ok: false, reason: `deriveAuthorizationScope does not authorize ${STEP} now: ${scope.reason}`, contractSha256: sha };
  const pr = contract.WORK_ITEM_CONTRACT && contract.WORK_ITEM_CONTRACT.preRegistration;
  if (!pr) return { ok: false, reason: "contract J2 has no preRegistration", contractSha256: sha };
  const mm: string[] = [];
  const need = (k: string, s: any, res: RegExp[]) => { if (typeof s !== "string" || !res.every((r) => r.test(s))) mm.push(k); };
  const same = (k: string, a: any, b: any) => { if (JSON.stringify(a) !== JSON.stringify(b)) mm.push(k); };
  const ds = pr.dataset || {};
  same("dataset.taskCorpus", ds.taskCorpus && [ds.taskCorpus.file, ds.taskCorpus.sha256], [PRE.pins.taskCorpus.file, PRE.pins.taskCorpus.sha256]);
  same("dataset.heldOutBasis", ds.heldOutBasis && [ds.heldOutBasis.file, ds.heldOutBasis.sha256], [PRE.pins.heldOutBasis.file, PRE.pins.heldOutBasis.sha256]);
  same("dataset.controlReference", ds.controlReference && [ds.controlReference.file, ds.controlReference.sha256], [PRE.pins.controlReference.file, PRE.pins.controlReference.sha256]);
  same("dataset.parseRangeTask.file", ds.parseRangeTask && ds.parseRangeTask.file, PRE.parseRangeTaskFile);
  same("dataset.replication", ds.replication, PRE.replication);
  same("dataset.heldOut", ds.heldOut, PRE.heldOut);
  need("dataset.refusal", ds.refusal, [/refuses \(NOT_MEASURED\) if any pinned sha256 differs/]);
  need("protocolSource", pr.protocolSource, [new RegExp(PRE.pins.protocolSource.file.replace(/[.]/g, "\\.") + "#j2_protocol \\(sha256 " + PRE.pins.protocolSource.sha256 + "\\)")]);
  const dec = pr.decoding || {};
  same("decoding", [dec.temperature, dec.seeds, dec.num_predict, dec.primarySeed], [PRE.decoding.temperature, PRE.decoding.seeds, PRE.decoding.num_predict, PRE.decoding.primarySeed]);
  const arms = pr.arms || {};
  need("arms.A0", arms.A0, [/runIntelligentCycle exactly as J/, /PROBE 3b \/ maxRepair 1/]);
  need("arms.A1", arms.A1, [/runDecomposed/, /NO EXPECTED OUTPUTS IN PROMPTS/, /its own verified-file freezing/, /same model \/ maxRepair as A0/, /generic repair hints only \(no repairExamples\)/, /NOT equal-information/]);
  need("arms.A2", arms.A2, [/ONLY the first failing sub-problem re-run/, /qwen2\.5-coder:7b, maxRepair 3/, /frozen verified parts/, /generic hints only/, /NOT equal-information/]);
  need("arms.A3_reportOnly", arms.A3_reportOnly, [/A2 \+ structured repairExamples for all sub-problems/, /never pooled with A0–A2, never decisive/]);
  need("arms.A4_reportOnly", arms.A4_reportOnly, [/single-file 7b \/ maxRepair 3 on v159-implement-parse-range only/, /never decisive/]);
  need("trigger", pr.trigger, [/A0 \(same task, same seed\) ends with NO_PROGRESS_IDENTICAL_REGENERATION or REPAIR_BUDGET_EXHAUSTED recorded by native-project-builder/]);
  const hyp = pr.hypothesis || {};
  need("hypothesis.main", hyp.main, [/with seed 42, A2 is accepted by the task's ORIGINAL whole-task test on at least 2 of the ELIGIBLE held-out tasks E/, /E = held-out tasks where A0@42 ended with an ODG stop and A2@42 is EXECUTED/]);
  need("hypothesis.refutedIf", hyp.refutedIf, [/A2@42 accepted on 0 or 1 task of E \(with \|E\| ≥ 4\)/]);
  need("metric", pr.metric, [/primary: A2@42/, /n = \|E\|/]);
  need("baseline", pr.baseline, [/RERUN-ALONE control A0@7 on E/, /A1@42 reported/]);
  need("uncertainty", pr.uncertainty, [/one-sided exact sign test of A2@42 vs A0@7 discordant pairs on E is reported only/]);
  need("minimumN", pr.minimumN, [/\|E\| ≥ 4/]);
  need("decisionRule", pr.decisionRule, [/first matching of NOT_MEASURED, PASS, PARTIAL, FAIL/]);
  const th = pr.thresholds || {};
  need("thresholds.NOT_MEASURED", th.NOT_MEASURED, [/Ollama unreachable or sandbox probe fails \(NOT_RUN\)/, /any pinned sha256 differs/, /\|E\| < 4/, /a hard cap is hit before every A0@42, A2@42 and A0@7 held-out row is measured/, /any C5 violation \(provider call, delegation past CREATED, non-loopback contact\)/, /a generated file is not retained \(C6\)/]);
  need("thresholds.PASS", th.PASS, [/A2@42 passes on ≥ 2 tasks of E AND A2@42 passes on strictly more tasks of E than A0@7 AND C4 reproduced on all 4 replication tasks/]);
  need("thresholds.PARTIAL", th.PARTIAL, [/A2@42 passes on exactly 1 task of E; OR ≥ 2 but the rerun-alone control or C4 is not satisfied/]);
  need("thresholds.FAIL", th.FAIL, [/A2@42 passes on 0 tasks of E/]);
  const caps = pr.caps || {};
  same("caps", [caps.perTrialWallMs, caps.maxModelCallsTotal, caps.maxRepairCeiling], [PRE.caps.perTrialWallMs, PRE.caps.maxModelCallsTotal, PRE.caps.maxRepairCeiling]);
  need("antiLeakage.prompts", pr.antiLeakage && pr.antiLeakage.prompts, [/HIDDEN grading cases \(held-out tests, per-module oracles, repair examples\)/, /records every prompt's sha256/, /no hidden-case expected-output literal of length ≥ 4 appears in an A0–A2 prompt, EXCLUDING literals already present in the frozen task-contract text given identically to every arm/,
    /static overlap, listed: roman-codec 1994\/MCMXCIV, rle-codec aaab\/a3b1, range-clamp-pipeline \[0,100\], parse-range \[1,2,3,5,7,8\]/, /\(violation ⇒ that row NOT_MEASURED\)/]);
  need("antiLeakage.oracle", pr.antiLeakage && pr.antiLeakage.oracle, [/ORIGINAL test, identical for all arms, read only after generation/]);
  const ac = (contract.WORK_ITEM_CONTRACT.acceptance_criteria || []).join("\n");
  need("acceptance_criteria", ac, [/^C1 stop trigger/m, /^C2 executed/m, /^C3 same oracle/m, /^C4 control: A0 on the 4 replication tasks at seed 42 reproduces J's default stop and verdict/m, /^C5 €0: 0 provider calls; no delegation record transitions past CREATED; only 127\.0\.0\.1:11434 contacted/m, /^C6 retention: every generated file is retained as sha256 \+ source in the evidence; every prompt is retained by sha256/m]);
  const ws = contract.WORK_ITEM_CONTRACT.write_set || [];
  if (!ws.includes(SELF) || !ws.includes(OUT)) mm.push("write_set");
  const dt = contract.authorization && contract.authorization.dispatchTargets && contract.authorization.dispatchTargets[STEP];
  if (!dt || dt.command !== SELF || JSON.stringify(dt.args) !== JSON.stringify([OUT]) || JSON.stringify(dt.writeSet) !== JSON.stringify([OUT])) mm.push("authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS");
  if (mm.length) return { ok: false, reason: "runner constants diverge from the frozen contract: " + mm.join(", "), contractSha256: sha };
  return { ok: true, contractSha256: sha, declaredOutput: OUT,
    scope: { currentStep: scope.currentStep, authorizedSteps: scope.authorizedSteps, derivedSteps: (scope.derivedSteps || []).map((d: any) => ({ step: d.step, rule: d.rule, coveredBy: d.coveredBy })), reason: scope.reason, independenceLevel: scope.independenceLevel, selfAuthorized: scope.selfAuthorized },
    inspection: { path: INSPECTION, verdict: inspection.verdict, inspectedHeadSha: inspection.inspectedHeadSha, inspectedPr: inspection.inspectedPr, inspectorSessionId: inspection.inspectorSessionId, authorSessionId: inspection.authorSessionId } };
}
/* write confinement: argv output path must be EXACTLY the declared writeSet entry (repo-relative, resolved under ROOT). */
function outputPathOk(arg: any, root: string = ROOT): boolean {
  if (typeof arg !== "string" || !arg) return false;
  return path.resolve(root, arg) === path.resolve(root, OUT) && path.normalize(arg) === OUT;
}

/* ================================================ tasks ================================================ */
/* trusted REFERENCE loader (repo corpus code, never model output) — same mechanism as J.recordReferenceCalls. */
function loadReference(files: any[], entry: string): any {
  const cache: Record<string, any> = {};
  const req = (spec: string): any => {
    const key = String(spec).replace(/^\.\//, "");
    if (cache[key]) return cache[key];
    const f = files.find((x: any) => x.path === key); if (!f) throw new Error("reference require of unknown module " + spec);
    const m: any = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function("module", "exports", "require", f.ref)(m, m.exports, req);
    cache[key] = m.exports; return m.exports;
  };
  return req(entry);
}
/* the whole-task inputs = the arguments the task's ORIGINAL corpus test calls the entry with (recorded on the reference). */
function deriveInputs(t: any): string[] {
  const ref = loadReference(t.files, "report.js"); const inputs: string[] = [];
  const ok = t.test((...a: any[]) => { inputs.push(a[0]); return ref(...a); });
  if (ok !== true) throw new Error(`reference fails the corpus test of ${t.id}`);
  return inputs;
}
const SEL: Record<string, string> = {
  "number-stats-suite": "held-out", "word-metrics": "held-out", "grade-report": "held-out", "roman-codec": "held-out",
  "bank-ledger": "held-out", "voting-tally": "held-out", "temperature-pipeline": "held-out",
};
/* hard task in J's exact shape (J.hardTask logic) for ANY corpus id; sub-problems WITHOUT repairExamples (A1/A2) and a
 * separate WITH-examples copy for every sub-problem (A3, report-only). */
function hardTask(id: string): any {
  const t = HARD_TASKS.find((x: any) => x.id === id); if (!t) throw new Error("unknown hard task " + id);
  const inputs = deriveInputs(t);
  const arch = t.files.map((f: any) => ({ path: f.path, role: f.path.replace(/\.js$/, ""), contract: f.contract, dependsOn: f.dependsOn || [] }));
  const wholeTestSource = NBS.testSourceFromFn(t.test, "report.js", HARD_TEST_PRELUDE);
  const calls = J.recordReferenceCalls(t.files, "report.js", inputs);
  const closure = (p: string, acc: Set<string> = new Set()): Set<string> => { const a = arch.find((x: any) => x.path === p); for (const d of (a ? a.dependsOn : [])) closure(d, acc); acc.add(p); return acc; };
  const mk = (withExamples: boolean) => arch.filter((a: any) => Array.isArray(calls[a.path]) && calls[a.path].length > 0).map((a: any) => {
    const need = closure(a.path); const cases = calls[a.path];
    const spec: any = { name: `${id}/${a.path}`, entry: a.path, architecture: arch.filter((x: any) => need.has(x.path)), writeSet: arch.filter((x: any) => need.has(x.path)).map((x: any) => x.path), independentTestCases: cases.map((c: any) => ({ entry: a.path, args: c.args, expect: c.expect })) };
    if (withExamples) spec.repairExamples = cases.map((c: any) => ({ args: c.args, expect: c.expect }));
    return { id: a.path, spec };
  });
  return { id, type: "implement", family: t.family, split: PRE.heldOut.includes(id) ? "heldOut" : "replication", selectedBecause: SEL[id] || "replication (J task)",
    spec: { name: id, architecture: arch, writeSet: arch.map((a: any) => a.path), independentTestSource: wholeTestSource },
    wholeTestSource, entry: "report.js", reference: Object.fromEntries(t.files.map((f: any) => [f.path, f.ref])),
    oracle: { derivation: "per-module (args→result) recorded from the corpus REFERENCE on the whole-task inputs (task-author oracle); A1/A2 specs carry NO repairExamples", inputs, wholeExpect: (calls["report.js"] || []).map((c: any) => c.expect), calls, subproblems: mk(false), subproblemsWithExamples: mk(true) } };
}
function parseRangeTask(): any {
  const t = J.buildTasks(["v159-implement-parse-range"])[0];
  const ref = loadReference([{ path: "f.js", ref: t.reference["f.js"] }], "f.js");
  // whole-task expected outputs of the ORIGINAL test's non-throwing calls (the throwing calls expect a RangeError, no value)
  const wholeExpect = ["1-3,5,7-8", " 2 , 1-2 ", "", "4"].map((s) => ref(s));
  return { ...t, split: "replication", oracle: null, leakOracle: { inputs: ["1-3,5,7-8", " 2 , 1-2 ", "", "4"], wholeExpect, calls: {} } };
}
function buildTasks(ids?: string[]): any[] {
  const all = [...PRE.heldOut.map(hardTask), ...PRE.replication.filter((x) => x !== "v159-implement-parse-range").map(hardTask), parseRangeTask()];
  return ids && ids.length ? all.filter((t) => ids.includes(t.id)) : all;
}

/* ---- anti-leakage: oracle expected-output literals (length ≥ 4) ---------------------------------------------------- */
/* literals(task) = every expected OUTPUT of the task's oracles (whole-task + every per-module case): string leaves of
 * length ≥ 4, number leaves whose decimal text has length ≥ 4, and the JSON text of every compound (array/object) value of
 * length ≥ 4. Booleans/null are keywords, not literals (ambiguity recorded). */
function leakLiterals(task: any): string[] {
  const out = new Set<string>(); const min = PRE.leakMinLiteralLength;
  const walk = (v: any) => {
    if (typeof v === "string") { if (v.length >= min) out.add(v); return; }
    if (typeof v === "number") { const s = String(v); if (s.length >= min) out.add(s); return; }
    if (v && typeof v === "object") { const j = JSON.stringify(v); if (j.length >= min) out.add(j); for (const k of Object.keys(v)) walk(v[k]); }
  };
  const o = task.oracle || task.leakOracle || {};
  for (const e of o.wholeExpect || []) walk(e);
  for (const k of Object.keys(o.calls || {})) for (const c of o.calls[k]) walk(c.expect);
  return [...out].sort();
}
const leakHits = (prompt: string, lits: string[]): string[] => lits.filter((l) => prompt.includes(l));
/* static overlap: hidden-case literals that occur verbatim in the frozen per-file task-contract text (given to every arm). */
const contractOverlap = (task: any, lits: string[] = leakLiterals(task)): string[] => lits.filter((l) => task.spec.architecture.some((a: any) => String(a.contract || "").includes(l)));
/* the literals the A0–A2 prompt check asserts on = hidden-case literals minus the LISTED task-contract exclusions. */
const checkedLiterals = (task: any): string[] => { const ex = PRE.taskContractLiteralExclusions[task.id] || []; return leakLiterals(task).filter((l) => !ex.includes(l)); };
/* run-time verification: computed static overlap per task === the contract's listed exclusions (tasks absent ⇒ []). */
function overlapMatchesList(tasks: any[]): { ok: boolean; mismatches: any[] } {
  const mm: any[] = [];
  for (const t of tasks) { const got = contractOverlap(t).slice().sort(); const want = (PRE.taskContractLiteralExclusions[t.id] || []).slice().sort(); if (JSON.stringify(got) !== JSON.stringify(want)) mm.push({ task: t.id, computed: got, listed: want }); }
  return { ok: mm.length === 0, mismatches: mm };
}

/* ================================================ network guard ================================================ */
/* makeGuard(transport, caps) — the ONLY network path. Exact allowlist http://127.0.0.1:11434; everything else refused +
 * recorded. Counts /api/generate calls, enforces caps, stamps seed/temperature, records each prompt's sha256 + leak hits. */
function makeGuard(transport: any, caps: any = PRE.caps): any {
  const st: any = { modelCalls: 0, otherRequests: 0, refused: [] as any[], prompts: [] as any[], capHit: null as any, ctx: null as any, trialDeadline: Infinity };
  const fetchImpl = async (url: any, init: any = {}): Promise<any> => {
    let u: any = null; try { u = new URL(String(url)); } catch { /* refused below */ }
    if (!u || u.protocol !== PRE.loopback.protocol || u.hostname !== PRE.loopback.host || u.port !== PRE.loopback.port) {
      st.refused.push({ url: String(url).slice(0, 200), ctx: st.ctx ? { task: st.ctx.task, arm: st.ctx.arm, seed: st.ctx.seed } : null, at: new Date().toISOString() });
      throw new Error("J2 network guard: only " + OLLAMA + " is allowed — refused " + String(url).slice(0, 120));
    }
    if (u.pathname !== "/api/generate") { st.otherRequests++; return transport(String(url), init); }
    if (st.capHit) throw new Error("J2 cap already hit: " + st.capHit.cap);
    if (st.modelCalls >= caps.maxModelCallsTotal) { st.capHit = { cap: "maxModelCallsTotal", limit: caps.maxModelCallsTotal, ctx: st.ctx }; throw new Error("J2 cap: maxModelCallsTotal"); }
    if (Date.now() > st.trialDeadline) { st.capHit = { cap: "perTrialWallMs", limit: caps.perTrialWallMs, ctx: st.ctx }; throw new Error("J2 cap: perTrialWallMs"); }
    const body = init && typeof init.body === "string" ? JSON.parse(init.body) : {};
    const seed = st.ctx ? st.ctx.seed : PRE.decoding.primarySeed;
    body.options = { ...(body.options || {}), seed, temperature: PRE.decoding.temperature, num_predict: PRE.decoding.num_predict };
    const prompt = String(body.prompt || "");
    st.modelCalls++;
    const rec = { i: st.modelCalls, task: st.ctx && st.ctx.task, arm: st.ctx && st.ctx.arm, seed, model: body.model, promptSha256: sha256(prompt), promptChars: prompt.length, leakHits: st.ctx && st.ctx.literals ? leakHits(prompt, st.ctx.literals) : [] };
    st.prompts.push(rec);
    return transport(String(url), { ...init, body: JSON.stringify(body) });
  };
  return { st, fetchImpl };
}

/* ================================================ arms ================================================ */
const load1 = (): number[] => os.loadavg().map((x: number) => Math.round(x * 100) / 100);
/* ctx for one (task, arm, seed) trial: generators bound to the guard; every generated file retained (sha256 + source). */
function trialCtx(env: any, task: any, arm: string, seed: number): any {
  const guard = env.guard;
  guard.st.ctx = { task: task.id, arm, seed, literals: env.literals[task.id] };
  guard.st.trialDeadline = Date.now() + env.caps.perTrialWallMs;
  const generations: any[] = [];
  const generatorFor = (model: string) => {
    const g = GEN.makeLocalGenerator({ model, host: OLLAMA, timeoutMs: env.generatorTimeoutMs, numPredict: PRE.decoding.num_predict, temperature: PRE.decoding.temperature }, guard.fetchImpl);
    return async (f: any, bc: any) => {
      const r = await g(f, bc);
      if (r && r.ok === true && typeof r.content === "string") generations.push({ callIndex: guard.st.modelCalls, model, path: f && f.path, sha256: sha256(r.content), chars: r.content.length, source: r.content });
      return r;
    };
  };
  const c0 = guard.st.modelCalls;
  return { generatorFor, generations, calls: () => guard.st.modelCalls, c0, sandboxDeps: env.sandboxDeps, measured: env.measured, now: env.now, t0: Date.now() };
}
const executedSandbox = (bo: any) => !!bo && bo.executionStatus === "EXECUTED" && bo.executionMode === "SANDBOX";

/* A0 — J's own runDefault (runIntelligentCycle + measured overlay), unchanged. */
async function runA0(env: any, task: any, seed: number): Promise<any> {
  const ctx = trialCtx(env, task, "A0", seed);
  const r = await J.runDefault(task, ctx);
  return finishRow(env, task, "A0", seed, ctx, { ...r, sandboxOnly: r.executionStatus === "EXECUTED" ? r.executionMode === "SANDBOX" : null, policyDecision: null });
}

/* decomposed run (A1 / A2 / A3): canonical runDecomposed with its OWN freezing; the injected buildProject only selects
 * the tier for the escalation target and records each sub-problem outcome (no freezing / verification seam added). */
async function decomposedOnce(env: any, task: any, ctx: any, subs: any[], base: any, target: any): Promise<any> {
  let cur = base.model; const subRows: any[] = []; const composed: Record<string, string> = {}; let modeOk = true; let ceilingOk = true;
  const gen = async (f: any, bc: any) => ctx.generatorFor(cur)(f, bc);
  const bp = async (spec: any, d: any) => {
    const tgt = !!target && spec.entry === target.id;
    cur = tgt ? target.model : base.model;
    const maxRepair = tgt ? target.maxRepair : d.maxRepair;
    if (!(maxRepair <= env.caps.maxRepairCeiling)) ceilingOk = false;
    const bo = await BUILDER.buildProject(spec, { ...d, maxRepair, ...ctx.sandboxDeps });
    if (bo.executionStatus === "EXECUTED" && bo.executionMode !== "SANDBOX") modeOk = false;
    subRows.push({ id: spec.entry, model: cur, maxRepair, verified: bo.verified, accepted: bo.accepted, repairs: bo.repairs, stopReason: bo.repairStopReason, executionStatus: bo.executionStatus, executionMode: bo.executionMode,
      structuredRepairExamples: Array.isArray(spec.repairExamples), verifyError: bo.verifyError ? String(bo.verifyError).slice(0, 200) : null,
      files: Object.fromEntries(Object.entries(bo.files || {}).map(([p, s]: any) => [p, sha256(s)])) });
    if (bo.accepted === true) for (const p of Object.keys(bo.files || {})) if (typeof bo.files[p] === "string" && !Object.prototype.hasOwnProperty.call(composed, p)) composed[p] = bo.files[p];
    return bo;
  };
  let dr: any = null, err: string | null = null;
  try { dr = await DECOMP.runDecomposed(subs, { generateFile: gen, maxRepair: base.maxRepair, buildProject: bp }); } catch (e: any) { err = String((e && e.message) || e); }
  let whole: any = null;
  if (dr && dr.allVerified === true) {
    const r = NBS.runIsolated(composed, { kind: "source", source: task.wholeTestSource }, { runner: ctx.sandboxDeps.sandboxRunner });
    whole = { status: r.status, verified: r.status === "EXECUTED" ? r.verified === true : null, error: r.verifyError || r.buildError || r.reason || null, files: Object.fromEntries(Object.entries(composed).map(([p, s]: any) => [p, sha256(s)])) };
  }
  const notRun = !dr || subRows.some((s) => s.executionStatus === "NOT_RUN") || (whole && whole.status !== "EXECUTED");
  return { accepted: !!(whole && whole.verified === true), executionStatus: notRun ? "NOT_RUN" : "EXECUTED", sandboxOnly: modeOk, maxRepairWithinCeiling: ceilingOk,
    subproblems: subRows, verifiedCount: dr ? dr.verifiedCount : null, total: dr ? dr.total : null, firstFailure: dr ? dr.firstFailure : null, allVerified: dr ? dr.allVerified === true : null,
    wholeTaskTest: whole || { status: "NOT_EVALUATED", reason: dr && dr.firstFailure ? `sub-problem ${dr.firstFailure} failed — chain stopped (localised failure)` : "decomposed run did not complete" },
    error: err || (dr && dr.ok === false ? dr.code : null) };
}
function baseOf(a0: any): any { return { model: a0.model, maxRepair: a0.maxRepair }; }
async function runA1(env: any, task: any, seed: number, a0: any): Promise<any> {
  const ctx = trialCtx(env, task, "A1", seed);
  const r = await decomposedOnce(env, task, ctx, task.oracle.subproblems, baseOf(a0), null);
  return finishRow(env, task, "A1", seed, ctx, { strategy: "DECOMPOSED_NO_EXPECTED_OUTPUTS_IN_PROMPTS", executor: "odg-decomposed-execution.runDecomposed → native-project-builder.buildProject (sandboxed)", model: a0.model, maxRepair: a0.maxRepair, ...r });
}
/* A2 (and A3 with examples): no failing sub-problem in the base ⇒ outcome = the base's (no re-execution); otherwise ONE
 * canonical runDecomposed over all sub-problems where ONLY the base's first failing sub-problem runs at the max-local tier. */
async function runEscalated(env: any, task: any, seed: number, a0: any, baseRow: any, arm: string, withExamples: boolean): Promise<any> {
  const subs = withExamples ? task.oracle.subproblemsWithExamples : task.oracle.subproblems;
  if (!baseRow.firstFailure) {
    const ctx = trialCtx(env, task, arm, seed);
    return finishRow(env, task, arm, seed, ctx, { strategy: arm === "A2" ? "A1_THEN_ESCALATE_FIRST_FAILURE" : "A2_WITH_STRUCTURED_EXAMPLES", reExecuted: false, inheritedFrom: baseRow.arm,
      note: `base ${baseRow.arm} has no failing sub-problem (allVerified=${baseRow.allVerified}) ⇒ nothing to escalate; outcome = base outcome`,
      accepted: baseRow.accepted, executionStatus: baseRow.executionStatus, sandboxOnly: baseRow.sandboxOnly, maxRepairWithinCeiling: baseRow.maxRepairWithinCeiling, subproblems: [], firstFailure: null, wholeTaskTest: baseRow.wholeTaskTest, inheritedLeak: baseRow.leakViolation === true });
  }
  const ctx = trialCtx(env, task, arm, seed);
  const target = { id: baseRow.firstFailure, model: PRE.maxLocal.model, maxRepair: PRE.maxLocal.maxRepair };
  const r = await decomposedOnce(env, task, ctx, subs, baseOf(a0), target);
  return finishRow(env, task, arm, seed, ctx, { strategy: arm === "A2" ? "A1_THEN_ESCALATE_FIRST_FAILURE" : "A2_WITH_STRUCTURED_EXAMPLES", reExecuted: true, escalationTarget: target, model: a0.model, maxRepair: a0.maxRepair, ...r });
}
/* A3 (report-only): base = decomposed WITH examples at A0's tier, then the A2 escalation over the same examples. */
async function runA3(env: any, task: any, seed: number, a0: any): Promise<any> {
  const ctxB = trialCtx(env, task, "A3", seed);
  const b = await decomposedOnce(env, task, ctxB, task.oracle.subproblemsWithExamples, baseOf(a0), null);
  const baseRow = finishRow(env, task, "A3", seed, ctxB, { strategy: "A3_BASE_DECOMPOSED_WITH_EXAMPLES", model: a0.model, maxRepair: a0.maxRepair, ...b });
  if (baseRow.status !== "MEASURED") return { base: baseRow, escalated: null };
  return { base: baseRow, escalated: await runEscalated(env, task, seed, a0, { ...baseRow, arm: "A3_base" }, "A3", true) };
}
/* A4 (report-only): parse-range single declared file, 7b / maxRepair 3. */
async function runA4(env: any, task: any, seed: number): Promise<any> {
  const ctx = trialCtx(env, task, "A4", seed);
  let bo: any = null, err: string | null = null;
  const spec = { ...task.spec, architecture: [task.spec.architecture[0]], writeSet: [task.spec.architecture[0].path] };
  try { bo = await BUILDER.buildProject(spec, { generateFile: ctx.generatorFor(PRE.maxLocal.model), maxRepair: PRE.maxLocal.maxRepair, ...ctx.sandboxDeps }); } catch (e: any) { err = String((e && e.message) || e); }
  return finishRow(env, task, "A4", seed, ctx, { strategy: "SINGLE_FILE_MAX_LOCAL", model: PRE.maxLocal.model, maxRepair: PRE.maxLocal.maxRepair, architectureUsed: spec.architecture.map((a: any) => a.path),
    accepted: !!(bo && bo.accepted === true), executionStatus: bo ? bo.executionStatus : "NOT_RUN", sandboxOnly: bo ? (bo.executionStatus === "EXECUTED" ? bo.executionMode === "SANDBOX" : null) : null, maxRepairWithinCeiling: true,
    repairs: bo ? bo.repairs : null, stopReason: bo ? bo.repairStopReason : null, verifyError: bo && bo.verifyError ? String(bo.verifyError).slice(0, 240) : null, files: bo ? Object.fromEntries(Object.entries(bo.files || {}).map(([p, s]: any) => [p, sha256(s)])) : {}, error: err });
}

/* finishRow — attaches prompts / generations / caps / leak assertion; status MEASURED | NOT_MEASURED (with reasons). */
function finishRow(env: any, task: any, arm: string, seed: number, ctx: any, r: any): any {
  const st = env.guard.st;
  const prompts = st.prompts.filter((p: any) => p.i > ctx.c0 && p.task === task.id && p.arm === arm && p.seed === seed);
  const wallMs = Date.now() - ctx.t0;
  const leak = DECISIVE_ARMS.includes(arm) && (prompts.some((p: any) => p.leakHits.length > 0) || r.inheritedLeak === true);
  const nm: string[] = [];
  if (r.executionStatus !== "EXECUTED") nm.push("NOT_RUN (no sandbox verdict)");
  if (r.executionStatus === "EXECUTED" && r.sandboxOnly === false) nm.push("model code executed outside SANDBOX mode");
  if (r.maxRepairWithinCeiling === false || (arm === "A0" && !(Number(r.maxRepair) <= env.caps.maxRepairCeiling))) nm.push("maxRepair above maxRepairCeiling");
  if (leak) nm.push("prompt-leak assertion: an oracle expected-output literal (length ≥ 4) appears in an " + arm + " prompt");
  if (st.capHit && st.capHit.ctx && st.capHit.ctx.task === task.id && st.capHit.ctx.arm === arm && st.capHit.ctx.seed === seed) nm.push("hard cap hit: " + st.capHit.cap);
  if (wallMs > env.caps.perTrialWallMs) { nm.push("hard cap hit: perTrialWallMs (wall " + wallMs + " ms)"); if (!st.capHit) st.capHit = { cap: "perTrialWallMs", limit: env.caps.perTrialWallMs, ctx: { task: task.id, arm, seed } }; }
  const delegationState = r.cycleEscalationWithoutAlternative ? r.cycleEscalationWithoutAlternative.delegationState : null;
  st.ctx = null; st.trialDeadline = Infinity;
  return { task: task.id, split: task.split, arm, seed, status: nm.length ? "NOT_MEASURED" : "MEASURED", notMeasuredBecause: nm,
    ...r, delegationState, leakViolation: leak, modelCalls: prompts.length, wallMs, loadavgEnd: load1(),
    prompts: prompts.map((p: any) => ({ i: p.i, model: p.model, promptSha256: p.promptSha256, promptChars: p.promptChars, leakHits: p.leakHits })),
    generations: ctx.generations };
}
const notRunRow = (task: any, arm: string, seed: number, why: string) => ({ task: task.id, split: task.split, arm, seed, status: "NOT_MEASURED", notMeasuredBecause: [why], executionStatus: "NOT_RUN", accepted: false, prompts: [], generations: [], modelCalls: 0 });

/* ================================================ schedule ================================================ */
const isStop = (row: any) => !!row && row.status === "MEASURED" && PRE.odgStops.includes(row.stopReason);
/* the run order puts every row the grade needs (held-out A0@42, A1@42, A2@42, A0@7) FIRST; report-only rows last. */
async function schedule(env: any, tasks: any[]): Promise<any[]> {
  const rows: any[] = [];
  const stopped = () => !!env.guard.st.capHit;
  const go = async (task: any, arm: string, seed: number, fn: () => Promise<any>) => { if (stopped()) { const r = notRunRow(task, arm, seed, "not run: a hard cap was hit earlier (" + env.guard.st.capHit.cap + ")"); rows.push(r); return r; } const r = await fn(); rows.push(r); env.progress(r); return r; };
  const decisive = async (task: any) => {
    const a0 = await go(task, "A0", 42, () => runA0(env, task, 42));
    const trig = isStop(a0);
    if (trig && task.oracle) {
      const a1 = await go(task, "A1", 42, () => runA1(env, task, 42, a0));
      if (a1.status === "MEASURED" || a1.executionStatus === "EXECUTED") await go(task, "A2", 42, () => runEscalated(env, task, 42, a0, { ...a1, arm: "A1" }, "A2", false));
      else rows.push(notRunRow(task, "A2", 42, "A1 not executed ⇒ A2 (A1 then escalation) cannot run"));
    } else {
      const why = !trig ? `trigger not met: A0@42 ${a0.status} stop=${a0.stopReason} (fail-closed, no alternative)` : "no intermediate oracle (single-file task) ⇒ decomposed arms not applicable";
      rows.push({ ...notRunRow(task, "A1", 42, why), notApplicable: true }); rows.push({ ...notRunRow(task, "A2", 42, why), notApplicable: true });
    }
    return a0;
  };
  const held = tasks.filter((t) => t.split === "heldOut"), repl = tasks.filter((t) => t.split === "replication");
  const a0h: Record<string, any> = {};
  for (const t of held) { a0h[t.id] = await decisive(t); if (isStop(a0h[t.id])) await go(t, "A0", PRE.controlSeed, () => runA0(env, t, PRE.controlSeed)); }
  for (const t of repl) await decisive(t);
  // report-only
  for (const t of [...held, ...repl]) {
    const a0 = rows.find((r) => r.task === t.id && r.arm === "A0" && r.seed === 42);
    if (!isStop(a0)) continue;
    if (t.oracle) { if (stopped()) { rows.push(notRunRow(t, "A3", 42, "not run: cap hit earlier")); continue; } const a3 = await runA3(env, t, 42, a0); rows.push(a3.base); env.progress(a3.base); if (a3.escalated) { rows.push(a3.escalated); env.progress(a3.escalated); } }
    else if (t.id === "v159-implement-parse-range") await go(t, "A4", 42, () => runA4(env, t, 42));
  }
  return rows;
}

/* ================================================ grading (pure over rows) ================================================ */
function jReference(jEvidence: any): any {
  const out: any = {};
  for (const id of PRE.replication) {
    const ys = (jEvidence && Array.isArray(jEvidence.rows) ? jEvidence.rows : []).filter((r: any) => r.task === id);
    const stops = [...new Set(ys.map((r: any) => r.default.stopReason))], acc = [...new Set(ys.map((r: any) => r.default.accepted))];
    const subs = ys.map((r: any) => (r.alternative && Array.isArray(r.alternative.subproblems) ? r.alternative.subproblems.map((s: any) => [s.id, s.verified === true]) : null));
    out[id] = { trials: ys.length, defaultStop: stops.length === 1 ? stops[0] : stops, defaultAccepted: acc.length === 1 ? acc[0] : acc, decomposedVerdicts: subs[0] || null, decomposedVerdictsAgreeAcrossTrials: subs.every((s: any) => JSON.stringify(s) === JSON.stringify(subs[0])) };
  }
  return out;
}
const rowOf = (rows: any[], task: string, arm: string, seed: number) => rows.find((r) => r.task === task && r.arm === arm && r.seed === seed) || null;
function signTestOneSided(b: number, c: number): any {
  const n = b + c; if (n === 0) return { b, c, n, pOneSided: null, note: "no discordant pairs" };
  let comb = 1, p = 0; const tot = Math.pow(2, n);
  for (let k = 0; k <= n; k++) { if (k > 0) comb = comb * (n - k + 1) / k; if (k >= b) p += comb / tot; }
  return { b, c, n, pOneSided: p, note: "P(X ≥ b), X ~ Binomial(b+c, 1/2); b = A2@42 pass & A0@7 fail, c = A2@42 fail & A0@7 pass — REPORT ONLY" };
}
/* summarize(rows, run) — E, counts, C1–C6, hypotheses, grade. run: { preconditions, refused, capHit, jRef, retention, ... } */
function summarize(rows: any[], run: any): any {
  const nm: string[] = [];
  if (run.preconditions && run.preconditions.ok !== true) nm.push(...run.preconditions.reasons);
  const heldIds = PRE.heldOut.filter((id) => rows.some((r) => r.task === id));
  const E = heldIds.filter((id) => { const a0 = rowOf(rows, id, "A0", 42), a2 = rowOf(rows, id, "A2", 42); return isStop(a0) && !!a2 && a2.status === "MEASURED" && a2.executionStatus === "EXECUTED"; });
  const passIn = (arm: string, seed: number) => E.filter((id) => { const r = rowOf(rows, id, arm, seed); return !!r && r.status === "MEASURED" && r.accepted === true; });
  const a2Pass = passIn("A2", 42), a1Pass = passIn("A1", 42), a0s7Pass = passIn("A0", PRE.controlSeed);
  const a0s7Measured = E.every((id) => { const r = rowOf(rows, id, "A0", PRE.controlSeed); return !!r && r.status === "MEASURED"; });
  // cap hit before every required held-out row is measured
  const required = PRE.heldOut.flatMap((id) => [["A0", 42], ...(isStop(rowOf(rows, id, "A0", 42)) ? [["A2", 42], ["A0", PRE.controlSeed]] : [])].map(([a, s]: any) => ({ id, a, s })));
  const capBlocked = !!run.capHit && required.some(({ id, a, s }) => { const r = rowOf(rows, id, a, s); return !r || (r.status !== "MEASURED" && (r.notMeasuredBecause || []).some((x: string) => /cap/.test(x))); });
  // C4
  const c4 = PRE.replication.map((id) => { const r = rowOf(rows, id, "A0", 42); const ref = run.jRef ? run.jRef[id] : null;
    const ok = !!r && !!ref && r.status === "MEASURED" && typeof ref.defaultStop === "string" && r.stopReason === ref.defaultStop && r.accepted === ref.defaultAccepted;
    return { task: id, j2: r ? { status: r.status, stopReason: r.stopReason, accepted: r.accepted } : null, j: ref ? { stopReason: ref.defaultStop, accepted: ref.defaultAccepted } : null, reproduced: ok }; });
  const c4All = c4.length === 4 && c4.every((x) => x.reproduced);
  // C5
  const delegationPastCreated = rows.filter((r) => r.delegationState !== null && r.delegationState !== undefined && r.delegationState !== "CREATED").map((r) => `${r.task}/${r.arm}@${r.seed}: ${r.delegationState}`);
  const c5 = { providerCalls: run.providerCalls || 0, nonLoopbackRefused: run.refused || [], delegationPastCreated, jControlReferenceUnchanged: run.jControlUnchangedAfter !== false,
    ok: (run.providerCalls || 0) === 0 && (run.refused || []).length === 0 && delegationPastCreated.length === 0 && run.jControlUnchangedAfter !== false };
  // C6
  const c6 = retention(rows);
  if (E.length < PRE.minimumE && !(run.preconditions && run.preconditions.ok !== true)) nm.push(`|E| = ${E.length} < ${PRE.minimumE}`);
  if (capBlocked) nm.push(`a hard cap (${run.capHit.cap}) was hit before every A0@42, A2@42 and A0@7 held-out row was measured`);
  if (!c5.ok) nm.push("C5 violation — run invalid, recorded as an incident: " + JSON.stringify({ providerCalls: c5.providerCalls, refused: c5.nonLoopbackRefused.length, delegationPastCreated, jControlReferenceUnchanged: c5.jControlReferenceUnchanged }));
  if (!c6.ok) nm.push("C6: generated file(s) not retained: " + c6.missing.slice(0, 5).join(", "));
  const controlSatisfied = a0s7Measured && a2Pass.length > a0s7Pass.length;
  let outcome: string; const because: string[] = [];
  if (nm.length) { outcome = "NOT_MEASURED"; because.push(...nm); }
  else if (a2Pass.length >= PRE.passMinE && controlSatisfied && c4All) outcome = "PASS";
  else if (a2Pass.length === 1 || (a2Pass.length >= PRE.passMinE && !(controlSatisfied && c4All))) { outcome = "PARTIAL"; if (a2Pass.length === 1) because.push("A2@42 passes on exactly 1 task of E"); if (a2Pass.length >= 2 && !controlSatisfied) because.push(a0s7Measured ? `rerun-alone control not satisfied: A2@42 ${a2Pass.length} ≤ A0@7 ${a0s7Pass.length}` : "rerun-alone control not measured on every task of E"); if (a2Pass.length >= 2 && !c4All) because.push("C4 not reproduced on all 4 replication tasks (environment drift)"); }
  else { outcome = "FAIL"; because.push("A2@42 passes on 0 tasks of E"); }
  // discordant pairs (report only)
  let b = 0, c = 0; for (const id of E) { const p2 = a2Pass.includes(id), p0 = a0s7Pass.includes(id); if (p2 && !p0) b++; if (!p2 && p0) c++; }
  // C1/C2/C3
  const c1 = rows.filter((r) => ["A1", "A2", "A3", "A4"].includes(r.arm) && r.executionStatus === "EXECUTED").every((r) => isStop(rowOf(rows, r.task, "A0", r.seed)));
  // H2 / H3 (report only)
  const h2Obs = rows.filter((r) => r.arm === "A1" && r.split === "replication" && Array.isArray(r.reportJsExportsFunction)).flatMap((r) => r.reportJsExportsFunction.map((x: any) => ({ task: r.task, ...x })));
  const h2 = h2Obs.length === 0 ? { verdict: "NOT_MEASURED", reason: "no failing report.js retained in an A1 replication row" } : { verdict: h2Obs.some((x: any) => x.exportsFunction === false) ? "SUPPORTED" : "REFUTED", observations: h2Obs };
  const h3Rows = PRE.replication.filter((id) => run.jRef && run.jRef[id] && run.jRef[id].decomposedVerdicts).map((id) => { const r = rowOf(rows, id, "A1", 42); const j2 = r && r.status === "MEASURED" ? r.subproblems.map((s: any) => [s.id, s.verified === true]) : null; return { task: id, j: run.jRef[id].decomposedVerdicts, j2, same: j2 !== null && JSON.stringify(j2) === JSON.stringify(run.jRef[id].decomposedVerdicts) }; });
  const h3 = h3Rows.some((x) => x.j2 === null) ? { verdict: "NOT_MEASURED", rows: h3Rows } : { verdict: h3Rows.every((x) => x.same) ? "SUPPORTED" : "REFUTED", rows: h3Rows };
  const perArm: any = {};
  for (const r of rows) { const k = `${r.arm}@${r.seed}`; const p = (perArm[k] = perArm[k] || { rows: 0, measured: 0, passes: 0, passesInE: 0, modelCalls: 0 }); p.rows++; p.modelCalls += r.modelCalls || 0; if (r.status === "MEASURED") { p.measured++; if (r.accepted === true) { p.passes++; if (E.includes(r.task)) p.passesInE++; } } }
  return {
    E, nE: E.length,
    primary: { arm: "A2@42", passes: a2Pass.length, n: E.length, passedTasks: a2Pass },
    rerunAloneControl: { arm: "A0@7", passes: a0s7Pass.length, n: E.length, passedTasks: a0s7Pass, measuredOnAllOfE: a0s7Measured, satisfied: controlSatisfied },
    attribution: { arm: "A1@42", passes: a1Pass.length, n: E.length, passedTasks: a1Pass, note: "attributes the gain to escalation (A2) vs decomposition alone (A1)" },
    perArmSeed: perArm,
    signTest: signTestOneSided(b, c),
    criteria: { C1_stopTriggerHonoured: c1, C2_notRunExcluded: true, C3_sameOracle: "whole-task ORIGINAL corpus test (task.wholeTestSource) for every arm, evaluated in the sandbox", C4: { reproducedAll: c4All, rows: c4 }, C5: c5, C6: { ok: c6.ok, generations: c6.generations, missing: c6.missing } },
    hypotheses: { H1: E.length < PRE.minimumE ? { verdict: "NOT_MEASURED", reason: `|E| = ${E.length} < ${PRE.minimumE}` } : { verdict: a2Pass.length >= 2 ? "SUPPORTED" : "REFUTED", a2Passes: a2Pass.length, nE: E.length }, H2_reportOnly: h2, H3_reportOnly: h3 },
    grade: { outcome, because, rule: "first matching of NOT_MEASURED, PASS, PARTIAL, FAIL per WORK_ITEM_CONTRACT.preRegistration.thresholds (mechanical; no re-tuning)" },
    adoptionDecision: outcome === "PASS" ? "ADOPTION_CANDIDATE (wiring A2 into the default cycle is OUT of J2's scope)" : "NOT_ADOPTED",
  };
}
/* C6: every generation's sha256 = sha256(source); every file sha recorded in an outcome is a retained generation. */
function retention(rows: any[]): any {
  const have = new Set<string>(); const missing: string[] = []; let n = 0;
  for (const r of rows) for (const g of r.generations || []) { n++; if (typeof g.source !== "string" || sha256(g.source) !== g.sha256) missing.push(`${r.task}/${r.arm}@${r.seed} generation ${g.path} sha mismatch`); else have.add(g.sha256); }
  const chk = (where: string, files: any) => { for (const [p, s] of Object.entries(files || {})) if (!have.has(String(s))) missing.push(`${where} ${p}`); };
  for (const r of rows) { const w = `${r.task}/${r.arm}@${r.seed}`; chk(w, r.files); for (const s of r.subproblems || []) chk(w + "/" + s.id, s.files); if (r.wholeTaskTest) chk(w + "/whole", r.wholeTaskTest.files); }
  return { ok: missing.length === 0, generations: n, missing };
}

/* H2 measurement (report-only, sandbox): does an A1 replication row's FAILING report.js export a function? */
function measureReportExports(row: any, sandboxDeps: any): any[] {
  const out: any[] = [];
  const sub = (row.subproblems || []).find((s: any) => s.id === "report.js" && s.verified !== true && s.executionStatus === "EXECUTED");
  if (!sub) return out;
  const bySha: Record<string, string> = {}; for (const g of row.generations || []) bySha[g.sha256] = g.source;
  const files: Record<string, string> = {}; for (const [p, s] of Object.entries(sub.files || {})) if (bySha[String(s)]) files[p] = bySha[String(s)];
  if (!files["report.js"]) return out;
  const r = NBS.runIsolated(files, { kind: "source", source: NBS.testSourceFromFn((f: any) => typeof f === "function", "report.js") }, { runner: sandboxDeps.sandboxRunner });
  out.push({ reportJsSha256: sub.files["report.js"], status: r.status, exportsFunction: r.status === "EXECUTED" && r.buildOk === true ? r.verified === true : null, note: r.status === "EXECUTED" && r.buildOk !== true ? "report.js does not build (no export observed)" : null });
  return out;
}

/* ================================================ experiment ================================================ */
/* experiment(opts) — everything after the gate. opts: { root, transport, caps?, taskIds?, sandboxDeps?, generatorTimeoutMs?,
 * skipPins?, progress? } — the CLI passes the live loopback transport; --selftest passes a fake Ollama. */
async function experiment(opts: any): Promise<any> {
  const root = opts.root || ROOT;
  const caps = { ...PRE.caps, ...(opts.caps || {}) };
  const guard = makeGuard(opts.transport, caps);
  const realGlobalFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = guard.fetchImpl;   // any other code path reaching for fetch hits the same guard
  try {
    const reasons: string[] = [];
    const pins: any = {};
    for (const [k, p] of Object.entries(PRE.pins) as any) { const s = fileSha(root, p.file); pins[k] = { file: p.file, sha256: s, pinned: p.sha256, matches: s === p.sha256 }; if (s !== p.sha256 && !opts.skipPins) reasons.push(`pinned sha256 differs: ${p.file}`); }
    const sandboxDeps = opts.sandboxDeps || {};
    const probe = NBS.probeSandbox(sandboxDeps.sandboxRunner);
    if (!probe.ok) reasons.push("sandbox probe fails (NOT_RUN): " + probe.reason);
    let installed: string[] = [], version: any = "NOT_MEASURED";
    if (!reasons.length) {
      const tags = await guard.fetchImpl(OLLAMA + "/api/tags", { method: "GET" }).then((r: any) => r.json()).catch(() => null);
      installed = tags && Array.isArray(tags.models) ? tags.models.map((m: any) => m.name) : [];
      const v = await guard.fetchImpl(OLLAMA + "/api/version", { method: "GET" }).then((r: any) => r.json()).catch(() => null);
      version = v && v.version ? v.version : "NOT_MEASURED";
      if (!installed.includes(POL.MODEL.SMALL) || !installed.includes(PRE.maxLocal.model)) reasons.push("Ollama unreachable on loopback or required local models absent (NOT_RUN; no fallback)");
    }
    const tasks = reasons.length ? [] : buildTasks(opts.taskIds);
    // grader self-test on TRUSTED reference code (sandbox): reference passes, broken fails, every sub-problem reference passes
    const graderSelfTest = tasks.map((t) => {
      const ref = NBS.runIsolated(t.reference, { kind: "source", source: t.wholeTestSource }, { runner: sandboxDeps.sandboxRunner });
      const broken = NBS.runIsolated(t.broken || { ...t.reference, [t.entry]: "module.exports = () => null;" }, { kind: "source", source: t.wholeTestSource }, { runner: sandboxDeps.sandboxRunner });
      const subs = t.oracle ? t.oracle.subproblems.map((s: any) => { const files: any = {}; for (const a of s.spec.architecture) files[a.path] = t.reference[a.path]; const r = NBS.runIsolated(files, NBS.serializableTest(s.spec), { runner: sandboxDeps.sandboxRunner }); return { id: s.id, cases: s.spec.independentTestCases.length, referencePasses: r.verified === true }; }) : null;
      return { id: t.id, referencePasses: ref.verified === true, brokenFails: broken.status === "EXECUTED" && broken.verified !== true, subproblems: subs };
    });
    if (graderSelfTest.some((g: any) => !(g.referencePasses && g.brokenFails && (!g.subproblems || g.subproblems.every((s: any) => s.referencePasses))))) reasons.push("grader self-test failed (oracle unusable)");
    const literals: Record<string, string[]> = Object.fromEntries(tasks.map((t) => [t.id, checkedLiterals(t)]));
    const staticContractOverlap = tasks.map((t) => ({ task: t.id, literalsInTaskContractText: contractOverlap(t), listedExclusions: PRE.taskContractLiteralExclusions[t.id] || [] })).filter((x) => x.literalsInTaskContractText.length || x.listedExclusions.length);
    const overlapCheck = overlapMatchesList(tasks);
    if (!overlapCheck.ok) reasons.push("static task-contract overlap ≠ the contract's listed exclusions (never silently widened): " + JSON.stringify(overlapCheck.mismatches));
    const jEvidenceBefore = fileSha(root, PRE.pins.controlReference.file);
    const jRef = jReference((() => { try { return JSON.parse(fs.readFileSync(path.join(root, PRE.pins.controlReference.file), "utf8")); } catch { return null; } })());
    const env = { guard, caps, literals, sandboxDeps, generatorTimeoutMs: opts.generatorTimeoutMs || 300000, measured: opts.measured !== undefined ? opts.measured : POL.loadMeasuredRegistry(), now: opts.now || Date.now(), progress: opts.progress || (() => {}) };
    const rows: any[] = reasons.length ? [] : await schedule(env, tasks);
    for (const r of rows) if (r.arm === "A1" && r.split === "replication" && r.status === "MEASURED") r.reportJsExportsFunction = measureReportExports(r, sandboxDeps);
    const jEvidenceAfter = fileSha(root, PRE.pins.controlReference.file);
    const run = { preconditions: { ok: reasons.length === 0, reasons }, refused: guard.st.refused, capHit: guard.st.capHit, providerCalls: 0, jRef, jControlUnchangedAfter: jEvidenceBefore === jEvidenceAfter };
    const summary = summarize(rows, run);
    return {
      outcome: summary.grade.outcome, summary, rows,
      run: { pins, sandboxProbe: probe, ollama: { endpoint: OLLAMA + " (loopback only, exact host:port allowlist)", version, installed }, graderSelfTest,
        preconditions: run.preconditions, network: { modelCalls: guard.st.modelCalls, otherLoopbackRequests: guard.st.otherRequests, refused: guard.st.refused, globalFetchGuarded: true },
        capHit: guard.st.capHit, caps, providerCalls: 0, jControlReference: { before: jEvidenceBefore, after: jEvidenceAfter, unchanged: jEvidenceBefore === jEvidenceAfter, reference: jRef },
        leakLiterals: literals, staticContractOverlap, staticOverlapMatchesList: overlapCheck },
    };
  } finally { (globalThis as any).fetch = realGlobalFetch; }
}

function gitHead(root: string): string | null { try { return cp.execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } }

function record(g: any, res: any, head: string | null, startedAt: string): any {
  return {
    schema: "odg-scenario-experiment/1", scenario: "J2", step: STEP, contract: CONTRACTS + "#J2", contractSha256: g.contractSha256,
    authorization: { ...g.scope, inspection: g.inspection, note: "authorized by odg-authorization-scope under the owner's V171 authorization (docs/odg/V171_OWNER_AUTHORIZATION_PORTFOLIO.json); the provider did not self-authorize" },
    outcome: res.outcome, grade: { ...res.summary.grade, gradedBy: "pre-registered rule only — NOT the independent VALIDATE_CRITERIA step (pending)" }, adoptionDecision: res.summary.adoptionDecision,
    preRegistration: PRE, arms: ARMS, decisiveArms: DECISIVE_ARMS,
    summary: res.summary, rows: res.rows, measurement: res.run,
    labels: { A1_A2: "no expected outputs in prompts — NOT equal-information (per-module task-author oracles)", A3: "report-only, NOT equal-information (structured repairExamples), never pooled", A4: "report-only, never decisive", execution: "REAL local run (loopback Ollama) — not a simulation; VERIFIED in-repo ≠ DEPLOYED" },
    ambiguities: [
      "seeds: seed 42 runs A0, A1, A2 (+ report-only A3/A4); seed 7 runs ONLY the A0 rerun-alone control, on held-out tasks whose A0@42 ended with an ODG stop (the baseline is 'A0@7 on E')",
      "A2 when A1 has NO failing sub-problem (all verified; whole-task verdict either way): nothing to escalate ⇒ A2's outcome IS A1's (reExecuted:false, A1's prompts/leak inherited)",
      "A2 when A1 failed: ONE canonical runDecomposed over all sub-problems where ONLY A1's first failing sub-problem runs at qwen2.5-coder:7b/maxRepair 3; earlier sub-problems are regenerated at A0's tier (temperature 0, same seed) and frozen by runDecomposed itself — the runner adds no freezing seam, so A1's sources are not injected",
      "A3 = its own decomposed base WITH structured repairExamples at A0's tier, then the same escalation of ITS first failing sub-problem",
      "parse-range has no intermediate oracle ⇒ A1/A2/A3 not applicable there (recorded notApplicable); A4 covers it",
      "prompt-leak literals = string leaves (length ≥ 4), number leaves whose decimal text has length ≥ 4, and the JSON text of compound expected values (length ≥ 4), over the whole-task and every per-module expected OUTPUT; booleans/null are keywords, not literals. The match is a literal substring over the full prompt; V17.3 (owner V173): the literals already present in the frozen task-contract text (the contract's listed static overlap) are excluded, and the computed overlap must equal that list at run time (else NOT_MEASURED) — measurement.staticContractOverlap records both",
      "E membership needs A0@42 MEASURED with an ODG stop and A2@42 MEASURED+EXECUTED (a leak/cap/NOT_RUN NOT_MEASURED row is not 'EXECUTED' for E)",
      "rerun-alone control: if any A0@7 row for a task of E is NOT_MEASURED the control is 'not satisfied' (conservative; PASS impossible)",
      "C4 compares A0@42's stop name and accepted flag with J's default (both J trials agree on each)",
      "perTrialWallMs is enforced at model-call granularity (a call already in flight finishes, bounded by the generator's own 300 s timeout); a trial whose wall time exceeds the cap is NOT_MEASURED and stops the run",
      "C5 'provider calls' = 0 by construction: no provider adapter is invoked and every network request (including globalThis.fetch) passes the loopback guard; the bwrap sandbox runs without network",
    ],
    honestLimits: [
      "failure-conditional selection: held-out tasks were chosen BECAUSE they failed at 3b/maxRepair 1 in V159 — regression to the mean; A0@7 mitigates, does not remove, this",
      "A1/A2 are NOT equal-information vs A0 (per-module task-author oracles)",
      "n small; temperature 0 ⇒ near-deterministic repeats; no statistical claim (sign test reported only)",
      "task oracles authored by the provider (task-author oracle)",
      "shared host ⇒ wall time confounded; comparisons on pass counts only",
      "provider (Claude Code) wrote this runner; the stops, builds and verdicts are executed by ODG components; the run is ODG GO's dispatch",
      "VERIFIED in-repo ≠ DEPLOYED",
    ],
    run: { head, startedAt, finishedAt: new Date().toISOString(), command: `npx tsx ${SELF} ${OUT}`, dispatchedBy: "ODG GO — contract-declared target", note: "head = HEAD of the tree the run executed in" },
  };
}

/* ================================================ --check ================================================ */
/* checkRecord(rec, contract?) — recompute every derived quantity from the committed rows (no model, no sandbox). */
function checkRecord(rec: any, liveContract: any = undefined): string[] {
  const p: string[] = [];
  if (!rec || rec.scenario !== "J2") return ["not a J2 record"];
  if (rec.contractSha256 !== PINNED_CONTRACT_SHA) p.push("record contractSha256 ≠ pinned");
  if (liveContract !== undefined && (!liveContract || AS.contractSha256(liveContract) !== PINNED_CONTRACT_SHA)) p.push("live contract sha256 ≠ pinned");
  if (JSON.stringify(rec.preRegistration) !== JSON.stringify(PRE)) p.push("preRegistration constants drifted");
  const m = rec.measurement || {};
  for (const r of rec.rows || []) {
    for (const q of r.prompts || []) { if (!Array.isArray(q.leakHits)) p.push(`${r.task}/${r.arm}@${r.seed}: prompt ${q.i} lacks leakHits`); if (!/^[0-9a-f]{64}$/.test(String(q.promptSha256))) p.push(`${r.task}/${r.arm}@${r.seed}: prompt ${q.i} sha missing`); }
    const leak = DECISIVE_ARMS.includes(r.arm) && ((r.prompts || []).some((q: any) => q.leakHits.length > 0) || r.inheritedLeak === true);
    if (!!r.leakViolation !== leak) p.push(`${r.task}/${r.arm}@${r.seed}: leakViolation does not re-derive`);
    if (leak && r.status !== "NOT_MEASURED") p.push(`${r.task}/${r.arm}@${r.seed}: leak row not NOT_MEASURED`);
    if (r.status === "MEASURED" && r.executionStatus !== "EXECUTED") p.push(`${r.task}/${r.arm}@${r.seed}: MEASURED without EXECUTED`);
    if ((r.modelCalls || 0) !== (r.prompts || []).length) p.push(`${r.task}/${r.arm}@${r.seed}: modelCalls ≠ #prompts`);
    // the leak hits re-derive from the recorded literals? (prompt text is not retained — only sha; hits are recorded at call time)
    if (["A1", "A2", "A3", "A4"].includes(r.arm) && r.executionStatus === "EXECUTED" && !isStop((rec.rows || []).find((x: any) => x.task === r.task && x.arm === "A0" && x.seed === r.seed))) p.push(`${r.task}/${r.arm}@${r.seed}: alternative executed without an A0 ODG stop (C1)`);
  }
  const prompts = (rec.rows || []).reduce((a: number, r: any) => a + (r.prompts || []).length, 0);
  if (m.network && prompts > m.network.modelCalls) p.push("row prompts exceed guarded model calls");
  const run = { preconditions: m.preconditions, refused: m.network ? m.network.refused : [], capHit: m.capHit, providerCalls: m.providerCalls, jRef: m.jControlReference ? m.jControlReference.reference : null, jControlUnchangedAfter: m.jControlReference ? m.jControlReference.unchanged : true };
  const s = summarize(rec.rows || [], run);
  if (JSON.stringify(s) !== JSON.stringify(rec.summary)) p.push("summary (E, counts, criteria, hypotheses, grade) does not re-derive from rows");
  if (rec.outcome !== s.grade.outcome) p.push("outcome ≠ re-derived grade");
  if (m.leakLiterals) { const tasks = buildTasks(Object.keys(m.leakLiterals)); for (const t of tasks) if (JSON.stringify(checkedLiterals(t)) !== JSON.stringify(m.leakLiterals[t.id])) p.push(`leak literals of ${t.id} do not re-derive`); }
  return p;
}

/* ================================================ selftest (fake Ollama; nothing written) ================================================ */
/* fakeOllama(plan) — an injected transport standing in for Ollama (no live model). plan(model, file, prompt) -> code. */
function fakeOllama(plan: (model: string, file: string, prompt: string) => string): any {
  return async (url: string, init: any) => {
    const u = new URL(url);
    if (u.pathname === "/api/tags") return { ok: true, status: 200, json: async () => ({ models: [{ name: "qwen2.5-coder:3b" }, { name: "qwen2.5-coder:7b" }] }) };
    if (u.pathname === "/api/version") return { ok: true, status: 200, json: async () => ({ version: "selftest-fake" }) };
    const b = JSON.parse(init.body); const file = (String(b.prompt).match(/^File: (.*)$/m) || [])[1] || "?";
    return { ok: true, status: 200, json: async () => ({ model: b.model, response: plan(b.model, file, String(b.prompt)), eval_count: 1 }) };
  };
}
async function selftest(): Promise<number> {
  let f = 0; const ok = (n: string, c: boolean) => { process.stdout.write(`${c ? "ok" : "NOT OK"} - ${n}\n`); if (!c) f++; };
  // --- gate + confinement
  const live = readContract(ROOT);
  ok("gate: live contract sha = pinned", !!live && AS.contractSha256(live) === PINNED_CONTRACT_SHA);
  ok("gate: no inspection ⇒ NOT authorized", gate(live, null).ok === false);
  ok("gate: REJECT inspection ⇒ NOT authorized", gate(live, { scenario: "J2", verdict: "REJECT", contractSha256: PINNED_CONTRACT_SHA }).ok === false);
  ok("gate: edited contract ⇒ sha refusal", (() => { const c = JSON.parse(JSON.stringify(live)); c.WORK_ITEM_CONTRACT.preRegistration.thresholds.PASS += " "; const r = gate(c, null); return r.ok === false && /≠ pinned/.test(r.reason); })());
  const insp = readInspection(ROOT);
  if (insp && insp.contractSha256 === PINNED_CONTRACT_SHA) ok("gate: committed inspection bound to the current contract ⇒ authorized", gate(live, insp).ok === true);
  else if (insp) ok(`gate: committed inspection bound to ${String(insp.contractSha256).slice(0, 8)}… ≠ current ${PINNED_CONTRACT_SHA.slice(0, 8)}… ⇒ REFUSED (re-inspection needed)`, gate(live, insp).ok === false);
  else process.stdout.write("skip - committed inspection record absent in this tree (gate refuses ⇒ NOT_AUTHORIZED at run time)\n");
  ok("confinement: declared output path accepted", outputPathOk(OUT));
  ok("confinement: any other path refused", !outputPathOk("docs/odg/evidence/OTHER.json") && !outputPathOk("/tmp/x.json") && !outputPathOk("./" + OUT + "/../x") && !outputPathOk(undefined));
  // --- tasks: J's tasks re-derive identically; pins
  const jt = J.buildTasks();
  for (const id of ["rle-codec", "csv-typed-validator", "range-clamp-pipeline"]) {
    const a = hardTask(id), b = jt.find((x: any) => x.id === id);
    const strip = (subs: any[]) => subs.map((s: any) => { const { repairExamples, ...spec } = s.spec; return { id: s.id, spec }; });
    ok(`task ${id}: derived inputs = J's inputs; A1 specs = J's specs minus repairExamples; whole test identical`, JSON.stringify(a.oracle.inputs) === JSON.stringify(b.oracle.inputs) && JSON.stringify(a.oracle.subproblems) === JSON.stringify(strip(b.oracle.subproblems)) && a.wholeTestSource === b.wholeTestSource);
  }
  ok("tasks: 11 tasks = 7 held-out + 4 replication; A1/A2 sub-problems carry no repairExamples; A3 copies carry them for all", (() => { const ts = buildTasks(); return ts.length === 11 && ts.filter((t) => t.split === "heldOut").length === 7 && ts.filter((t) => t.oracle).every((t) => t.oracle.subproblems.every((s: any) => !("repairExamples" in s.spec)) && t.oracle.subproblemsWithExamples.every((s: any) => Array.isArray(s.spec.repairExamples))); })());
  ok("pins: every pinned sha256 matches the tree", Object.values(PRE.pins).every((p: any) => fileSha(ROOT, p.file) === p.sha256));
  // --- network guard
  { const g = makeGuard(fakeOllama(() => "module.exports=1;"));
    for (const u of ["http://example.com/api/generate", "http://127.0.0.1:80/api/generate", "https://127.0.0.1:11434/api/generate", "http://localhost:11434/api/generate", "http://127.0.0.1:11435/api/tags"]) { let refused = false; try { await g.fetchImpl(u, { method: "POST", body: "{}" }); } catch { refused = true; } ok("guard: refuses " + u, refused); }
    ok("guard: every refusal recorded", g.st.refused.length === 5);
    await g.fetchImpl(OLLAMA + "/api/generate", { method: "POST", body: JSON.stringify({ model: "m", prompt: "p", options: { seed: 1, temperature: 0.7 } }) });
    ok("guard: loopback generate allowed, counted, prompt sha recorded", g.st.modelCalls === 1 && g.st.prompts[0].promptSha256 === sha256("p"));
    const g2 = makeGuard(fakeOllama(() => "module.exports=1;"), { ...PRE.caps, maxModelCallsTotal: 1 });
    await g2.fetchImpl(OLLAMA + "/api/generate", { method: "POST", body: "{\"prompt\":\"a\"}" }); let capped = false; try { await g2.fetchImpl(OLLAMA + "/api/generate", { method: "POST", body: "{\"prompt\":\"b\"}" }); } catch { capped = true; }
    ok("guard: maxModelCallsTotal enforced (call 2 of cap 1 refused, capHit recorded)", capped && g2.st.capHit && g2.st.capHit.cap === "maxModelCallsTotal"); }
  // --- leak literals
  ok("leak: roman-codec literals include 'MCMXCIV' and '1994'; booleans excluded", (() => { const l = leakLiterals(hardTask("roman-codec")); return l.includes("MCMXCIV") && l.includes("1994") && !l.includes("true"); })());
  ok("leak: computed static overlap = the contract's listed exclusions (all 11 tasks)", overlapMatchesList(buildTasks()).ok === true);
  ok("leak: listed exclusions removed from the checked set; other hidden literals kept", (() => { const r = checkedLiterals(hardTask("roman-codec")); const all = leakLiterals(hardTask("roman-codec")); return !r.includes("MCMXCIV") && !r.includes("1994") && r.length === all.length - 2 && r.length > 0; })());
  ok("leak: an unlisted overlap ⇒ mismatch detected (never silently widened)", (() => { const t = hardTask("word-metrics"); const lit = leakLiterals(t)[0]; const t2 = { ...t, spec: { ...t.spec, architecture: t.spec.architecture.map((a: any, i: number) => (i === 0 ? { ...a, contract: a.contract + " " + lit } : a)) } }; return !!lit && overlapMatchesList([t]).ok === true && overlapMatchesList([t2]).ok === false; })());
  ok("leak: hits detected verbatim", JSON.stringify(leakHits("expected the result is MCMXCIV", ["MCMXCIV", "XLII"])) === JSON.stringify(["MCMXCIV"]));
  // --- grading (synthetic rows)
  const mkRows = (spec: any) => { const rows: any[] = []; for (const id of PRE.heldOut) { const s = spec[id] || {}; rows.push({ task: id, split: "heldOut", arm: "A0", seed: 42, status: "MEASURED", executionStatus: "EXECUTED", stopReason: s.stop === undefined ? "REPAIR_BUDGET_EXHAUSTED" : s.stop, accepted: false, delegationState: "CREATED", prompts: [], generations: [] }); rows.push({ task: id, split: "heldOut", arm: "A2", seed: 42, status: s.a2nm ? "NOT_MEASURED" : "MEASURED", executionStatus: "EXECUTED", accepted: !!s.a2, prompts: [], generations: [] }); rows.push({ task: id, split: "heldOut", arm: "A0", seed: 7, status: "MEASURED", executionStatus: "EXECUTED", stopReason: "REPAIR_BUDGET_EXHAUSTED", accepted: !!s.a07, prompts: [], generations: [] }); }
    for (const id of PRE.replication) rows.push({ task: id, split: "replication", arm: "A0", seed: 42, status: "MEASURED", executionStatus: "EXECUTED", stopReason: "REPAIR_BUDGET_EXHAUSTED", accepted: false, prompts: [], generations: [] }); return rows; };
  const jRef = jReference(JSON.parse(fs.readFileSync(path.join(ROOT, PRE.pins.controlReference.file), "utf8")));
  const runOk = { preconditions: { ok: true, reasons: [] }, refused: [], capHit: null, providerCalls: 0, jRef, jControlUnchangedAfter: true };
  ok("C4 reference: J's 4 replication defaults = REPAIR_BUDGET_EXHAUSTED / not accepted, trials agree", PRE.replication.every((id) => jRef[id].defaultStop === "REPAIR_BUDGET_EXHAUSTED" && jRef[id].defaultAccepted === false && jRef[id].trials === 2));
  const G = (spec: any, run: any = runOk) => summarize(mkRows(spec), run).grade.outcome;
  ok("grade: A2 passes 2 of 7, A0@7 0 ⇒ PASS", G({ "word-metrics": { a2: 1 }, "bank-ledger": { a2: 1 } }) === "PASS");
  ok("grade: A2 2, A0@7 2 ⇒ PARTIAL (control not beaten)", G({ "word-metrics": { a2: 1, a07: 1 }, "bank-ledger": { a2: 1, a07: 1 } }) === "PARTIAL");
  ok("grade: A2 1 ⇒ PARTIAL", G({ "word-metrics": { a2: 1 } }) === "PARTIAL");
  ok("grade: A2 0 ⇒ FAIL", G({}) === "FAIL");
  ok("grade: |E| = 3 ⇒ NOT_MEASURED", G({ "number-stats-suite": { stop: null }, "word-metrics": { stop: null }, "grade-report": { stop: null }, "roman-codec": { a2nm: true }, "bank-ledger": { a2: 1 }, "voting-tally": { a2: 1 } }) === "NOT_MEASURED");
  ok("grade: NO_QUALIFIED_LOCAL_MODEL is not a stop (not in E)", summarize(mkRows({ "word-metrics": { stop: "NO_QUALIFIED_LOCAL_MODEL", a2: 1 } }), runOk).E.includes("word-metrics") === false);
  ok("grade: C4 drift ⇒ PASS capped at PARTIAL", (() => { const rows = mkRows({ "word-metrics": { a2: 1 }, "bank-ledger": { a2: 1 } }); rows.find((r) => r.task === "rle-codec").stopReason = "NO_PROGRESS_IDENTICAL_REGENERATION"; return summarize(rows, runOk).grade.outcome === "PARTIAL"; })());
  ok("grade: non-loopback refusal ⇒ NOT_MEASURED (C5)", G({ "word-metrics": { a2: 1 }, "bank-ledger": { a2: 1 } }, { ...runOk, refused: [{ url: "http://x" }] }) === "NOT_MEASURED");
  ok("grade: delegation past CREATED ⇒ NOT_MEASURED (C5)", (() => { const rows = mkRows({ "word-metrics": { a2: 1 }, "bank-ledger": { a2: 1 } }); rows[0].delegationState = "DISPATCHED"; return summarize(rows, runOk).grade.outcome === "NOT_MEASURED"; })());
  ok("grade: unretained generated file ⇒ NOT_MEASURED (C6)", (() => { const rows = mkRows({ "word-metrics": { a2: 1 }, "bank-ledger": { a2: 1 } }); rows[1].files = { "x.js": sha256("y") }; return summarize(rows, runOk).grade.outcome === "NOT_MEASURED"; })());
  ok("grade: pinned sha differs / NOT_RUN ⇒ NOT_MEASURED", G({ "word-metrics": { a2: 1 }, "bank-ledger": { a2: 1 } }, { ...runOk, preconditions: { ok: false, reasons: ["pinned sha256 differs: x"] } }) === "NOT_MEASURED");
  ok("grade: cap hit before required rows ⇒ NOT_MEASURED", (() => { const rows = mkRows({ "word-metrics": { a2: 1 }, "bank-ledger": { a2: 1 } }); const r = rows.find((x) => x.task === "temperature-pipeline" && x.seed === 7); r.status = "NOT_MEASURED"; r.notMeasuredBecause = ["not run: a hard cap was hit earlier"]; return summarize(rows, { ...runOk, capHit: { cap: "maxModelCallsTotal" } }).grade.outcome === "NOT_MEASURED"; })());
  ok("sign test: b=3,c=0 ⇒ p=0.125", signTestOneSided(3, 0).pOneSided === 0.125);

  // --- end-to-end with the fake Ollama transport (real bwrap sandbox; no live model)
  const probe = NBS.probeSandbox();
  if (!probe.ok) { process.stdout.write("skip - bwrap sandbox unavailable here: end-to-end selftest not run (" + probe.reason + ")\n"); ok("sandbox unavailable ⇒ experiment NOT_MEASURED with nothing executed", (await experiment({ transport: fakeOllama(() => ""), taskIds: ["word-metrics"], sandboxDeps: { sandboxRunner: () => ({ status: "NOT_RUN" }) } })).outcome === "NOT_MEASURED"); }
  else {
    const W = HARD_TASKS.find((t: any) => t.id === "word-metrics");
    const refOf = (file: string) => (W.files.find((x: any) => x.path === file) || {}).ref;
    // 3b: correct everywhere except report.js (wrong keys, same text every time ⇒ identical regeneration); 7b: all correct
    const plan = (model: string, file: string) => (file === "report.js" && model === "qwen2.5-coder:3b" ? "module.exports = (s) => ({ n: 0 });" : refOf(file) || "module.exports = () => null;");
    const lines: string[] = [];
    const res = await experiment({ transport: fakeOllama(plan), taskIds: ["word-metrics"], progress: (r: any) => lines.push(`${r.task}/${r.arm}@${r.seed} ${r.status} acc=${r.accepted}`) });
    const row = (arm: string, seed: number) => res.rows.find((r: any) => r.task === "word-metrics" && r.arm === arm && r.seed === seed);
    const a0 = row("A0", 42), a1 = row("A1", 42), a2 = row("A2", 42), a07 = row("A0", 7), a3 = row("A3", 42);
    ok("e2e: preconditions ok (sandbox probe, fake tags list both models, grader self-test)", res.run.preconditions.ok === true);
    ok("e2e: A0@42 = J's runDefault, ODG stop recorded verbatim, SANDBOX only, not accepted", !!a0 && a0.status === "MEASURED" && PRE.odgStops.includes(a0.stopReason) && a0.accepted === false && a0.executionMode === "SANDBOX");
    ok("e2e: A1@42 decomposed (3b) localises the failure at report.js, not accepted", !!a1 && a1.status === "MEASURED" && a1.firstFailure === "report.js" && a1.accepted === false && a1.subproblems.every((s: any) => s.executionMode === "SANDBOX" && s.structuredRepairExamples === false));
    ok("e2e: A2@42 re-runs ONLY report.js at 7b/maxRepair 3 and passes the ORIGINAL whole-task test", !!a2 && a2.status === "MEASURED" && a2.accepted === true && a2.subproblems.filter((s: any) => s.model === PRE.maxLocal.model).map((s: any) => s.id).join() === "report.js" && a2.subproblems.find((s: any) => s.id === "report.js").maxRepair === 3 && a2.wholeTaskTest.verified === true);
    ok("e2e: A0@7 rerun-alone control executed with seed 7 stamped on every prompt", !!a07 && a07.status === "MEASURED" && a07.prompts.length > 0 && res.rows.filter((r: any) => r.seed === 7).every((r: any) => r.arm === "A0"));
    ok("e2e: A3 report-only rows carry structured examples", !!a3 && a3.subproblems.some((s: any) => s.structuredRepairExamples === true));
    ok("e2e: no leak in A0–A2 prompts (word-metrics)", [a0, a1, a2, a07].every((r: any) => r.leakViolation === false));
    ok("e2e: every prompt retained by sha256; C6 retention complete", res.rows.every((r: any) => r.prompts.every((p: any) => /^[0-9a-f]{64}$/.test(p.promptSha256))) && res.summary.criteria.C6.ok === true && res.summary.criteria.C6.generations > 0);
    ok("e2e: C5 holds (no refusal, 0 provider calls, delegations ≤ CREATED, J evidence unchanged)", res.summary.criteria.C5.ok === true);
    ok("e2e: single held-out task ⇒ |E| = 1 < 4 ⇒ NOT_MEASURED (mechanical)", res.summary.nE === 1 && res.outcome === "NOT_MEASURED");
    const rec = record({ contractSha256: PINNED_CONTRACT_SHA, scope: {}, inspection: {} }, res, "0".repeat(40), new Date().toISOString());
    const rt = JSON.parse(JSON.stringify(rec));
    ok("check: a fresh record re-derives (CHECK OK)", checkRecord(rt).length === 0);
    const t1 = JSON.parse(JSON.stringify(rec)); t1.rows.find((r: any) => r.arm === "A2").accepted = false; ok("check: tampered row ⇒ drift detected", checkRecord(t1).length > 0);
    const t2 = JSON.parse(JSON.stringify(rec)); t2.rows[0].prompts[0].leakHits = ["x"]; ok("check: a recorded leak hit on a MEASURED row ⇒ drift detected", checkRecord(t2).length > 0);
    const t3 = JSON.parse(JSON.stringify(rec)); t3.rows[0].generations[0].source += " "; ok("check: altered retained source ⇒ drift detected (C6)", checkRecord(t3).length > 0);
    // hard cap path: a total model-call cap of 3 stops the run mid-trial
    const res2 = await experiment({ transport: fakeOllama(plan), taskIds: ["word-metrics"], caps: { maxModelCallsTotal: 3 } });
    ok("e2e: cap maxModelCallsTotal=3 ⇒ cap recorded, remainder NOT_MEASURED", !!res2.run.capHit && res2.rows.some((r: any) => r.status === "NOT_MEASURED" && r.notMeasuredBecause.some((x: string) => /cap/.test(x))) && res2.run.network.modelCalls <= 3);
    process.stdout.write("info - e2e rows: " + lines.join(" | ") + "\n");
    process.stdout.write("info - static contract-text overlap (literals the frozen task contracts already contain): " + JSON.stringify(buildTasks().map((t) => ({ task: t.id, lits: leakLiterals(t).filter((l) => t.spec.architecture.some((a: any) => String(a.contract || "").includes(l))) })).filter((x) => x.lits.length)) + "\n");
  }
  process.stdout.write(`\n${f === 0 ? "ALL PASS" : f + " FAILURE(S)"}\n`);
  return f === 0 ? 0 : 1;
}

/* ================================================ CLI ================================================ */
async function main(argv: string[]): Promise<number> {
  const positional = argv.filter((a) => !a.startsWith("-"));
  if (argv.includes("--selftest")) return selftest();
  if (argv.includes("--check-at-run-head")) {
    if (positional.length !== 1 || !outputPathOk(positional[0])) { process.stdout.write(`REFUSED — --check-at-run-head takes exactly ${OUT}; got ${JSON.stringify(positional)}\n`); return 3; }
    const r = RHC.checkAtRunHead({ repoRoot: ROOT, recordRel: OUT, runnerRel: SELF, checkArgs: ["--check", OUT] });
    process.stdout.write(RHC.format("V172 J2", r) + `  current tree HEAD (not used for recomputation): ${gitHead(ROOT)}\n` + (r.verdict === "CHECK_OK" ? "RESULT: CHECK OK at run head\n" : "RESULT: FAILED\n"));
    return r.verdict === "CHECK_OK" ? 0 : 1;
  }
  if (positional.length !== 1 || !outputPathOk(positional[0])) { process.stdout.write(`REFUSED — output path must be exactly the contract-declared writeSet entry ${OUT} (got ${JSON.stringify(positional)}); nothing written\n`); return 3; }
  if (argv.includes("--check")) {
    let rec: any = null; try { rec = JSON.parse(fs.readFileSync(path.join(ROOT, OUT), "utf8")); } catch { rec = null; }
    const probs = rec ? checkRecord(rec, readContract(ROOT)) : ["record absent"];
    process.stdout.write(probs.length ? "CHECK FAILED — V172 J2 record drifts\n" + probs.join("\n") + "\n" : `CHECK OK (${rec.rows.length} rows; outcome ${rec.outcome})\n`);
    return probs.length ? 1 : 0;
  }
  const g = gate(readContract(ROOT), readInspection(ROOT));
  if (!g.ok) { process.stdout.write(`NOT_AUTHORIZED — ${g.reason}; nothing written\n`); return 2; }
  const startedAt = new Date().toISOString(); const head = gitHead(ROOT);
  const res = await experiment({ transport: F.loopbackFetch, progress: (r: any) => process.stderr.write(`${r.task} ${r.arm}@${r.seed}: ${r.status} accepted=${r.accepted} stop=${r.stopReason || "-"} calls=${r.modelCalls}\n`) });
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(record(g, res, head, startedAt), null, 2) + "\n");
  process.stdout.write(JSON.stringify({ outcome: res.outcome, because: res.summary.grade.because, E: res.summary.E, primary: res.summary.primary, control: res.summary.rerunAloneControl, wrote: OUT }, null, 1) + "\n");
  return 0;
}

module.exports = { gate, outputPathOk, readContract, buildTasks, hardTask, deriveInputs, leakLiterals, leakHits, makeGuard, summarize, retention, jReference, signTestOneSided, checkRecord, experiment, record, fakeOllama, PRE, ARMS, PINNED_CONTRACT_SHA, OUT, SELF };

if (require.main === module) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }).catch((e) => { process.stderr.write("J2 runner error: " + String((e && e.stack) || e) + "\n"); process.exitCode = 1; });
}
export {};
