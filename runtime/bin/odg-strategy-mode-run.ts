#!/usr/bin/env node
"use strict";
/*
 * V16.4 §4/§10 D — apply odg-strategy-mode-selector to REAL mission records built from COMMITTED evidence (no model call,
 * no provider call, no network). Missions: the 4 V159 measured-policy missions, the 4 V161 scenario-J tasks, the V161
 * scenario-F invoice pipeline, and the 16 V160 A–P work-item contracts (at the level their evidence allows).
 *
 * Two evidence regimes per mission with a known outcome:
 *   PRIOR   — only the evidence that existed BEFORE that mission's run (retrospective "what would the selector have chosen");
 *   CURRENT — all committed evidence including the observed outcome (what the selector chooses NOW).
 * Scenario D ("ODG choisit correctement le mode") is graded against criteria PRE-REGISTERED below (PRE_REGISTERED_D),
 * written in this file before the first run. RETROSPECTIVE ≠ PROSPECTIVE: a retrospective check can show the choice is
 * consistent with known outcomes; it cannot show the chosen HYBRID/PROVIDER would have succeeded (never executed).
 *
 * Usage: npx tsx runtime/bin/odg-strategy-mode-run.ts [--write]   (derive; --write writes the evidence file)
 *        npx tsx runtime/bin/odg-strategy-mode-run.ts --check     (re-derive and compare with the committed evidence)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const SEL = require(path.join(ROOT, "runtime", "core", "odg-strategy-mode-selector.js"));
const POL = require(path.join(ROOT, "runtime", "core", "odg-local-model-execution-policy.js"));

const OUT_REL = "docs/odg/evidence/V164_STRATEGY_MODE_SELECTION.json";
const SRC = Object.freeze({
  REG: "docs/odg/evidence/V155_OLLAMA_CAPABILITY_REGISTRY.json",
  V159: "docs/odg/evidence/V159_MEASURED_MODEL_POLICY.json",
  ISO: "docs/odg/evidence/V159_NATIVE_BUILD_ISOLATION.json",
  J: "docs/odg/evidence/V161_SCENARIO_J.json",
  F: "docs/odg/evidence/V161_SCENARIO_F.json",
  AP: "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json",
  CP8: "docs/odg/evidence/V163_CHECKPOINT_8.json",
});

// ---- PRE-REGISTERED pass criteria for V16.4 §10 scenario D (fixed before the first run; do not edit after) --------
const PRE_REGISTERED_D = Object.freeze({
  scenario: "D — ODG choisit correctement le mode (V16.4 §10)",
  registeredIn: "runtime/bin/odg-strategy-mode-run.ts (same commit as the first evidence write; ordering is NOT cryptographically provable)",
  criteria: Object.freeze([
    { id: "D1", name: "PROVIDER_NEVER_EXECUTABLE_WITHOUT_BUDGET_AND_AUTHORIZATION", test: "every selection whose mode or tentativeMode is PROVIDER/HYBRID has authorizationRequired=true, budgetRequired=true (no verifiable budget exists in any real record), providerExecutable=false, launchedBySelector=false, delegation records only in state CREATED; providerCalls=0" },
    { id: "D2", name: "HYBRID_ONLY_WHEN_DECOMPOSABLE_AND_DISJOINT", test: "every HYBRID selection has inputs.decomposable=true, inputs.writeSetDisjoint=true, ≥1 native part and ≥1 delegated part" },
    { id: "D3", name: "AVOIDS_OBSERVED_LOCAL_FAILURE (retrospective)", test: "for missions whose observed local outcome was FAILURE (V159 implement-parse-range, the 4 J tasks), the PRIOR selection is not NATIVE (would not have re-spent the local strategy that failed)" },
    { id: "D4", name: "NO_CONTRADICTION_ON_OBSERVED_SUCCESS (retrospective)", test: "for missions whose observed local outcome was SUCCESS (V159 bugfix/repair/refactor, F invoice pipeline), the PRIOR selection is NATIVE (would not have delegated what native solved)" },
    { id: "D5", name: "STRATEGY_CHAIN_REPRODUCES_J_AND_IS_BOUNDED", test: "replaying each J row through nextStrategyAfterFailure from the default reproduces J's recorded alternative (strategy, model, maxRepair); the step after the alternative's failure is HYBRID or PROVIDER; the continued chain terminates within MAX_CHAIN with no repeated strategy" },
    { id: "D6", name: "NOT_MEASURED_NEVER_DEFAULT_FILLED", test: "every part input (taskClass, writeSet, independentCheck) is cited (source ≠ UNCITED) or NOT_MEASURED; any NOT_MEASURED part qualification without a whole-mission accept ⇒ uncertainty HIGH" },
    { id: "D7", name: "PROSPECTIVE_CONFIRMATION", test: "a HYBRID or PROVIDER selection was subsequently executed and independently validated — NOT_MEASURED in this mission (no provider call allowed, no hybrid execution run)" },
  ]),
  gradingRule: "FAIL if any of D1–D6 fails; PASS only if D1–D6 pass AND D7 passes; otherwise PARTIAL (D7 NOT_MEASURED ⇒ ceiling PARTIAL). Retrospective consistency ≠ prospective correctness.",
});

function readJson(rel: string): any { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); }
function sha(rel: string): string { return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex"); }

function loadSources(): any {
  const s: any = {};
  for (const [k, rel] of Object.entries(SRC)) s[k] = readJson(rel as string);
  s.measured = POL.loadMeasuredRegistry(SRC.REG, { root: ROOT });
  // pinned evaluation instant = the latest timestamp among the sources (deterministic; registry freshness is checked against it)
  const ts = [s.V159.generatedAt, s.ISO.finishedAt, s.J.generatedAt, s.F.finishedAt].map((x: any) => Date.parse(x)).filter(Number.isFinite);
  s.now = Math.max(...ts);
  return s;
}

// ---- mission builders (every value cites its evidence field) -------------------------------------------------------
function v159Obs(s: any, id: string): any[] {
  return s.V159.runs.filter((r: any) => r.mission === id && r.status === "MEASURED").map((r: any, i: number) => ({ model: r.model, maxRepair: r.maxRepair, strategy: "DEFAULT", accepted: r.accepted === true, wallMs: r.wallMs, source: `${SRC.V159}#runs[mission=${id},condition=${r.condition},trial=${r.trial}]` }));
}
function jTask(s: any, id: string): any { return s.J.tasks.find((t: any) => t.id === id); }
function jRows(s: any, id: string): any[] { return s.J.rows.filter((r: any) => r.task === id); }

function buildV159(s: any, regime: string): any[] {
  return s.V159.missions.map((m: any) => {
    const obs = regime === "PRIOR" ? [] : [...v159Obs(s, m.id), ...(m.id === "v159-implement-parse-range" ? jRows(s, m.id).flatMap((r: any) => jAsObs(r, m.id)) : [])];
    return { id: `V159/${m.id}`, family: "V159", taskId: m.id, taskClass: m.taskClass, taskClassSource: `${SRC.V159}#missions[id=${m.id}].taskClass`, contract: m.contract, observations: obs };
  });
}
function jAsObs(r: any, id: string): any[] {
  const out = [{ model: r.default.model, maxRepair: r.default.maxRepair, strategy: "DEFAULT", accepted: r.default.accepted === true, executionStatus: r.default.executionStatus, wallMs: r.default.wallMs, source: `${SRC.J}#rows[task=${id},trial=${r.trial}].default` }];
  if (r.alternative && !Array.isArray(r.alternative.subproblems)) out.push({ model: r.alternative.model, maxRepair: r.alternative.maxRepair, strategy: r.alternative.strategy, accepted: r.alternative.accepted === true, executionStatus: r.alternative.executionStatus, wallMs: r.alternative.wallMs, source: `${SRC.J}#rows[task=${id},trial=${r.trial}].alternative` });
  return out;
}
function buildJ(s: any, regime: string): any[] {
  return s.J.tasks.map((t: any, ti: number) => {
    const tcSrc = `${SRC.J}#tasks[${ti}].type`;
    const base: any = { id: `J/${t.id}`, family: "J", taskId: t.id, taskClass: t.type, taskClassSource: tcSrc, decomposition: { strategy: t.plannerStrategy, source: `${SRC.J}#tasks[${ti}].plannerStrategy` } };
    if (!t.intermediateOracle) {
      // single file: whole-task observations ARE the part's observations
      const prior = t.id === "v159-implement-parse-range" ? v159Obs(s, t.id) : [];
      const cur = regime === "PRIOR" ? prior : [...prior, ...jRows(s, t.id).flatMap((r: any) => jAsObs(r, t.id))];
      return { ...base, writeSet: t.files.map((f: string) => `${t.id}/${f}`), writeSetSource: `${SRC.J}#tasks[${ti}].files`, observations: cur };
    }
    const iso = s.ISO.modelGenerated.builds.filter((b: any) => b.id === t.id).map((b: any) => ({ model: b.model, maxRepair: b.repairs, strategy: "DEFAULT", accepted: b.finalAccepted === true, executionStatus: b.executionStatus, wallMs: b.buildMs, source: `${SRC.ISO}#modelGenerated.builds[id=${t.id}]` }));
    const rows = regime === "PRIOR" ? [] : jRows(s, t.id);
    const missionObservations = [...iso, ...rows.map((r: any) => ({ model: r.default.model, maxRepair: r.default.maxRepair, strategy: "DEFAULT", accepted: r.default.accepted === true, executionStatus: r.default.executionStatus, wallMs: r.default.wallMs, source: `${SRC.J}#rows[task=${t.id},trial=${r.trial}].default` }))];
    const parts = t.intermediateOracle.subproblems.map((sp: any, si: number) => ({
      id: sp.id, taskClass: t.type, taskClassSource: `${tcSrc} (inherited by part)`,
      writeSet: [`${t.id}/${sp.id}`], writeSetSource: `${SRC.J}#tasks[${ti}].intermediateOracle.subproblems[${si}].id`,
      independentCheck: sp.cases > 0, independentCheckSource: `${SRC.J}#tasks[${ti}].intermediateOracle.subproblems[${si}].cases=${sp.cases}`,
      observations: rows.flatMap((r: any) => arr(r.alternative && r.alternative.subproblems).filter((x: any) => x.id === sp.id).map((x: any) => ({ model: r.alternative.model, maxRepair: r.alternative.maxRepair, strategy: r.alternative.strategy, accepted: x.verified === true, executionStatus: x.executionStatus, source: `${SRC.J}#rows[task=${t.id},trial=${r.trial}].alternative.subproblems[id=${sp.id}]` }))),
    }));
    return { ...base, parts, missionObservations };
  });
}
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function buildF(s: any, regime: string): any {
  const t0 = s.F.trials[0];
  const real = s.F.trials.filter((t: any) => t.classification === "REAL");
  return {
    id: "v161-scenario-f-invoice-pipeline", family: "F",
    decomposition: { strategy: t0.decomposition.strategy, source: `${SRC.F}#trials[0].decomposition.strategy` },
    parts: s.F.task.parts.map((p: any, pi: number) => ({
      id: p.id, writeSet: t0.decomposition.writeSets[p.id], writeSetSource: `${SRC.F}#trials[0].decomposition.writeSets.${p.id}`,
      independentCheck: p.ownCases > 0, independentCheckSource: `${SRC.F}#task.parts[${pi}].ownCases=${p.ownCases}`,
      observations: regime === "PRIOR" ? [] : real.map((t: any) => ({ model: (t.assignments.find((a: any) => a.part === p.id) || {}).model, maxRepair: null, strategy: "DECOMPOSED", accepted: !!(t.receipt[p.id] && t.receipt[p.id].ownAccepted === true), executionStatus: t.receipt[p.id] && t.receipt[p.id].executionStatus, source: `${SRC.F}#trials[${t.trialId}].receipt.${p.id}.ownAccepted` })),
    })),
  };
}
function buildAP(s: any): any[] {
  return s.AP.contracts.map((c: any, i: number) => ({
    id: `AP-${c.scenario}`, family: "AP", authorizationState: c.state,
    writeSet: c.WORK_ITEM_CONTRACT.write_set, writeSetSource: `${SRC.AP}#contracts[${i}].WORK_ITEM_CONTRACT.write_set`,
  }));
}

function outcomeOf(s: any, m: any): any {
  if (m.family === "V159") { const pm = [s.V159.before.perMission[m.taskId], s.V159.after.perMission[m.taskId]]; const pass = pm.reduce((a: number, x: any) => a + x.passes, 0), n = pm.reduce((a: number, x: any) => a + x.n, 0); return { local: pass > 0 ? "SUCCESS" : "FAILURE", passes: pass, n, source: `${SRC.V159}#before/after.perMission.${m.taskId}` }; }
  if (m.family === "J") { const o = s.J.summary.perTask[m.taskId]; return { local: o.default.passes + o.alternative.passes > 0 ? "SUCCESS" : "FAILURE", passes: o.default.passes + o.alternative.passes, n: o.default.measured + o.alternative.measured, source: `${SRC.J}#summary.perTask.${m.taskId}` }; }
  if (m.family === "F") { const real = s.F.trials.filter((t: any) => t.classification === "REAL"); const acc = real.filter((t: any) => t.accepted === true).length; return { local: acc === real.length && acc > 0 ? "SUCCESS" : "FAILURE", passes: acc, n: real.length, source: `${SRC.F}#trials[classification=REAL].accepted` }; }
  return null;
}

function compact(sel: any): any {
  return { mode: sel.mode, tentativeMode: sel.tentativeMode, rule: sel.rule, rationale: sel.rationale, uncertainty: sel.uncertainty,
    authorizationRequired: sel.authorizationRequired, budgetRequired: sel.budgetRequired, providerExecutable: sel.providerExecutable, launchedBySelector: sel.launchedBySelector,
    fallbackChain: sel.fallbackChain, parts: sel.parts.map((p: any) => ({ id: p.id, qualification: p.qualification, localModel: p.localModel, basis: p.basis })),
    hybrid: { applicable: sel.perModeAssessment.HYBRID.applicable, nativeParts: sel.perModeAssessment.HYBRID.nativeParts, delegatedParts: sel.perModeAssessment.HYBRID.delegatedParts, refusedBecause: sel.perModeAssessment.HYBRID.refusedBecause },
    provider: { cost: sel.perModeAssessment.PROVIDER.cost, executable: sel.perModeAssessment.PROVIDER.executable },
    inputs: { planner: sel.inputs.planner, decomposable: sel.inputs.decomposable, writeSetDisjoint: sel.inputs.writeSetDisjoint, risk: sel.inputs.risk, deadline: sel.inputs.deadline },
    delegationRecords: sel.delegationRecords };
}

// ---- J replay through nextStrategyAfterFailure (D5) ----------------------------------------------------------------
function replayJ(s: any): any[] {
  return s.J.rows.map((r: any) => {
    const t = jTask(s, r.task);
    const partIds = t.intermediateOracle ? t.intermediateOracle.subproblems.map((x: any) => x.id) : [];
    const start = { mode: "NATIVE", strategy: "DEFAULT", model: r.default.model, maxRepair: r.default.maxRepair };
    const s1 = SEL.nextStrategyAfterFailure(start, { accepted: r.default.accepted, executionStatus: r.default.executionStatus, stopReason: r.default.stopReason, intermediateOracle: !!t.intermediateOracle });
    const alt = r.alternative || {};
    const subs = arr(alt.subproblems);
    const partsEv = partIds.map((id: string) => { const x = subs.find((y: any) => y.id === id); return x ? { id, verified: x.verified === true, stopReason: x.stopReason } : { id, verified: false, stopReason: null, notRun: true }; });
    const s2 = s1.next ? SEL.nextStrategyAfterFailure({ ...s1.next, tried: s1.tried }, { accepted: alt.accepted, executionStatus: alt.executionStatus, stopReason: alt.stopReason, parts: partsEv, decomposable: partIds.length >= 2, disjoint: partIds.length >= 2 }) : null;
    // structural continuation (HYPOTHETICAL failures, labelled): keep failing until the chain stops
    const chain = [SEL.strategyKey(start)]; let cur: any = s2; let guard = 0;
    if (s1.next) chain.push(SEL.strategyKey(s1.next));
    while (cur && cur.next && guard++ < 20) { chain.push(SEL.strategyKey(cur.next)); if (cur.next.mode === "DECISION_REQUIRED") break; cur = SEL.nextStrategyAfterFailure({ ...cur.next, tried: cur.tried }, { stopReason: "REPAIR_BUDGET_EXHAUSTED" }); }
    const reproduces = !!s1.next && s1.next.strategy === r.selection.strategy && s1.next.model === r.selection.model && s1.next.maxRepair === r.selection.maxRepair;
    return { task: r.task, trial: r.trial, recordedSelection: { strategy: r.selection.strategy, rule: r.selection.rule, model: r.selection.model, maxRepair: r.selection.maxRepair },
      step1: s1.next ? { key: SEL.strategyKey(s1.next), rule: s1.rule } : { key: null, rule: s1.rule }, reproducesJ: reproduces,
      step2: s2 && s2.next ? { key: SEL.strategyKey(s2.next), rule: s2.rule, reason: s2.reason } : null,
      chainWithHypotheticalContinuedFailures: chain, chainLength: chain.length, noRepeat: new Set(chain).size === chain.length, terminatesWithin: SEL.MAX_CHAIN };
  });
}

function build(): any {
  const s = loadSources();
  const ctx = { measured: s.measured, now: s.now };
  const missions: any[] = [];
  const fam = (regime: string) => [...buildV159(s, regime), ...buildJ(s, regime), buildF(s, regime)];
  const prior = fam("PRIOR"), current = fam("CURRENT");
  for (let i = 0; i < prior.length; i++) {
    const p = SEL.selectStrategyMode(prior[i], ctx), c = SEL.selectStrategyMode(current[i], ctx);
    missions.push({ id: prior[i].id, family: prior[i].family, observedOutcome: outcomeOf(s, prior[i]), prior: compact(p), current: compact(c), _full: [p, c] });
  }
  for (const m of buildAP(s)) { const c = SEL.selectStrategyMode(m, ctx); missions.push({ id: m.id, family: "AP", observedOutcome: null, prior: null, current: compact(c), _full: [c] }); }

  // sensitivity (NOT graded): F parts labelled with the hypothetical class 'implement' (the evidence has NO class label)
  const fHyp = buildF(s, "PRIOR"); fHyp.parts = fHyp.parts.map((p: any) => ({ ...p, taskClass: "implement", taskClassSource: "HYPOTHETICAL LABEL (sensitivity only — not evidence)" }));
  const sens = SEL.selectStrategyMode(fHyp, ctx);
  const replay = replayJ(s);

  // ---- grade D against the pre-registered criteria ----
  const all = missions.flatMap((m) => m._full);
  const provLike = all.filter((x: any) => ["PROVIDER", "HYBRID"].includes(x.mode) || ["PROVIDER", "HYBRID"].includes(x.tentativeMode));
  const D1 = provLike.every((x: any) => x.authorizationRequired && x.budgetRequired && !x.providerExecutable && x.launchedBySelector === false && x.delegationRecords.every((d: any) => d.state === "CREATED"));
  const hybrids = all.filter((x: any) => x.mode === "HYBRID");
  const D2 = hybrids.every((x: any) => x.inputs.decomposable && x.inputs.writeSetDisjoint && x.perModeAssessment.HYBRID.nativeParts.length >= 1 && x.perModeAssessment.HYBRID.delegatedParts.length >= 1);
  const fails = missions.filter((m) => m.observedOutcome && m.observedOutcome.local === "FAILURE");
  const succ = missions.filter((m) => m.observedOutcome && m.observedOutcome.local === "SUCCESS");
  const D3 = fails.length > 0 && fails.every((m) => m.prior.mode !== "NATIVE");
  const D4 = succ.length > 0 && succ.every((m) => m.prior.mode === "NATIVE");
  const D5 = replay.every((r: any) => r.reproducesJ && r.step2 && ["HYBRID", "PROVIDER"].includes(r.step2.key) && r.noRepeat && r.chainLength <= SEL.MAX_CHAIN + 1);
  const D6 = all.every((x: any) => x.parts.every((p: any) => [p.taskClass, p.writeSet, p.independentCheck].every((v: any) => v.status === "NOT_MEASURED" || (typeof v.source === "string" && v.source !== "UNCITED")))
    && (!x.parts.some((p: any) => p.qualification === "NOT_MEASURED") || x.inputs.missionObservations > 0 || x.uncertainty.level === "HIGH"));
  const res = (ok: boolean) => (ok ? "PASS" : "FAIL");
  const results = { D1: res(D1), D2: res(D2), D3: res(D3), D4: res(D4), D5: res(D5), D6: res(D6), D7: "NOT_MEASURED" };
  const structuralFail = ["D1", "D2", "D3", "D4", "D5", "D6"].some((k) => (results as any)[k] === "FAIL");
  const grade = structuralFail ? "FAIL" : (results.D7 === "PASS" ? "PASS" : "PARTIAL");
  for (const m of missions) delete m._full;

  const countBy = (regime: string) => { const c: any = {}; for (const m of missions) { const x = m[regime]; if (x) c[x.mode] = (c[x.mode] || 0) + 1; } return c; };
  return {
    schema: "V164_STRATEGY_MODE_SELECTION_EVIDENCE",
    directive: "owner V16.4 §4 sélecteur de stratégie (MODE NATIF / HYBRIDE / FOURNISSEUR) + §7 gap 'absence de mode hybride dans le sélecteur' + §10 scenario D",
    gapRef: `${SRC.CP8}#odgCapabilityAudit.3_chooseMode ("'hybrid' is not an option of the component")`,
    head: headOf(),
    evaluationInstant: new Date(s.now).toISOString(),
    evaluationInstantNote: "pinned = latest timestamp among the source evidence files (deterministic; registry freshness checked against it)",
    sources: Object.fromEntries(Object.entries(SRC).map(([k, rel]) => [k, { path: rel, sha256: sha(rel as string) }])),
    component: SEL.STRATEGY_MODE_SELECTOR_CONTRACT,
    rules: SEL.RULES,
    preRegistration: PRE_REGISTERED_D,
    missions,
    modeCounts: { prior: countBy("prior"), current: countBy("current") },
    jStrategyReplay: replay,
    sensitivity: { note: "NOT GRADED. F parts carry NO task-class label in the evidence; if they were labelled 'implement' (hypothetical), the class registry (implement ⇒ NO_QUALIFIED_LOCAL_MODEL) would drive the PRIOR choice:", mode: sens.mode, rule: sens.rule, rationale: sens.rationale, implication: sens.mode === "NATIVE" ? "unchanged" : "the selector would have delegated a mission native solved (4/4 trials accepted: 3 REAL + 1 CONTROLLED) ⇒ class-level 'implement' NO_QUALIFIED is pessimistic for small single-function parts; D4 passes only because F parts are unlabelled" },
    scenarioD: { results, grade, gradingRule: PRE_REGISTERED_D.gradingRule,
      retrospectiveVsProspective: "D3/D4/D5 are RETROSPECTIVE (consistency of the choice with outcomes observed before/after); no HYBRID or PROVIDER selection was executed (no provider call allowed, no hybrid run) ⇒ prospective correctness NOT_MEASURED ⇒ ceiling PARTIAL" },
    providerCalls: 0, modelCalls: 0,
    honestLimits: [
      "the selector CHOOSES only; nothing was executed by this run (no model, no provider, no network) — evidence is re-read from committed files",
      "D3 is driven mainly by the class-level registry verdict implement ⇒ NO_QUALIFIED_LOCAL_MODEL (V155, n=6 per model) plus prior observed failures; it shows the selector would not have repeated the failed local strategy, NOT that PROVIDER would have succeeded",
      "J per-part 'verified' verdicts came from an arm whose repair prompts partly saw expected outputs (V161 J honestLimits #1) ⇒ the HYBRID CURRENT choice for the 3 decomposed J tasks rests on that partly-advantaged evidence",
      "risk is NOT_MEASURED for every real record (no record declares a risk level) ⇒ uncertainty ≥ MEDIUM everywhere; no deadline was supplied by any record",
      "A–P contracts are scenario-level work items (state PROPOSED, placeholder write-sets) ⇒ DECISION_REQUIRED by rule M0; their tentativeMode is low-information (no task class, no observation)",
      "F part write-sets are the scenario's namespaced virtual paths; the real-repo supervisor refused (REFUSED_WRITESET_CONFLICT) — disjointness here is between the parts, not against the live repository",
      "authorization objects are declared data checked for binding (by/missionId/scope/evidenceRef), not cryptographically verified; no real record supplies one",
      "pre-registration lives in the same commit as the first evidence write; its precedence over the results is asserted, not cryptographically provable",
    ],
  };
}

function headOf(): string { try { return cp.execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return "UNKNOWN"; } }
function stripVolatile(o: any): any { const c = JSON.parse(JSON.stringify(o)); delete c.head; return c; }

function check(): number {
  let committed: any;
  try { committed = JSON.parse(fs.readFileSync(path.join(ROOT, OUT_REL), "utf8")); } catch (e: any) { process.stdout.write("CHECK FAILED: evidence unreadable\n"); return 1; }
  const fresh = build();
  const a = JSON.stringify(stripVolatile(committed)), b = JSON.stringify(stripVolatile(fresh));
  if (a !== b) { process.stdout.write("CHECK FAILED: committed evidence does not re-derive from the sources + selector\n"); return 1; }
  process.stdout.write(`CHECK OK (${fresh.missions.length} missions; D=${fresh.scenarioD.grade})\n`);
  return 0;
}

module.exports = { PRE_REGISTERED_D, build, check, replayJ, loadSources, OUT_REL };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes("--check")) process.exit(check());
  const ev = build();
  const json = JSON.stringify(ev, null, 2) + "\n";
  if (argv.includes("--write")) fs.writeFileSync(path.join(ROOT, OUT_REL), json);
  process.stdout.write(JSON.stringify({ modeCounts: ev.modeCounts, scenarioD: ev.scenarioD, missions: ev.missions.map((m: any) => [m.id, m.prior && m.prior.mode, m.current.mode, m.current.tentativeMode]) }, null, 1) + "\n");
}
export {};
