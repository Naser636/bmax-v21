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
{ const RNS = REG.buildRegister(sources({ contracts: contracts.concat([contract("Q2", "NOT_STARTED")]) })); const q = RNS.items.find((x: any) => x.id === "Q2");
  check("NOT_STARTED contract, not executed ⇒ NOT_STARTED (not the PARTIAL fallback), source initialState.status, still selectable", q.status === "NOT_STARTED" && q.statusSource[0].endsWith("initialState.status") && RNS.statusCounts.NOT_STARTED === 1 && !("NOT_STARTED" in SEL.EXPLAINED_DEFAULTS.nonSelectableStatuses)); }
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
// OWN-1 clarification (V17.6, #1001 defect; fail-closed per #1003 inspection): only committed paths / component ids are exempt
check("OWN-1 clarif: a registered component id (odg-production-metric) and its committed path ⇒ no match", REG.ownerMatches("extend odg-production-metric with a recordRunMs field").length === 0 && REG.ownerMatches("edit `runtime/core/odg-production-metric.ts` and runtime/core/odg-production-metric.test.ts").length === 0);
for (const adv of ["deploy-to-production", "spend-the-budget-now", "spend/budget", "https://example.com/deploy", "deploy.sh", "production.deploy", "Deploy-To-Production", "ODG-PRODUCTION-METRIC", "runtime/core/odg-production-metric.ts/../../deploy.sh", "odg-production-metric-deploy"])
  check(`OWN-1 clarif ADVERSARIAL: '${adv}' (not a committed path / component id) ⇒ still gated`, REG.ownerMatches(adv).length >= 1 && REG.ownerMatches("x " + adv + " y").length === REG.ownerMatches(adv).length);
for (const prot of ["edit deploy/odg-mission-runner.service", "deploy/odg-recover.sudoers", "deploy/odg-rollback.sh", "deploy/odg-mission-runner.timer", "deploy/odg-backup.timer.candidate", "deploy/odg-resident-driver.service.d/v364-hardening.conf", "x.socket deploy", "deploy/README-systemd.md", "~/.config/systemd/user/odg-production.service", "runtime/governance/ROADMAP.json", "runtime/governance/constitution/RUNTIME_CONSTITUTION.md production", "docs/odg/closure-register.json deploy", "README.md deploy", "package.json production"])
  check(`OWN-1 clarif PROTECTED/non-module path: '${prot}' ⇒ still gated`, REG.ownerMatches(prot).length >= 1);
check("OWN-1 clarif: never-exempt guard beats the listing (even an injected committed id/path)", REG.isCommittedToken("deploy/odg-recover.sudoers", { paths: new Set(["deploy/odg-recover.sudoers"]), ids: new Set(["deploy/odg-recover.sudoers"]) }) === false && REG.isCommittedToken("odg-x.service", { paths: new Set(), ids: new Set(["odg-x.service"]) }) === false);
check("OWN-1 clarif: case-insensitive and consistent (deploy-to-production ≡ Deploy-To-Production)", REG.ownerMatches("deploy-to-production").length === REG.ownerMatches("Deploy-To-Production").length && REG.ownerMatches("Deploy-To-Production").length === 2);
check("OWN-1 clarif: fail closed — empty repository listing ⇒ no exemption", REG.ownerMatches("odg-production-metric", { paths: new Set(), ids: new Set() }).length === 1);
check("OWN-1 clarif: real prose 'mise en production' / 'deploy to production' / 'production deployment' ⇒ gated", REG.ownerMatches("mise en production du module").length === 1 && REG.ownerMatches("deploy to production").length === 2 && REG.ownerMatches("a production deployment").length === 2);
check("OWN-1 clarif: protected locations never exempt (ROADMAP.json, governance, systemd)", REG.ownerMatches("write runtime/governance/ROADMAP.json").length === 2 && REG.ownerMatches("~/.config/systemd/user/x.service").length === 1);
check("OWN-1 clarif: 'owner-gated' / 'owner-authorized' prose still matches", REG.ownerMatches("an owner-gated step; owner-authorized write-set").length === 2);
{ const RP = REG.buildRegister(sources({ contracts: contracts.concat([contract("P1", "PARTIAL", { wic: { acceptance_criteria: ["AC1 extend odg-production-metric (runtime/core/odg-production-metric.ts)"] } }), contract("P2", "PARTIAL", { wic: { acceptance_criteria: ["AC1 mise en production"] } })]) }));
  check("OWN-1 clarif: register item with path-only 'production' ⇒ not gated; prose 'mise en production' ⇒ gated; clarification recorded, rule text unchanged", RP.items.find((x: any) => x.id === "P1").requiresOwnerAuthorization === false && RP.items.find((x: any) => x.id === "P2").requiresOwnerAuthorization === true && RP.ownerRuleClarification === REG.OWN1_PATH_CLARIFICATION && RP.ownerRule === REG.OWNER_RULE && /^OWN-1: requiresOwnerAuthorization iff/.test(RP.ownerRule)); }
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

// ── CP8 capability gaps (V16.4 §3/§7) ──
const cp8g = Object.assign({}, cp8, {
  odgCapabilityAudit: { "1_selectNextMission": { status: "PARTIAL", evidence: "live tick selects M0001 only" }, "3_chooseMode": { status: "PARTIAL", evidence: "'hybrid' is not an option" }, "4_authorizeProvider": { status: "PARTIAL", evidence: "real provider launch NOT_IMPLEMENTED (billed, no verifiable spend ceiling)" }, "7_validateIndependently": { status: "PARTIAL", evidence: "inspector identity not cryptographically bound" }, "8_integrateResult": { status: "NOT_IMPLEMENTED (by design)", evidence: "commit/merge is human/coordinator-gated" }, "X_done": { status: "OPERATIONAL", evidence: "works" } },
  gaps: ["ODG cannot launch a provider", "integration is human", "something new and unlinked"],
  ownerQuestions: ["provider spend ceiling for pilot arm C?"],
});
const later = [{ path: "docs/odg/evidence/V164_STRATEGY_MODE_SELECTION.json", data: { gapRef: "docs/odg/evidence/V163_CHECKPOINT_8.json#odgCapabilityAudit.3_chooseMode (x)" } }];
const RG = REG.buildRegister(Object.assign(sources({ cp8: cp8g }), { laterEvidence: later }));
const gi = (id: string) => RG.items.find((x: any) => x.id === id);
const gapItems = RG.items.filter((x: any) => x.kind === "CP8_CAPABILITY_GAP");
check("gaps: one item per audit entry ≠ OPERATIONAL (OPERATIONAL entry dropped)", !gapItems.some((x: any) => /X_done/.test(x.id + x.title)) && ["1_selectNextMission", "3_chooseMode", "4_authorizeProvider", "7_validateIndependently", "8_integrateResult"].every((k) => gapItems.some((x: any) => x.statusSource.some((s: string) => s.endsWith(`odgCapabilityAudit.${k}.status`)))));
check("gaps: DEDUP-1 merges 'cannot launch a provider' into 4_authorizeProvider and 'integration is human' into 8 (both cited)", gi("CP8-GAP-4-authorizeProvider").cp8Gaps.length === 1 && gi("CP8-GAP-8-integrateResult").statusSource.some((s: string) => /gaps\[1\]/.test(s)));
check("gaps: an unlinked CP8 gap is never dropped ⇒ own PROPOSED item", gapItems.some((x: any) => x.status === "PROPOSED" && /something new/.test(x.title)));
check("gaps: status from the audit (PARTIAL / NOT_IMPLEMENTED), with source", gi("CP8-GAP-8-integrateResult").status === "NOT_IMPLEMENTED" && gi("CP8-GAP-1-selectNextMission").status === "PARTIAL" && RG.statusCounts.NOT_IMPLEMENTED === 1);
check("gaps: owner flags — spend/provider launch, crypto identity (negated text still flags), commit/merge, linked owner question", gi("CP8-GAP-4-authorizeProvider").requiresOwnerAuthorization && /ownerQuestions\[0\]/.test(gi("CP8-GAP-4-authorizeProvider").ownerReason) && gi("CP8-GAP-7-validateIndependently").requiresOwnerAuthorization && gi("CP8-GAP-8-integrateResult").requiresOwnerAuthorization && !gi("CP8-GAP-1-selectNextMission").requiresOwnerAuthorization && !gi("CP8-GAP-3-chooseMode").requiresOwnerAuthorization);
check("gaps: LAND-1 — gapRef in a later file is cited + counted, CP8 status kept", gi("CP8-GAP-3-chooseMode").landedEvidence.length === 1 && gi("CP8-GAP-3-chooseMode").status === "PARTIAL" && gi("CP8-GAP-3-chooseMode").criteria.evidenceLevel.value === 0.5 && gi("CP8-GAP-1-selectNextMission").criteria.evidenceLevel.value === 0.25);
check("gaps: no default fill — every criterion except evidenceLevel NOT_MEASURED with value null", gapItems.every((x: any) => Object.entries(x.criteria).every(([k, c]: any) => k === "evidenceLevel" ? c.status === "MEASURED" : c.status === "NOT_MEASURED" && c.value === null)));
check("gaps: no authorization created (authorizedBy absent, deps [])", gapItems.every((x: any) => !x.authorizedBy && x.deps.length === 0));
check("gaps: prior items byte-identical with or without the gap source", JSON.stringify(R.items) === JSON.stringify(RG.items.filter((x: any) => x.kind !== "CP8_CAPABILITY_GAP")) || JSON.stringify(REG.buildRegister(sources({ cp8: cp8g })).items.filter((x: any) => x.kind !== "CP8_CAPABILITY_GAP")) === JSON.stringify(RG.items.filter((x: any) => x.kind !== "CP8_CAPABILITY_GAP")));
const dg = SEL.selectNextExplained(REG.toSelectorCandidates(RG), { weights: REG.WEIGHTS, directions: REG.DIRECTIONS });
check("gaps: owner-gated gap items never selected; selectable gap items appear in ranking", !dg.selected || !gi(dg.selected.id) || !gi(dg.selected.id).requiresOwnerAuthorization && dg.ranking.some((r: any) => r.id === "CP8-GAP-3-chooseMode" && r.autoSelectable));

// ── V16.7 evidence-derived benefit measures for capability gaps (BLK-2 / REL-2 / DEP-2) ──
const cp8b = Object.assign({}, cp8g, {
  odgCapabilityAudit: Object.assign({}, cp8g.odgCapabilityAudit, { "1_selectNextMission": { status: "PARTIAL", evidence: "live tick selects M0001 only (ALREADY_PROVEN dedup)" }, "2_setPriorities": { status: "PARTIAL", evidence: "no canonical register supplies strategicImportance" }, "6_recoverResults": { status: "PARTIAL", evidence: "converge proven on real runs (#923); provider launched by the coordinator" }, "5_superviseExecution": { status: "PARTIAL", evidence: "odg-agent-supervisor refuses repo-mode assign" } }),
  hybridMethod: { blockers: ["C requires a provider launch with a verifiable spend ceiling — OWNER decision", "mission selection for the pilot not decidable by ODG (audit #1/#2)"] },
  nextAction: "until then ODG can autonomously select only M0001 (already proven ⇒ IDLE)",
  prs: cp8.prs.concat([{ pr: 923, merge: "x", what: "delegate converge (2 HIGH REJECTs fixed: a; b)", gates: "independent inspection ACCEPT" }, { pr: 924, merge: "y", what: "after the REJECTs listed in the PR history", gates: "" }]),
});
const cp9 = { path: "docs/odg/evidence/V166_CHECKPOINT_9.json", data: { openGaps: ["provider launch by ODG (no verifiable spend ceiling)", "cryptographic inspector identity (declared session ids only)", "sandboxed dispatch under /home", "integration (merge) still performed by the coordinating session"], ownerQuestions: ["provider spend ceiling"], nextAction: "halts", prs: [] } };
const goc = { path: "docs/odg/evidence/V164_GO_CYCLE.json", data: { executionCandidates: { schedulerEligibility: [{ reason: "NOT_PRE_AUTHORIZED: G" }, { reason: "ALREADY_PROVEN (dedup): M0001" }], finding: "allowlist holds only already-proven canaries" } } };
const RB = REG.buildRegister(Object.assign(sources({ cp8: cp8b }), { laterEvidence: later, benefitEvidence: [cp9, goc] }));
const bi = (id: string) => RB.items.find((x: any) => x.id === id);
const RB0 = REG.buildRegister(Object.assign(sources({ cp8: cp8b }), { laterEvidence: later }));
const bi0 = (id: string) => RB0.items.find((x: any) => x.id === id);
check("BLK-2: audit '#1/#2' reference + anchors (normalized: already-proven ≈ ALREADY_PROVEN) attribute 4 records in 2 files ⇒ n=2 ⇒ 0.5, every record cited", bi("CP8-GAP-1-selectNextMission").criteria.blockerRepetitionReduction.value === 0.5 && bi("CP8-GAP-1-selectNextMission").criteria.blockerRepetitionReduction.source.length === 4 && bi("CP8-GAP-1-selectNextMission").criteria.blockerRepetitionReduction.rule === "BLK-2");
check("BLK-2: two fields of ONE file count once (GO schedulerEligibility reason + finding ⇒ 1)", (() => { const one = REG.buildRegister(Object.assign(sources({ cp8: Object.assign({}, cp8b, { hybridMethod: { blockers: [] }, nextAction: "" }) }), { benefitEvidence: [goc] })).items.find((x: any) => x.id === "CP8-GAP-1-selectNextMission").criteria.blockerRepetitionReduction; return one.value === 0.25 && one.source.filter((p: string) => /V164_GO_CYCLE/.test(p)).length === 2; })());
check("BLK-2/REL-2 divisors declared provider-authored", /PROVIDER-AUTHORED/.test(REG.BLK2_RULE) && /PROVIDER-AUTHORED/.test(REG.REL2_RULE));
check("BLK-2: repetition across checkpoints counts (CP8 hybrid blocker + CP9 openGaps) ⇒ 4_authorizeProvider n=2 ⇒ 0.5", bi("CP8-GAP-4-authorizeProvider").criteria.blockerRepetitionReduction.value === 0.5);
check("BLK-2: audit reference alone attributes (#2) ⇒ 0.25", bi("CP8-GAP-2-setPriorities").criteria.blockerRepetitionReduction.value === 0.25);
check("BLK-2: an anchor absent from the gap's own CP8 text is UNUSABLE (8: 'auto-commit' not in fixture text; 'integration' is)", bi("CP8-GAP-8-integrateResult").criteria.blockerRepetitionReduction.value === 0.25 && /anchor 'integration'/.test(bi("CP8-GAP-8-integrateResult").criteria.blockerRepetitionReduction.basis) && !/auto-commit/.test(bi("CP8-GAP-8-integrateResult").criteria.blockerRepetitionReduction.basis));
check("BLK-2: no attributed record ⇒ NOT_MEASURED (never 0): 3_chooseMode, 5_superviseExecution", ["CP8-GAP-3-chooseMode", "CP8-GAP-5-superviseExecution"].every((id) => bi(id).criteria.blockerRepetitionReduction.status === "NOT_MEASURED" && bi(id).criteria.blockerRepetitionReduction.value === null));
check("REL-2: cited PR #923 with '2 HIGH REJECTs' ⇒ r=2 ⇒ 0.5; uncounted 'the REJECTs' never guessed", bi("CP8-GAP-6-recoverResults").criteria.reliabilityQuality.value === 0.5 && REG.countRejects("after the REJECTs listed").counted === 0 && REG.countRejects("after the REJECTs listed").uncounted === 1 && REG.countRejects("2 HIGH REJECTs fixed").counted === 2);
check("REL-2: gap citing no PR ⇒ NOT_MEASURED", bi("CP8-GAP-1-selectNextMission").criteria.reliabilityQuality.status === "NOT_MEASURED");
check("DEP-2: linked owner question still open in the latest checkpoint ⇒ 0/1 + depsStated; deps stay []", bi("CP8-GAP-4-authorizeProvider").criteria.dependencyAvailability.value === 0 && bi("CP8-GAP-4-authorizeProvider").depsStated.length === 1 && bi("CP8-GAP-4-authorizeProvider").deps.length === 0);
check("DEP-2: no linked owner question ⇒ NOT_MEASURED", bi("CP8-GAP-1-selectNextMission").criteria.dependencyAvailability.status === "NOT_MEASURED");
check("DEP-2: owner question not re-listed in the latest checkpoint ⇒ NOT_MEASURED (resolution not stated)", REG.buildRegister(Object.assign(sources({ cp8: cp8b }), { benefitEvidence: [{ path: cp9.path, data: Object.assign({}, cp9.data, { ownerQuestions: [] }) }, goc] })).items.find((x: any) => x.id === "CP8-GAP-4-authorizeProvider").criteria.dependencyAvailability.status === "NOT_MEASURED");
check("without benefit evidence: CP8 hybrid/nextAction/prs still attribute; CP9/GO-only records vanish (no fill)", bi0("CP8-GAP-7-validateIndependently").criteria.blockerRepetitionReduction.status === "NOT_MEASURED" && bi0("CP8-GAP-4-authorizeProvider").criteria.blockerRepetitionReduction.value === 0.25 && bi0("CP8-GAP-4-authorizeProvider").criteria.dependencyAvailability.status === "NOT_MEASURED");
check("no default fill: SPD/REU/STR/AUT/CAP/CRC stay NOT_MEASURED on every gap; every measured value cites ≥1 source", RB.items.filter((x: any) => x.kind === "CP8_CAPABILITY_GAP").every((x: any) => ["speedEfficiency", "reusability", "strategicValue", "autonomyBenefit", "capabilityGain", "costRiskComplexity"].every((k) => x.criteria[k].status === "NOT_MEASURED") && Object.values(x.criteria).every((c: any) => c.status !== "MEASURED" || c.source.length > 0)));
check("prior (non-gap) items byte-identical with and without benefit evidence", JSON.stringify(RB.items.filter((x: any) => x.kind !== "CP8_CAPABILITY_GAP")) === JSON.stringify(RG.items.filter((x: any) => x.kind !== "CP8_CAPABILITY_GAP")));
check("owner flags unchanged by benefit evidence", RB.items.filter((x: any) => x.kind === "CP8_CAPABILITY_GAP").every((x: any) => x.requiresOwnerAuthorization === bi0(x.id).requiresOwnerAuthorization));
check("benefit evidence is deterministic (order of benefitEvidence irrelevant)", JSON.stringify(RB) === JSON.stringify(REG.buildRegister(Object.assign(sources({ cp8: cp8b }), { laterEvidence: later, benefitEvidence: [goc, cp9] }))));
check("fieldRecords / auditRefs helpers", REG.fieldRecords({ a: { b: ["x", "y"] } }, "a.b[*]").map((r: any) => r.ptr).join() === "a.b[0],a.b[1]" && JSON.stringify(REG.auditRefs("(audit #1/#2)")) === "[1,2]" && REG.auditRefs("PR #923").length === 0);

// ── V16.9 Phase 1 — CLOSE-1 closures, RES-1 resolutions, CTR-1..3 contradictions, LCP-1 latest checkpoint ──────────────
{
  const SS = require("../bin/odg-strategic-select.ts");
  const AS = require("./odg-authorization-scope.js");
  const path = require("path");
  const ROOT = path.resolve(__dirname, "..", "..");
  // V16.9 R7: the loader's proofProbes are functions (not JSON-cloneable) — the clone keeps the SAME probe object.
  const clone = (o: any) => { const c = JSON.parse(JSON.stringify(o)); if (o && o.proofProbes) c.proofProbes = o.proofProbes; return c; };
  const real = SS.loadSources(ROOT);
  const { inputs: _in, ...rs } = real;
  const RR = REG.buildRegister(rs);
  const ri = (reg: any, id: string) => reg.items.find((x: any) => x.id === id);
  // closure derivation on the REAL committed records
  check("CLOSE-1 real: G (4/4 steps validated, graded PARTIAL) ⇒ CLOSED_PARTIAL citing V166_G_CRITERIA_VALIDATION.json#scenarioGrade", ri(RR, "G").status === "CLOSED_PARTIAL" && ri(RR, "G").statusSource[0] === "docs/odg/evidence/V166_G_CRITERIA_VALIDATION.json#scenarioGrade" && ri(RR, "G").closure.closed === true && ri(RR, "G").closure.validatedSteps.length === 4);
  check("CLOSE-1 real: H (4/4 validated, graded FAIL) ⇒ CLOSED_FAIL — negative result preserved, never upgraded", ri(RR, "H").status === "CLOSED_FAIL" && ri(RR, "H").closure.grade === "FAIL" && /V168_H_CRITERIA_VALIDATION\.json#scenarioGrade/.test(ri(RR, "H").statusSource[0]));
  check("append-only history: G keeps EXECUTED_PARTIAL (CP8-dated) then CLOSED_PARTIAL (validation date); H keeps PARTIAL then CLOSED_FAIL", JSON.stringify(ri(RR, "G").statusHistory.map((h: any) => h.status)) === '["EXECUTED_PARTIAL","CLOSED_PARTIAL"]' && ri(RR, "G").statusHistory[0].since.value === "2026-11-23" && ri(RR, "G").statusHistory[1].since.source === "docs/odg/evidence/V166_G_CRITERIA_VALIDATION.json#date" && JSON.stringify(ri(RR, "H").statusHistory.map((h: any) => h.status)) === '["PARTIAL","CLOSED_FAIL"]' && ri(RR, "H").statusHistory[0].since.value === null && ri(RR, "H").statusHistory.every((h: any) => h.source.length > 0 && typeof h.rule === "string"));
  check("closed items keep their record (criteria kept, not deleted)", Object.keys(ri(RR, "H").criteria).length === REG.CRITERIA.length && RR.items.some((x: any) => x.id === "G"));
  // partial steps ⇒ not closed
  const noVal = clone(rs); noVal.authorizationEvidence.H.validation = null;
  const RNV = REG.buildRegister(noVal);
  check("CLOSE-1: H without its criteria-validation record (3/4 steps) ⇒ NOT closed (PARTIAL), closure.closed=false at VALIDATE_CRITERIA", ri(RNV, "H").status === "PARTIAL" && ri(RNV, "H").closure.closed === false && ri(RNV, "H").closure.currentStep === "VALIDATE_CRITERIA" && !ri(RNV, "H").statusHistory);
  const noExp = clone(rs); noExp.authorizationEvidence.H.experiment = null; noExp.authorizationEvidence.H.validation = null;
  check("CLOSE-1: H at RUN_CONTROLLED_EXPERIMENTS (2/4) ⇒ not closed", ri(REG.buildRegister(noExp), "H").closure.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && !/^CLOSED_/.test(ri(REG.buildRegister(noExp), "H").status));
  check("CLOSE-1: no authorization evidence at all ⇒ G/H keep the earlier statuses (EXECUTED_PARTIAL / PARTIAL)", (() => { const r = REG.buildRegister({ ...rs, authorizationEvidence: {} }); return ri(r, "G").status === "EXECUTED_PARTIAL" && ri(r, "H").status === "PARTIAL"; })());
  // upgrade refused / CLOSED_PASS on a labelled fixture
  const upg = clone(rs); upg.authorizationEvidence.H.validation.scenarioGrade = "PASS";
  check("negative grade preserved: a validation record claiming PASS over a FAIL experiment is refused (R5b) ⇒ NOT CLOSED_PASS", ri(REG.buildRegister(upg), "H").status === "PARTIAL" && ri(REG.buildRegister(upg), "H").closure.closed === false);
  const pass = clone(rs); pass.authorizationEvidence.H.experiment.outcome = "PASS"; pass.authorizationEvidence.H.validation.scenarioGrade = "PASS"; pass.authorizationEvidence.H.validation.experimentEvidence.experimentSha256 = AS.experimentSha256(pass.authorizationEvidence.H.experiment);
  check("labelled fixture: experiment PASS + validation PASS re-bound ⇒ CLOSED_PASS (grade carried as recorded)", ri(REG.buildRegister(pass), "H").status === "CLOSED_PASS");
  // not selectable
  const dR = SEL.selectNextExplained(REG.toSelectorCandidates(RR), { weights: REG.WEIGHTS, directions: REG.DIRECTIONS });
  check("CLOSED_* / RESOLVED_BY_EVIDENCE are non-selectable selector defaults", ["CLOSED_PASS", "CLOSED_PARTIAL", "CLOSED_FAIL", "CLOSED_NOT_MEASURED", "RESOLVED_BY_EVIDENCE"].every((k) => k in SEL.EXPLAINED_DEFAULTS.nonSelectableStatuses));
  // V16.9 Phase 1b: the gap's only resolution record carries no inspection reference ⇒ RES-1 refuses it ⇒ it is not resolved (was: listed here)
  check("not selectable: G and H are EXCLUDED by status, never selected nor tied", ["G", "H"].every((id) => dR.excluded.some((e: any) => e.id === id && /^(CLOSED_|RESOLVED_)/.test(e.status))) && !["G", "H"].includes(dR.selected ? dR.selected.id : "") && !(dR.tiedSet || []).some((id: string) => id === "G" || id === "H"));
  // RES-1
  // V16.9 Phase 1b (#949 LOW) — RES-1 now requires an independent inspection reference + proof currency. The committed
  // V169_J_CANONICAL_DEFECTS_FIX.json has no inspection (stated in V169_CONTINUITY_PHASE1_AFTER.json honestLimits) ⇒ refused.
  // (Phase-1 assertion "real ⇒ RESOLVED_BY_EVIDENCE" encoded the old, uninspected acceptance — replaced.)
  check("RES-1 real (1b): the uninspected resolution record is REFUSED ⇒ CP8-GAP-canonicalDefectsJ stays PROPOSED, refusal reported on the item", ri(RR, "CP8-GAP-canonicalDefectsJ").status === "PROPOSED" && !ri(RR, "CP8-GAP-canonicalDefectsJ").statusHistory && ri(RR, "CP8-GAP-canonicalDefectsJ").resolutionRefused.length === 1 && /no independent inspection reference/.test(ri(RR, "CP8-GAP-canonicalDefectsJ").resolutionRefused[0].reason));
  // labelled fixture: the same record + an inspection reference whose inspectedHeadSha is the REAL #940 merge commit (exists, ancestor of main)
  const withInsp = (head: string, extra: any = {}) => { const x = clone(rs); x.resolutionEvidence[0].data.inspection = { verdict: "ACCEPT", inspectedHeadSha: head, inspectorSessionId: "fixture-inspector-01", authorSessionId: "fixture-author-0002", ...extra }; return x; };
  const MERGE = rs.resolutionEvidence[0].data.fixedBy.mergeCommit;
  const RI = REG.buildRegister(withInsp(MERGE));
  check("RES-1 fixture (labelled inspection, real commit): ⇒ RESOLVED_BY_EVIDENCE citing the record (#940, 613bf2cd), PROPOSED kept in statusHistory, proofCurrency CURRENT", ri(RI, "CP8-GAP-canonicalDefectsJ").status === "RESOLVED_BY_EVIDENCE" && ri(RI, "CP8-GAP-canonicalDefectsJ").resolution.pr === 940 && /^613bf2cd/.test(ri(RI, "CP8-GAP-canonicalDefectsJ").resolution.mergeCommit) && ri(RI, "CP8-GAP-canonicalDefectsJ").statusHistory[0].status === "PROPOSED" && ri(RI, "CP8-GAP-canonicalDefectsJ").resolution.proofCurrency.status === "CURRENT");
  check("RES-1 fixture: inspectedHeadSha that does NOT exist in git ⇒ WRONG_COMMIT ⇒ refused (PROPOSED)", ri(REG.buildRegister(withInsp("deadbeef".repeat(5))), "CP8-GAP-canonicalDefectsJ").status === "PROPOSED" && /WRONG_COMMIT/.test(ri(REG.buildRegister(withInsp("deadbeef".repeat(5))), "CP8-GAP-canonicalDefectsJ").resolutionRefused[0].reason));
  check("RES-1 fixture: fixedBy.mergeCommit that does NOT exist ⇒ refused; same inspector/author session ⇒ refused; no probes ⇒ refused", (() => { const a = withInsp(MERGE); a.resolutionEvidence[0].data.fixedBy.mergeCommit = "0".repeat(40); const b = withInsp(MERGE, { inspectorSessionId: "same-session-01", authorSessionId: "same-session-01" }); const c = withInsp(MERGE); delete c.proofProbes; return [a, b, c].every((x) => ri(REG.buildRegister(x), "CP8-GAP-canonicalDefectsJ").status === "PROPOSED"); })());
  const badRes = (mut: (d: any) => void) => { const x = withInsp(MERGE); mut(x.resolutionEvidence[0].data); return ri(REG.buildRegister(x), "CP8-GAP-canonicalDefectsJ").status; };
  check("RES-1 refuses malformed records: short merge sha / no reproTests / status not FIXED ⇒ stays PROPOSED", badRes((d) => { d.fixedBy.mergeCommit = "613bf2cd"; }) === "PROPOSED" && badRes((d) => { d.reproTests = []; }) === "PROPOSED" && badRes((d) => { d.resolution.status = "PLANNED"; }) === "PROPOSED");
  // contradiction detectors
  const ctr = (reg: any, rule: string) => reg.contradictions.detected.filter((c: any) => c.rule === rule);
  check("CTR-1 real: canonicalDefectsJ PROPOSED vs CP10.prs #940 'fixed' ⇒ reported on the item, state OPEN since 1b (the resolution record is refused by RES-1 — no inspection)", (() => { const c = ctr(RR, "CTR-1"); return c.length === 1 && c[0].item === "CP8-GAP-canonicalDefectsJ" && /V168_CHECKPOINT_10\.json#prs\[\d+\]\.what/.test(c[0].bSource) && c[0].state === "OPEN" && c[0].autoResolved === false && ri(RR, "CP8-GAP-canonicalDefectsJ").contradictions.length === 1; })());
  check("CTR-1 fixture (labelled inspection): with an accepted resolution the contradiction is reported as RESOLVED_BY_EVIDENCE (resolved by the record, not by the detector)", ctr(RI, "CTR-1").length === 1 && ctr(RI, "CTR-1")[0].state === "RESOLVED_BY_EVIDENCE" && ctr(RI, "CTR-1")[0].autoResolved === false);
  const noRes = REG.buildRegister({ ...rs, resolutionEvidence: [] });
  check("CTR-1 fixture: without the resolution record the gap stays PROPOSED and the contradiction is OPEN (reported, not auto-resolved)", ri(noRes, "CP8-GAP-canonicalDefectsJ").status === "PROPOSED" && ctr(noRes, "CTR-1")[0].state === "OPEN");
  const noFix = clone(rs); for (const c of noFix.checkpoints) c.data.prs = c.data.prs.map((p: any) => ({ ...p, what: String(p.what).replace(/fixed/g, "touched") }));
  check("CTR-1 fixture: same anchors without the word 'fixed' ⇒ not reported", ctr(REG.buildRegister({ ...noFix, resolutionEvidence: [] }), "CTR-1").length === 0);
  check("CTR-2 real: G, H, G2 (#964), J2, V175-NB1, V175-NB2 and J (V17.6) contract state AUTHORIZED_FOR_REVISION vs their closure records ⇒ reported OPEN (contract never rewritten)", (() => { const c = ctr(RR, "CTR-2"); return c.length === 7 && c.every((x: any) => x.kind === "CONTRACT_STATE_VS_CLOSURE" && x.state === "OPEN") && ri(RR, "H").contradictions.length === 1; })());
  // labelled fixture: G/H contract state set to a CLOSED_ value, records re-bound to the edited contract sha (as a real
  // authorized contract edit would require) — then CTR-2 has nothing to report
  const stClosed = clone(rs);
  for (const c of stClosed.contracts.data.contracts) if (c.scenario === "G" || c.scenario === "H" || c.scenario === "G2" || c.scenario === "J2" || c.scenario === "V175-NB1" || c.scenario === "V175-NB2" || c.scenario === "J") {
    c.state = "CLOSED (fixture)"; const sha = AS.contractSha256(c); const ev = stClosed.authorizationEvidence[c.scenario];
    ev.inspection.contractSha256 = sha; ev.experiment.contractSha256 = sha; ev.validation.contractSha256 = sha; ev.validation.experimentEvidence.experimentSha256 = AS.experimentSha256(ev.experiment);
  }
  check("CTR-2 fixture: contract state containing CLOSED (records re-bound) ⇒ still closed, no CONTRACT_STATE contradiction; checkpoint mission statuses agree (CP9 G, CP10 H) ⇒ none", (() => { const r = REG.buildRegister(stClosed); return ri(r, "H").status === "CLOSED_FAIL" && ri(r, "G").status === "CLOSED_PARTIAL" && ctr(r, "CTR-2").length === 0 && !ri(r, "H").contradictions; })());
  const cpBad = clone(rs); const cp10 = cpBad.checkpoints.find((c: any) => /CHECKPOINT_10/.test(c.path)); cp10.data.missionH = { status: "CLOSED_PASS" };
  check("CTR-2 fixture: checkpoint missionH.status CLOSED_PASS vs derived CLOSED_FAIL ⇒ CHECKPOINT_MISSION_STATUS_VS_CLOSURE reported", ctr(REG.buildRegister(cpBad), "CTR-2").some((c: any) => c.kind === "CHECKPOINT_MISSION_STATUS_VS_CLOSURE" && c.item === "H"));
  check("CTR-3 real: declared record sets stop at CP9 < newest committed CP15 (V17.8) ⇒ reported (not auto-extended)", (() => { const c = ctr(RR, "CTR-3"); return c.length === 1 && /V166_CHECKPOINT_9/.test(c[0].a) && /V178_CHECKPOINT_15/.test(c[0].b) && c[0].autoResolved === false; })());
  check("CTR-3 fixture: when the newest committed checkpoint is CP9 ⇒ not reported", ctr(REG.buildRegister({ ...rs, latestCheckpoint: "V166_CHECKPOINT_9.json" }), "CTR-3").length === 0);
  check("no contradiction key on items without one (S12 regex cannot match a bare key)", RR.items.filter((x: any) => !["G", "H", "G2", "J2", "V175-NB1", "V175-NB2", "J", "CP8-GAP-canonicalDefectsJ"].includes(x.id)).every((x: any) => !("contradictions" in x)));
  // LCP-1
  check("LCP-1: latest checkpoint by NUMBER, not lexicographic order", REG.latestCheckpointOf(["docs/odg/evidence/Z150_CHECKPOINT_9.json", "A1_CHECKPOINT_10.json", "V150_CHECKPOINT_4.json", "other.json"]) === "A1_CHECKPOINT_10.json" && REG.latestCheckpointOf([]) === null);
  check("LCP-1 real: module LATEST_CHECKPOINT discovered = V178_CHECKPOINT_15.json (CP15 written V17.8; no longer hard-coded); register output agrees", REG.LATEST_CHECKPOINT === "V178_CHECKPOINT_15.json" && RR.latestCheckpoint.file === "V178_CHECKPOINT_15.json" && RR.capabilityGapRules.benefit.latestCheckpoint === "V178_CHECKPOINT_15.json");
  check("LCP-1 synthetic fixture (no checkpoint names) ⇒ latest = highest supplied doc (CP9 in the V16.7 benefit fixture) — DEP-2 tests above unchanged", RB.latestCheckpoint.file === "V166_CHECKPOINT_9.json");
  // prior items otherwise unchanged
  const RP = REG.buildRegister({ ...rs, authorizationEvidence: {}, resolutionEvidence: [], checkpoints: [] });
  check("real: G2 closed by its committed records (V17.4) ⇒ CLOSED_PARTIAL via odg-authorization-scope", ri(RR, "G2").status === "CLOSED_PARTIAL" && ri(RR, "G2").closure && ri(RR, "G2").closure.closed === true);
  check("real: J2 closed by its committed records (V17.5) ⇒ CLOSED_FAIL via odg-authorization-scope", ri(RR, "J2").status === "CLOSED_FAIL" && ri(RR, "J2").closure && ri(RR, "J2").closure.closed === true);
  if (false) check("(retired V17.5: J2 no longer NOT_STARTED)", ["J2"].every((k) => ri(RR, k).status === "NOT_STARTED" && ri(RR, k).closure && ri(RR, k).closure.closed === false && ri(RR, k).closure.component === "odg-authorization-scope.deriveAuthorizationScope"));
  // V17.2: G2/J2 carry their OWN inspection records (#957) ⇒ their scoped state legitimately differs; excluded by name, nothing else
  check("prior items otherwise unchanged: every item except G, H, canonicalDefectsJ (and G2/J2/V175-NB1/V175-NB2/J/V176-NB3/F, which carry their own inspection records) is byte-identical with and without the Phase-1 records", RR.items.filter((x: any) => !["G", "H", "CP8-GAP-canonicalDefectsJ", "G2", "J2", "V175-NB1", "V175-NB2", "J", "V176-NB3", "F"].includes(x.id)).every((x: any) => JSON.stringify(x) === JSON.stringify(ri(RP, x.id))) && RR.itemCount === RP.itemCount);
  check("synthetic V16.4 fixture has no closure/resolution fields (no authorization blocks, no records)", R.items.every((x: any) => !x.closure && !x.statusHistory && !x.resolution));
}

process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-strategic-register + selectNextExplained (taxonomy, EXECUTED_PARTIAL≠ACCEPTED, NOT_MEASURED⇒uncertainty, no id tie-break, owner-gated never auto-selected)" : f + " FAIL") + "\n");
process.exit(f === 0 ? 0 : 1);
export {};
