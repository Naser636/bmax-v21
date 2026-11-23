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
  NOT_ADOPTED: "tested under a stated rule and not adopted (re-test only with new data)",
  BLOCKED: "next step is owner-gated / external (V150 summary.ownerGated)",
  FAILED: "executed and graded FAIL",
  NOT_MEASURED: "current state cannot be derived from the evidence (overlap or completion not stated by any field)",
  PROPOSED: "listed as next work by a canonical source; no contract; not executed per the evidence",
});

const CRITERIA = Object.freeze([
  { name: "autonomyBenefit", direction: "HIGHER_IS_BETTER", rule: "AUT-1: value = min(1, n/2) where n = number of V150 sections the item advances whose sectionsStatus.title matches /AUTONOM/i; a §45 scenario contract always advances §45 ('BATTERIE DE DÉMONSTRATION DE L'AUTONOMIE'); items with no section mapping ⇒ NOT_MEASURED" },
  { name: "capabilityGain", direction: "HIGHER_IS_BETTER", rule: "CAP-1: value = min(1, n/4) where n = number of NON-§45 V150 sections in the advances of the top10NextInternal item(s) that reference the work item (a §45 contract X via '§45-X'), counting only sections whose sectionsStatus.status ≠ VALIDATED; not referenced by any top10 item ⇒ NOT_MEASURED" },
  { name: "blockerRepetitionReduction", direction: "HIGHER_IS_BETTER", rule: "BLK-0: NOT_MEASURED for every item — no canonical field links a work item to the blockers/repetitions its completion would remove (CP8.gaps and V150 blockers are not keyed to work items); topic keywords are not evidence of benefit" },
  { name: "reliabilityQuality", direction: "HIGHER_IS_BETTER", rule: "REL-0: NOT_MEASURED for every item — no evidence field records an expected reliability/quality gain per work item" },
  { name: "speedEfficiency", direction: "HIGHER_IS_BETTER", rule: "SPD-0: NOT_MEASURED for every item — no evidence field records an expected speed/efficiency gain per work item" },
  { name: "reusability", direction: "HIGHER_IS_BETTER", rule: "REU-0: NOT_MEASURED for every item — no evidence field records reuse of a work item's output by other items" },
  { name: "strategicValue", direction: "HIGHER_IS_BETTER", rule: "STR-1: value = (11 - rank)/10 for the best V150 summary.top10NextInternal rank that references the item; listed only in summary.alsoInternal (unranked, after the top 10) ⇒ 0.05; absent from both ⇒ NOT_MEASURED (absence is not evidence of low value)" },
  { name: "costRiskComplexity", direction: "LOWER_IS_BETTER", rule: "CRC-1: contracts only: value = min(1, (|acceptance_criteria| + |write_set|)/10 + (0.3 if an owner-gated step is stated)); items without a WORK_ITEM_CONTRACT ⇒ NOT_MEASURED (no declared scope to size)" },
  { name: "dependencyAvailability", direction: "HIGHER_IS_BETTER", rule: "DEP-1: only when the evidence STATES a dependency: value = satisfied/stated (an owner-authorization dependency is unsatisfied while contract.authorizedBy is null; an 'IN_PROGRESS elsewhere' dependency is satisfied only if a field states it landed); no stated dependency ⇒ deps [] and NOT_MEASURED" },
  { name: "evidenceLevel", direction: "HIGHER_IS_BETTER", rule: "EVD-1: value = min(1, k/4) where k = |initialState.evidence| (contracts) + 1 if an executed scenario evidence file references the item + 1 if CP8 grades it + 1 if CP8.v150Matrix.note lists it executed; items with no pointer ⇒ k = 0 (a count, measured)" },
]);

const WEIGHTS = Object.freeze(Object.fromEntries(CRITERIA.map((c) => [c.name, 1])));
const WEIGHTS_NOTE = "equal weights (1 each) DECLARED by the provider — no canonical source weights these criteria; owner may replace";
const DIRECTIONS = Object.freeze(Object.fromEntries(CRITERIA.map((c) => [c.name, c.direction])));

const OWNER_RE = /\bowner[- ](?:gated|authori[sz]ed|decision)|\bspend\b|\bbudget\b|\bbilling\b|\bpaid\b|\begress\b|\bsystemd\b|\bdeploy(?:ment)?\b|\bproduction\b|ROADMAP\.json|\bgovernance\b|\bBoussole\b/gi;
const OWNER_RULE = "OWN-1: requiresOwnerAuthorization iff /owner-gated|owner-authorized|owner decision|spend|budget|billing|paid|egress|systemd|deploy|production|ROADMAP.json|governance|Boussole/i matches the item's objective, acceptance_criteria or initialState.missingForPass (contracts) or its own text (other items), ignoring matches directly preceded by no/without/not/never; contract `scope` and `stop_conditions` are NOT scanned (they are negative lists / identical boilerplate on all 16 contracts)";

const SCN_RULE = "SCN-1: a scenario evidence file (contractRef/contract '#X' or scenario field naming X) counts as executed against contract X only if its basename version V<n>_ ≥ the contracts file's version; earlier files are pre-contract evidence already cited in initialState.evidence";

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
    else { status = "PARTIAL"; statusSource = [`${base}.initialState.status`]; nextStep = { text: init.missingForPass, source: `${base}.initialState.missingForPass` }; }
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
    for (const m of mfp.matchAll(/\bscenario ([A-P])\b/g)) if (m[1] !== L) deps.push(m[1]);
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

  // ── 5. CP8 method-card matrix ⇒ PROPOSED (EXPERIMENT) / NOT_ADOPTED (DEFER) ─────────────────────────────────────────
  const mc: any[] = P8 && P8.data.globalResearch && Array.isArray(P8.data.globalResearch.matrix) ? P8.data.globalResearch.matrix : [];
  mc.forEach((m: any, i: number) => {
    const ptr = `${pf}#globalResearch.matrix[${i}].decision`;
    const status = m.decision === "DEFER" ? "NOT_ADOPTED" : m.decision === "REJECT" ? "FAILED" : m.decision === "EXPERIMENT" ? "PROPOSED" : "NOT_MEASURED";
    const crit: any = Object.fromEntries(CRITERIA.map((c) => [c.name, notMeasured(c.rule.split(":")[0], "method card: no work-item field for this criterion")]));
    crit.evidenceLevel = measured(0, "EVD-1", [ptr], "k=0 (demonstration not run)");
    items.push({ id: String(m.card), kind: "CP8_METHOD_CARD", title: `${m.card} (${m.org})`, status, statusSource: [ptr, `${pf}#globalResearch.matrix[${i}].basis`], nextStep: status === "PROPOSED" ? { text: "run the card's demonstrationTest", source: `${pf}#globalResearch.matrix[${i}].basis` } : null, deps: [], depsNote: "no dependency stated ⇒ []", depsStated: [], requiresOwnerAuthorization: false, ownerReason: null, sectionsAdvanced: [], criteria: crit });
  });

  const statusCounts: any = Object.fromEntries(Object.keys(STATUS).map((s) => [s, 0]));
  for (const it of items) statusCounts[it.status] = (statusCounts[it.status] || 0) + 1;
  return deepFreeze({
    schema: "ODG_STRATEGIC_REGISTER/1",
    statusTaxonomy: STATUS,
    criteria: CRITERIA, weights: WEIGHTS, weightsNote: WEIGHTS_NOTE, ownerRule: OWNER_RULE,
    sourcesUsed: { contracts: cf, v150: vf, cp8: pf, scenarioEvidence: Object.keys(scen).sort().map((k) => ({ scenario: k, path: scen[k].path })), preContractEvidenceIgnored: ignoredEvidence, scenarioEvidenceRule: SCN_RULE },
    itemCount: items.length, statusCounts, items,
  });
}

/* toSelectorCandidates(register) — the exact candidate shape mission-priority-selector.selectNextExplained consumes. */
function toSelectorCandidates(register: any): any[] {
  return register.items.map((it: any) => ({ id: it.id, status: it.status, deps: it.deps, requiresOwnerAuthorization: it.requiresOwnerAuthorization, ownerReason: it.ownerReason, criteria: Object.fromEntries(Object.entries(it.criteria).map(([k, v]: any) => [k, { status: v.status, value: v.value }])) }));
}

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

module.exports = { buildRegister, toSelectorCandidates, scenarioLetter, ownerMatches, STATUS, CRITERIA, SCN_RULE, WEIGHTS, DIRECTIONS, WEIGHTS_NOTE, OWNER_RULE, STRATEGIC_REGISTER_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(STRATEGIC_REGISTER_CONTRACT, null, 2) + "\n"); }
export {};
