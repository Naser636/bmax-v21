/**
 * V16.9 — Addendum "Boussole vivante" PHASE 0 — §29 CONTINUITY BASELINE (before any improvement). READ-ONLY, offline.
 *
 * Runs the 15 §29 scenarios against the CURRENT canonical components (no new engine, no fix) on the REAL committed
 * records, and grades each with the rule PRE-REGISTERED below. Writes docs/odg/evidence/V169_CONTINUITY_BASELINE.json.
 * `--check` recomputes from the committed sources and exits 1 on drift (generatedAtHead excluded).
 *
 * Every decision in a result is produced by the named ODG component (odg-strategic-register, mission-priority-selector,
 * odg-authorization-scope, odg-go-cycle.actionabilityOf, odg-program-continuity, odg-v124-consolidation, campaign-controller,
 * odg-observation-currency, mission-scheduler, research-governor). This bin only feeds committed records to them, applies
 * labelled mutations (each one named in the output, never committed) and applies the pre-registered grading rules.
 * Ground-truth labels come from committed records and are cited per scenario.
 *
 * No network, no model, no provider call, no git write; the only subprocess is local read-only `git` (rev-parse, diff
 * --name-only, log -1, cat-file -e). Honesty: scenarios, mutations, labels and grading rules were written by the technical
 * provider (Claude Code), after exploratory READ-ONLY reads of the records but BEFORE the first execution of this bin.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const SS = require("./odg-strategic-select.ts");
const REG = require("../core/odg-strategic-register.js");
const SEL = require("../core/mission-priority-selector.js");
const AS = require("../core/odg-authorization-scope.js");
const GO = require("../core/odg-go-cycle.js");
const PC = require("../core/odg-program-continuity.js");
const V124 = require("../core/odg-v124-consolidation.js");
const CC = require("../core/campaign-controller.js");
const OCUR = require("../core/odg-observation-currency.js");
const MS = require("../core/mission-scheduler.js");
const RG = require("../core/research-governor.js");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_REL = "docs/odg/evidence/V169_CONTINUITY_BASELINE.json";
const EV = "docs/odg/evidence";
const AUTH_EVIDENCE: any = {
  G: { inspection: `${EV}/V166_G_CONTRACT_INSPECTION.json`, experiment: `${EV}/V166_G_EXPERIMENT.json`, validation: `${EV}/V166_G_CRITERIA_VALIDATION.json` },
  H: { inspection: `${EV}/V168_H_CONTRACT_INSPECTION.json`, experiment: `${EV}/V168_H_EXPERIMENT.json`, validation: `${EV}/V168_H_CRITERIA_VALIDATION.json` },
};
const FIXED_AS_OF = Date.UTC(2026, 10, 24); // the baseline's declared evaluation instant (deterministic)

// ---- PRE-REGISTERED scenarios + grading rules (written before the first execution of this bin; not edited after) ----
const PRE_REGISTRATION = Object.freeze({
  writtenBefore: "the first execution of this bin (provider-authored after read-only exploration; not edited after seeing results)",
  gradeVocabulary: ["PASS", "PARTIAL", "FAIL", "NOT_MEASURED"],
  scenarios: Object.freeze([
    { n: 1, name: "reprendre une mission après interruption", test: "(a) GO SELECT recomputed from committed records (odg-strategic-register + selectNextExplained + odg-go-cycle.actionabilityOf over the committed contracts + authorization evidence) vs CP10.nextAction; (b) does a component identify the step the interrupted GO run (V168_H_GO_EXECUTE_TRACE.jsonl, DEADLINE before EVIDENCE) did not complete; (c) V12.4 companion → odg-v124-consolidation.toContinuityProgram → odg-program-continuity.buildDossier nextEligible vs V14.4 §2 Phase-1 anchor", PASS: "(a) matches CP10.nextAction AND (b) a component names the missing step AND (c) nextEligible = CM-RADAR-GATE-CHAIN", PARTIAL: "(a) and (c) hold, (b) does not", FAIL: "(a) or (c) mismatches" },
    { n: 2, name: "retrouver le dernier checkpoint", test: "(a) odg-authorization-scope.deriveAuthorizationScope(H, committed evidence) → validated steps + currentStep; (b) the checkpoint the canonical register reads as latest (odg-strategic-register.LATEST_CHECKPOINT) vs the head of the committed checkpoint chain (the CP file not cited as `previous` by any other)", PASS: "(a) 4/4 H steps validated with evidence pointers AND (b) canonical latest = chain head", PARTIAL: "exactly one of (a),(b)", FAIL: "neither" },
    { n: 3, name: "retrouver une décision et sa justification", addedAfterFirstRun: true, addedNote: "pre-registered after the first run of scenarios 1,2,5–15 (owner text received later); written before #3 was first run", test: "two committed decisions: D1 = H's Δ1 tightening (non-inferiority ⇒ superiority vs B1, after inspection REJECT @587650b0); D2 = G's write_set restore (after inspection REJECT @b994ca69). (a) does a canonical component (odg-authorization-scope validatedSteps evidence) return a pointer to the record holding the decision; (b) does a component return the decision + justification itself; (c) are decision + justification + provenance (record path, head) present in the committed records (runner extraction)", PASS: "(b) for D1 and D2 with provenance", PARTIAL: "(a) and (c) for D1 and D2 but not (b) — the decision is reachable only by reading the record the component points to", FAIL: "(c) fails for D1 or D2 (decision or justification absent from the records)" },
    { n: 4, name: "identifier les tests réussis, échoués et absents", addedAfterFirstRun: true, addedNote: "pre-registered after the first run of scenarios 1,2,5–15 (owner text received later); written before #4 was first run", test: "for H and G: (a) acceptance-criterion results (pass/fail per criterion) in the committed criteria-validation records; (b) a per-PR CI result (head + green/red) recorded for the mission's PRs in a committed record; (c) tests NOT run listed with a reason; (d) a canonical component enumerating (a)–(c)", PASS: "(a),(b),(c) for H and G AND (d)", PARTIAL: "(a) for H and G but (b) or (c) missing, or (d) absent (runner extraction only)", FAIL: "(a) missing for H or G" },
    { n: 5, name: "préserver PARTIAL/FAIL", test: "status of G (CLOSED_PARTIAL per V167 dossier/CP9) and H (CLOSED_FAIL per CP10) in the canonical register odg-strategic-register.buildRegister", PASS: "G status in the PARTIAL family AND H status in the FAIL family (FAIL/CLOSED_FAIL/NOT_ADOPTED)", PARTIAL: "neither is upgraded to PASS/ACCEPTED but at least one closure verdict is absent from the register status", FAIL: "a PARTIAL/FAIL is shown as PASS/ACCEPTED" },
    { n: 6, name: "preuve périmée (head/sha ne correspond plus)", test: "odg-observation-currency.assess with the REAL git changed-set (observedCommit..HEAD) on: V164_GO_CYCLE.json (labelled STALE: CP10.scenarioJ_V164 'NOT regenerated'), V164_STRATEGIC_REGISTER.json (labelled FRESH: odg-strategic-select --check recomputes it byte-identical); plus sha-bound proofs V168_H_CRITERIA_VALIDATION.experimentEvidence.sha256 vs the current file", PASS: "every labelled-STALE detected, no labelled-FRESH flagged, and a live (non-test) caller applies the check to evidence records", PARTIAL: "every labelled-STALE detected only when this runner invokes the component, or a labelled-FRESH is flagged (false-stale)", FAIL: "a labelled-STALE record is not detected" },
    { n: 7, name: "preuve du mauvais commit", test: "odg-authorization-scope on H with labelled mutations: (m1) inspection.contractSha256 := G's inspection sha; (m2) contract objective edited; (m3) inspection.inspectedHeadSha := a well-formed 40-hex sha that does NOT exist in git; plus git cat-file -e on the merge shas cited in CP10.prs", PASS: "real chain valid AND m1,m2,m3 all invalidate the step", PARTIAL: "real chain valid AND m1,m2 invalidate BUT m3 accepted (commit existence never verified)", FAIL: "real chain invalid OR m1 or m2 accepted" },
    { n: 8, name: "autorisation manquante (J)", test: "odg-go-cycle.actionabilityOf(J) on committed state; deriveAuthorizationScope(J); mutation (m1) J given an authorization block citing H's owner directive (V168)", PASS: "J not actionable AND scope not applicable AND m1 refused (foreign owner source) AND selfAuthorized never true", FAIL: "any of these violated" },
    { n: 9, name: "autorisé plutôt que bloqué (GO-ACT-1)", test: "actionabilityOf over every register item on (s1) committed state and (s2) the labelled fixture 'H at RUN_CONTROLLED_EXPERIMENTS' (H experiment+validation records removed, as odg-go-cycle.test does) while the strategic selection stays DECISION_REQUIRED J/G", PASS: "s1 ⇒ 0 actionable; s2 ⇒ exactly H actionable (SCOPED_STEP_AUTHORIZED) and no owner-gated item actionable", FAIL: "otherwise" },
    { n: 10, name: "dépendance bloquant plusieurs missions", test: "campaign-controller (selectNextLot/summary/staleAcceptances) on the REAL closure-register.json (427) and the V12.4 companion; fan-out of each BLOCKED item over non-ACCEPTED dependents", PASS: "selected lot does not depend (transitively) on a BLOCKED item AND a component exposes, per blocker, the missions it blocks", PARTIAL: "selection safe but no component exposes the blocked-by fan-out (only computable by the runner)", FAIL: "selected lot depends on a BLOCKED item" },
    { n: 11, name: "empêcher de refaire un travail validé", test: "(a) mission-scheduler.evaluateEligibility on a proven mission; (b) program-continuity on V12.4 companion: ACCEPTED never nextEligible; (c) A–P register: is an item whose authorization-scope says 'all steps validated' (H) still status-selectable?", PASS: "(a),(b) refuse re-execution AND (c) a closed item is non-selectable by status", PARTIAL: "(a),(b) hold but (c) the closed item stays selectable (protected only by scores / authorization)", FAIL: "(a) or (b) re-offers validated work" },
    { n: 12, name: "contradiction entre registres", test: "labelled contradictions from committed records: K1 CP8-GAP-canonicalDefectsJ PROPOSED in the register vs CP10.prs #940 'J canonical defects fixed'; K2 register H PARTIAL vs CP10 missionH CLOSED_FAIL; K3 V12.4 companion CM-RADAR-GATE-CHAIN READY commit null vs runtime/core/odg-radar-gate-chain.ts present (V14.4 §5); does any canonical register output flag them", PASS: "every labelled contradiction flagged by a component", PARTIAL: "some flagged", FAIL: "none flagged" },
    { n: 13, name: "découverte Radar + fiabilité", test: "(a) committed V164 admission: every decision carries reasons + evidenceSha256 + tier; (b) research-governor.govern with the V372 grant: allowlisted https GET ⇒ allowed, non-allowlisted ⇒ denied, after expiry ⇒ denied; (c) a new discovery measured offline", PASS: "(a),(b) hold AND (c) measured", PARTIAL: "(a),(b) hold, (c) not measurable offline (real collection is network-gated)", FAIL: "(a) or (b) violated" },
    { n: 14, name: "faiblesse non mesurée", test: "register criteria: count NOT_MEASURED values, each with rule+reason, none scored (odg-strategic-select.grade b1/b2); is an unmeasured criterion turned into a tracked register item by a component", PASS: "surfaced with reason, never scored, AND converted into a tracked item automatically", PARTIAL: "surfaced with reason and never scored, not converted", FAIL: "an unmeasured value is scored or silently defaulted" },
    { n: 15, name: "une correction améliore réellement la capacité", test: "H (the only committed before/after on held-out data): authorization-scope validates experiment+validation bound to the contract sha; the recorded verdict is consistent with the recorded measurements (AUC H1 vs B0) and adoption", PASS: "a component-verified held-out comparison shows an ADOPTED improvement", PARTIAL: "the verification ran and correctly REFUSED a non-improvement, but no proven improvement exists in the records", FAIL: "an improvement is claimed without a measured comparison, or the verdict contradicts the measurement" },
  ]),
});

function sha256(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }
function git(root: string, args: string[]): string | null { try { return String(execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim(); } catch { return null; } }
function rj(root: string, rel: string): any { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); }
function optional(root: string, rel: string): any { try { return { ...rj(root, rel), recordPath: rel }; } catch { return null; } }
const clone = (o: any) => JSON.parse(JSON.stringify(o));

function loadState(root: string): any {
  const src = SS.loadSources(root);
  const authorizationEvidence: any = {};
  for (const [sc, f] of Object.entries(AUTH_EVIDENCE) as any) authorizationEvidence[sc] = { inspection: optional(root, f.inspection), experiment: optional(root, f.experiment), validation: optional(root, f.validation) };
  const { inputs, ...sources } = src;
  return { inputs, sources, authorizationEvidence };
}
const contractOf = (state: any, sc: string) => state.sources.contracts.data.contracts.find((c: any) => String(c.scenario) === sc);
const selOpts = () => ({ weights: REG.WEIGHTS, directions: REG.DIRECTIONS });
const scopeOf = (state: any, sc: string) => AS.deriveAuthorizationScope(contractOf(state, sc), state.authorizationEvidence[sc] || {});
function changedPaths(root: string, from: string): string[] | null { const o = git(root, ["diff", "--name-only", `${from}..HEAD`]); return o === null ? null : o.split("\n").filter(Boolean).sort(); }
function fullSha(root: string, ref: string): string | null { return git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]); }
function commitExists(root: string, sha: string): boolean { return git(root, ["cat-file", "-e", `${sha}^{commit}`]) !== null; }
function lastWrite(root: string, rel: string): string | null { return git(root, ["log", "-1", "--format=%H", "--", rel]); }

function s1(root: string, state: any, register: any, cp10: any): any {
  const strategic = SEL.selectNextExplained(REG.toSelectorCandidates(register), selOpts());
  const actionable = register.items.filter((it: any) => GO.actionabilityOf(state, it).actionable).map((it: any) => it.id);
  const expected = { decision: "DECISION_REQUIRED", tiedSet: ["G", "J"], actionable: 0 };
  const a = strategic.decision === expected.decision && (strategic.tiedSet || []).slice().sort().join(",") === "G,J" && actionable.length === 0;
  const trace = fs.readFileSync(path.join(root, EV, "V168_H_GO_EXECUTE_TRACE.jsonl"), "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l));
  const stepsRun = trace.filter((e: any) => e.kind === "STEP").map((e: any) => e.step);
  const missingInTrace = GO.STEPS.filter((s: string) => !stepsRun.includes(s));
  // (b) does a canonical component name the missing step on resume? The GO core re-derives state from records each cycle;
  // no exported component reads a prior cycle's trace to resume its missing step (odg-go lastCycle is used for --check/digest only).
  const resumeComponent = typeof GO.resumeFromTrace === "function" || typeof GO.resumeCycle === "function";
  const b = resumeComponent;
  const companion = rj(root, "docs/odg/v124-consolidated-roadmap.json");
  const dossier = PC.buildDossier(V124.toContinuityProgram(companion), { asOfEpochMs: FIXED_AS_OF, currentCommit: fullSha(root, "HEAD") });
  const c = dossier.nextEligible === "CM-RADAR-GATE-CHAIN";
  const grade = !(a && c) ? "FAIL" : b ? "PASS" : "PARTIAL";
  return { grade, measured: { a_strategic: { decision: strategic.decision, tiedSet: strategic.tiedSet || [] }, a_actionable: actionable, a_expectedFromCP10: cp10.nextAction, a_matches: a,
    b_interruptedTrace: { stop: (trace.find((e: any) => e.kind === "STOP") || {}).reason || null, stepsCompleted: stepsRun, stepsNotCompleted: missingInTrace }, b_componentNamesMissingStep: b,
    c_v124Dossier: { boussoleRef: dossier.boussoleRef, missionsTotal: dossier.missionsTotal, done: dossier.done.length, mustRevalidate: dossier.mustRevalidate.length, blocked: dossier.blocked.map((x: any) => x.id), nextEligible: dossier.nextEligible }, c_matches: c,
    twoNextAnswers: { goAP: actionable.length ? actionable : "halt (owner decision J/G)", v124: dossier.nextEligible, reconciledByAComponent: false } },
    metrics: { correctResume: a && c ? 1 : 0, resumeAttempts: 1, interruptedStepsRecoveredByComponent: b ? missingInTrace.length : 0, interruptedStepsTotal: missingInTrace.length } };
}

function chainHead(root: string): any {
  const files = fs.readdirSync(path.join(root, EV)).filter((f: string) => /_CHECKPOINT_\d+\.json$/.test(f)).sort();
  const prev = new Set<string>();
  for (const f of files) { try { const p = rj(root, `${EV}/${f}`).previous; if (typeof p === "string") prev.add(path.basename(p)); } catch { /* unparsable: ignored */ } }
  const heads = files.filter((f: string) => !prev.has(f));
  const numbered = heads.map((f: string) => ({ f, n: Number((f.match(/_CHECKPOINT_(\d+)\.json$/) || [])[1]) })).sort((x: any, y: any) => y.n - x.n);
  return { files: files.length, headsNotCitedAsPrevious: heads, head: numbered.length ? numbered[0].f : null };
}
function s2(root: string, state: any): any {
  const sc = scopeOf(state, "H");
  const a = sc.applicable === true && sc.validatedSteps.length === 4 && sc.currentStep === null && sc.validatedSteps.every((v: any) => v.evidence);
  const ch = chainHead(root);
  const b = REG.LATEST_CHECKPOINT === ch.head;
  const grade = a && b ? "PASS" : a || b ? "PARTIAL" : "FAIL";
  return { grade, measured: { a_H: { validatedSteps: sc.validatedSteps.map((v: any) => v.step), currentStep: sc.currentStep, reason: sc.reason }, a_ok: a, b_canonicalLatest: REG.LATEST_CHECKPOINT, b_chain: ch, b_ok: b },
    metrics: { checkpointsLocated: (a ? 1 : 0) + (b ? 1 : 0), checkpointLookups: 2 } };
}

const PARTIAL_FAMILY = /PARTIAL/; const FAIL_FAMILY = /^(FAIL|CLOSED_FAIL|NOT_ADOPTED|REJECTED)/; const PASS_FAMILY = /^(PASS|ACCEPTED|CLOSED_PASS)$/;
function s3(root: string, state: any): any {
  const H = contractOf(state, "H"), G = contractOf(state, "G");
  const hRev = (H.revisionHistory || [])[0] || {}, gRev = (G.revisionHistory || [])[0] || {};
  const hIns = rj(root, `${EV}/V168_H_CONTRACT_INSPECTION.json`), gIns = rj(root, `${EV}/V166_G_CONTRACT_INSPECTION.json`);
  const find = (hist: any[], v: string) => (hist || []).find((x: any) => x.verdict === v) || null;
  const d1 = { decision: "H thresholds.PASS tightened Δ1 ≥ −0.02 ⇒ Δ1 > 0 AND CI95-low(Δ1) > 0", record: `${EV}/V160_AP_WORK_ITEM_CONTRACTS.json#H.revisionHistory[0].inspectionFixes + ${EV}/V168_H_CONTRACT_INSPECTION.json#history`,
    justification: hRev.inspectionFixes && hRev.inspectionFixes.inspection ? String(hRev.inspectionFixes.inspection) : null, reject: find(hIns.history, "REJECT"), accept: find(hIns.history, "ACCEPT") };
  const gFix = typeof gRev.inspectionFixes === "string" ? gRev.inspectionFixes : JSON.stringify(gRev.inspectionFixes || null);
  const d2 = { decision: "G experiment files moved back into write_set", record: `${EV}/V160_AP_WORK_ITEM_CONTRACTS.json#G.revisionHistory[0].inspectionFixes + ${EV}/V166_G_CONTRACT_INSPECTION.json#history`,
    justification: /write_set/.test(gFix) ? gFix : null, reject: find(gIns.history, "REJECT"), accept: find(gIns.history, "ACCEPT") };
  const present = (d: any) => !!d.justification && !!d.reject && !!d.accept && typeof d.reject.head === "string" && typeof d.accept.head === "string";
  const c = present(d1) && present(d2);
  const ptr = (sc: string) => { const v = scopeOf(state, sc).validatedSteps.find((x: any) => x.step === "INSPECT_REVISED_CONTRACT"); return v && v.evidence ? v.evidence.recordPath : null; };
  const pH = ptr("H"), pG = ptr("G");
  const a = pH === `${EV}/V168_H_CONTRACT_INSPECTION.json` && pG === `${EV}/V166_G_CONTRACT_INSPECTION.json`;
  const b = false; // no exported component returns a decision + its justification (authorization-scope returns verdict/sha/session ids + recordPath only)
  const grade = !c ? "FAIL" : b ? "PASS" : a ? "PARTIAL" : "FAIL";
  const brief = (d: any) => ({ decision: d.decision, record: d.record, justification: d.justification ? d.justification.slice(0, 400) : null, rejectAt: d.reject ? d.reject.head : null, acceptAt: d.accept ? d.accept.head : null, acceptFindings: d.accept ? d.accept.findings : null });
  return { grade, measured: { D1_H_delta1: brief(d1), D2_G_writeSet: brief(d2), a_componentPointer: { H: pH, G: pG, ok: a }, b_componentReturnsDecision: b, c_recordsHoldDecision: c },
    metrics: { decisionsRetrieved: [present(d1), present(d2)].filter(Boolean).length, decisionsAsked: 2, decisionsReturnedByComponent: 0 } };
}

function s4(root: string, state: any): any {
  const cp10 = rj(root, `${EV}/V168_CHECKPOINT_10.json`);
  const per = (sc: string, valRel: string, prs: number[]) => {
    const v = rj(root, valRel);
    const crit = (v.criteria || []).map((c: any) => ({ id: c.id, status: c.status, outcome: /FAIL/.test(String(c.status)) ? "FAIL" : /PARTIAL/.test(String(c.status)) ? "PARTIAL" : /^MET/.test(String(c.status)) ? "PASS" : "UNKNOWN" }));
    const prRecs = cp10.prs.filter((p: any) => prs.includes(p.pr)).map((p: any) => ({ pr: p.pr, merge: p.merge, gates: p.gates || null, perPrCiResultRecorded: /\b(green|red|pass|fail)\b.*\b[0-9a-f]{7,40}\b/i.test(String(p.gates || "")) && !/exact head \+ independent inspection ACCEPT on exact head \(or/.test(String(p.gates || "")) }));
    const txt = JSON.stringify(v);
    const notRun = /not run|NOT_RUN|not executed/i.test(txt);
    return { scenario: sc, record: valRel, criteria: crit, scenarioGrade: v.scenarioGrade, prsInCP10: prRecs, a_criteriaResults: crit.length > 0 && crit.every((c: any) => c.outcome !== "UNKNOWN"), b_perPrCiResult: prRecs.length > 0 && prRecs.every((p: any) => p.perPrCiResultRecorded), c_notRunListed: notRun };
  };
  const H = per("H", `${EV}/V168_H_CRITERIA_VALIDATION.json`, [942, 943, 944, 945, 946]);
  const cp9 = rj(root, `${EV}/V166_CHECKPOINT_9.json`);
  const G: any = per("G", `${EV}/V166_G_CRITERIA_VALIDATION.json`, []);
  const gPrs = Array.isArray(cp9.prs) ? cp9.prs.map((p: any) => ({ pr: p.pr, gates: p.gates || null })) : [];
  G.prsInCP9 = gPrs; G.b_perPrCiResult = false;
  const goTraceNotRun = ["EVIDENCE", "NEXT_SELECTION"]; // S1: GO steps not completed in the H execute run (DEADLINE)
  const d = false; // no canonical component enumerates passed/failed/not-run tests per A–P mission
  const a = H.a_criteriaResults && G.a_criteriaResults, b = H.b_perPrCiResult && G.b_perPrCiResult, c = H.c_notRunListed && G.c_notRunListed;
  const grade = !a ? "FAIL" : (a && b && c && d) ? "PASS" : "PARTIAL";
  return { grade, measured: { H, G, hGoStepsNotRun: goTraceNotRun, d_componentEnumerates: d, ciNote: "CP9/CP10 record a generic gate policy per PR ('CI green on exact head + …'), not a per-PR CI result; the only per-head CI outcome found (CI red on f82f3b6f) is in a git commit message (0c675fc4), not in a record" },
    metrics: { criteriaWithResult: H.criteria.length + G.criteria.length, perPrCiResultsRecorded: 0 } };
}

function s5(register: any): any {
  const g = register.items.find((i: any) => i.id === "G"), h = register.items.find((i: any) => i.id === "H");
  const gOk = PARTIAL_FAMILY.test(g.status), hOk = FAIL_FAMILY.test(h.status);
  const upgraded = PASS_FAMILY.test(g.status) || PASS_FAMILY.test(h.status);
  const grade = upgraded ? "FAIL" : gOk && hOk ? "PASS" : "PARTIAL";
  return { grade, measured: { G: { registerStatus: g.status, statusSource: g.statusSource, closureOfRecord: "CLOSED_PARTIAL (docs/odg/evidence/V167_V166_CLOSURE_DOSSIER.json; CP9)" }, H: { registerStatus: h.status, statusSource: h.statusSource, closureOfRecord: "CLOSED_FAIL (NOT_ADOPTED) (docs/odg/evidence/V168_CHECKPOINT_10.json#missionH)" }, gPreserved: gOk, hPreserved: hOk, upgradedToPass: upgraded },
    metrics: { statusErrors: (gOk ? 0 : 1) + (hOk ? 0 : 1) } };
}

function s6(root: string, cp10: any): any {
  const head = fullSha(root, "HEAD");
  const obs = (rel: string, observedCommit: string | null, scope: string[], label: string, labelSource: string) => {
    const changed = observedCommit ? changedPaths(root, observedCommit) : null;
    const a = OCUR.assess({ claim: `${rel} describes the current state`, observedAtEpochMs: FIXED_AS_OF, method: "committed evidence record", observedCommit, scope }, { asOfEpochMs: FIXED_AS_OF, currentCommit: head, changedPathsKnown: changed !== null, changedPaths: changed || [] });
    const flagged = a.mayAssertCurrent !== true;
    return { record: rel, observedCommit, observedCommitSource: observedCommit ? "record field or last commit writing the file (git log -1)" : null, scope, label, labelSource, currency: a.currency, flaggedStale: flagged, correct: (label === "STALE") === flagged, scopeChangedPaths: changed ? changed.filter((p: string) => scope.some((s: string) => p === s || p.startsWith(s.endsWith("/") ? s : s + "/"))) : null };
  };
  const reg = rj(root, `${EV}/V164_STRATEGIC_REGISTER.json`);
  const regScope = reg.inputs.map((i: any) => String(i.source)).filter((s: string) => !s.startsWith("git:")).concat(["runtime/core/odg-strategic-register.ts", "runtime/bin/odg-strategic-select.ts", "runtime/core/mission-priority-selector.ts"]).sort();
  const goRel = `${EV}/V164_GO_CYCLE.json`;
  const recs = [
    obs(goRel, lastWrite(root, goRel), ["runtime/core/odg-go-cycle.ts", "runtime/bin/odg-go.ts"], "STALE", "docs/odg/evidence/V168_CHECKPOINT_10.json#scenarioJ_V164 ('V164_GO_CYCLE.json NOT regenerated')"),
    obs(`${EV}/V164_STRATEGIC_REGISTER.json`, fullSha(root, String(reg.generatedAtHead)), regScope, "FRESH", "odg-strategic-select --check recomputes it byte-identical from the committed sources (content-level truth)"),
  ];
  // sha-bound proof: the criteria validation's experiment file sha vs the current file
  const val = rj(root, `${EV}/V168_H_CRITERIA_VALIDATION.json`);
  const curSha = sha256(fs.readFileSync(path.join(root, val.experimentEvidence.path), "utf8"));
  const shaBound = { record: `${EV}/V168_H_CRITERIA_VALIDATION.json#experimentEvidence.sha256`, recorded: val.experimentEvidence.sha256, current: curSha, matches: val.experimentEvidence.sha256 === curSha, checkedByComponent: "odg-authorization-scope validationValid (experimentSha256 over canon(record)) — see scenario 7" };
  const staleDetected = recs.filter((r) => r.label === "STALE" && r.flaggedStale).length, staleTotal = recs.filter((r) => r.label === "STALE").length;
  const falseStale = recs.filter((r) => r.label === "FRESH" && r.flaggedStale).length;
  const liveCaller = false; // no non-test caller applies odg-observation-currency to evidence records (program-continuity applies it only to missions carrying an `observation`; the V12.4 companion carries none)
  const grade = staleDetected < staleTotal ? "FAIL" : (falseStale === 0 && liveCaller) ? "PASS" : "PARTIAL";
  return { grade, measured: { headAtRun: "HEAD (excluded from --check; see generatedAtHead)", records: recs, shaBound, liveCallerAppliesCurrencyToEvidence: liveCaller, cp10Head: cp10.headAtCheckpoint },
    metrics: { staleProofsDetected: staleDetected, staleProofsLabelled: staleTotal, falseStaleOnFreshRecords: falseStale } };
}

function s7(root: string, state: any): any {
  const H = contractOf(state, "H"), ev = state.authorizationEvidence.H;
  const real = AS.deriveAuthorizationScope(H, ev);
  const realOk = real.validatedSteps.some((v: any) => v.step === "INSPECT_REVISED_CONTRACT");
  const inspOk = (scope: any) => scope.validatedSteps.some((v: any) => v.step === "INSPECT_REVISED_CONTRACT");
  const gInsp = state.authorizationEvidence.G.inspection;
  const m1 = AS.deriveAuthorizationScope(H, { ...ev, inspection: { ...ev.inspection, contractSha256: gInsp ? gInsp.contractSha256 : "0".repeat(64) } });
  const hMut = clone(H); hMut.WORK_ITEM_CONTRACT.objective = String(hMut.WORK_ITEM_CONTRACT.objective) + " (mutated)";
  const m2 = AS.deriveAuthorizationScope(hMut, ev);
  const ghost = "deadbeef".repeat(5);
  const m3 = AS.deriveAuthorizationScope(H, { ...ev, inspection: { ...ev.inspection, inspectedHeadSha: ghost } });
  const ghostExists = commitExists(root, ghost);
  const realHead = String(ev.inspection.inspectedHeadSha);
  const cp10 = rj(root, `${EV}/V168_CHECKPOINT_10.json`);
  const merges = cp10.prs.map((p: any) => ({ pr: p.pr, merge: p.merge, exists: commitExists(root, String(p.merge)) }));
  const r1 = !inspOk(m1), r2 = !inspOk(m2), r3 = !inspOk(m3);
  const grade = !(realOk && r1 && r2) ? "FAIL" : r3 ? "PASS" : "PARTIAL";
  return { grade, measured: { real: { inspectionValid: realOk, inspectedHeadSha: realHead, inspectedHeadExistsInGit: commitExists(root, realHead) },
    m1_foreignContractSha: { rejected: r1, reason: m1.reason }, m2_contractEdited: { rejected: r2, reason: m2.reason }, m3_nonexistentInspectedHead: { sha: ghost, existsInGit: ghostExists, rejected: r3, reason: m3.reason },
    cp10MergeShasExist: merges, note: "commit existence of cited shas is verified here by the runner (git cat-file); no canonical component performs it" },
    metrics: { wrongBindingsRejected: [r1, r2, r3].filter(Boolean).length, wrongBindingsTried: 3 } };
}

function s8(state: any, register: any): any {
  const J = register.items.find((i: any) => i.id === "J");
  const act = GO.actionabilityOf(state, J);
  const sc = scopeOf(state, "J");
  const jc = clone(contractOf(state, "J"));
  jc.authorization = { by: "OWNER", source: "docs/odg/V168_OWNER_AUTHORIZATION_H.json (V168)", scope: ["REVISE_CONTRACT"], executionAuthorized: false };
  const m1 = AS.deriveAuthorizationScope(jc, {});
  const ok = act.actionable === false && sc.applicable === false && m1.applicable === false && sc.selfAuthorized === false && m1.selfAuthorized === false;
  return { grade: ok ? "PASS" : "FAIL", measured: { J_actionability: act, J_scope: { applicable: sc.applicable, reason: sc.reason }, m1_foreignOwnerSource: { applicable: m1.applicable, reason: m1.reason } },
    metrics: { permissionChecksRespected: [act.actionable === false, sc.applicable === false, m1.applicable === false].filter(Boolean).length, permissionChecksTried: 3 } };
}

function s9(state: any, register: any): any {
  const list = (st: any) => register.items.map((it: any) => ({ id: it.id, gated: it.requiresOwnerAuthorization === true, a: GO.actionabilityOf(st, it) })).filter((x: any) => x.a.actionable);
  const committed = list(state);
  const fx = { ...state, authorizationEvidence: { ...state.authorizationEvidence, H: { ...state.authorizationEvidence.H, experiment: null, validation: null } } };
  const atRun = list(fx);
  const ok = committed.length === 0 && atRun.length === 1 && atRun[0].id === "H" && atRun[0].a.basis === "SCOPED_STEP_AUTHORIZED" && atRun.every((x: any) => !x.gated);
  return { grade: ok ? "PASS" : "FAIL", measured: { s1_committedActionable: committed.map((x: any) => x.id), s2_fixture: "H at RUN_CONTROLLED_EXPERIMENTS (H experiment+validation records removed; labelled fixture, never committed)", s2_actionable: atRun.map((x: any) => ({ id: x.id, basis: x.a.basis, step: x.a.step || null })) },
    metrics: { permissionChecksRespected: ok ? 2 : 0, permissionChecksTried: 2 } };
}

function fanOut(reg: any): any[] {
  const items = reg.items || []; const byId = new Map(items.map((i: any) => [i.id, i]));
  const dependents = (id: string): string[] => { const out = new Set<string>(); const q = [id]; while (q.length) { const x = q.shift(); for (const it of items) if ((it.deps || []).includes(x) && !out.has(it.id)) { out.add(it.id); q.push(it.id); } } return [...out].filter((d) => (byId.get(d) as any).status !== "ACCEPTED").sort(); };
  return items.filter((i: any) => i.status === "BLOCKED").map((i: any) => ({ blocker: i.id, blocksNonAccepted: dependents(i.id) }));
}
function dependsOnBlocked(reg: any, id: string | null): boolean {
  if (!id) return false; const byId = new Map((reg.items || []).map((i: any) => [i.id, i])); const seen = new Set<string>(); const q = [id];
  while (q.length) { const x: any = byId.get(q.shift() as string); if (!x) continue; for (const d of x.deps || []) { if (seen.has(d)) continue; seen.add(d); const dd: any = byId.get(d); if (dd && dd.status === "BLOCKED") return true; q.push(d); } }
  return false;
}
function s10(root: string): any {
  const cr = rj(root, "docs/odg/closure-register.json");
  const companion = rj(root, "docs/odg/v124-consolidated-roadmap.json");
  const vr = { items: V124.toContinuityProgram(companion).missions.map((m: any) => ({ ...m })) };
  const res = [{ name: "closure-register.json", reg: cr }, { name: "v124-consolidated-roadmap.json", reg: vr }].map(({ name, reg }) => {
    const sel = CC.selectNextLot(reg); const sm = CC.summary(reg);
    const lot = sel && sel.lot ? sel.lot.id : null;
    const exposesFanOut = Array.isArray(sm.blocked) && sm.blocked.some((b: any) => Array.isArray(b.blocks) || Array.isArray(b.dependents));
    return { register: name, total: (reg.items || []).length, selected: lot, selectedDependsOnBlocked: dependsOnBlocked(reg, lot), staleAcceptances: CC.staleAcceptances(reg).length, componentExposesFanOut: exposesFanOut, runnerComputedFanOut: fanOut(reg) };
  });
  const safe = res.every((r) => !r.selectedDependsOnBlocked), exposed = res.every((r) => r.componentExposesFanOut);
  const grade = !safe ? "FAIL" : exposed ? "PASS" : "PARTIAL";
  return { grade, measured: { registers: res }, metrics: { blockersWithDependents: res.reduce((s, r) => s + r.runnerComputedFanOut.filter((f: any) => f.blocksNonAccepted.length).length, 0) } };
}

function s11(root: string, state: any, register: any): any {
  const e = MS.evaluateEligibility({ status: "PENDING", mission: "M0001" }, { preAuthorized: ["M0001"], isProven: (id: string) => id === "M0001" });
  const a = e.eligible === false && /ALREADY_PROVEN/.test(e.reason);
  const companion = rj(root, "docs/odg/v124-consolidated-roadmap.json");
  const d = PC.buildDossier(V124.toContinuityProgram(companion), { asOfEpochMs: FIXED_AS_OF });
  const b = !d.done.some((x: any) => x.id === d.nextEligible);
  const hScope = scopeOf(state, "H");
  const hClosed = hScope.applicable && hScope.currentStep === null;
  const h = register.items.find((i: any) => i.id === "H");
  const nonSel = SEL.EXPLAINED_DEFAULTS.nonSelectableStatuses || {};
  const hStatusSelectable = !Object.prototype.hasOwnProperty.call(nonSel, h.status);
  const c = !(hClosed && hStatusSelectable);
  const grade = !(a && b) ? "FAIL" : c ? "PASS" : "PARTIAL";
  return { grade, measured: { a_schedulerDedup: e, b_v124: { done: d.done.length, nextEligible: d.nextEligible, nextIsDone: !b }, c_H: { allStepsValidated: hClosed, registerStatus: h.status, statusSelectable: hStatusSelectable, protectedBy: hStatusSelectable ? "authorization-scope (no current step) + scores only — not by status" : "status" } },
    metrics: { reExecutionsRefused: [a, b].filter(Boolean).length, closedItemsStillStatusSelectable: hClosed && hStatusSelectable ? 1 : 0 } };
}

function s12(root: string, register: any, cp10: any): any {
  const flagIn = (it: any) => !!it && /CONTRADICT|CONFLICT|INCONSISTEN/i.test(JSON.stringify(it));
  const k1i = register.items.find((i: any) => i.id === "CP8-GAP-canonicalDefectsJ");
  const k1evid = cp10.prs.find((p: any) => p.pr === 940);
  const h = register.items.find((i: any) => i.id === "H");
  const companion = rj(root, "docs/odg/v124-consolidated-roadmap.json");
  const gc = companion.missions.find((m: any) => m.id === "CM-RADAR-GATE-CHAIN");
  const v = V124.validate(companion, rj(root, "runtime/governance/ROADMAP.json"));
  const k3flag = /RADAR-GATE-CHAIN/.test(JSON.stringify(v)) && /commit|present|exists/i.test(JSON.stringify(v));
  const ks = [
    { id: "K1", a: `register ${k1i ? k1i.id : "?"} status ${k1i ? k1i.status : "?"}`, b: `CP10.prs #${k1evid ? k1evid.pr : "?"}: ${k1evid ? k1evid.what : "?"}`, flagged: flagIn(k1i) },
    { id: "K2", a: `register H status ${h.status}`, b: `CP10.missionH.status ${cp10.missionH.status}`, flagged: flagIn(h) },
    { id: "K3", a: `V12.4 companion ${gc.id} status ${gc.status} commit ${gc.commit}`, b: `runtime/core/odg-radar-gate-chain.ts exists=${fs.existsSync(path.join(root, "runtime/core/odg-radar-gate-chain.ts"))} (documented by hand in docs/odg/V14_4_ROADMAP.md §5)`, flagged: k3flag },
  ];
  const n = ks.filter((k) => k.flagged).length;
  return { grade: n === ks.length ? "PASS" : n > 0 ? "PARTIAL" : "FAIL", measured: { contradictions: ks, v124ValidateOk: v && v.ok }, metrics: { contradictionsLabelled: ks.length, contradictionsFlaggedByComponent: n } };
}

function s13(root: string): any {
  const adm = rj(root, `${EV}/V164_RADAR_SOURCE_ADMISSION.json`);
  const a = adm.decisions.every((d: any) => Array.isArray(d.reasons) && d.reasons.length > 0 && typeof d.evidenceSha256 === "string" && d.tier !== undefined);
  const grant = rj(root, "docs/odg/V372_RESEARCH_GRANT.json").grant;
  const now = Date.UTC(2026, 10, 24);
  const allow = RG.govern({ urls: ["https://www.nist.gov/publications"] }, grant, now);
  const deny = RG.govern({ urls: ["https://example.com/x"] }, grant, now);
  const exp = RG.govern({ urls: ["https://www.nist.gov/publications"] }, grant, grant.expiresMs + 1);
  const allowed = (r: any) => r && (r.allowed === true || r.decision === "ALLOW" || r.ok === true);
  const b = allowed(allow) && !allowed(deny) && !allowed(exp);
  const grade = !(a && b) ? "FAIL" : "PARTIAL";
  const aLoose = adm.decisions.every((d: any) => typeof d.evidenceSha256 === "string" && d.tier !== undefined && (d.decision === "ADMIT" || (Array.isArray(d.reasons) && d.reasons.length > 0)));
  const emptyReasonAdmits = adm.decisions.filter((d: any) => d.decision === "ADMIT" && !(Array.isArray(d.reasons) && d.reasons.length)).map((d: any) => d.host);
  const untightenedReading = { reportOnly: true, notGraded: true, reading: "reasons required only for DEFER/REFUSE (ADMIT justified by tier/admittedPrefixes/termsCondition)", a: aLoose, wouldGrade: !(aLoose && b) ? "FAIL" : "PARTIAL" };
  return { grade, gradeCause: a ? null : `FAIL is due to the pre-registered wording 'every decision carries reasons': the ${emptyReasonAdmits.length} ADMIT decisions carry an empty reasons[] (${emptyReasonAdmits.join(", ")}); governor checks (b) pass`, untightenedReading, measured: { a_admission: { summary: adm.summary, everyDecisionHasReasonsShaTier: a }, b_governor: { allowlisted: allow, nonAllowlisted: deny, afterExpiry: exp, ok: b }, c_newDiscovery: "NOT_MEASURED — real collection is network-gated (grant V372 active until 2026-12-22, but this baseline is offline)" },
    metrics: { admissionDecisionsWithEvidence: adm.decisions.length, newDiscoveriesMeasured: null } };
}

function s14(root: string, register: any): any {
  const sources = SS.loadSources(root);
  const rec = SS.compute(sources);
  const crit = register.items.flatMap((it: any) => Object.entries(it.criteria).map(([k, c]: any) => ({ item: it.id, k, c })));
  const nm = crit.filter((x: any) => x.c.status === "NOT_MEASURED");
  const withReason = nm.filter((x: any) => typeof x.c.reason === "string" && typeof x.c.rule === "string").length;
  const b1 = rec.grading.B.checks.b1, b2 = rec.grading.B.checks.b2;
  const converted = false; // no component turns a NOT_MEASURED criterion into a register item (CP10.openGaps lists it by hand)
  const grade = !(b1 && b2) ? "FAIL" : converted ? "PASS" : "PARTIAL";
  return { grade, measured: { criteriaValues: crit.length, notMeasured: nm.length, notMeasuredWithRuleAndReason: withReason, b1, b2, convertedToTrackedItem: converted, handRecordedIn: "docs/odg/evidence/V168_CHECKPOINT_10.json#openGaps ('4 register criteria NOT_MEASURED for every item')" },
    metrics: { unmeasuredSurfaced: withReason, unmeasuredScored: b2 ? 0 : null } };
}

function s15(root: string, state: any): any {
  const sc = scopeOf(state, "H");
  const verified = ["RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"].every((s) => sc.validatedSteps.some((v: any) => v.step === s));
  const val = rj(root, `${EV}/V168_H_CRITERIA_VALIDATION.json`);
  const ex = rj(root, `${EV}/V168_H_EXPERIMENT.json`);
  const grade = String(val.scenarioGrade && (val.scenarioGrade.grade || val.scenarioGrade)).toUpperCase();
  const adoption = JSON.stringify(val.adoption || ex.adoptionDecision || "");
  const aucs = ex.primary && ex.primary.auc ? ex.primary.auc : {};
  const h1 = typeof aucs.H1 === "number" ? aucs.H1 : null, b0 = typeof aucs.B0 === "number" ? aucs.B0 : null;
  const consistent = /FAIL/.test(grade) && /NOT_ADOPTED|NOT ADOPTED|REJECT/i.test(adoption) && h1 !== null && b0 !== null && h1 < b0;
  const g = !(verified && consistent) ? "FAIL" : "PARTIAL";
  return { grade: g, measured: { H_verifiedByAuthorizationScope: verified, recordedGrade: grade, adoption: JSON.parse(adoption || "null"), aucH1: h1, aucB0: b0, consistentVerdict: consistent, improvementsProvenInRecords: 0, note: "G is CLOSED_PARTIAL (V167 dossier); no adopted, held-out-verified improvement exists in the committed records" },
    metrics: { improvementsProven: 0, nonImprovementsCorrectlyRefused: consistent ? 1 : 0 } };
}

function compute(root: string): any {
  const state = loadState(root);
  const register = REG.buildRegister({ ...state.sources, inputs: state.inputs });
  const cp10 = rj(root, `${EV}/V168_CHECKPOINT_10.json`);
  const results: any = {
    1: s1(root, state, register, cp10), 2: s2(root, state), 3: s3(root, state), 4: s4(root, state), 5: s5(register), 6: s6(root, cp10), 7: s7(root, state),
    8: s8(state, register), 9: s9(state, register), 10: s10(root), 11: s11(root, state, register), 12: s12(root, register, cp10), 13: s13(root), 14: s14(root, register), 15: s15(root, state),
  };
  const scenarios = PRE_REGISTRATION.scenarios.map((s: any) => ({ n: s.n, name: s.name, grade: results[s.n].grade, ...(results[s.n].gradeCause ? { gradeCause: results[s.n].gradeCause, untightenedReading: results[s.n].untightenedReading } : {}), ...(s.addedAfterFirstRun ? { preRegisteredAfterFirstRunOfOthers: true } : {}), measured: results[s.n].measured, metrics: results[s.n].metrics }));
  const counts: any = {}; for (const s of scenarios) counts[s.grade] = (counts[s.grade] || 0) + 1;
  const m = (n: number) => results[n].metrics;
  const permR = m(8).permissionChecksRespected + m(9).permissionChecksRespected, permT = m(8).permissionChecksTried + m(9).permissionChecksTried;
  return {
    "//": "V16.9 addendum Phase 0 — §29 continuity BASELINE before any improvement. Read-only, offline; produced by runtime/bin/odg-v169-continuity-baseline.ts over committed records; nothing fixed. Mutations/fixtures are labelled and never committed.",
    schema: "ODG_V169_CONTINUITY_BASELINE/1",
    preRegistration: PRE_REGISTRATION,
    inputs: state.inputs.concat(["docs/odg/v124-consolidated-roadmap.json", "docs/odg/closure-register.json", `${EV}/V168_CHECKPOINT_10.json`, `${EV}/V168_H_GO_EXECUTE_TRACE.jsonl`, `${EV}/V164_RADAR_SOURCE_ADMISSION.json`, "docs/odg/V372_RESEARCH_GRANT.json"].map((rel) => ({ source: rel, sha256: sha256(fs.readFileSync(path.join(root, rel), "utf8")) }))),
    scenarios,
    summary: { counts, perScenario: scenarios.map((s: any) => `${s.n}:${s.grade}`) },
    honestLimits: [
      "the owner's addendum text (§21–§31) is NOT committed in the repository; scenario wording follows the owner text relayed by the coordinator (§29 verbatim list)",
      "scenarios #3 and #4 were PRE-REGISTERED AFTER the first run of the other 13 (the owner text arrived later; the first run recorded them NOT_MEASURED); their rules were written before #3/#4 were first run; no other rule was changed",
      "scenarios, labelled mutations/fixtures, ground-truth labels and grading rules were written by the technical provider after read-only exploration of the records (e.g. the GO dry-run halt and H's register status were seen before this bin was written); they were not edited after its first execution",
      "first-execution correction (measurement code, not a rule): S15 read the AUCs from a wrong field path (null ⇒ vacuous consistency); fixed to ex.primary.auc.{H1,B0}; the S15 grading rule is unchanged",
      "S13 is FAIL on the pre-registered wording 'every decision carries reasons': the 3 ADMIT decisions carry an empty reasons[] (reasons record refusal/deferral causes only; ADMIT is justified by tier/admittedPrefixes/termsCondition). Kept as FAIL — not re-graded; the scenario record carries gradeCause + an untightenedReading (report-only, NOT graded); the rule wording is flagged for owner review",
      "S6 ground truth: STALE = a committed record says so (CP10); FRESH = content-identical recomputation (odg-strategic-select --check). odg-observation-currency is path-based and conservative ⇒ the FRESH register is flagged HISTORICAL (false-stale 1/1)",
      "S1 runs the GO SELECT/actionability logic over committed records, not odg-go itself (odg-go Truth-Locks on branch main and reads host state); one real `odg-go --dry` on the main checkout is recorded under hostObservations",
      "S10: neither register has a BLOCKED item whose dependents are still open except p01-demand-validation → p01-billing-sandbox (itself BLOCKED); fan-out is computed by this runner, no component exposes it",
    ],
    metrics29: {
      recoveryPrecision: { value: Number(((m(1).correctResume + m(2).checkpointsLocated) / (m(1).resumeAttempts + m(2).checkpointLookups)).toFixed(4)), basis: "correct resume decisions + checkpoints located / lookups (S1+S2)" },
      correctResumeRate: { value: m(1).correctResume / m(1).resumeAttempts, basis: "S1 (a)+(c)" },
      interruptedStepsRecoveredByComponent: { value: m(1).interruptedStepsRecoveredByComponent, of: m(1).interruptedStepsTotal },
      statusErrors: { value: m(5).statusErrors + (m(12).contradictionsLabelled - m(12).contradictionsFlaggedByComponent), basis: "S5 register statuses differing from closure of record + S12 unflagged contradictions (K2 counted in both: overlap 1)", overlap: 1 },
      staleProofsDetected: { value: m(6).staleProofsDetected, of: m(6).staleProofsLabelled, falseStale: m(6).falseStaleOnFreshRecords },
      permissionRespect: { value: Number((permR / permT).toFixed(4)), basis: `${permR}/${permT} checks (S8+S9)` },
      repetitionsAvoided: { value: "see hostObservations (live attempt log — host state, not committed)", deterministicChecks: m(11).reExecutionsRefused, closedItemsStillStatusSelectable: m(11).closedItemsStillStatusSelectable },
      resumeTimeMs: { value: "NOT_MEASURED (deterministic record; wall-clock excluded — see hostObservations)" },
      resumeCost: { value: 0, unit: "paid calls", basis: "offline: no network, no model, no provider" },
      decisionQuality: { value: `${m(3).decisionsRetrieved}/${m(3).decisionsAsked} decisions + justifications retrievable from records; ${m(3).decisionsReturnedByComponent} returned by a component`, basis: "S3" },
      missionsUnblocked: { value: "NOT_MEASURED", basis: "Phase 0 applies no change (baseline); measured after a fix phase" },
      regressions: { value: "NOT_MEASURED", basis: "no before/after in Phase 0 — this record IS the 'before'" },
      improvementObtained: { value: m(15).improvementsProven, basis: "S15: adopted held-out-verified improvements in the committed records" },
      ownerMetricNames: ["précision de récupération=recoveryPrecision", "taux de reprise correcte=correctResumeRate", "qualité des décisions=decisionQuality", "erreurs de statut=statusErrors", "preuves périmées détectées=staleProofsDetected", "respect des permissions=permissionRespect", "répétitions évitées=repetitionsAvoided", "missions débloquées=missionsUnblocked", "temps et coût de reprise=resumeTimeMs+resumeCost", "régressions=regressions", "amélioration réellement obtenue=improvementObtained"],
    },
  };
}

function main(argv: string[]): number {
  const root = (() => { const i = argv.indexOf("--root"); return i >= 0 ? path.resolve(argv[i + 1]) : ROOT; })();
  const out = (() => { const i = argv.indexOf("--out"); return i >= 0 ? path.resolve(argv[i + 1]) : path.join(root, OUT_REL); })();
  const t0 = Date.now();
  const rec = compute(root);
  const ms = Date.now() - t0;
  if (argv.includes("--check")) {
    let committed: any;
    try { committed = JSON.parse(fs.readFileSync(out, "utf8")); } catch (e: any) { process.stderr.write(`--check: cannot read ${out}: ${e.message}\n`); return 1; }
    const { generatedAtHead: _h, hostObservations: _o, ...rest } = committed;
    if (JSON.stringify(rest) !== JSON.stringify(JSON.parse(JSON.stringify(rec)))) { process.stderr.write("--check: DRIFT — recomputed baseline differs from the committed record\n"); return 1; }
    process.stdout.write(`--check: OK (no drift) ${rec.summary.perScenario.join(" ")}\n`);
    return 0;
  }
  let prevHost: any = null;
  try { prevHost = JSON.parse(fs.readFileSync(out, "utf8")).hostObservations || null; } catch { prevHost = null; }
  const full = { generatedAtHead: git(root, ["rev-parse", "HEAD"]), ...rec, hostObservations: prevHost || { note: "fill by hand from host-state reads (not recomputed by --check)", computeMs: ms } };
  fs.writeFileSync(out, JSON.stringify(full, null, 2) + "\n");
  process.stdout.write(`wrote ${path.relative(root, out)} in ${ms} ms: ${rec.summary.perScenario.join(" ")}\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { compute, main, PRE_REGISTRATION, OUT_REL, chainHead, fanOut, dependsOnBlocked };
export {};
