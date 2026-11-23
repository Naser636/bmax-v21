#!/usr/bin/env node
"use strict";
/* V16.4 — offline tests for odg-strategic-register + mission-priority-selector.selectNextExplained. Synthetic fixtures
 * (no network, no model); the REAL components are exercised (no mocks). */
const REG = require("./odg-strategic-register.js");
const SEL = require("./mission-priority-selector.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

const contract = (L: string, status: string, over: any = {}) => ({
  scenario: L, title: L + " — t", state: "PROPOSED", authorizedBy: null,
  initialState: Object.assign({ status, evidence: ["e1", "e2"], missingForPass: "something internal" }, over.initialState || {}),
  WORK_ITEM_CONTRACT: Object.assign({ objective: "do " + L, scope: "no VPS/systemd/deploy, no external spend", write_set: ["a.ts"], acceptance_criteria: ["x", "y"], stop_conditions: ["requires an owner-gated action (systemd, spend)"] }, over.wic || {}),
});
const v150 = (over: any = {}) => ({ sectionsStatus: [{ id: "§13", status: "PARTIALLY_VALIDATED", title: "13. KNOWLEDGE" }, { id: "§35", status: "PARTIALLY_VALIDATED", title: "35. PHASE 7 — AUTONOMIE NATIVE" }, { id: "§45", status: "PARTIALLY_VALIDATED", title: "§45 — BATTERIE DE DÉMONSTRATION DE L'AUTONOMIE" }, { id: "§30", status: "VALIDATED", title: "30. CONTINUITÉ" }],
  summary: Object.assign({ top10NextInternal: [{ rank: 1, item: "write CP", advances: ["§45"] }, { rank: 3, item: "use knowledge", advances: ["§13", "§30", "§45-G", "§45-D"] }, { rank: 9, item: "§54 release dossier without deployment", advances: ["§35"] }], alsoInternal: ["Scenario L: extend", "Wire heartbeat"], ownerGated: ["Production waves: systemd", "External providers: spend ceiling"] }, over) });
const cp8 = { v150Matrix: { note: "x; top10 items 1 (CP7) executed" }, prs: [{ pr: 1, merge: "abc", what: "CP7 + contracts", gates: "independent inspection ACCEPT" }], scenarios: { G: { status: "PARTIAL", criteria: { "used": "MET (yes)", "utility": "PARTIAL — not measured" } }, H: { status: "FAIL", criteria: { a: "NOT MET" } } }, globalResearch: { matrix: [{ card: "MC-1", org: "o", decision: "EXPERIMENT" }, { card: "MC-2", org: "o", decision: "DEFER" }] } };
const contracts = [contract("A", "PARTIAL", { wic: { acceptance_criteria: ["apply limited to an owner-authorized write-set"] } }), contract("B", "PASS"), contract("D", "PARTIAL"), contract("G", "PARTIAL"), contract("H", "PARTIAL"), contract("E", "PARTIAL"), contract("I", "PARTIAL", { initialState: { missingForPass: "needs scenario D first" } })];
const sources = (o: any = {}) => ({
  contracts: { path: "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json", data: { contracts: o.contracts || contracts } },
  v150: { path: "docs/odg/evidence/V150_TRACEABILITY_MATRIX.json", data: o.v150 || v150() },
  cp8: o.cp8 === null ? null : { path: "cp8.json", data: o.cp8 || cp8 },
  scenarioEvidence: o.scenarioEvidence || [{ path: "docs/odg/evidence/V160_SCENARIO_G.json", data: { scenario: "G", contract: "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#G" } }, { path: "docs/odg/evidence/V161_SCENARIO_H.json", data: { scenario: "V15.0 §45 H — x" } }, { path: "docs/odg/evidence/V150_SCENARIO_E_SELF_HEALING.json", data: { scenario: "V15.0 §45 E — self-healing" } }],
});
const R = REG.buildRegister(sources());
const it = (id: string) => R.items.find((x: any) => x.id === id);

// ── taxonomy mapping ──
check("PASS contract ⇒ PASS_IN_SCOPE (source initialState.status)", it("B").status === "PASS_IN_SCOPE" && it("B").statusSource.some((s: string) => /initialState\.status/.test(s)));
check("PARTIAL contract, not executed ⇒ PARTIAL", it("D").status === "PARTIAL");
check("executed V16x evidence + CP8 PARTIAL ⇒ EXECUTED_PARTIAL with remaining criterion as next step", it("G").status === "EXECUTED_PARTIAL" && it("G").nextStep.remainingCriteria.length === 1 && it("G").nextStep.remainingCriteria[0].criterion === "utility");
check("executed evidence + CP8 FAIL ⇒ FAILED", it("H").status === "FAILED");
check("SCN-1: pre-contract V150_SCENARIO_E file is ignored (E stays PARTIAL)", it("E").status === "PARTIAL" && R.sourcesUsed.preContractEvidenceIgnored.includes("docs/odg/evidence/V150_SCENARIO_E_SELF_HEALING.json"));
check("V150 ownerGated ⇒ BLOCKED + requiresOwnerAuthorization", R.items.filter((x: any) => x.kind === "V150_OWNER_GATED").length === 2 && R.items.filter((x: any) => x.kind === "V150_OWNER_GATED").every((x: any) => x.status === "BLOCKED" && x.requiresOwnerAuthorization));
check("CP8 method card DEFER ⇒ NOT_ADOPTED; EXPERIMENT ⇒ PROPOSED", it("MC-2").status === "NOT_ADOPTED" && it("MC-1").status === "PROPOSED");
check("top10 item listed executed by CP8 note + merged/inspected PR ⇒ ACCEPTED", it("V150-T01").status === "ACCEPTED");
check("top10 item not executed ⇒ PROPOSED (needs a contract)", it("V150-T09").status === "PROPOSED" && /WORK_ITEM_CONTRACT/.test(it("V150-T09").nextStep.text));
check("without CP8: executed G is still EXECUTED_PARTIAL (from the evidence file), never ACCEPTED", REG.buildRegister(sources({ cp8: null })).items.find((x: any) => x.id === "G").status === "EXECUTED_PARTIAL");
check("statusCounts cover the full taxonomy (incl. zero entries)", Object.keys(REG.STATUS).every((k) => typeof R.statusCounts[k] === "number") && Object.values(R.statusCounts).reduce((a: number, b: any) => a + b, 0) === R.itemCount);
check("every item has ≥1 status source pointer", R.items.every((x: any) => x.statusSource.length > 0));

// ── criteria discipline ──
check("every criterion is MEASURED(rule+source+number) or NOT_MEASURED(rule+reason, value null)", R.items.every((x: any) => Object.values(x.criteria).every((c: any) => c.status === "MEASURED" ? c.source.length > 0 && typeof c.value === "number" && /-\d$/.test(c.rule) : c.status === "NOT_MEASURED" && c.value === null && typeof c.reason === "string")));
check("CAP-1 counts only non-VALIDATED, non-§45 sections (§13 yes, §30 VALIDATED no) ⇒ 1/4", it("D").criteria.capabilityGain.value === 0.25);
check("STR-1 rank 3 ⇒ 0.8; alsoInternal-only ⇒ 0.05; absent ⇒ NOT_MEASURED", it("D").criteria.strategicValue.value === 0.8 && it("E").criteria.strategicValue.status === "NOT_MEASURED");
check("BLK/REL/SPD/REU are NOT_MEASURED for every item (no evidence field)", R.items.every((x: any) => ["blockerRepetitionReduction", "reliabilityQuality", "speedEfficiency", "reusability"].every((k) => x.criteria[k].status === "NOT_MEASURED")));
check("criteria rules are recorded for all 10 criteria", REG.CRITERIA.length === 10 && REG.CRITERIA.every((c: any) => /^[A-Z]{3}-\d: /.test(c.rule)));

// ── owner gating + dependencies ──
check("OWN-1: 'owner-authorized' in acceptance_criteria ⇒ requiresOwnerAuthorization", it("A").requiresOwnerAuthorization === true);
check("OWN-1: contract scope ('no VPS/systemd/deploy, no external spend') + stop_conditions are NOT scanned", it("D").requiresOwnerAuthorization === false);
check("OWN-1: 'without deployment' is a negation, not a flag", it("V150-T09").requiresOwnerAuthorization === false && REG.ownerMatches("needs a deployment").length === 1);
check("deps only when stated: 'needs scenario D first' ⇒ deps [D]; otherwise []", JSON.stringify(it("I").deps) === '["D"]' && it("D").deps.length === 0 && /no item-to-item dependency/.test(it("D").depsNote));
check("DEP-1 with no stated dependency ⇒ NOT_MEASURED (not availability 1)", it("D").criteria.dependencyAvailability.status === "NOT_MEASURED");

// ── selector (explained path) ──
const W = { a: 1, b: 1 };
const cand = (id: string, a: any, b: any, over: any = {}) => Object.assign({ id, status: "PARTIAL", deps: [], criteria: { a: a === null ? { status: "NOT_MEASURED", value: null } : { status: "MEASURED", value: a }, b: b === null ? { status: "NOT_MEASURED", value: null } : { status: "MEASURED", value: b } } }, over);
const s1 = SEL.scoreExplained(cand("X", 0.8, null), W, {});
check("NOT_MEASURED ⇒ 0 to evidence score + its weight to uncertainty (not 0.5)", s1.evidenceScore === 0.4 && s1.uncertainty === 0.5 && s1.upperBound === 0.9 && SEL.scoreExplained(cand("Y", 0.8, 0.5), W, {}).evidenceScore === 0.65);
check("LOWER_IS_BETTER criterion is inverted", SEL.scoreExplained(cand("X", 0.2, 1), W, { a: "LOWER_IS_BETTER" }).evidenceScore === 0.9);
const tie = SEL.selectNextExplained([cand("Z-b", 0.7, 0.7), cand("A-a", 0.7, 0.7)], { weights: W });
check("exact tie ⇒ DECISION_REQUIRED, selected null, tied set both, proposed rule — NO id tie-break", tie.decision === "DECISION_REQUIRED" && tie.selected === null && tie.tiedSet.length === 2 && /never break by id/.test(tie.proposedResolutionRule));
const tie2 = SEL.selectNextExplained([cand("Z", 0.7, 0.7), cand("A", 0.7, 0.7)].reverse(), { weights: W });
check("tie decision independent of candidate order", JSON.stringify(tie2.tiedSet.slice().sort()) === JSON.stringify(tie.tiedSet.slice().sort().map((x: string) => x.replace(/-.*/, ""))) && tie2.decision === "DECISION_REQUIRED");
const W3 = { a: 1, b: 1, costRiskComplexity: 1 };
const rc = (id: string, risk: number) => ({ id, status: "PARTIAL", deps: [], criteria: { a: { status: "MEASURED", value: 0.7 }, b: { status: "MEASURED", value: 0.7 }, costRiskComplexity: { status: "MEASURED", value: risk } } });
const t3 = SEL.selectNextExplained([rc("A", 0.5), rc("Z", 0.49)], { weights: W3, directions: { costRiskComplexity: "LOWER_IS_BETTER" } });
check("tie within epsilon resolved by a DECLARED rule (R3 lower risk) ⇒ TIE_EXPLAINED naming the rule; 'Z' wins over 'A' (not id)", t3.decision === "TIE_EXPLAINED" && t3.selected.id === "Z" && t3.resolvedBy === "R3_LOWER_RISK" && t3.resolutionSteps.length >= 1);
const og = SEL.selectNextExplained([cand("TOP", 1, 1, { requiresOwnerAuthorization: true, ownerReason: "spend" }), cand("LOW", 0.4, 0.4)], { weights: W });
check("owner-gated top candidate is ranked but NEVER auto-selected", og.selected.id === "LOW" && og.ownerAuthorizationRequired.some((x: any) => x.id === "TOP") && og.ranking[0].id === "TOP" && og.ranking[0].autoSelectable === false);
check("only owner-gated candidates ⇒ NO_ELIGIBLE", SEL.selectNextExplained([cand("TOP", 1, 1, { requiresOwnerAuthorization: true })], { weights: W }).decision === "NO_ELIGIBLE");
const unc = SEL.selectNextExplained([cand("U", 0.9, null), cand("V", 0.1, 0.1)], { weights: W, uncertaintyMax: 0.4 });
check("high uncertainty on the would-be choice ⇒ DECISION_REQUIRED with a PROPOSED candidate", unc.decision === "DECISION_REQUIRED" && unc.selected === null && unc.proposed.id === "U" && /uncertaintyMax/.test(unc.uncertaintyExplanation));
const ex = SEL.selectNextExplained([cand("EP", 0.6, 0.6, { status: "EXECUTED_PARTIAL" }), cand("AC", 1, 1, { status: "ACCEPTED" }), cand("PS", 1, 1, { status: "PASS_IN_SCOPE" }), cand("BL", 1, 1, { status: "BLOCKED" })], { weights: W });
check("EXECUTED_PARTIAL stays eligible; ACCEPTED/PASS_IN_SCOPE/BLOCKED excluded with reasons", ex.selected && ex.selected.id === "EP" && ex.excluded.length === 3 && ex.excluded.every((e: any) => typeof e.reason === "string"));
check("unmet dependency ⇒ excluded via the REUSED scoreMission gate", SEL.selectNextExplained([cand("D1", 1, 1, { deps: ["X"] })], { weights: W }).excluded[0].reason.includes("dependency unmet"));
check("explained output is frozen + marked proposal-only", Object.isFrozen(og) && og.isProposalOnly === true);

// ── end-to-end on the fixture register ──
const d = SEL.selectNextExplained(REG.toSelectorCandidates(R), { weights: REG.WEIGHTS, directions: REG.DIRECTIONS });
check("register → selector: never selects an owner-gated or non-selectable item", !d.selected || !it(d.selected.id).requiresOwnerAuthorization && !(it(d.selected.id).status in SEL.EXPLAINED_DEFAULTS.nonSelectableStatuses));
check("register → selector: deterministic", JSON.stringify(d) === JSON.stringify(SEL.selectNextExplained(REG.toSelectorCandidates(REG.buildRegister(sources())), { weights: REG.WEIGHTS, directions: REG.DIRECTIONS })));
check("malformed sources throw explicitly (no silent empty register)", (() => { try { REG.buildRegister({}); return false; } catch { return true; } })());

process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-strategic-register + selectNextExplained (taxonomy, EXECUTED_PARTIAL≠ACCEPTED, NOT_MEASURED⇒uncertainty, no id tie-break, owner-gated never auto-selected)" : f + " FAIL") + "\n");
process.exit(f === 0 ? 0 : 1);
export {};
