#!/usr/bin/env node
"use strict";

/*
 * V16.4 §3/§11 — ODG STRATEGIC REGISTER. PURE + deterministic builder of the canonical prioritization register for the
 * V15.0 work items, derived ONLY from committed evidence: the A–P WORK_ITEM_CONTRACTs (V160_AP_WORK_ITEM_CONTRACTS.json),
 * the V150 traceability matrix (sections, top10NextInternal.advances, alsoInternal, ownerGated), executed scenario
 * evidence files (V160_SCENARIO_G / V161_SCENARIO_F / V161_SCENARIO_J …) and checkpoint CP8 (scenario grading,
 * v150Matrix note, method-card matrix). Every status and every criterion value carries a source pointer (file + field)
 * and the id of the declared rule that produced it; a value no rule can derive is NOT_MEASURED (never a default).
 * Dependencies are recorded ONLY when evidence text states them. The register FEEDS the existing selector
 * (mission-priority-selector.selectNextExplained) — it is not a second scheduler or decision engine. Dual export.
 *
 * Honesty: the rule definitions and weights below were written by the technical provider (Claude Code); ODG's
 * components apply them mechanically. They are declared here so the owner can replace them.
 */

const STATUS = Object.freeze({
  ACCEPTED: "listed executed by CP8.v150Matrix.note AND a CP8.prs entry naming it records a merge + independent inspection ACCEPT (merge = the human integration act; ACCEPTED ≠ RELEASED)",
  PASS_IN_SCOPE: "contract initial state PASS within its declared scope (extensions recorded separately)",
  EXECUTED_PARTIAL: "executed (scenario evidence file exists) and graded PARTIAL — remains ELIGIBLE, never treated as ACCEPTED",
  PARTIAL: "contract initial state PARTIAL, not yet executed against its contract",
  NOT_STARTED: "contract initial state NOT_STARTED (nothing executed yet), not executed against its contract — selectable like PARTIAL, never upgraded to PARTIAL",
  NOT_ADOPTED: "tested under a stated rule and not adopted (re-test only with new data)",
  BLOCKED: "next step is owner-gated / external (V150 summary.ownerGated)",
  FAILED: "executed and graded FAIL",
  NOT_MEASURED: "current state cannot be derived from the evidence (overlap or completion not stated by any field)",
  PROPOSED: "listed as next work by a canonical source; no contract; not executed per the evidence",
  NOT_IMPLEMENTED: "CP8 odgCapabilityAudit status NOT_IMPLEMENTED (capability absent, possibly by design)",
  // V16.9 Phase 1 (CLOSE-1 / RES-1) — derived from committed closure / resolution records; never selectable; the prior status
  // is kept in the item's statusHistory (append-only); a negative grade is carried as recorded, never upgraded.
  CLOSED_PASS: "CLOSE-1: all scoped steps validated (odg-authorization-scope) and the committed criteria-validation record grades PASS",
  CLOSED_PARTIAL: "CLOSE-1: all scoped steps validated (odg-authorization-scope) and the committed criteria-validation record grades PARTIAL — closed as PARTIAL (further work = a new mission, not a re-grade)",
  CLOSED_FAIL: "CLOSE-1: all scoped steps validated (odg-authorization-scope) and the committed criteria-validation record grades FAIL — negative result preserved",
  CLOSED_NOT_MEASURED: "CLOSE-1: all scoped steps validated (odg-authorization-scope) and the committed criteria-validation record grades NOT_MEASURED",
  RESOLVED_BY_EVIDENCE: "RES-1: a committed resolution record (resolvesRegisterItem = this id, resolution.status FIXED, fixedBy.pr + 40-hex fixedBy.mergeCommit, ≥1 reproTests entry, an independent inspection reference ACCEPT, proof currency usable) states the item's subject fixed",
});

const CRITERIA = Object.freeze([
  { name: "autonomyBenefit", direction: "HIGHER_IS_BETTER", rule: "AUT-1: value = min(1, n/2) where n = number of V150 sections the item advances whose sectionsStatus.title matches /AUTONOM/i; a §45 scenario contract always advances §45 ('BATTERIE DE DÉMONSTRATION DE L'AUTONOMIE'); items with no section mapping ⇒ NOT_MEASURED" },
  { name: "capabilityGain", direction: "HIGHER_IS_BETTER", rule: "CAP-1: value = min(1, n/4) where n = number of NON-§45 V150 sections in the advances of the top10NextInternal item(s) that reference the work item (a §45 contract X via '§45-X'), counting only sections whose sectionsStatus.status ≠ VALIDATED; not referenced by any top10 item ⇒ NOT_MEASURED" },
  { name: "blockerRepetitionReduction", direction: "HIGHER_IS_BETTER", rule: "BLK-0: NOT_MEASURED for every non-capability-gap item — no canonical field links a work item to the blockers/repetitions its completion would remove (CP8.gaps and V150 blockers are not keyed to work items); topic keywords are not evidence of benefit. CP8 capability-gap items use BLK-2 (capabilityGapRules.benefit)" },
  { name: "reliabilityQuality", direction: "HIGHER_IS_BETTER", rule: "REL-0: NOT_MEASURED for every non-capability-gap item — no evidence field records an expected reliability/quality gain per work item. CP8 capability-gap items use REL-2 (capabilityGapRules.benefit)" },
  { name: "speedEfficiency", direction: "HIGHER_IS_BETTER", rule: "SPD-0: NOT_MEASURED for every item — no evidence field records an expected speed/efficiency gain per work item" },
  { name: "reusability", direction: "HIGHER_IS_BETTER", rule: "REU-0: NOT_MEASURED for every item — no evidence field records reuse of a work item's output by other items" },
  { name: "strategicValue", direction: "HIGHER_IS_BETTER", rule: "STR-1: value = (11 - rank)/10 for the best V150 summary.top10NextInternal rank that references the item; listed only in summary.alsoInternal (unranked, after the top 10) ⇒ 0.05; absent from both ⇒ NOT_MEASURED (absence is not evidence of low value)" },
  { name: "costRiskComplexity", direction: "LOWER_IS_BETTER", rule: "CRC-1: contracts only: value = min(1, (|acceptance_criteria| + |write_set|)/10 + (0.3 if an owner-gated step is stated)); items without a WORK_ITEM_CONTRACT ⇒ NOT_MEASURED (no declared scope to size)" },
  { name: "dependencyAvailability", direction: "HIGHER_IS_BETTER", rule: "DEP-1: only when the evidence STATES a dependency: value = satisfied/stated (an owner-authorization dependency is unsatisfied while contract.authorizedBy is null; an 'IN_PROGRESS elsewhere' dependency is satisfied only if a field states it landed); no stated dependency ⇒ deps [] and NOT_MEASURED. CP8 capability-gap items use DEP-2 (capabilityGapRules.benefit)" },
  { name: "evidenceLevel", direction: "HIGHER_IS_BETTER", rule: "EVD-1: value = min(1, k/4) where k = |initialState.evidence| (contracts) + 1 if an executed scenario evidence file references the item + 1 if CP8 grades it + 1 if CP8.v150Matrix.note lists it executed; items with no pointer ⇒ k = 0 (a count, measured); CP8 capability-gap items: k = 1 per CP8 pointer (odgCapabilityAudit entry, gaps entry) + 1 per merged later evidence file whose gapRef cites the item (LAND-1)" },
]);

const WEIGHTS = Object.freeze(Object.fromEntries(CRITERIA.map((c) => [c.name, 1])));
const WEIGHTS_NOTE = "equal weights (1 each) DECLARED by the provider — no canonical source weights these criteria; owner may replace";
const DIRECTIONS = Object.freeze(Object.fromEntries(CRITERIA.map((c) => [c.name, c.direction])));

const OWNER_RE = /\bowner[- ](?:gated|authori[sz]ed|decision)|\bspend\b|\bbudget\b|\bbilling\b|\bpaid\b|\begress\b|\bsystemd\b|\bdeploy(?:ment)?\b|\bproduction\b|ROADMAP\.json|\bgovernance\b|\bBoussole\b/gi;
const OWNER_RULE = "OWN-1: requiresOwnerAuthorization iff /owner-gated|owner-authorized|owner decision|spend|budget|billing|paid|egress|systemd|deploy|production|ROADMAP.json|governance|Boussole/i matches the item's objective, acceptance_criteria or initialState.missingForPass (contracts) or its own text (other items), ignoring matches directly preceded by no/without/not/never; contract `scope` and `stop_conditions` are NOT scanned (they are negative lists / identical boilerplate on all 16 contracts)";

const SCN_RULE = "SCN-1: a scenario evidence file (contractRef/contract '#X' or scenario field naming X) counts as executed against contract X only if its basename version V<n>_ ≥ the contracts file's version; earlier files are pre-contract evidence already cited in initialState.evidence";

const AS = require("./odg-authorization-scope.js");
const OCUR = require("./odg-observation-currency.js");   // V16.9 Phase 1b — RES-1 proof currency (composed)
const DEPG = require("./odg-register-dependency-graph.js");
const BREF = require("./odg-boussole-ref.js");   // V17.5 PRIORITY 3 — BREF-1 boussoleRef on every item (composed)   // V17.5 — item→item dependency edges (DEPG-1) + contention (CONT-1)

/*
 * V16.9 addendum Phase 1 — "Continuité vérifiable". Declared rules (provider-authored; ODG applies them mechanically):
 */
const CLOSE_RULE = "CLOSE-1: a WORK_ITEM_CONTRACT item whose contract carries an owner authorization block is CLOSED iff odg-authorization-scope.deriveAuthorizationScope(contract, committed {inspection, experiment, validation} records) is applicable, validates EVERY step of its declared sequence and has no current step; status = CLOSED_<grade> with <grade> = the VALIDATE_CRITERIA evidence scenarioGrade (the committed V*_<X>_CRITERIA_VALIDATION.json, R5b — bounded by the experiment outcome, never upgraded); any missing/invalid step ⇒ not closed (status from the earlier rules, closure.closed=false with the scope's reason). The pre-closure status is kept in statusHistory; criteria are kept (record preserved); CLOSED_* are non-selectable";
const RES_RULE = "RES-1: an item is RESOLVED_BY_EVIDENCE iff a committed evidence file carries top-level resolvesRegisterItem = the item id, resolution.status = 'FIXED', fixedBy.pr (integer), fixedBy.mergeCommit (40 hex) and ≥1 reproTests entry, AND (V16.9 Phase 1b, #949 LOW) an independent inspection reference (inspection.verdict ACCEPT, 40-hex inspection.inspectedHeadSha, distinct opaque inspectorSessionId/authorSessionId) AND odg-observation-currency.assessEvidenceCurrency usableAsProof over the injected sources.proofProbes (merge commit + inspected head exist in local git and are ancestors of main; no probe ⇒ refused); the file is cited; the earlier status is kept in statusHistory; a refused record is reported on the item (resolutionRefused) with its reason";
const CONTRADICTION_RULES = Object.freeze({
  "CTR-1": "GAP_STATED_FIXED: a CP8_CAPABILITY_GAP item whose status (before RES-1) is open while a PR record of a checkpoint LATER than CP8 (prs[*].what) contains one of the gap's usable blockerAnchors (anchor present in the gap's own CP8 text, normalized as BLK-2) AND the word 'fixed' ⇒ reported; resolved only by a RES-1 record (then state RESOLVED_BY_EVIDENCE + citation), never by the detector",
  "CTR-2": "CONTRACT_STATE_VS_CLOSURE: a CLOSE-1-closed item whose contract `state` does not contain 'CLOSED' (the contract state is never rewritten), OR a checkpoint mission<X>.status that does not start with the derived CLOSED_<grade> (or names a CLOSED_ state while CLOSE-1 does not close X) ⇒ reported, not resolved",
  "CTR-3": "STALE_CHECKPOINT_POINTER: a checkpoint pointer the register reads (declared BLOCKER_FIELDS / PR_RECORD_FIELDS record files) whose newest checkpoint number is below the newest committed checkpoint (docs/odg/evidence/*_CHECKPOINT_<n>.json, by number) ⇒ reported (the declared record sets are NOT extended automatically: that would change BLK-2/REL-2 inputs)",
});
const LATEST_CP_RULE = "LCP-1: the latest checkpoint is the committed docs/odg/evidence/*_CHECKPOINT_<n>.json with the highest <n> (discovered, not hard-coded); buildRegister uses sources.latestCheckpoint, else the highest-numbered checkpoint among the documents it was given";
function cpNumber(name: string): number { const m = /_CHECKPOINT_(\d+)\.json$/.exec(String(name)); return m ? Number(m[1]) : -1; }
/* latestCheckpointOf(names) — LCP-1 over a list of file names/paths; null when none is a checkpoint. */
function latestCheckpointOf(names: string[]): string | null {
  let best: string | null = null, bn = -1;
  for (const n of Array.isArray(names) ? names : []) { const k = cpNumber(n); if (k > bn) { bn = k; best = String(n).split(/[/:]/).pop() as string; } }
  return best;
}
/* discoverLatestCheckpoint() — load-time LCP-1 over the repository evidence directory (fs readdir only; null if absent). */
function discoverLatestCheckpoint(): string | null {
  try {
    const fs = require("fs"), path = require("path");
    let d = __dirname;
    for (let i = 0; i < 6; i++) { const ev = path.join(d, "docs", "odg", "evidence"); if (fs.existsSync(ev)) return latestCheckpointOf(fs.readdirSync(ev)); d = path.dirname(d); }
  } catch { /* no filesystem view ⇒ null */ }
  return null;
}

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function ownerMatches(text: string): string[] {
  const out: string[] = [];
  const re = new RegExp(OWNER_RE.source, "gi");
  let m: any;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (/\b(no|without|not|never)\s+$/i.test(before)) continue;
    out.push(m[0]);
  }
  return out;
}
function sectionId(a: string): string | null { const m = /^§(\d+)/.exec(String(a)); return m ? "§" + m[1] : null; }
function measured(value: number, rule: string, source: string[], basis: string): any { return { status: "MEASURED", value: Number(Math.min(1, Math.max(0, value)).toFixed(4)), rule, source, basis }; }
function notMeasured(rule: string, reason: string, source: string[] = []): any { return { status: "NOT_MEASURED", value: null, rule, source, reason }; }

/* executed scenario evidence file for contract letter X: contractRef/contract ending '#X', or scenario field naming X. */
function scenarioLetter(doc: any): string | null {
  if (!isObj(doc)) return null;
  const ref = String(doc.contractRef || doc.contract || "");
  const r = /#([A-P])\b/.exec(ref);
  if (r) return r[1];
  const s = /(?:^|§45 )([A-P])(?: —|$)/.exec(String(doc.scenario || ""));
  return s ? s[1] : null;
}

/*
 * buildRegister(sources) — sources: { contracts:{path,data}, v150:{path,data}, cp8:{path,data}|null,
 *   scenarioEvidence:[{path,data}] }. Returns a frozen { items, statusCounts, criteria, weights, ... }.
 */
function buildRegister(sources: any): any {
  const C = sources && sources.contracts ? sources.contracts : null;
  const V = sources && sources.v150 ? sources.v150 : null;
  const P8 = sources && sources.cp8 && isObj(sources.cp8.data) ? sources.cp8 : null;
  if (!C || !isObj(C.data) || !Array.isArray(C.data.contracts)) throw new Error("contracts source missing or malformed");
  if (!V || !isObj(V.data) || !isObj(V.data.summary) || !Array.isArray(V.data.sectionsStatus)) throw new Error("V150 matrix source missing or malformed");
  const cf = C.path, vf = V.path, pf = P8 ? P8.path : null;
  const sections: any = {};
  V.data.sectionsStatus.forEach((s: any, i: number) => { sections[s.id] = { status: s.status, title: s.title, blocker: s.blocker, idx: i }; });
  const top10: any[] = Array.isArray(V.data.summary.top10NextInternal) ? V.data.summary.top10NextInternal : [];
  const also: any[] = Array.isArray(V.data.summary.alsoInternal) ? V.data.summary.alsoInternal : [];
  const ownerGated: any[] = Array.isArray(V.data.summary.ownerGated) ? V.data.summary.ownerGated : [];
  const executedNote = P8 && P8.data.v150Matrix ? String(P8.data.v150Matrix.note || "") : "";
  const executedTop10 = new Map<number, string>(); // rank → label, from CP8.v150Matrix.note "top10 items 1 (CP7), 4 (F) … executed"
  { const m = /top10 items ([^;]*?) executed/.exec(executedNote); if (m) for (const n of m[1].matchAll(/(\d+)\s*\(([^)]*)\)/g)) executedTop10.set(Number(n[1]), n[2].trim()); }
  const scen: any = {};
  // SCN-1: an evidence file counts as EXECUTED-AGAINST-THE-CONTRACT only if its basename version V<n>_ is ≥ the contracts
  // file's version (V160): earlier files (V150_SCENARIO_E/L/M) are the pre-contract evidence already cited in initialState.
  const ver = (p: string) => { const m = /(?:^|\/)V(\d+)_[^/]*$/.exec(String(p)); return m ? Number(m[1]) : -1; };
  const cver = ver(cf);
  const ignoredEvidence: string[] = [];
  for (const e of (Array.isArray(sources.scenarioEvidence) ? sources.scenarioEvidence : []).slice().sort((a: any, b: any) => (a.path < b.path ? -1 : 1))) {
    const L = scenarioLetter(e.data);
    if (!L) continue;
    if (ver(e.path) < cver) { ignoredEvidence.push(e.path); continue; }
    scen[L] = e;
  }

  const sectionsOf = (advances: any[]) => Array.from(new Set((advances || []).filter((a) => !/^§45-/.test(String(a))).map(sectionId).filter(Boolean))) as string[];
  const refsTop10 = (letter: string) => top10.map((t, i) => ({ t, i })).filter(({ t }) => Array.isArray(t.advances) && t.advances.includes("§45-" + letter));
  const autonomyOf = (secs: string[], ptr: string[]) => {
    const hits = secs.filter((s) => sections[s] && /AUTONOM/i.test(sections[s].title));
    return measured(hits.length / 2, "AUT-1", ptr.concat(hits.map((s) => `${vf}#sectionsStatus[${sections[s].idx}].title`)), `sections advanced matching /AUTONOM/: [${hits.join(", ")}]`);
  };
  const capabilityOf = (secs: string[], ptr: string[]) => {
    const open = secs.filter((s) => s !== "§45" && sections[s] && sections[s].status !== "VALIDATED");
    return measured(open.length / 4, "CAP-1", ptr.concat(open.map((s) => `${vf}#sectionsStatus[${sections[s].idx}].status`)), `non-§45 sections advanced, not VALIDATED: [${open.join(", ")}]`);
  };
  const items: any[] = [];
  const statedText: any[] = [];   // V17.5 — the 'scenario X' statements, fed to DEPG-1 as STATED_TEXT edges

  // ── 1. A–P WORK_ITEM_CONTRACTs ──────────────────────────────────────────────────────────────────────────────────────
  C.data.contracts.forEach((x: any, ci: number) => {
    const L = String(x.scenario);
    const base = `${cf}#contracts[${ci}]`;
    const w = isObj(x.WORK_ITEM_CONTRACT) ? x.WORK_ITEM_CONTRACT : {};
    const init = isObj(x.initialState) ? x.initialState : {};
    const ev = scen[L] || null;
    const g = P8 && isObj(P8.data.scenarios) && isObj(P8.data.scenarios[L]) ? P8.data.scenarios[L] : null;
    const cp8Graded = !!(g && isObj(g.criteria));
    // status
    let status: string, statusSource: string[], nextStep: any;
    if (init.status === "PASS") { status = "PASS_IN_SCOPE"; statusSource = [`${base}.initialState.status`, `${base}.initialState.missingForPass`]; nextStep = { text: init.missingForPass, source: `${base}.initialState.missingForPass` }; }
    else if (ev && (!g || /PARTIAL/.test(String(g.status)))) {
      status = "EXECUTED_PARTIAL";
      statusSource = [`${ev.path}#${ev.data.contractRef ? "contractRef" : ev.data.contract ? "contract" : "scenario"}`].concat(g ? [`${pf}#scenarios.${L}.status`] : [`${base}.initialState.status`]);
      const remaining = cp8Graded ? Object.keys(g.criteria).filter((k) => !/^MET\b/.test(String(g.criteria[k]))).map((k) => ({ criterion: k, grade: g.criteria[k] })) : [];
      nextStep = cp8Graded ? { remainingCriteria: remaining, source: `${pf}#scenarios.${L}.criteria` } : { text: init.missingForPass, source: `${base}.initialState.missingForPass` };
    } else if (ev && g && /FAIL/.test(String(g.status))) { status = "FAILED"; statusSource = [`${pf}#scenarios.${L}.status`]; nextStep = null; }
    else if (init.status === "NOT_STARTED") { status = "NOT_STARTED"; statusSource = [`${base}.initialState.status`]; nextStep = { text: init.missingForPass, source: `${base}.initialState.missingForPass` }; }
    else { status = "PARTIAL"; statusSource = [`${base}.initialState.status`]; nextStep = { text: init.missingForPass, source: `${base}.initialState.missingForPass` }; }
    // CLOSE-1 (V16.9 Phase 1): closure from the committed scoped-step records, via the canonical odg-authorization-scope.
    let closure: any = null, statusHistory: any = null;
    if (isObj(x.authorization)) {
      const aev = isObj(sources.authorizationEvidence) && isObj(sources.authorizationEvidence[L]) ? sources.authorizationEvidence[L] : {};
      const sc = AS.deriveAuthorizationScope(x, { ...aev, probes: sources.proofProbes });   // R7 probes injected by the loader
      const vstep = sc.validatedSteps.find((v: any) => v.step === "VALIDATE_CRITERIA");
      const allDone = sc.applicable === true && sc.currentStep === null && sc.sequence.every((st: string) => sc.validatedSteps.some((v: any) => v.step === st));
      const vp = aev.validation && aev.validation.recordPath ? String(aev.validation.recordPath) : "criteria-validation record";
      if (allDone && vstep && /^(PASS|PARTIAL|FAIL|NOT_MEASURED)$/.test(String(vstep.evidence.scenarioGrade))) {
        const g = String(vstep.evidence.scenarioGrade);
        const prior = { status, source: statusSource.slice(), since: priorSince(statusSource, P8), rule: "status rules before CLOSE-1" };
        status = "CLOSED_" + g;
        statusSource = [`${vp}#scenarioGrade`, `${vp}#contractSha256`, `${vp}#experimentEvidence.experimentSha256`];
        const vdate = aev.validation && typeof aev.validation.date === "string" ? aev.validation.date : null;
        statusHistory = [prior, { status, source: statusSource.slice(), since: vdate ? { value: vdate, source: `${vp}#date` } : { value: null, source: `${vp} (no date field)` }, rule: "CLOSE-1" }];
        closure = { closed: true, rule: "CLOSE-1", grade: g, record: vp, contractSha256: sc.contractSha256, experimentSha256: vstep.evidence.experimentSha256, validatedSteps: sc.validatedSteps.map((v: any) => v.step), stepState: aev.validation && isObj(aev.validation.stepState) ? aev.validation.stepState : null, component: "odg-authorization-scope.deriveAuthorizationScope" };
        nextStep = { text: "closed — further work needs a NEW mission (not a re-grade, not a re-run)", source: `${vp}#stepState` };
      } else closure = { closed: false, rule: "CLOSE-1", currentStep: sc.currentStep || null, reason: sc.reason, component: "odg-authorization-scope.deriveAuthorizationScope" };
    }
    // owner authorization
    const scanned = [String(w.objective || ""), ...(Array.isArray(w.acceptance_criteria) ? w.acceptance_criteria : []).map(String), String(init.missingForPass || "")].join(" ‖ ");
    const om = ownerMatches(scanned);
    const requiresOwnerAuthorization = om.length > 0;
    // dependencies — only when stated
    const deps: any[] = [];
    const depsStated: any[] = [];
    const mfp = String(init.missingForPass || "");
    if (/owner-gated|owner-authori[sz]ed/i.test(mfp)) depsStated.push({ kind: "OWNER_AUTHORIZATION", text: (/[^;.]*owner-(?:gated|authori[sz]ed)[^;.]*/i.exec(mfp) || [""])[0].trim(), satisfied: x.authorizedBy ? true : false, source: `${base}.initialState.missingForPass`, satisfiedSource: `${base}.authorizedBy` });
    { const m = /([^;.]*)\(IN_PROGRESS elsewhere\)/.exec(mfp); if (m) depsStated.push({ kind: "OTHER_WORK", text: m[1].trim(), satisfied: false, satisfiedBasis: "no field of the contract states it landed (CP8 lists PRs but no field links them to this dependency)", source: `${base}.initialState.missingForPass` }); }
    for (const m of mfp.matchAll(/\bscenario ([A-P])\b/g)) if (m[1] !== L) { deps.push(m[1]); statedText.push({ from: L, to: m[1], source: `${base}.initialState.missingForPass` }); }
    // criteria
    const refs = refsTop10(L);
    const alsoIdx = also.findIndex((a) => new RegExp("^Scenario " + L + "\\b").test(String(a)));
    const secs = Array.from(new Set(["§45"].concat(...refs.map(({ t }) => sectionsOf(t.advances)))));
    const refPtr = refs.map(({ i }) => `${vf}#summary.top10NextInternal[${i}].advances`);
    const crit: any = {};
    crit.autonomyBenefit = autonomyOf(secs, [`${base}.scenario`].concat(refPtr));
    crit.capabilityGain = refs.length ? capabilityOf(secs, refPtr) : notMeasured("CAP-1", "not referenced by any V150 top10NextInternal item ('§45-" + L + "')", [`${vf}#summary.top10NextInternal`]);
    crit.blockerRepetitionReduction = notMeasured("BLK-0", "no canonical field links this item to blockers/repetitions removed");
    crit.reliabilityQuality = notMeasured("REL-0", "no evidence field records it");
    crit.speedEfficiency = notMeasured("SPD-0", "no evidence field records it");
    crit.reusability = notMeasured("REU-0", "no evidence field records it");
    if (refs.length) { const best = Math.min(...refs.map(({ t }) => Number(t.rank))); crit.strategicValue = measured((11 - best) / 10, "STR-1", refPtr.map((p) => p.replace(/\.advances$/, ".rank")), `best top10 rank ${best}`); }
    else if (alsoIdx >= 0) crit.strategicValue = measured(0.05, "STR-1", [`${vf}#summary.alsoInternal[${alsoIdx}]`], "listed in alsoInternal (unranked, after the top 10)");
    else crit.strategicValue = notMeasured("STR-1", "absent from top10NextInternal and alsoInternal", [`${vf}#summary`]);
    const ac = Array.isArray(w.acceptance_criteria) ? w.acceptance_criteria.length : 0, ws = Array.isArray(w.write_set) ? w.write_set.length : 0;
    crit.costRiskComplexity = measured((ac + ws) / 10 + (requiresOwnerAuthorization ? 0.3 : 0), "CRC-1", [`${base}.WORK_ITEM_CONTRACT.acceptance_criteria`, `${base}.WORK_ITEM_CONTRACT.write_set`], `|AC|=${ac}, |write_set|=${ws}, ownerGatedStep=${requiresOwnerAuthorization}`);
    crit.dependencyAvailability = depsStated.length ? measured(depsStated.filter((d) => d.satisfied).length / depsStated.length, "DEP-1", depsStated.map((d) => d.source), `${depsStated.filter((d) => d.satisfied).length}/${depsStated.length} stated dependencies satisfied`) : notMeasured("DEP-1", "no dependency stated in the evidence ⇒ deps [] (absence of a statement is not availability)", [`${base}.initialState.missingForPass`]);
    const evPtrs = Array.isArray(init.evidence) ? init.evidence.length : 0;
    const k = evPtrs + (ev ? 1 : 0) + (cp8Graded ? 1 : 0);
    crit.evidenceLevel = measured(k / 4, "EVD-1", [`${base}.initialState.evidence`].concat(ev ? [ev.path] : []).concat(cp8Graded ? [`${pf}#scenarios.${L}.criteria`] : []), `k=${k} (initialState.evidence ${evPtrs}${ev ? " + executed file" : ""}${cp8Graded ? " + CP8 grading" : ""})`);
    items.push({
      id: L, kind: "WORK_ITEM_CONTRACT", title: x.title, contractState: x.state, authorizedBy: x.authorizedBy || null,
      status, statusSource, nextStep, executedEvidence: ev ? ev.path : null,
      deps, depsNote: deps.length ? "item dependencies stated in initialState.missingForPass" : "no item-to-item dependency stated in the evidence ⇒ []",
      depsStated, requiresOwnerAuthorization, ownerReason: requiresOwnerAuthorization ? `OWN-1 matched [${om.join(", ")}] in objective/acceptance_criteria/missingForPass` : null,
      sectionsAdvanced: secs, criteria: crit,
      ...(closure ? { closure } : {}), ...(statusHistory ? { statusHistory } : {}),
    });
  });

  // ── 2. V150 top10 items not tied to a §45 scenario ──────────────────────────────────────────────────────────────────
  top10.forEach((t: any, i: number) => {
    if (!Array.isArray(t.advances) || t.advances.some((a: any) => /^§45-/.test(String(a)))) return; // covered by the contract
    const id = "V150-T" + String(t.rank).padStart(2, "0");
    const ptr = `${vf}#summary.top10NextInternal[${i}]`;
    const executed = executedTop10.has(Number(t.rank));
    const label = executedTop10.get(Number(t.rank)) || "";
    const mergedAccept = executed && label && P8 && Array.isArray(P8.data.prs) ? P8.data.prs.find((p: any) => String(p.what).includes(label) && p.merge && /inspection ACCEPT/.test(String(p.gates))) : null;
    const status = executed ? (mergedAccept ? "ACCEPTED" : "NOT_MEASURED") : "PROPOSED";
    const statusSource = executed ? [`${pf}#v150Matrix.note`].concat(mergedAccept ? [`${pf}#prs[pr=${mergedAccept.pr}].gates`] : []) : [`${ptr}.item`, `${pf || "CP8(absent)"}#v150Matrix.note (not listed executed)`];
    const om = ownerMatches(String(t.item));
    const secs = sectionsOf(t.advances);
    const crit: any = {
      autonomyBenefit: autonomyOf(secs, [`${ptr}.advances`]),
      capabilityGain: capabilityOf(secs, [`${ptr}.advances`]),
      blockerRepetitionReduction: notMeasured("BLK-0", "no canonical field links this item to blockers/repetitions removed"),
      reliabilityQuality: notMeasured("REL-0", "no evidence field records it"),
      speedEfficiency: notMeasured("SPD-0", "no evidence field records it"),
      reusability: notMeasured("REU-0", "no evidence field records it"),
      strategicValue: measured((11 - Number(t.rank)) / 10, "STR-1", [`${ptr}.rank`], `top10 rank ${t.rank}`),
      costRiskComplexity: notMeasured("CRC-1", "no WORK_ITEM_CONTRACT ⇒ no declared scope to size"),
      dependencyAvailability: notMeasured("DEP-1", "no dependency stated ⇒ deps []", [`${ptr}.item`]),
      evidenceLevel: measured((executed ? 1 : 0) / 4, "EVD-1", executed ? [`${pf}#v150Matrix.note`] : [`${ptr}`], `k=${executed ? 1 : 0}`),
    };
    items.push({ id, kind: "V150_TOP10_ITEM", title: t.item, status, statusSource, nextStep: status === "PROPOSED" ? { text: "author a WORK_ITEM_CONTRACT (none exists) — then PROPOSED → AUTHORIZED", source: `${ptr}.item` } : null, deps: [], depsNote: "no dependency stated in the evidence ⇒ []", depsStated: [], requiresOwnerAuthorization: om.length > 0, ownerReason: om.length ? `OWN-1 matched [${om.join(", ")}] in the item text` : null, sectionsAdvanced: secs, criteria: crit });
  });

  // ── 3. V150 alsoInternal items not tied to a §45 scenario ───────────────────────────────────────────────────────────
  also.forEach((a: any, i: number) => {
    if (/^Scenario [A-P]\b/.test(String(a))) return;
    const id = "V150-AI" + (i + 1);
    const ptr = `${vf}#summary.alsoInternal[${i}]`;
    const prior = /\b(V1\d\d)\b/.exec(String(a));
    const overlap = prior ? Object.values(scen).find((e: any) => JSON.stringify(e.data).toLowerCase().includes('"' + prior[1].toLowerCase() + "-")) as any : null;
    const status = overlap ? "NOT_MEASURED" : "PROPOSED";
    const om = ownerMatches(String(a));
    const depsStated: any[] = [];
    { const m = /After ([^,(]*?) lands/i.exec(String(a)); if (m) depsStated.push({ kind: "OTHER_WORK", text: m[1].trim(), satisfied: false, satisfiedBasis: "no field states it landed", source: ptr }); }
    const crit: any = {
      autonomyBenefit: notMeasured("AUT-1", "no section mapping in the source"),
      capabilityGain: notMeasured("CAP-1", "not a top10 item"),
      blockerRepetitionReduction: notMeasured("BLK-0", "no canonical field"),
      reliabilityQuality: notMeasured("REL-0", "no evidence field records it"),
      speedEfficiency: notMeasured("SPD-0", "no evidence field records it"),
      reusability: notMeasured("REU-0", "no evidence field records it"),
      strategicValue: measured(0.05, "STR-1", [ptr], "listed in alsoInternal"),
      costRiskComplexity: notMeasured("CRC-1", "no WORK_ITEM_CONTRACT"),
      dependencyAvailability: depsStated.length ? measured(0, "DEP-1", [ptr], "0/1 stated dependencies shown satisfied") : notMeasured("DEP-1", "no dependency stated ⇒ deps []", [ptr]),
      evidenceLevel: measured(0, "EVD-1", [ptr], "k=0"),
    };
    items.push({ id, kind: "V150_ALSO_INTERNAL", title: a, status, statusSource: overlap ? [ptr, `${overlap.path} (contains task ids prefixed '${prior![1].toLowerCase()}-': overlap exists, no field states this item complete)`] : [ptr], nextStep: null, deps: [], depsNote: "no item-to-item dependency stated ⇒ []", depsStated, requiresOwnerAuthorization: om.length > 0, ownerReason: om.length ? `OWN-1 matched [${om.join(", ")}]` : null, sectionsAdvanced: [], criteria: crit });
  });

  // ── 4. V150 owner-gated items ⇒ BLOCKED ─────────────────────────────────────────────────────────────────────────────
  ownerGated.forEach((g: any, i: number) => {
    const ptr = `${vf}#summary.ownerGated[${i}]`;
    const crit: any = Object.fromEntries(CRITERIA.map((c) => [c.name, notMeasured(c.rule.split(":")[0], "BLOCKED item — not scored for selection")]));
    items.push({ id: "V150-OG" + String(i + 1).padStart(2, "0"), kind: "V150_OWNER_GATED", title: g, status: "BLOCKED", statusSource: [ptr], nextStep: { text: "owner decision", source: ptr }, deps: [], depsNote: "owner-gated", depsStated: [{ kind: "OWNER_AUTHORIZATION", text: g, satisfied: false, source: ptr }], requiresOwnerAuthorization: true, ownerReason: "listed in V150 summary.ownerGated", sectionsAdvanced: [], criteria: crit });
  });

  // ── 6. CP8 capability gaps (odgCapabilityAudit entries ≠ OPERATIONAL + CP8.gaps, deduplicated by GAP_LINKS) ─────────
  const latestForDep2 = typeof sources.latestCheckpoint === "string" ? sources.latestCheckpoint : latestCheckpointOf((Array.isArray(sources.checkpointNames) ? sources.checkpointNames.map(String) : []).concat((Array.isArray(sources.checkpoints) ? sources.checkpoints : []).map((c: any) => c.path)).concat(pf ? [pf] : []).concat((Array.isArray(sources.benefitEvidence) ? sources.benefitEvidence : []).map((e: any) => e.path)));
  if (P8) for (const g of capabilityGapItems(P8, Array.isArray(sources.laterEvidence) ? sources.laterEvidence : [], Array.isArray(sources.benefitEvidence) ? sources.benefitEvidence : [], latestForDep2)) items.push(g);

  // ── 5. CP8 method-card matrix ⇒ PROPOSED (EXPERIMENT) / NOT_ADOPTED (DEFER) ─────────────────────────────────────────
  const mc: any[] = P8 && P8.data.globalResearch && Array.isArray(P8.data.globalResearch.matrix) ? P8.data.globalResearch.matrix : [];
  mc.forEach((m: any, i: number) => {
    const ptr = `${pf}#globalResearch.matrix[${i}].decision`;
    const status = m.decision === "DEFER" ? "NOT_ADOPTED" : m.decision === "REJECT" ? "FAILED" : m.decision === "EXPERIMENT" ? "PROPOSED" : "NOT_MEASURED";
    const crit: any = Object.fromEntries(CRITERIA.map((c) => [c.name, notMeasured(c.rule.split(":")[0], "method card: no work-item field for this criterion")]));
    crit.evidenceLevel = measured(0, "EVD-1", [ptr], "k=0 (demonstration not run)");
    items.push({ id: String(m.card), kind: "CP8_METHOD_CARD", title: `${m.card} (${m.org})`, status, statusSource: [ptr, `${pf}#globalResearch.matrix[${i}].basis`], nextStep: status === "PROPOSED" ? { text: "run the card's demonstrationTest", source: `${pf}#globalResearch.matrix[${i}].basis` } : null, deps: [], depsNote: "no dependency stated ⇒ []", depsStated: [], requiresOwnerAuthorization: false, ownerReason: null, sectionsAdvanced: [], criteria: crit });
  });

  // ── 7. V16.9 Phase 1: RES-1 resolutions + contradiction detectors (CTR-1..3) + LCP-1 ──────────────────────────────
  const cps: any[] = (Array.isArray(sources.checkpoints) ? sources.checkpoints : []).filter((c: any) => c && isObj(c.data)).slice().sort((a: any, b: any) => cpNumber(a.path) - cpNumber(b.path));
  const cpNames: string[] = (Array.isArray(sources.checkpointNames) ? sources.checkpointNames.map(String) : []).concat(cps.map((c: any) => c.path)).concat(pf ? [pf] : []).concat((Array.isArray(sources.benefitEvidence) ? sources.benefitEvidence : []).map((e: any) => e.path));
  const latestCp = typeof sources.latestCheckpoint === "string" ? sources.latestCheckpoint : latestCheckpointOf(cpNames);
  const p8n = pf ? cpNumber(pf) : 8;
  const resolutions = (Array.isArray(sources.resolutionEvidence) ? sources.resolutionEvidence : []).slice().sort((a: any, b: any) => (a.path < b.path ? -1 : 1));
  const contradictions: any[] = [];
  const addC = (it: any, c: any) => { contradictions.push({ item: it ? it.id : null, ...c }); if (it) { it.contradictions = (it.contradictions || []).concat([c]); } };
  for (const it of items) {
    const targeting = resolutions.filter((r: any) => isObj(r.data) && r.data.resolvesRegisterItem === it.id);
    const checks = targeting.map((r: any) => ({ r, c: resolutionCheck(r.data, sources.proofProbes) }));
    const resHit = checks.find((x: any) => x.c.ok);
    const res = resHit ? resHit.r : null;
    if (!res && checks.length) it.resolutionRefused = checks.map((x: any) => ({ rule: "RES-1", record: x.r.path, reason: x.c.reason, proofCurrency: x.c.proofCurrency }));
    const priorStatus = it.status, priorSource = it.statusSource.slice();
    if (res) {
      const since = typeof res.data.date === "string" ? { value: res.data.date, source: `${res.path}#date` } : { value: null, source: `${res.path} (no date field)` };
      it.statusHistory = (it.statusHistory || [{ status: priorStatus, source: priorSource, since: priorSince(priorSource, P8), rule: "status rules before RES-1" }]).concat([{ status: "RESOLVED_BY_EVIDENCE", source: [`${res.path}#resolvesRegisterItem`, `${res.path}#fixedBy.mergeCommit`], since, rule: "RES-1" }]);
      it.status = "RESOLVED_BY_EVIDENCE";
      it.statusSource = [`${res.path}#resolvesRegisterItem`, `${res.path}#resolution.status`, `${res.path}#fixedBy.mergeCommit`, `${res.path}#reproTests`];
      it.resolution = { rule: "RES-1", record: res.path, pr: res.data.fixedBy.pr, mergeCommit: res.data.fixedBy.mergeCommit, reproTests: res.data.reproTests.map((t: any) => (isObj(t) ? t.file : String(t))), inspectedHeadSha: res.data.inspection.inspectedHeadSha, proofCurrency: resHit.c.proofCurrency };
      it.nextStep = null;
    }
    // CTR-1
    if (it.kind === "CP8_CAPABILITY_GAP" && /^(PROPOSED|PARTIAL|NOT_IMPLEMENTED|NOT_MEASURED)$/.test(priorStatus)) {
      const link = GAP_LINKS.find((l: any) => l.id === it.id) || {};
      const own = normTxt([it.title].concat(it.cp8Gaps || []).join(" "));
      const anchors = (link.anchors || []).filter((a: string) => own.includes(normTxt(a)));
      for (const c of cps) {
        if (cpNumber(c.path) <= p8n || !Array.isArray(c.data.prs)) continue;
        c.data.prs.forEach((p: any, i: number) => {
          const w = String(p && p.what || "");
          const hit = anchors.filter((a: string) => normTxt(w).includes(normTxt(a)));
          if (hit.length && /\bfixed\b/i.test(w)) addC(it, { rule: "CTR-1", kind: "GAP_STATED_FIXED", a: `register status ${priorStatus}`, aSource: priorSource, b: w, bSource: `${c.path}#prs[${i}].what`, anchors: hit, state: res ? "RESOLVED_BY_EVIDENCE" : "OPEN", resolvedBy: res ? res.path : null, autoResolved: false });
        });
      }
    }
    // CTR-2
    if (it.kind === "WORK_ITEM_CONTRACT") {
      const ci = C.data.contracts.findIndex((x: any) => String(x.scenario) === it.id);
      const closed = !!(it.closure && it.closure.closed);
      if (closed && !/CLOSED/.test(String(it.contractState || ""))) addC(it, { rule: "CTR-2", kind: "CONTRACT_STATE_VS_CLOSURE", a: `contract state ${it.contractState}`, aSource: [`${cf}#contracts[${ci}].state`], b: `closure record grade ${it.closure.grade} (${it.status})`, bSource: [`${it.closure.record}#scenarioGrade`, `${it.closure.record}#stepState`], state: "OPEN", autoResolved: false, note: "the contract state is never rewritten by the register (odg-authorization-scope contractStateRewritten=false); a contract edit needs authorization" });
      for (const c of cps) {
        const m = c.data["mission" + it.id];
        if (!isObj(m) || typeof m.status !== "string") continue;
        const agrees = closed ? m.status.startsWith(it.status) : !/^CLOSED_/.test(m.status);
        if (!agrees) addC(it, { rule: "CTR-2", kind: "CHECKPOINT_MISSION_STATUS_VS_CLOSURE", a: `register status ${it.status}`, aSource: it.statusSource, b: `checkpoint mission${it.id}.status ${m.status}`, bSource: [`${c.path}#mission${it.id}.status`], state: "OPEN", autoResolved: false });
      }
    }
  }
  // CTR-3
  const declaredCps = Array.from(new Set(BLOCKER_FIELDS.concat(PR_RECORD_FIELDS).map((b: any) => b.file).filter((f: string) => cpNumber(f) >= 0))) as string[];
  const declaredNewest = latestCheckpointOf(declaredCps);
  if (latestCp && declaredNewest && cpNumber(declaredNewest) < cpNumber(latestCp)) addC(null, { rule: "CTR-3", kind: "STALE_CHECKPOINT_POINTER", a: `declared benefit record sets (blockerFields/prRecordFields) stop at ${declaredNewest}`, aSource: ["odg-strategic-register.BLOCKER_FIELDS", "odg-strategic-register.PR_RECORD_FIELDS"], b: `newest committed checkpoint ${latestCp} (LCP-1)`, bSource: [`docs/odg/evidence/${latestCp}`], state: "OPEN", autoResolved: false, note: "not extended automatically (would change BLK-2/REL-2 inputs); an owner/provider rule change is needed" });
  const latestDoc = latestCp ? (cps.find((c: any) => String(c.path).endsWith(latestCp)) || (Array.isArray(sources.benefitEvidence) ? sources.benefitEvidence : []).find((e: any) => String(e.path).endsWith(latestCp))) : null;
  const latestCheckpoint = { file: latestCp, rule: LATEST_CP_RULE, source: latestCp ? `docs/odg/evidence/${latestCp}` : null, declaredFieldsPresent: latestDoc ? { ownerQuestions: Array.isArray(latestDoc.data.ownerQuestions) } : null, dep2Note: latestDoc && !Array.isArray(latestDoc.data.ownerQuestions) ? `${latestCp} has no ownerQuestions field ⇒ DEP-2 finds no re-listed owner question ⇒ NOT_MEASURED (the rule is not widened to other fields)` : null };

  // ── 8. V17.5 DEPG-1: item→item dependency edges from explicit committed evidence (after every status rule, so a
  // STATED_TEXT edge reads the final status). deps[] = targets of UNSATISFIED edges (the selector's eligibility gate and
  // R1_MORE_UNBLOCKING read it); every edge is a stated dependency for DEP-1 (rule text unchanged, applied as declared).
  const DG = DEPG.deriveDependencyGraph({ contracts: C, executedEvidence: Object.fromEntries(Object.keys(scen).sort().map((k) => [k, { path: scen[k].path, field: scen[k].data.contractRef ? "contractRef" : scen[k].data.contract ? "contract" : "scenario" }])), evidence: sources.dependencyEvidence, statedText, itemStatus: Object.fromEntries(items.map((it: any) => [it.id, it.status])), items: items.map((it: any) => ({ id: it.id, kind: it.kind })) });
  for (const it of items) {
    it.dependencyGraph = DG.byItem[it.id];
    if (it.kind !== "WORK_ITEM_CONTRACT") continue;
    const all = DG.edges.filter((e: any) => e.from === it.id);
    const out = all.filter((e: any) => DG.dep1Kinds.includes(e.kind));   // prerequisites whose satisfaction can fail
    it.dependencyEdges = all;
    it.deps = Array.from(new Set(out.filter((e: any) => !e.satisfied).map((e: any) => e.to))).sort();
    const structural = all.length - out.length;
    it.depsNote = (!out.length ? "no item-to-item dependency stated in the evidence ⇒ []" : it.deps.length ? `DEPG-1: ${out.length} prerequisite edge(s); deps = the ${it.deps.length} unsatisfied target(s)` : `DEPG-1: ${out.length} prerequisite edge(s), all satisfied ⇒ deps [] (nothing to unblock)`) + (structural ? `; ${structural} structural CODE_IMPORT edge(s) recorded for fanOut only (not DEP-1)` : "");
    if (!out.length) continue;
    it.depsStated = it.depsStated.concat(out.map((e: any) => ({ kind: "ITEM_" + e.kind, item: e.to, text: `${e.kind} on ${e.to}${e.via ? ` via ${e.via}` : ""}`, satisfied: e.satisfied, satisfiedBasis: e.satisfiedBasis, source: e.source, targetSource: e.targetSource })));
    const sat = it.depsStated.filter((d: any) => d.satisfied).length;
    it.criteria.dependencyAvailability = measured(sat / it.depsStated.length, "DEP-1", Array.from(new Set(it.depsStated.map((d: any) => d.source))), `${sat}/${it.depsStated.length} stated dependencies satisfied (${it.depsStated.map((d: any) => `${d.kind}${d.item ? " " + d.item : ""}=${d.satisfied ? "satisfied" : "unsatisfied"}`).join(", ")})`);
  }
  const dependencyGraph = { rule: DG.rule, edgeKinds: DG.edgeKinds, completedStatuses: DG.completedStatuses, counts: DG.counts, fanOut: Object.fromEntries(Object.keys(DG.byItem).filter((k) => DG.byItem[k].status === "DERIVED").sort().map((k) => [k, { fanOut: DG.byItem[k].fanOut, dependents: DG.byItem[k].dependents, blockingFanOut: DG.byItem[k].blockingFanOut, blockingDependents: DG.byItem[k].blockingDependents }])), edges: DG.edges, contention: DG.contention, dep1Kinds: DG.dep1Kinds, structuralKinds: DG.structuralKinds, staleWriteSets: DG.staleWriteSets, independenceStated: DG.independenceStated, independenceNote: DG.independenceNote, notMeasuredKinds: Array.from(new Set(items.filter((it: any) => DG.byItem[it.id].status === "NOT_MEASURED").map((it: any) => it.kind))).sort() };

  // ── 9. V17.5 PRIORITY 3 BREF-1: a source-cited boussoleRef on EVERY item (after every status rule; read-only over the
  // committed boussole evidence — changes no status/criterion/selection) + the contract identity GO traces carry.
  const BREFS = BREF.deriveBoussoleRefs({ items, contracts: C, v150: V, evidence: sources.boussoleEvidence });
  for (const it of items) {
    it.boussoleRef = BREFS.get(it.id);
    if (it.kind !== "WORK_ITEM_CONTRACT") continue;
    const ci = C.data.contracts.findIndex((x: any) => String(x.scenario) === it.id);
    const x = C.data.contracts[ci];
    const auth = isObj(x.authorization) ? x.authorization : null;
    const orec = auth && typeof auth.source === "string" ? (/^(docs\/[^\s]+\.json)/.exec(auth.source) || [])[1] || null : null;
    it.contractRef = { contractSha256: AS.contractSha256(x), contractSource: `${cf}#contracts[${ci}]`, ownerRecord: orec, ownerRecordSource: orec ? `${cf}#contracts[${ci}].authorization.source` : null, ownerRecordReason: orec ? null : auth ? "authorization.source names no committed docs/*.json record" : "no authorization block (contract not owner-scoped)" };
  }
  const boussole = { rule: BREF.BREF_RULE, coverage: BREF.boussoleCoverage(items), contractRefRule: "CREF-1: WORK_ITEM_CONTRACT items carry contractRef {contractSha256 = odg-authorization-scope.contractSha256(contract entry), ownerRecord = the docs/*.json path that authorization.source starts with, else null + reason}", precedence: sources.boussoleEvidence && sources.boussoleEvidence.precedence && sources.boussoleEvidence.precedence.data && sources.boussoleEvidence.precedence.data.precedence ? { order: sources.boussoleEvidence.precedence.data.precedence.order, source: `${sources.boussoleEvidence.precedence.path}#precedence.order` } : null, sources: sources.boussoleEvidence ? Object.fromEntries(Object.entries(sources.boussoleEvidence).filter(([, v]: any) => v && v.path).map(([k, v]: any) => [k, v.path]).sort()) : {} };

  const statusCounts: any = Object.fromEntries(Object.keys(STATUS).map((s) => [s, 0]));
  for (const it of items) statusCounts[it.status] = (statusCounts[it.status] || 0) + 1;
  return deepFreeze({
    schema: "ODG_STRATEGIC_REGISTER/1",
    statusTaxonomy: STATUS,
    criteria: CRITERIA, weights: WEIGHTS, weightsNote: WEIGHTS_NOTE, ownerRule: OWNER_RULE,
    capabilityGapRules: { dedupe: GAP_DEDUP_RULE, owner: OWNER_RULE_GAP, landed: LAND_RULE, links: GAP_LINKS.map((l: any) => ({ id: l.id, audit: l.audit, gapRe: l.gapRe ? String(l.gapRe) : null, ownerQuestionRe: l.oqRe ? String(l.oqRe) : null, blockerAnchors: l.anchors || [] })), benefit: { blocker: BLK2_RULE, reliability: REL2_RULE, dependency: DEP2_RULE, blockerFields: BLOCKER_FIELDS, prRecordFields: PR_RECORD_FIELDS, latestCheckpoint: latestCp, notDerived: BENEFIT_NOT_DERIVED } },
    continuityRules: { closure: CLOSE_RULE, resolution: RES_RULE, latestCheckpoint: LATEST_CP_RULE, contradictions: CONTRADICTION_RULES, history: "append-only statusHistory [{status, source, since, rule}] on every item whose status CLOSE-1 or RES-1 changed; earlier statuses are never deleted" },
    latestCheckpoint,
    dependencyGraph,
    boussole,
    contradictions: { rules: CONTRADICTION_RULES, count: contradictions.length, detected: contradictions, note: "reported, never auto-resolved by the detector" },
    sourcesUsed: { contracts: cf, v150: vf, cp8: pf, laterEvidence: (Array.isArray(sources.laterEvidence) ? sources.laterEvidence : []).map((e: any) => e.path).sort(), benefitEvidence: (Array.isArray(sources.benefitEvidence) ? sources.benefitEvidence : []).map((e: any) => e.path).sort(), scenarioEvidence: Object.keys(scen).sort().map((k) => ({ scenario: k, path: scen[k].path })), preContractEvidenceIgnored: ignoredEvidence, scenarioEvidenceRule: SCN_RULE, authorizationEvidence: Object.keys(isObj(sources.authorizationEvidence) ? sources.authorizationEvidence : {}).sort().map((k) => ({ scenario: k, ...Object.fromEntries(["inspection", "experiment", "validation"].map((t) => [t, sources.authorizationEvidence[k][t] && sources.authorizationEvidence[k][t].recordPath ? sources.authorizationEvidence[k][t].recordPath : null])) })), resolutionEvidence: resolutions.map((r: any) => r.path), checkpoints: cps.map((c: any) => c.path), checkpointNames: (Array.isArray(sources.checkpointNames) ? sources.checkpointNames.map(String) : []).slice().sort() },
    itemCount: items.length, statusCounts, items,
  });
}

/*
 * CP8 CAPABILITY GAPS — one item per CP8.odgCapabilityAudit entry whose status ≠ OPERATIONAL and one per CP8.gaps entry
 * NOT linked to an audit entry. GAP_LINKS is a PROVIDER-AUTHORED, declared pairing table (DEDUP-1): a gap whose text
 * matches gapRe is the SAME gap as that audit entry (merged into one item, both cited); oqRe links a CP8.ownerQuestions
 * entry (an open owner question ⇒ owner authorization required). Criteria use the SAME rules as every other item.
 */
const GAP_LINKS: any[] = [
  { id: "CP8-GAP-1-selectNextMission", audit: "1_selectNextMission", anchors: ["ALREADY_PROVEN", "M0001"] },
  { id: "CP8-GAP-2-setPriorities", audit: "2_setPriorities", gapRe: /mission register/i, oqRe: /mission-priority-selector/i, anchors: ["strategicImportance", "priority attributes"] },
  { id: "CP8-GAP-3-chooseMode", audit: "3_chooseMode", anchors: ["hybrid"] },
  { id: "CP8-GAP-4-authorizeProvider", audit: "4_authorizeProvider", gapRe: /launch a provider/i, oqRe: /provider spend ceiling/i, anchors: ["provider launch", "spend ceiling"] },
  { id: "CP8-GAP-5-superviseExecution", audit: "5_superviseExecution", gapRe: /supervisor cannot assign/i, anchors: ["supervisor"] },
  { id: "CP8-GAP-6-recoverResults", audit: "6_recoverResults", anchors: ["converge"] },
  { id: "CP8-GAP-7-validateIndependently", audit: "7_validateIndependently", anchors: ["inspector identity"] },
  { id: "CP8-GAP-8-integrateResult", audit: "8_integrateResult", gapRe: /integration is human/i, anchors: ["integration", "auto-commit"] },
  { id: "CP8-GAP-9-chooseFollowing", audit: "9_chooseFollowing", anchors: ["M0001"] },
  { id: "CP8-GAP-executedPartialMapping", audit: null, gapRe: /EXECUTED_PARTIAL/, oqRe: /mission-priority-selector/i, anchors: ["EXECUTED_PARTIAL"] },
  { id: "CP8-GAP-canonicalDefectsJ", audit: null, gapRe: /decomposed-execution/i, oqRe: /canonical defects found by J/i, anchors: ["decomposed-execution", "repair-feedback"] },
];
const GAP_DEDUP_RULE = "DEDUP-1: provider-authored pairing table GAP_LINKS — a CP8.gaps entry matching a link's gapRe is the same gap as that link's odgCapabilityAudit entry (one item, both cited); a CP8.gaps entry matching no link becomes its own item (status PROPOSED, CP8 lists it open without an audit status)";
const OWNER_RULE_GAP = "OWN-2 (capability-gap items only; prior items keep OWN-1): requiresOwnerAuthorization iff the item's cited CP8 text matches /cryptograph|provider launch|launch a provider|billed|spend|auto-commit|commit\/merge|human\/coordinator-gated|\bhost\b|systemd|sudo|deploy/i (negation guard as OWN-1), OR OWN-1 matches, OR a CP8.ownerQuestions entry is linked (open owner question). No authorization is created or inferred.";
const LAND_RULE = "LAND-1: later evidence is reflected ONLY when a merged evidence file (V164+ other than this register's own output) carries a top-level gapRef naming 'odgCapabilityAudit.<key>' of the item; it is cited (landedEvidence) and counted in EVD-1, but the CP8 status is kept unless that file states a new status field for the gap (none does)";
/*
 * V16.7 — EVIDENCE-DERIVED BENEFIT MEASURES for CP8 capability-gap items (prior items keep BLK-0 / REL-0 / DEP-1 and are
 * untouched). Inputs are declared committed fields only (BLOCKER_FIELDS / PR_RECORD_FIELDS / LATEST_CHECKPOINT); the
 * attribution anchors in GAP_LINKS are provider-written but CONSTRAINED: an anchor counts only if it occurs in the gap's
 * own cited CP8 text (checked here), so a gap is never linked through a word it does not itself use. Zero attributed
 * records ⇒ NOT_MEASURED (absence from a declared record set is not evidence of no benefit) — never a default.
 */
const BLOCKER_FIELDS: any[] = Object.freeze([
  { file: "V163_CHECKPOINT_8.json", field: "hybridMethod.blockers[*]" },
  { file: "V163_CHECKPOINT_8.json", field: "nextAction" },
  { file: "V164_GO_CYCLE.json", field: "executionCandidates.schedulerEligibility[*].reason" },
  { file: "V164_GO_CYCLE.json", field: "executionCandidates.finding" },
  { file: "V166_CHECKPOINT_9.json", field: "openGaps[*]" },
  { file: "V166_CHECKPOINT_9.json", field: "go.realStateAtCP9" },
  { file: "V166_CHECKPOINT_9.json", field: "nextAction" },
  { file: "V167_V166_CLOSURE_DOSSIER.json", field: "nextMissionRecommended" },
].map((x) => Object.freeze(x))) as any;
const PR_RECORD_FIELDS: any[] = Object.freeze([
  { file: "V163_CHECKPOINT_8.json", field: "prs[*]", text: ["what", "gates"] },
  { file: "V166_CHECKPOINT_9.json", field: "prs[*]", text: ["what", "gates"] },
].map((x) => Object.freeze(x))) as any;
/* LCP-1: discovered at module load from docs/odg/evidence/*_CHECKPOINT_<n>.json (highest n) — no longer hard-coded (was
 * "V166_CHECKPOINT_9.json" until V16.9 Phase 1). buildRegister itself stays pure and uses sources.latestCheckpoint. */
const LATEST_CHECKPOINT: string | null = discoverLatestCheckpoint();
const BLK2_RULE = "BLK-2 (CP8 capability-gap items only): n = number of distinct committed BLOCKER RECORDS (the declared blockerFields — CP8-or-later evidence only, so blockers removed by the PRs CP8 lists are not counted; a record repeated in a later checkpoint counts again: repetition) attributed to the gap, counting AT MOST ONE per source file (several fields of one file restate one observation; every matched record is still cited); a record is attributed iff it names the gap's audit number in an 'audit #a/#b' reference, OR its normalized text (lower-case; runs of '_', '-', whitespace ⇒ one space) contains one of the gap's declared blockerAnchors, an anchor being USABLE only if it occurs (normalized) in the gap's own cited CP8 text; value = min(1, n/4) — the divisor 4 is PROVIDER-AUTHORED (no canonical source scales it): it is the number of distinct files in blockerFields, so a gap blocking in every declared file reaches 1, and it matches the n/4 scale of CAP-1/EVD-1; n = 0 ⇒ NOT_MEASURED (absence from the declared record set is not evidence of no benefit)";
const REL2_RULE = "REL-2 (CP8 capability-gap items only): r = number of independent-inspection REJECTs recorded in a CP8-or-later PR record (the declared prRecordFields) whose PR number the gap's own cited CP8 text cites as '#<n>' (the gap names that PR as its area's work); a record contributes the integer written immediately before 'REJECT' (optionally with one severity word, e.g. '2 HIGH REJECTs'); a REJECT mention without a count is UNCOUNTED (not guessed); value = min(1, r/4) — the divisor 4 is PROVIDER-AUTHORED (no canonical source scales it), chosen only to keep the n/4 scale of CAP-1/EVD-1/BLK-2; gap text cites no PR, or no counted REJECT ⇒ NOT_MEASURED";
const DEP2_RULE = "DEP-2 (CP8 capability-gap items only): a gap linked to a CP8.ownerQuestions entry (GAP_LINKS.oqRe) has that owner decision as its STATED dependency; it is UNSATISFIED (value 0/1) iff the latest checkpoint's ownerQuestions (latestCheckpoint) still lists a question matching the same oqRe; not re-listed ⇒ NOT_MEASURED (no field states it was resolved); no linked owner question ⇒ NOT_MEASURED (DEP-1)";
const BENEFIT_NOT_DERIVED = Object.freeze([
  "autonomyBenefit (AUT-1), capabilityGain (CAP-1), strategicValue (STR-1): no V150 section / top10 / alsoInternal entry references a CP8 capability gap",
  "speedEfficiency (SPD-0), reusability (REU-0): no committed field records a speed or reuse effect per gap",
  "costRiskComplexity (CRC-1): no WORK_ITEM_CONTRACT sizes a gap; the owner flag alone would give a size term of 0 by default, which is a default fill ⇒ NOT_MEASURED",
]);

const normTxt = (t: string) => String(t).toLowerCase().replace(/[_\-\s]+/g, " ").trim();
function fieldRecords(data: any, field: string): { ptr: string; value: any }[] {
  let cur: { ptr: string; value: any }[] = [{ ptr: "", value: data }];
  for (const seg of field.split(".")) {
    const m = /^([^[]+)(\[\*\])?$/.exec(seg);
    if (!m) return [];
    const next: { ptr: string; value: any }[] = [];
    for (const c of cur) {
      const v = c.value && typeof c.value === "object" ? c.value[m[1]] : undefined;
      if (v === undefined) continue;
      const p = (c.ptr ? c.ptr + "." : "") + m[1];
      if (m[2]) { if (Array.isArray(v)) v.forEach((x: any, i: number) => next.push({ ptr: `${p}[${i}]`, value: x })); }
      else next.push({ ptr: p, value: v });
    }
    cur = next;
  }
  return cur;
}
function benefitDocs(P8: any, benefit: any[]): Map<string, any> {
  const m = new Map<string, any>();
  const base = (p: string) => String(p).split(/[/:]/).pop() as string;
  m.set("V163_CHECKPOINT_8.json", P8); // the CP8 source, whatever its path (repo file or git:<ref>:<path> fallback)
  for (const e of benefit) if (e && isObj(e.data)) m.set(base(e.path), e);
  return m;
}
function auditRefs(text: string): number[] {
  const out: number[] = [];
  for (const m of String(text).matchAll(/audit\s+(#\d+(?:\s*\/\s*#?\d+)*)/gi)) for (const n of m[1].matchAll(/\d+/g)) out.push(Number(n[0]));
  return out;
}
function countRejects(text: string): { counted: number; uncounted: number } {
  let counted = 0, uncounted = 0;
  for (const m of String(text).matchAll(/(?:(\d+)\s+(?:[A-Z]+\s+)?)?REJECTs?\b/g)) { if (m[1]) counted += Number(m[1]); else uncounted += 1; }
  return { counted, uncounted };
}

function benefitCriteria(id: string, auditKey: string | null, ownText: string, oqRe: RegExp | null, docs: Map<string, any>, latestCheckpoint: string | null = LATEST_CHECKPOINT): any {
  const link = GAP_LINKS.find((L: any) => L.id === id) || {};
  const own = normTxt(ownText);
  const anchors = (link.anchors || []).filter((a: string) => own.includes(normTxt(a)));
  const auditNo = auditKey ? Number((/^(\d+)_/.exec(auditKey) || [])[1]) : NaN;
  // BLK-2
  const hits: any[] = [];
  for (const bf of BLOCKER_FIELDS) {
    const d = docs.get(bf.file);
    if (!d) continue;
    for (const r of fieldRecords(d.data, bf.field)) {
      if (typeof r.value !== "string") continue;
      const why: string[] = [];
      if (!Number.isNaN(auditNo) && auditRefs(r.value).includes(auditNo)) why.push(`audit #${auditNo}`);
      for (const a of anchors) if (normTxt(r.value).includes(normTxt(a))) why.push(`anchor '${a}'`);
      if (why.length) hits.push({ ptr: `${d.path}#${r.ptr}`, why });
    }
  }
  const files = Array.from(new Set(hits.map((h) => h.ptr.split("#")[0])));
  const blk = hits.length
    ? measured(files.length / 4, "BLK-2", hits.map((h) => h.ptr), `n=${files.length} source file(s) with ≥1 attributed blocker record (at most one counted per file; ${hits.length} record(s) cited): ${hits.map((h) => `${h.ptr} [${h.why.join(", ")}]`).join("; ")}`)
    : notMeasured("BLK-2", `no declared blocker record attributed (usable anchors [${anchors.join(", ")}]${Number.isNaN(auditNo) ? "" : `, audit #${auditNo}`}) — absence is not evidence of no benefit`, BLOCKER_FIELDS.map((b: any) => `${b.file}#${b.field}`));
  // REL-2
  const cited = Array.from(new Set(Array.from(String(ownText).matchAll(/#(\d{3,})\b/g)).map((m) => Number(m[1]))));
  const relHits: any[] = [];
  let uncounted = 0;
  for (const pf of PR_RECORD_FIELDS) {
    const d = docs.get(pf.file);
    if (!d) continue;
    for (const r of fieldRecords(d.data, pf.field)) {
      if (!isObj(r.value) || !cited.includes(Number(r.value.pr))) continue;
      const c = countRejects(pf.text.map((k: string) => String(r.value[k] || "")).join(" ‖ "));
      uncounted += c.uncounted;
      if (c.counted > 0) relHits.push({ ptr: `${d.path}#${r.ptr}`, pr: Number(r.value.pr), n: c.counted });
    }
  }
  const r = relHits.reduce((a, h) => a + h.n, 0);
  const rel = !cited.length ? notMeasured("REL-2", "the gap's cited CP8 text cites no PR number ⇒ no area-linked inspection record")
    : r > 0 ? measured(r / 4, "REL-2", relHits.map((h) => h.ptr), `r=${r} counted REJECTs in PR record(s) cited by the gap: ${relHits.map((h) => `#${h.pr}=${h.n}`).join(", ")}${uncounted ? `; ${uncounted} uncounted mention(s) ignored` : ""}`)
    : notMeasured("REL-2", `cited PR(s) [${cited.map((n) => "#" + n).join(", ")}] carry no counted REJECT in the declared PR records${uncounted ? ` (${uncounted} uncounted mention(s))` : ""}`);
  // DEP-2
  let dep: any, depStated: any = null;
  const latestName = latestCheckpoint || "(no checkpoint)";
  const latest = docs.get(latestName);
  if (!oqRe) dep = notMeasured("DEP-2", "no CP8 owner question linked ⇒ no dependency stated in the cited CP8 text ⇒ deps []");
  else {
    const oq = latest && Array.isArray(latest.data.ownerQuestions) ? latest.data.ownerQuestions.map(String) : [];
    const j = oq.findIndex((q: string) => oqRe.test(q));
    if (j >= 0) {
      const ptr = `${latest.path}#ownerQuestions[${j}]`;
      depStated = { kind: "OWNER_AUTHORIZATION", text: oq[j], satisfied: false, source: ptr, satisfiedBasis: "still listed open in the latest checkpoint (DEP-2)" };
      dep = measured(0, "DEP-2", [ptr], "0/1 stated dependencies satisfied (linked owner question still open in the latest checkpoint)");
    } else dep = notMeasured("DEP-2", `linked owner question not re-listed in ${latest ? latest.path : latestName + " (absent)"} ⇒ resolution not stated by any field`);
  }
  return { blk, rel, dep, depStated };
}

const OWN2_RE = /cryptograph|provider launch|launch a provider|billed|\bspend\b|auto-commit|commit\/merge|human\/coordinator-gated|\bhost\b|\bsystemd\b|\bsudo\b|\bdeploy/gi;
function own2Matches(text: string): string[] {
  const out: string[] = [];
  const re = new RegExp(OWN2_RE.source, "gi");
  let m: any;
  // NO negation guard here: CP8 audit text describes what is MISSING ("not cryptographically bound"), so a negated
  // match still names the owner-gated capability the gap needs.
  while ((m = re.exec(text)) !== null) out.push(m[0]);
  return out.concat(ownerMatches(text));
}

function capabilityGapItems(P8: any, later: any[], benefit: any[] = [], latestCheckpoint: string | null = null): any[] {
  const pf = P8.path, d = P8.data;
  const audit: any = isObj(d.odgCapabilityAudit) ? d.odgCapabilityAudit : {};
  const gaps: string[] = Array.isArray(d.gaps) ? d.gaps.map(String) : [];
  const oqs: string[] = Array.isArray(d.ownerQuestions) ? d.ownerQuestions.map(String) : [];
  const usedGaps = new Set<number>();
  const out: any[] = [];
  const docs = benefitDocs(P8, benefit);
  const mk = (id: string, auditKey: string | null, gi: number[], oi: number[], fallbackStatus: string, oqRe: RegExp | null = null) => {
    const a = auditKey ? audit[auditKey] : null;
    const rawStatus = a ? String(a.status) : null;
    const status = rawStatus ? (/^OPERATIONAL/.test(rawStatus) ? null : /^NOT_IMPLEMENTED/.test(rawStatus) ? "NOT_IMPLEMENTED" : /^PARTIAL/.test(rawStatus) ? "PARTIAL" : "NOT_MEASURED") : fallbackStatus;
    if (!status) return;
    const statusSource = (a ? [`${pf}#odgCapabilityAudit.${auditKey}.status`] : []).concat(gi.map((i) => `${pf}#gaps[${i}]`));
    const landed = later.filter((e: any) => auditKey && typeof e.data.gapRef === "string" && e.data.gapRef.includes("odgCapabilityAudit." + auditKey)).map((e: any) => ({ path: e.path, field: "gapRef", gapRef: e.data.gapRef }));
    const text = [a ? String(a.evidence) : "", ...gi.map((i) => gaps[i])].join(" \u2016 ");
    const om = own2Matches(text);
    const owner = om.length > 0 || oi.length > 0;
    const ownerReason = owner ? [om.length ? `OWN-2 matched [${om.join(", ")}] in the cited CP8 text` : null, oi.length ? `open owner question: ${oi.map((i) => `${pf}#ownerQuestions[${i}]`).join(", ")}` : null].filter(Boolean).join("; ") : null;
    const k = (a ? 1 : 0) + gi.length + landed.length;
    const nm = (rule: string, reason: string) => notMeasured(rule, reason);
    const bc = benefitCriteria(id, auditKey, text, oi.length ? oqRe : null, docs, latestCheckpoint || LATEST_CHECKPOINT);
    const crit: any = {
      autonomyBenefit: nm("AUT-1", "no V150 section mapping for a CP8 capability gap"),
      capabilityGain: nm("CAP-1", "not referenced by any V150 top10NextInternal item"),
      blockerRepetitionReduction: bc.blk,
      reliabilityQuality: bc.rel,
      speedEfficiency: nm("SPD-0", "no evidence field records it"),
      reusability: nm("REU-0", "no evidence field records it"),
      strategicValue: nm("STR-1", "absent from V150 top10NextInternal and alsoInternal"),
      costRiskComplexity: nm("CRC-1", "no WORK_ITEM_CONTRACT ⇒ no declared scope to size (the owner flag alone would be a default-filled size term)"),
      dependencyAvailability: bc.dep,
      evidenceLevel: measured(k / 4, "EVD-1", statusSource.concat(landed.map((l: any) => `${l.path}#gapRef`)), `k=${k} (${a ? "audit entry" : ""}${gi.length ? ` + ${gi.length} gaps entr${gi.length > 1 ? "ies" : "y"}` : ""}${landed.length ? ` + ${landed.length} landed evidence` : ""})`),
    };
    out.push({
      id, kind: "CP8_CAPABILITY_GAP", title: a ? `${auditKey}: ${a.evidence}` : gaps[gi[0]], status, statusSource,
      cp8Status: rawStatus, cp8Gaps: gi.map((i) => gaps[i]), landedEvidence: landed,
      landedNote: landed.length ? "later merged evidence cites this gap (LAND-1); CP8 status kept — no file states a new status for it" : "no merged later evidence file cites this gap via gapRef ⇒ CP8 status kept",
      nextStep: { text: a ? String(a.evidence) : gaps[gi[0]], source: statusSource[0] },
      deps: [], depsNote: bc.depStated ? "no item-to-item dependency stated ⇒ []; owner-decision dependency recorded in depsStated (DEP-2)" : "no dependency stated in the evidence ⇒ []", depsStated: bc.depStated ? [bc.depStated] : [],
      requiresOwnerAuthorization: owner, ownerReason, sectionsAdvanced: [], criteria: crit,
    });
  };
  for (const L of GAP_LINKS) {
    const gi = L.gapRe ? gaps.map((g, i) => (L.gapRe.test(g) ? i : -1)).filter((i) => i >= 0) : [];
    const oi = L.oqRe ? oqs.map((q, i) => (L.oqRe.test(q) ? i : -1)).filter((i) => i >= 0) : [];
    if (L.audit && !audit[L.audit]) continue;
    if (!L.audit && gi.length === 0) continue;
    gi.forEach((i) => usedGaps.add(i));
    mk(L.id, L.audit, gi, oi, "PROPOSED", L.oqRe || null);
  }
  // audit entries / gaps not covered by the table (CP8 changed) ⇒ own items, never dropped.
  Object.keys(audit).sort().forEach((key) => { if (!GAP_LINKS.some((L) => L.audit === key)) mk("CP8-GAP-" + key, key, [], [], "PROPOSED"); });
  gaps.forEach((g, i) => { if (!usedGaps.has(i) && !GAP_LINKS.some((L) => L.gapRe && L.gapRe.test(g))) mk("CP8-GAP-g" + (i + 1), null, [i], [], "PROPOSED"); });
  return out;
}

/* toSelectorCandidates(register) — the exact candidate shape mission-priority-selector.selectNextExplained consumes. */
function toSelectorCandidates(register: any): any[] {
  return register.items.map((it: any) => ({ id: it.id, status: it.status, deps: it.deps, requiresOwnerAuthorization: it.requiresOwnerAuthorization, ownerReason: it.ownerReason, criteria: Object.fromEntries(Object.entries(it.criteria).map(([k, v]: any) => [k, { status: v.status, value: v.value }])) }));
}

/* priorSince(statusSource, P8) — the dated source of a pre-closure status: CP8 date when CP8 is cited, else null (cited). */
function priorSince(src: string[], P8: any): any {
  if (P8 && src.some((s) => String(s).startsWith(P8.path + "#")) && typeof P8.data.date === "string") return { value: P8.data.date, source: `${P8.path}#date` };
  return { value: null, source: `${String(src[0] || "").split("#")[0]} (no date field)` };
}
/* resolutionCheck(doc, probes) — RES-1 check of a committed resolution record → { ok, reason, proofCurrency }.
 * V16.9 Phase 1b (#949 inspection LOW): besides the shape, the record must carry an INDEPENDENT INSPECTION reference
 * (inspection.verdict ACCEPT, 40-hex inspection.inspectedHeadSha, distinct opaque inspectorSessionId / authorSessionId)
 * and pass odg-observation-currency.assessEvidenceCurrency (fixedBy.mergeCommit + inspection.inspectedHeadSha exist in
 * local git and are ancestors of main; cited file hashes current) over the injected probes — no probe ⇒ refused. */
const SID = /^[A-Za-z0-9._:-]{8,128}$/;
function resolutionCheck(d: any, probes?: any): any {
  const no = (reason: string, cur: any = null) => ({ ok: false, reason, proofCurrency: cur });
  if (!(isObj(d) && typeof d.resolvesRegisterItem === "string" && isObj(d.resolution) && d.resolution.status === "FIXED" && isObj(d.fixedBy) && Number.isInteger(d.fixedBy.pr) && /^[0-9a-f]{40}$/.test(String(d.fixedBy.mergeCommit || "")) && Array.isArray(d.reproTests) && d.reproTests.length > 0)) return no("RES-1 shape: resolvesRegisterItem, resolution.status FIXED, fixedBy.pr, 40-hex fixedBy.mergeCommit and ≥1 reproTests required");
  const ins = d.inspection;
  if (!isObj(ins)) return no("RES-1: no independent inspection reference (inspection.{verdict, inspectedHeadSha, inspectorSessionId, authorSessionId}) — a resolution is never self-certified");
  if (ins.verdict !== "ACCEPT") return no(`RES-1: inspection verdict ${ins.verdict === undefined ? "absent" : ins.verdict} ≠ ACCEPT`);
  if (!/^[0-9a-f]{40}$/.test(String(ins.inspectedHeadSha || ""))) return no("RES-1: inspection.inspectedHeadSha (40 hex) missing");
  if (!SID.test(String(ins.inspectorSessionId || "")) || !SID.test(String(ins.authorSessionId || "")) || String(ins.inspectorSessionId) === String(ins.authorSessionId)) return no("RES-1: inspection lacks distinct opaque inspectorSessionId / authorSessionId (not independent)");
  const c = OCUR.assessEvidenceCurrency(d, probes, { requireCommitBinding: true });
  const cur = { status: c.status, usableAsProof: c.usableAsProof, counts: c.counts, blocking: c.blocking, rule: "odg-observation-currency.assessEvidenceCurrency" };
  if (!c.usableAsProof) return no(`RES-1 proof currency ${c.status}: ${c.reason}`, cur);
  return { ok: true, reason: "RES-1 satisfied (shape + inspection reference + proof currency)", proofCurrency: cur };
}
/* resolutionValid(doc, probes?) — boolean form of resolutionCheck (kept for callers). */
function resolutionValid(d: any, probes?: any): boolean { return resolutionCheck(d, probes).ok === true; }
function deepFreeze(o: any): any { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; }

const STRATEGIC_REGISTER_CONTRACT = Object.freeze({
  id: "V164-ODG-STRATEGIC-REGISTER", source: "owner directive V16.4 §3 + §11 ('commencer par le registre stratégique et le sélecteur')",
  composes: "mission-priority-selector.selectNextExplained (no second scheduler/orchestrator/decision engine)",
  invariants: Object.freeze([
    "every status and criterion value carries a source pointer + rule id; underivable ⇒ NOT_MEASURED, never a default",
    "EXECUTED_PARTIAL stays eligible with its remaining criterion as next step; never treated as ACCEPTED",
    "dependencies only when evidence text states them; otherwise [] with a note",
    "owner-gated / financial / external / governance items flagged requiresOwnerAuthorization (never auto-selected)",
    "rules and weights are provider-written and declared; the register is a PROPOSAL input, not an authorization",
  ]),
});

module.exports = { CLOSE_RULE, RES_RULE, CONTRADICTION_RULES, LATEST_CP_RULE, latestCheckpointOf, discoverLatestCheckpoint, cpNumber, resolutionValid, resolutionCheck, buildRegister, toSelectorCandidates, scenarioLetter, ownerMatches, STATUS, CRITERIA, SCN_RULE, GAP_LINKS, GAP_DEDUP_RULE, OWNER_RULE_GAP, LAND_RULE, capabilityGapItems, BLOCKER_FIELDS, PR_RECORD_FIELDS, LATEST_CHECKPOINT, BLK2_RULE, REL2_RULE, DEP2_RULE, BENEFIT_NOT_DERIVED, benefitCriteria, fieldRecords, auditRefs, countRejects, normTxt, WEIGHTS, DIRECTIONS, WEIGHTS_NOTE, OWNER_RULE, STRATEGIC_REGISTER_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(STRATEGIC_REGISTER_CONTRACT, null, 2) + "\n"); }
export {};
