#!/usr/bin/env node
"use strict";
/* V17.5 — offline tests for odg-register-criteria-measurement (BLK-3 / REU-1; REL-0 / SPD-0 kept) and its wiring into
 * odg-strategic-register.buildRegister + odg-strategic-select.loadSources. Synthetic fixtures + the REAL committed
 * sources (read-only); no network, no model, no repo write. */
const fs = require("fs");
const path = require("path");
const CM = require("./odg-register-criteria-measurement.js");
const REG = require("./odg-strategic-register.js");
const SEL = require("./mission-priority-selector.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

const SHA_A = "a".repeat(64), SHA_B = "b".repeat(64);
const CF = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const contract = (L: string, wic: any = {}) => ({ scenario: L, title: L, state: "PROPOSED", authorizedBy: null, initialState: { status: "PARTIAL", evidence: [], missingForPass: "x" }, WORK_ITEM_CONTRACT: Object.assign({ objective: "o", write_set: ["runtime/core/<m>.ts"], acceptance_criteria: ["a"] }, wic) });
const t2 = contract("T2", { write_set: ["runtime/bin/t2-run.ts", "docs/odg/evidence/V172_T2_EXPERIMENT.json"], preRegistration: { dataset: {
  replication: ["task-a", "task-b"], heldOut: ["task-c", "task-d"],
  heldOutBasis: { file: "docs/odg/evidence/V159_BASIS.json", sha256: SHA_A },
  controlReference: { file: "docs/odg/evidence/V161_SCENARIO_T.json", sha256: SHA_B },
  unpinned: { file: "docs/odg/evidence/V100_UNPINNED.json" },
} } });
const tParent = contract("T", { write_set: ["docs/odg/evidence/V160_SCENARIO_T.json", "runtime/bin/<runner>.ts"] });
const tNoise = contract("U", { invariants: ["V161_SCENARIO_T.json is never edited"], preRegistration: { antiLeakage: { notLookedAt: ["docs/odg/evidence/V161_SCENARIO_T.json"] } } });
const basis = { modelGenerated: { builds: [{ id: "task-c", repairStopReason: "REPAIR_BUDGET_EXHAUSTED" }, { id: "task-d", repairStopReason: null, finalAccepted: true }, { id: "other", repairStopReason: "REPAIR_BUDGET_EXHAUSTED" }] } };
const control = { rows: [{ task: "task-a", default: { stopReason: "NO_PROGRESS_IDENTICAL_REGENERATION" }, alternative: { stopReason: "SOMETHING_ELSE" } }], summary: { perTask: { "task-b": { stops: ["REPAIR_BUDGET_EXHAUSTED"] } } } };
const evidence = [{ path: "docs/odg/evidence/V159_BASIS.json", sha256: SHA_A, data: basis }, { path: "docs/odg/evidence/V161_SCENARIO_T.json", sha256: SHA_B, data: control }];
const contracts = [tParent, t2, tNoise];
const scen = { T: "docs/odg/evidence/V161_SCENARIO_T.json" };
const src = (ev: any[] = evidence) => ({ contracts: { path: CF, data: { contracts }, sha256: "c".repeat(64) }, measurementEvidence: ev });

// ── BLK-3 ──
const b = CM.measureBlockerRepetition(t2, `${CF}#contracts[1]`, new Map(evidence.map((e) => [e.path, e])));
check("BLK-3: 3 of 4 pre-registered tasks carry a stop record (task-a via rows[].task, task-b via perTask key, task-c via builds[].id) ⇒ 0.75", b.status === "MEASURED" && b.value === 0.75 && b.rule === "BLK-3");
check("BLK-3: a non-stop value (SOMETHING_ELSE, null) and a task outside the pre-registered list ('other') never count", !b.source.some((s: string) => /alternative|builds\[1\]|builds\[2\]/.test(s)) && /no record: \[task-d\]/.test(b.basis));
check("BLK-3: source citation = dataset file + sha256 pins + task pointers + every stop record path#field", b.source.includes(`${CF}#contracts[1].WORK_ITEM_CONTRACT.preRegistration.dataset.heldOutBasis.file`) && b.source.includes(`${CF}#contracts[1].WORK_ITEM_CONTRACT.preRegistration.dataset.controlReference.sha256`) && b.source.includes("docs/odg/evidence/V161_SCENARIO_T.json#rows[0].default.stopReason") && b.source.includes("docs/odg/evidence/V161_SCENARIO_T.json#summary.perTask.task-b.stops[0]") && b.source.includes("docs/odg/evidence/V159_BASIS.json#modelGenerated.builds[0].repairStopReason"));
check("BLK-3: measuredAt is content-addressed (sha256 of each used file); method stated", b.measuredAt.contentSha256["docs/odg/evidence/V159_BASIS.json"] === SHA_A && b.measuredAt.contentSha256["docs/odg/evidence/V161_SCENARIO_T.json"] === SHA_B && typeof b.method === "string");
const bMis = CM.measureBlockerRepetition(t2, `${CF}#contracts[1]`, new Map([[evidence[0].path, { ...evidence[0], sha256: "d".repeat(64) }], [evidence[1].path, evidence[1]]]));
check("BLK-3: a cited file whose sha256 ≠ the contract's pin is REFUSED (not read) ⇒ only the other file counts (task-a, task-b ⇒ 0.5) and the refusal is reported", bMis.value === 0.5 && /refused: docs\/odg\/evidence\/V159_BASIS\.json \(sha256/.test(bMis.basis) && /no pinned sha256/.test(bMis.basis));
const bNone = CM.measureBlockerRepetition(t2, `${CF}#contracts[1]`, new Map());
check("BLK-3: no loaded evidence ⇒ NOT_MEASURED with reason (never 0, never a default)", bNone.status === "NOT_MEASURED" && bNone.value === null && /no usable cited evidence/.test(bNone.reason));
check("BLK-3: no pre-registered task list ⇒ BLK-0 NOT_MEASURED (rule not applicable)", CM.measureBlockerRepetition(tParent, `${CF}#contracts[0]`, new Map(evidence.map((e) => [e.path, e]))).status === "NOT_MEASURED");
const bZero = CM.measureBlockerRepetition(t2, `${CF}#contracts[1]`, new Map([[evidence[0].path, { ...evidence[0], data: { builds: [{ id: "task-c", repairStopReason: null }] } }]]));
check("BLK-3: usable file but n = 0 ⇒ NOT_MEASURED (absence is not evidence of no benefit)", bZero.status === "NOT_MEASURED" && /no stop record/.test(bZero.reason));
check("citedMeasurementFiles: only pinned files of task-list contracts (the unpinned one is not loaded)", JSON.stringify(CM.citedMeasurementFiles({ contracts })) === JSON.stringify(["docs/odg/evidence/V159_BASIS.json", "docs/odg/evidence/V161_SCENARIO_T.json"]));

// ── REU-1 ──
const r = CM.measureReusability(contracts, 0, CF, scen, "c".repeat(64));
check("REU-1: T's SCN-1 evidence declared as T2's dataset controlReference.file ⇒ r=1 ⇒ 0.25, citing pointer is the dataset file field", r.status === "MEASURED" && r.value === 0.25 && r.source.includes(`${CF}#contracts[1].WORK_ITEM_CONTRACT.preRegistration.dataset.controlReference.file`));
check("REU-1: free-text mentions (invariants, antiLeakage.notLookedAt) are NOT reuse ⇒ U is not counted", /r=1 /.test(r.basis) && !/U ←/.test(r.basis) && !r.source.some((s: string) => /contracts\[2\]/.test(s)));
check("REU-1: nobody declares T2's outputs ⇒ NOT_MEASURED with reason", CM.measureReusability(contracts, 1, CF, scen).status === "NOT_MEASURED");
check("REU-1: placeholder-only write_set and no executed evidence ⇒ NOT_MEASURED (nothing to find reused)", /no concrete output/.test(CM.measureReusability([contract("Z"), t2], 0, CF, {}).reason));
check("declaresPath: token-bounded prefix (V160_SCENARIO_G.json ≠ V160_SCENARIO_G_PR_HISTORY.json)", CM.declaresPath("docs/odg/evidence/V160_SCENARIO_G.json", "docs/odg/evidence/V160_SCENARIO_G.json") && !CM.declaresPath("docs/odg/evidence/V160_SCENARIO_G_PR_HISTORY.json", "docs/odg/evidence/V160_SCENARIO_G.json") && CM.declaresPath("docs/odg/evidence/X.json (built later)", "docs/odg/evidence/X.json"));

// ── REL/SPD preserved, determinism, no circularity ──
const all = CM.measureContractCriteria(src(), 1, scen);
check("REL-0 / SPD-0 stay NOT_MEASURED with the searched reason (no per-item field)", all.reliabilityQuality.status === "NOT_MEASURED" && all.speedEfficiency.status === "NOT_MEASURED" && /V17\.5 search/.test(all.reliabilityQuality.reason) && /V17\.5 search/.test(all.speedEfficiency.reason));
check("determinism: two computations byte-identical; input order of measurementEvidence irrelevant", JSON.stringify(CM.measureContractCriteria(src(), 1, scen)) === JSON.stringify(all) && JSON.stringify(CM.measureContractCriteria(src(evidence.slice().reverse()), 1, scen)) === JSON.stringify(all));
check("no circularity by signature: measureContractCriteria(sources, ci, scenPaths) takes no register/decision argument", CM.measureContractCriteria.length === 3);
{ const poisoned = { ...src(), register: { items: [{ id: "T2", criteria: { reusability: { status: "MEASURED", value: 1 } } }] }, decision: { selected: { id: "T2" } } };
  check("no circularity: register/decision-shaped extra keys in sources change nothing", JSON.stringify(CM.measureContractCriteria(poisoned, 1, scen)) === JSON.stringify(all)); }

// ── wiring into buildRegister (synthetic v150) ──
const v150 = { sectionsStatus: [{ id: "§45", status: "PARTIALLY_VALIDATED", title: "§45 — BATTERIE DE DÉMONSTRATION DE L'AUTONOMIE" }], summary: { top10NextInternal: [], alsoInternal: [], ownerGated: [] } };
const R = REG.buildRegister({ contracts: { path: CF, data: { contracts } }, contractsSha256: "c".repeat(64), v150: { path: "v150.json", data: v150 }, cp8: null, scenarioEvidence: [{ path: "docs/odg/evidence/V161_SCENARIO_T.json", data: { scenario: "V15.0 §45 T — x" } }], measurementEvidence: evidence });
const it = (id: string) => R.items.find((x: any) => x.id === id);
check("buildRegister applies BLK-3 to the task-list contract and keeps the 4 criteria rule ids declared", it("T2").criteria.blockerRepetitionReduction.rule === "BLK-3" && it("T2").criteria.blockerRepetitionReduction.value === 0.75 && R.contractMeasurementRules.blockerRepetitionReduction === CM.BLK3_RULE && R.sourcesUsed.measurementEvidence.length === 2);
check("buildRegister: without measurementEvidence ⇒ BLK-3 NOT_MEASURED (no fill)", REG.buildRegister({ contracts: { path: CF, data: { contracts } }, v150: { path: "v150.json", data: v150 }, cp8: null, scenarioEvidence: [] }).items.find((x: any) => x.id === "T2").criteria.blockerRepetitionReduction.status === "NOT_MEASURED");
check("weights / directions / criterion names unchanged (10 criteria, equal weights)", REG.CRITERIA.length === 10 && Object.values(REG.WEIGHTS).every((w: any) => w === 1) && REG.DIRECTIONS.costRiskComplexity === "LOWER_IS_BETTER" && SEL.EXPLAINED_DEFAULTS.uncertaintyMax === 0.5 && SEL.EXPLAINED_DEFAULTS.epsilon === 0.02);

// ── REAL committed sources (read-only) ──
{
  const ROOT = path.resolve(__dirname, "..", "..");
  const SS = require("../bin/odg-strategic-select.ts");
  const live = SS.loadSources(ROOT);
  check("real loader: measurementEvidence = exactly J2's pinned dataset files; never the register output", JSON.stringify(live.measurementEvidence.map((e: any) => e.path)) === JSON.stringify(["docs/odg/evidence/V159_NATIVE_BUILD_ISOLATION.json", "docs/odg/evidence/V161_SCENARIO_J.json"]) && !live.measurementEvidence.some((e: any) => /STRATEGIC_REGISTER|GO_CYCLE/.test(e.path)));
  const RR = REG.buildRegister(live);
  const ri = (id: string) => RR.items.find((x: any) => x.id === id);
  check("real: J2 BLK-3 = 11/11 pre-registered tasks with a committed stop record ⇒ 1", ri("J2").criteria.blockerRepetitionReduction.value === 1 && /n=11\/11/.test(ri("J2").criteria.blockerRepetitionReduction.basis));
  check("real: J REU-1 = 0.25 (J2 declares V161_SCENARIO_J.json as dataset.controlReference.file)", ri("J").criteria.reusability.value === 0.25 && /J2 ← \[docs\/odg\/evidence\/V161_SCENARIO_J\.json\]/.test(ri("J").criteria.reusability.basis));
  check("real: G / H stay REU NOT_MEASURED (H/G2 name their outputs only under notLookedAt — not reuse)", ri("G").criteria.reusability.status === "NOT_MEASURED" && ri("H").criteria.reusability.status === "NOT_MEASURED");
  check("real: REL/SPD NOT_MEASURED on every WORK_ITEM_CONTRACT; BLK/REU measured only on J2 / J", RR.items.filter((x: any) => x.kind === "WORK_ITEM_CONTRACT").every((x: any) => x.criteria.reliabilityQuality.status === "NOT_MEASURED" && x.criteria.speedEfficiency.status === "NOT_MEASURED" && (x.criteria.blockerRepetitionReduction.status === "MEASURED") === (x.id === "J2") && (x.criteria.reusability.status === "MEASURED") === (x.id === "J")));
  const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V164_STRATEGIC_REGISTER.json"), "utf8"));
  check("committed register carries the measured J/J2 values (regenerated, no drift on these items)", JSON.stringify(committed.register.items.find((x: any) => x.id === "J2").criteria.blockerRepetitionReduction) === JSON.stringify(JSON.parse(JSON.stringify(ri("J2").criteria.blockerRepetitionReduction))) && committed.register.items.find((x: any) => x.id === "J").criteria.reusability.value === 0.25);
}

process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-register-criteria-measurement (BLK-3/REU-1 source-cited, NOT_MEASURED preserved, deterministic, no circularity)" : f + " FAIL") + "\n");
process.exit(f === 0 ? 0 : 1);
export {};
