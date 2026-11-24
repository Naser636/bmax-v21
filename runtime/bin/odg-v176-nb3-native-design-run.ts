#!/usr/bin/env node
"use strict";
/*
 * V17.6 NB3 — NATIVE DESIGN RUNNER WITH REPAIR DIVERSITY (contract docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#V176-NB3,
 * owner record docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json: « Préparer NB3 avec le nouveau levier de diversité des
 * réparations. Faire inspecter son contrat, puis laisser GO décider et exécuter une fois si les conditions sont conformes. »).
 *
 * NO second engine: this is the NB2 runner (runtime/bin/odg-v175-native-design-run.ts runNativeDesign — S1 PROBLEM … S6 LEARN,
 * buildProject, bwrap sandbox, ADAPT-1, HOST-1, DIGEST-1, denylist, authorship ledger, ALREADY_RECORDED guard) PARAMETRISED by
 * NB3's contract profile: same target (odg-canonical-json undefined gap), same oracle (all PROB-1 cases) and criteria shape,
 * same caps (maxModelCalls 12, wallMs, per-call ADAPT-1), plus ONE lever: the pre-registered DIV-1 repair-diversity ladder
 * (runtime/core/odg-native-design-pipeline.ts) walked only on a STALL (identical regeneration — NB2's observed failure mode).
 *
 * MODES:
 *   <out>             NATIVE run (GO dispatch). Refused (exit 2) unless odg-authorization-scope derives RUN_CONTROLLED_EXPERIMENTS
 *                     as the current execution-authorized step of V176-NB3 (owner V176 build missions + committed independent
 *                     inspection ACCEPT bound to the contract sha) AND the contract's budgets equal this runner's BUDGETS
 *                     (pre-registration enforced); <out> must be the declared writeSet (exit 3); existing record ⇒ exit 4.
 *   --emit-contract   print the contract ODG's rules derive from the CURRENT repo.
 *   --selftest        offline fake-Ollama behind the real loopback guard; real sandbox; nothing written.
 * NETWORK: exact http://127.0.0.1:11434/api/generate allowlist. 0 provider calls. No --probe mode (NB3's first live call is GO's).
 */
const fs = require("fs");
const path = require("path");
const NB2 = require("./odg-v175-native-design-run.js");
const PIPE = require("../core/odg-native-design-pipeline.js");
const NBS = require("../core/odg-native-build-sandbox.js");
const AS = require("../core/odg-authorization-scope.js");
const OCUR = require("../core/odg-observation-currency.js");

const ROOT = path.resolve(__dirname, "..", "..");
const SELF = "runtime/bin/odg-v176-nb3-native-design-run.ts";
const SCENARIO = "V176-NB3";
const OUT = "docs/odg/evidence/V176_NB3_NATIVE_DESIGN_RESULT.json";
const INSPECTION = "docs/odg/evidence/V176_NB3_CONTRACT_INSPECTION.json";   // written by an independent inspector, never here
const OWNER_RECORD = "docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json";
const REGISTRY = "docs/odg/evidence/V155_OLLAMA_CAPABILITY_REGISTRY.json";
const LESSON_SOURCES = Object.freeze([NB2.LESSON_SOURCES[0], NB2.OUT, OUT]);   // NB1 + NB2 committed records, then NB3's own

/* DIV-1 schedule — PRE-REGISTERED (fixed before any NB3 model call; the guard refuses any other point).
 * base = NB2's (temperature 0, seed 42); 2 sampling steps per design; design switch in SEL-1 order; model escalation only
 * to a REGISTERED larger local model — the committed V155 registry lists qwen2.5-coder:7b (7.6B) as the largest available
 * (3b, 0.5b are smaller) ⇒ no escalation point (largerModels(registry) = [], tested). maxVariations = ladder length − 1. */
const DIVERSITY = Object.freeze({
  rule: PIPE.DIVERSITY_RULE,
  base: Object.freeze({ temperature: 0, seed: 42 }),
  sampling: Object.freeze([Object.freeze({ temperature: 0.5, seed: 1042 }), Object.freeze({ temperature: 0.9, seed: 2042 })]),
  designSwitch: true,
  escalationModels: Object.freeze([] as string[]),
  escalationBasis: `${REGISTRY}: no AVAILABLE model larger than qwen2.5-coder:7b (7.6B; others 3.1B, 494.03M) ⇒ no MODEL_ESCALATION point`,
  maxVariations: 8,
});
const BUDGETS = Object.freeze({ ...NB2.BUDGETS, diversity: DIVERSITY });   // every NB2 cap unchanged (maxModelCalls 12 is the TOTAL)
const PROFILE = Object.freeze({ scenario: SCENARIO, out: OUT, runner: SELF, budgets: BUDGETS, lessonSources: LESSON_SOURCES });
const STEP = NB2.STEP;
function readJson(p: string): any { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
const canon = AS.canon;

function runNb3(opts: any): Promise<any> { return NB2.runNativeDesign({ ...opts, profile: PROFILE }); }

/* contractFor(root) — NB2's rule-derived contract (same target / oracle / criteria shape) re-bound to NB3's profile. */
function contractFor(root: string): any {
  const base = NB2.contractFor(root);
  if (!base) return null;
  const w = base.WORK_ITEM_CONTRACT;
  const ladder = PIPE.diversityLadder(DIVERSITY, ["D1", "D2", "D3"], BUDGETS.model);
  return {
    ...base,
    scenario: SCENARIO,
    title: "NB3: ODG repairs odg-canonical-json's undefined gap again (NB2's target + oracle) with the pre-registered DIV-1 repair-diversity lever",
    WORK_ITEM_CONTRACT: {
      ...w,
      objective: w.objective + " — NB3: same problem and criteria as NB2 (CLOSED_FAIL, 27/33, both repair rounds NO_PROGRESS_IDENTICAL_REGENERATION); the ONLY new lever is DIV-1 repair diversity (pre-registered ladder, same total call cap)",
      write_set: [w.nativePatchWriteSet[0], w.nativePatchWriteSet[1], SELF, OUT],
      invariants: [...w.invariants,
        "DIV-1: diversity points (model, temperature, seed) are exactly the pre-registered budgets.diversity ladder; the guard refuses any other; the ladder advances only on a STALL (content already seen), ≤ maxVariations, all calls within the same maxModelCalls; every call records its (model, temperature, seed)",
        "NB2's records (V175_NB2_*) are untouched; NB3 is a new contract with a new id — NB2 is never re-opened"],
      acceptance_criteria: [...w.acceptance_criteria,
        "AC7 diversity recorded: the result carries diversity.ladder, every transition (reason, point, params) and per-call (model, temperature, seed); every sent call is a pre-registered point; network.modelCalls ≤ maxModelCalls"],
      stop_conditions: [...w.stop_conditions, "DIV-1 ladder exhausted (maxVariations or last point) ⇒ the identical generation stands and buildProject stops NO_PROGRESS (FAIL if no PASS) — never an extra call", "a call with non-pre-registered options ⇒ refused by the guard ⇒ NOT_MEASURED"],
      evidence_required: [OUT],
      budgets: BUDGETS,
      preRegistration: {
        ...w.preRegistration,
        metric: "verdict of runNativeDesign under the V176-NB3 profile (PASS ⇔ AC2 ∧ AC3 ∧ AC4 within budgets); secondary (descriptive, not graded): stalls broken = DIV-1 transitions followed by a novel generation",
        baseline: "NB2 (V175_NB2_NATIVE_DESIGN_RESULT.json, CLOSED_FAIL): best design 27/33, 7 model calls, both repair rounds NO_PROGRESS_IDENTICAL_REGENERATION at temperature 0 / seed 42; the integrated helper fails " + base.origin.failingCases + "/" + base.origin.totalCases + " PROB-1 cases",
        hypothesis: "H-NB3: repair diversity (DIV-1) breaks NB2's identical-regeneration stall and lets the local model reach all PROB-1 cases within the same 12-call cap. Refuted if the verdict is FAIL with ≥1 diversity transition; untested if no stall occurs",
        diversitySchedule: { ...DIVERSITY, ladderForThreeDesigns: ladder.map((p: any) => ({ i: p.i, kind: p.kind, design: "rank" + (["D1", "D2", "D3"].indexOf(p.design) + 1), model: p.model, temperature: p.temperature, seed: p.seed })), note: "the ladder is instantiated over the run's SEL-1 ranking (rank1 = chosen design); design ids are the run's" },
        decisionRule: "outcome = runner verdict recorded verbatim (PASS / FAIL / NOT_MEASURED); one dispatch; no re-run to obtain a PASS; criteria/budgets/schedule not changed after observation",
        caps: { ...w.preRegistration.caps, maxModelCalls: BUDGETS.maxModelCalls, diversity: { maxVariations: DIVERSITY.maxVariations, points: PIPE.allowedCallOptions(DIVERSITY, BUDGETS.model).length, sameTotalCallCap: true } },
        honestLimits: w.preRegistration.honestLimits + "; sampling at temperature > 0 with a fixed seed is reproducible only on the same Ollama/model build; no larger local model is registered, so model escalation is not part of this test",
      },
    },
    authorization: { ...base.authorization, dispatchTargets: { RUN_CONTROLLED_EXPERIMENTS: { command: SELF, args: [OUT], writeSet: [OUT] } } },
  };
}

/* gate — NB2's scoped gate under NB3's profile + PRE-REGISTRATION: the contract's budgets must equal this runner's BUDGETS. */
function budgetsMatch(contract: any): boolean { const d = contract && contract.WORK_ITEM_CONTRACT ? contract.WORK_ITEM_CONTRACT.budgets : null; return !!d && canon(d) === canon(BUDGETS); }
function gate(contract: any, inspection: any, probes: any): any {
  if (contract && !budgetsMatch(contract)) return { ok: false, reason: "contract budgets (incl. the DIV-1 schedule) ≠ runner BUDGETS — the pre-registered schedule is not the one this runner would run" };
  return NB2.gate(contract, inspection, probes, PROFILE);
}
function readContract(root: string): any { const d = readJson(path.join(root, NB2.CONTRACTS)); return d ? (d.contracts || []).find((c: any) => c && c.scenario === SCENARIO) || null : null; }
function readInspection(root: string): any { const r = readJson(path.join(root, INSPECTION)); return r ? { ...r, recordPath: INSPECTION } : null; }

/* ---------------- selftest (FAKE model — fixtures, NOT native results) ---------------- */
async function selftest(): Promise<number> {
  let f = 0; const check = (n: string, c: boolean) => { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; };
  const probe = NBS.probeSandbox();
  // NB2's failure mode: every implementation (and every temperature-0 repair) of design alpha is FIX_WRONG; a SAMPLED call
  // (temperature > 0) answers FIX_RIGHT. Without diversity this stalls; with DIV-1 the ladder's first sampling point breaks it.
  const F = fakeBySampling();
  const r = await runNb3({ root: ROOT, label: "SELFTEST", transport: F.fake, loadProbe: NB2.IDLE });
  if (!r.problem || !r.problem.defect) { check("integrated ⇒ NOT_MEASURED", r.verdict === "NOT_MEASURED"); return f; }
  if (probe && probe.ok === true) {
    check("DIV-1 breaks the identical-regeneration stall: PASS via a SAMPLING point", r.verdict === "PASS" && r.diversity.transitions.length >= 1 && r.diversity.transitions.some((t: any) => t.kind === "SAMPLING"));
    check("every sent call is a pre-registered point; modelCalls ≤ maxModelCalls", F.calls.every((c: any) => PIPE.allowedCallOptions(DIVERSITY, BUDGETS.model).some((a: any) => a.model === c.model && a.temperature === c.temperature && a.seed === c.seed)) && r.network.modelCalls <= BUDGETS.maxModelCalls);
    check("per-call params recorded", r.prompts.filter((p: any) => p.stage !== "S3 design" && p.ok).every((p: any) => typeof p.temperature === "number" || p.stage.startsWith("S4")));
  } else { process.stdout.write("SKIP - sandbox unavailable\n"); check("no sandbox ⇒ NOT_MEASURED", r.verdict === "NOT_MEASURED"); }
  return f;
}
/* fakeBySampling() — answers by the REQUESTED temperature: 0 ⇒ always FIX_WRONG (identical), > 0 ⇒ FIX_RIGHT. */
function fakeBySampling(o: any = {}): any {
  const calls: any[] = [];
  const fake = async (_url: string, init: any) => {
    const b = JSON.parse(init.body);
    if (b.prompt === PIPE.WARMUP_PROMPT) return { ok: true, json: async () => ({ model: b.model, response: "ready", ...NB2.FAKE_TIMINGS }) };
    const t = b.options ? b.options.temperature : null; calls.push({ model: b.model, temperature: t, seed: b.options ? b.options.seed : null });
    let resp: string;
    if (/Task: propose/.test(b.prompt)) resp = NB2.FIX_DESIGNS;
    else resp = "```ts\n" + (o.never ? NB2.FIX_WRONG : t > 0 ? NB2.FIX_RIGHT : NB2.FIX_WRONG) + "```";
    return { ok: true, json: async () => ({ model: b.model, ...NB2.FAKE_TIMINGS, response: resp }) };
  };
  return { fake, calls };
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === "--selftest") return (await selftest()) === 0 ? 0 : 1;
  if (argv[0] === "--emit-contract") { process.stdout.write(JSON.stringify(contractFor(ROOT), null, 2) + "\n"); return 0; }
  const out = argv[0];
  if (out !== OUT) { process.stdout.write(`REFUSED: output path must be the declared writeSet entry ${OUT}\n`); return 3; }
  // ONE-SHOT: a NATIVE run never overwrites an existing result (the single execution is GO's).
  if (fs.existsSync(path.join(ROOT, OUT))) { process.stdout.write(`ALREADY_RECORDED: ${OUT} exists — a NATIVE run never overwrites a result (one execution only)\n`); return 4; }
  const c = readContract(ROOT);
  const g = gate(c, readInspection(ROOT), OCUR.localGitProbes(ROOT));
  if (!g.ok) { process.stdout.write(`NOT_AUTHORIZED: ${g.reason}\n`); return 2; }
  const r = await runNb3({ root: ROOT, label: "NATIVE (ODG GO dispatch)", transport: NB2.loopbackTransport(), expectedDigest: c.origin && c.origin.evidenceDigest, contractSha256: g.contractSha256 });
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(r, null, 2) + "\n");
  process.stdout.write(`NATIVE verdict ${r.verdict} → ${OUT}\n`);
  return r.verdict === "PASS" ? 0 : 1;
}

module.exports = { runNb3, contractFor, gate, budgetsMatch, readContract, readInspection, fakeBySampling, DIVERSITY, BUDGETS, PROFILE, SELF, SCENARIO, OUT, INSPECTION, OWNER_RECORD, REGISTRY, LESSON_SOURCES, STEP };
if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stdout.write("ERROR " + String((e && e.stack) || e) + "\n"); process.exit(1); });
export {};
