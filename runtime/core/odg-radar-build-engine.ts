#!/usr/bin/env node
"use strict";
/*
 * V17.6 — RADAR BUILD ENGINE: the INTERNAL-IMPROVEMENT leg of the Radar loop (owner CTO directive V176 2026-11-24 §4
 * « LE RADAR DEVIENT UN MOTEUR DE CONSTRUCTION … Chaque découverte doit pouvoir déboucher sur une décision ou une mission
 * utile »). PURE, READ-ONLY, deterministic, synchronous, no network, no store: every input is INJECTED by the caller
 * (runtime/bin/odg-v176-radar-build-proposals.ts reads committed evidence + the runtime/core import graph).
 *
 * It COMPOSES the existing chain — it builds NO second radar / scheduler / registry / scoring formula:
 *   1 DETECT    detectSignals(): internal improvement signals from COMMITTED evidence (register NOT_MEASURED criteria,
 *               outcome-learning findings, production-metric gaps, latest-checkpoint open gaps and open owner decisions,
 *               governance owner questions, native-build lessons, open register contradictions, ADMITTED external Radar
 *               observations). Each signal cites its source pointer; nothing is collected live.
 *   2 ANALYSE   analyse(): each signal → an improvement KEY + EXISTING target components through the provider-declared
 *   3 COMPARE   LINKS table (DEDUP-1 precedent of odg-strategic-register.GAP_LINKS); multiplier = consumers of those
 *               components in the injected change-impact graph (change-impact-graph.buildGraph); a statement no link
 *               matches gets NO component (⇒ refused NO_COMPONENT_ATTACHED, never an invented target).
 *   4 PRIORITISE the signals run through odg-radar-to-mission-loop.runLoop (ODG_INTERNAL scope: deny-by-default gate,
 *               dedup against the register's item ids / contract ids / in-flight builds via opts.seenKeys); the admitted
 *               PROPOSALS become register-shaped candidates ranked by mission-priority-selector.selectNextExplained with
 *               the register's own WEIGHTS/DIRECTIONS (no new formula; score ≠ authorization).
 *   5 DESIGN    designContract(): a PROPOSED WORK_ITEM_CONTRACT draft per top proposal (write_set flagged ESTIMATE,
 *               acceptance tests, multiplier rationale, owner-gate status, governance path classes) — authorizedBy null.
 *   6 CONSTRUIRE is NOT done here: the draft enters the existing PROPOSED → AUTHORIZED path; nothing self-authorizes.
 *   7/8 MEASURE/LEARN: each proposal records the before-metric it intends to move (source-cited) and the rule a later run
 *               uses to compare after (after = null until a later committed record exists).
 *   SUPERSEDED  (V17.6 R2C) a proposal whose improvement already landed (declared SUPERSEDED table: delivering PRs + the
 *               artifact that proves it, VERIFIED present through the injected ctx.artifactExists) is marked supersededBy
 *               and never enters `top` (a delivered improvement is not re-proposed; absent artifact ⇒ NOT superseded).
 *   CONVERT     (V17.6 R2C, owner record docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json « Transformer les
 *               meilleures propositions Radar en contrats exécutables, sans créer de système parallèle ») convertToContracts():
 *               the top-N eligible drafts become WORK_ITEM_CONTRACT entries APPENDED to the EXISTING contracts file
 *               (V160_AP_WORK_ITEM_CONTRACTS.json — no new registry) in state PROPOSED, authorizedBy null, write_set still
 *               flagged ESTIMATE; binding (concrete write_set + inspection) is a later per-contract step when GO selects it.
 */
const crypto = require("crypto");
const LOOP = require("./odg-radar-to-mission-loop.js");
const SEL = require("./mission-priority-selector.js");
const REG = require("./odg-strategic-register.js");

const SCHEMA = "odg-v176-radar-build-proposals/1";
const NM_THRESHOLD = 0.5;       // RB-NM-1: a register criterion is a signal when NOT_MEASURED on ≥ 50% of the items
const PM_MIN_COUNT = 2;         // RB-PM-1: a production-metric NOT_MEASURED field is a signal when it recurs ≥ 2 times
const REWORK_SHARE = 0.5;       // RB-PM-2: open→last-commit share of summed open→merge time ≥ 0.5 ⇒ rework/wait signal
const TOP_N = 5;
const sha8 = (s: string): string => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 8);
const isObj = (v: any): boolean => v !== null && typeof v === "object" && !Array.isArray(v);
const slug = (s: string): string => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ── LINKS — provider-authored, declared (owner may replace). First match on the signal statement wins. ─────────────
 * key: improvement identity (dedup unit). registerItem: an EXISTING register item it duplicates (⇒ DUPLICATE, reinforces
 * that item). inFlight: an in-flight build named by the latest checkpoint '(build in progress: …)' (⇒ DUPLICATE).
 * components: existing runtime/core module basenames (or repo paths outside core: multiplier NOT_MEASURED). */
const LINKS: readonly any[] = Object.freeze([
  { re: /register criteria NOT_MEASURED|criterion \w+ NOT_MEASURED on|uncertainty at or above the selector's uncertaintyMax/, inFlight: "native criteria measurement" },
  { re: /native code construction by ODG merged = 0|nativeCodeLinesMerged = 0/, key: "RB-NATIVE-CODE-CONSTRUCTION", components: ["odg-native-repair-item", "odg-go-cycle"],
    objective: "ODG detects a second real defect class in its own repo and a GO-dispatched native build lands merged CODE (not evidence data) under a contract", writeSet: ["runtime/core/odg-native-repair-item.ts", "runtime/core/odg-native-repair-item.test.ts", "runtime/bin/odg-v175-native-build-run.ts"],
    acceptance: ["a new defect class is DETECTED by executed probes (not assumed) and cited", "the native build PASSes its held-out oracle in the sandbox", "after-metric nativeCodeLinesMerged > 0 in a recomputed production metric window"], metric: { path: "windowShare.nativeCodeLinesMerged" } },
  { re: /integration \(merge\) still by the coordinating session/, registerItem: "CP8-GAP-8-integrateResult" },
  { re: /cryptographic inspector identity|independence declared by session/, registerItem: "CP8-GAP-7-validateIndependently" },
  { re: /spend ceiling/, registerItem: "CP8-GAP-4-authorizeProvider" },
  { re: /stdout\/stderr discarded/, key: "RB-DISPATCH-DIAGNOSTICS", components: ["odg-go-cycle", "runtime/bin/odg-go.ts"],
    objective: "keep a bounded, redacted tail of the dispatched child's stdout/stderr in the GO trace so a failed dispatch is diagnosable", writeSet: ["runtime/bin/odg-go.ts", "runtime/core/odg-go-cycle.ts", "runtime/core/odg-go-cycle.test.ts"],
    acceptance: ["a failing dispatched child leaves a bounded stderr tail in the trace", "secrets are redacted (test with a planted token)", "trace size stays bounded"], metric: { text: "dispatched child stdout/stderr discarded" } },
  { re: /claim store keyed/, key: "RB-GO-CLAIM-STORE-KEY", components: ["odg-go-cycle", "runtime/bin/odg-go.ts"],
    objective: "key the GO one-shot claim store to the canonical repository identity, not the --repo git common dir", writeSet: ["runtime/bin/odg-go.ts", "runtime/core/odg-go-cycle.test.ts"],
    acceptance: ["two worktrees of one repo share one claim", "two distinct repos never share a claim"], metric: { text: "claim store keyed to --repo common dir" } },
  { re: /setsid grandchild/, key: "RB-DISPATCH-PROCESS-GROUP", components: ["odg-go-cycle", "runtime/bin/odg-go.ts"],
    objective: "a GO deadline/stop terminates every descendant of the dispatched child, including setsid grandchildren", writeSet: ["runtime/bin/odg-go.ts", "runtime/core/odg-go-cycle.test.ts"],
    acceptance: ["a test child that spawns a setsid grandchild leaves no live process after GO stop"], metric: { text: "setsid grandchild escapes the dispatch process group" } },
  { re: /reached PASS by their pre-registered rule/, key: "RB-PASS-PROBABILITY-CALIBRATION", components: ["odg-native-outcome-calibration", "mission-priority-selector"],
    objective: "the selector reports a calibrated P(PASS) per candidate from realized grades (report-only first), so a prediction can be compared to outcomes", writeSet: ["runtime/core/odg-outcome-learning.ts", "runtime/core/odg-outcome-learning.test.ts", "runtime/bin/odg-v175-outcome-learning.ts"],
    acceptance: ["passRateCalibration.pForPlanner is non-null once ≥ the calibrator's minimum observations exist", "NOT fed into scoring without a separate inspected change"], metric: { path: "passRateCalibration.successes" } },
  { re: /selection drift/, key: "RB-SELECTION-AT-RUN-HEAD", components: ["odg-go-cycle", "mission-priority-selector"],
    objective: "GO re-derives the register selection at run head and refuses (or records the owner override) when it differs from the selection being executed", writeSet: ["runtime/core/odg-go-cycle.ts", "runtime/core/odg-go-cycle.test.ts"],
    acceptance: ["a stale selection is detected before EXECUTE", "the trace records selectedAt vs runHead"], metric: { finding: true } },
  { re: /never the register's selection|strategic selection was not the dispatched mission/, key: "RB-DISPATCH-SELECTION-ALIGNMENT", components: ["odg-go-cycle", "odg-strategic-register"],
    objective: "make the register's choice actionable (contract + owner step stated) so GO dispatches the register selection instead of an override", writeSet: ["runtime/core/odg-go-cycle.ts", "runtime/core/odg-go-cycle.test.ts"],
    acceptance: ["a GO run over the committed register dispatches the register selection or states the missing owner step", "owner overrides stay recorded"], metric: { finding: true } },
  { re: /score did not separate outcomes|did not anticipate success/, key: "RB-OUTCOME-FEEDBACK-TO-SCORING", components: ["odg-outcome-learning", "mission-priority-selector"],
    objective: "propose an inspected, owner-visible change that lets outcome learning adjust criterion trust (report-only today: feedsScoring=false)", writeSet: ["runtime/core/odg-outcome-learning.ts", "runtime/core/odg-outcome-learning.test.ts"],
    acceptance: ["the adjustment is computed from ≥ minSupport outcomes and cited", "weights are unchanged unless an independent inspection accepts the change"], metric: { finding: true } },
  { re: /re-attempts of a non-PASS parent/, key: "RB-REATTEMPT-CHANGED-INPUT", components: ["mission-priority-selector", "odg-strategic-register"],
    objective: "a re-attempt of a non-PASS parent must cite a measured changed input (new data/strategy) before it is selectable", writeSet: ["runtime/core/odg-strategic-register.ts", "runtime/core/odg-strategic-register.test.ts"],
    acceptance: ["a re-attempt with no stated changed input is NOT selectable", "one with a cited changed input is"], metric: { finding: true } },
  { re: /providerEngagedEur/, registerItem: "V150-T07" },
  { re: /costAvailableEur/, key: "RB-OWNER-BUDGET-FIELD", ownerGatedKind: "owner_decision", components: ["odg-production-metric"],
    objective: "owner states a € budget per contract so cost-vs-budget becomes measurable", writeSet: ["docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json"], acceptance: ["costAvailableEur MEASURED for new contracts"], metric: { field: "costAvailableEur" } },
  { re: /inspectionVerdictAt/, key: "RB-RECORD-INSPECTION-VERDICT-TIME", components: ["odg-production-metric", "evaluator-independence"],
    objective: "record the inspection verdict timestamp in the committed inspection record so verdict latency is measured, not bounded", writeSet: ["runtime/core/odg-production-metric.ts", "runtime/core/odg-production-metric.test.ts"],
    acceptance: ["inspectionVerdictAt MEASURED for PRs inspected after the change", "older PRs stay NOT_MEASURED (no backfill guess)"], metric: { field: "inspectionVerdictAt" } },
  { re: /preOpenBuildMs/, key: "RB-RECORD-WORK-START", components: ["odg-production-metric", "odg-go-cycle"],
    objective: "record work start (GO dispatch or contract AUTHORIZED time) so pre-PR build time is measured", writeSet: ["runtime/core/odg-production-metric.ts", "runtime/core/odg-production-metric.test.ts"],
    acceptance: ["preOpenBuildMs MEASURED for GO-dispatched work", "no inferred start for older PRs"], metric: { field: "preOpenBuildMs" } },
  { re: /recordRunMs|localModelCalls/, key: "RB-RECORD-RUN-ACCOUNTING", components: ["odg-production-metric", "odg-go-cycle"],
    objective: "experiment records carry run start/finish and local-model call counts", writeSet: ["runtime/core/odg-production-metric.ts", "runtime/core/odg-production-metric.test.ts"],
    acceptance: ["recordRunMs and localModelCalls MEASURED for new experiment records"], metric: { field: "recordRunMs" } },
  { re: /open→last-commit share/, key: "RB-PRE-OPEN-SELF-INSPECTION", components: ["evaluator-independence", "inspection-boundary"],
    objective: "run the inspection checklist (tests one file at a time, --check, fail-closed review) BEFORE a PR opens, to cut post-open rework", writeSet: ["runtime/core/inspection-boundary.ts", "runtime/core/evaluator-independence.test.ts"],
    acceptance: ["afterOpenUntilLastCommitShare falls in a later production-metric window", "PRs with inspection-finding commits fall"], metric: { path: "prTimeline.aggregate.split.afterOpenUntilLastCommitShare" } },
  { re: /Q-CTR2|'le Radar existant'/, key: "RB-OWNER-Q-CTR2", ownerGatedKind: "owner_decision", components: ["odg-governance-precedence"],
    objective: "owner answers Q-CTR2 (scope of 'le Radar existant'); the interim RADAR-1 is then replaced by the answer", writeSet: ["docs/odg/evidence/V175_GOVERNANCE_PRECEDENCE.json"], acceptance: ["ownerQuestions[Q-CTR2].answer non-null and quoted verbatim"], metric: { text: "Q-CTR2 answer null" } },
  { re: /PROPOSED → AUTHORIZED/, registerItem: "J" },
  { re: /V15\.0 adoption/, key: "RB-OWNER-V150-ADOPTION", ownerGatedKind: "owner_decision", components: ["odg-governance-precedence"],
    objective: "owner decides V15.0 adoption (OD-1)", writeSet: ["docs/odg/evidence/V175_GOVERNANCE_PRECEDENCE.json"], acceptance: ["V15_0 source status changes by an owner record"], metric: { text: "V15.0 status PROPOSED" } },
  { re: /GitHub AUP|deferred Radar sources/, key: "RB-OWNER-RADAR-SOURCES", ownerGatedKind: "owner_decision", components: ["odg-radar-source-admission"],
    objective: "owner decides the deferred Radar sources (terms/AUP, per-host pacing) so admission can move DEFER → ADMIT/REFUSE", writeSet: ["docs/odg/evidence/V164_RADAR_SOURCE_ADMISSION.json"], acceptance: ["deferred count falls in a re-run admission record"], metric: { text: "deferred Radar sources" } },
  { re: /target of (V\d+-NB\d+)/, inFlightFromText: true },
  { re: /OWNER_GATED: .*migrating/, key: "RB-CANON-CALLER-MIGRATION", ownerGatedKind: "owner_decision", componentsFrom: "defectiveSites",
    objective: "owner decides whether defective canon() callers migrate to odg-canonical-json (changes persisted hash/signature preimages)", writeSet: ["runtime/core/audit-log.ts", "runtime/core/agent-identity.ts"], acceptance: ["a migration plan with a re-sign/re-chain step is owner-approved before any code change"], metric: { path: "detection.defectiveSites.length" } },
  { re: /STALE_CHECKPOINT_POINTER/, key: "RB-REGISTER-CHECKPOINT-POINTERS", components: ["odg-strategic-register"],
    objective: "extend the declared BLOCKER_FIELDS / PR_RECORD_FIELDS to the latest checkpoint under an inspected rule change", writeSet: ["runtime/core/odg-strategic-register.ts", "runtime/core/odg-strategic-register.test.ts", "docs/odg/evidence/V164_STRATEGIC_REGISTER.json"],
    acceptance: ["CTR-3 no longer detected", "BLK-2/REL-2 changes are listed and inspected"], metric: { text: "CTR-3 OPEN" } },
  { re: /jidoka|stop-on-defect|automation with a human touch/, key: "RB-EXT-JIDOKA-STOP-ON-DEFECT", components: ["odg-jidoka-completeness"],
    objective: "experiment: apply the admitted jidoka principle (stop on defect, human touch) as a completeness check on ODG's own pipeline stops", writeSet: ["runtime/core/odg-jidoka-completeness.ts", "runtime/core/odg-jidoka-completeness.test.ts"],
    acceptance: ["every pipeline stop path is enumerated and each has a stop-on-defect test", "external claim stays RETURN_TO_EXPERIMENT until the experiment is graded"], metric: { text: "admitted external observation, verdict RETURN_TO_EXPERIMENT" } },
] as any[]);
/* ── SUPERSEDED — provider-declared: improvements a merged PR already delivered. Applies ONLY when the cited artifact
 * exists (ctx.artifactExists, injected): a declaration without its artifact is not evidence ⇒ the proposal stays live. */
const SUPERSEDED: readonly any[] = Object.freeze([
  Object.freeze({ key: "RB-OUTCOME-FEEDBACK-TO-SCORING", deliveredBy: Object.freeze(["#994"]), artifact: "runtime/core/odg-outcome-feedback.ts",
    note: "outcome feedback → selector scoring delivered (odg-outcome-feedback OFB-CAL-2 attribution, report-only until ACTIVATE)" }),
  Object.freeze({ key: "RB-PRE-OPEN-SELF-INSPECTION", deliveredBy: Object.freeze(["#987", "#998"]), artifact: "runtime/bin/odg-pre-open-gate.ts",
    note: "pre-open self-inspection gate delivered (#987) and its test-selection / regeneration-order gaps fixed (#998)" }),
]);
const SUPERSEDED_RULE = "SUP-1: a proposal is SUPERSEDED iff its key is in the declared SUPERSEDED table AND the cited artifact exists in the repository (injected ctx.artifactExists); superseded proposals stay listed (supersededBy = delivering PRs + artifact) but never enter top or a conversion; no artifact (or no predicate) ⇒ NOT superseded";
function supersededOf(key: string, ctx: any): any {
  const d = SUPERSEDED.find((x: any) => x.key === key);
  if (!d || !ctx || typeof ctx.artifactExists !== "function" || ctx.artifactExists(d.artifact) !== true) return null;
  return { rule: "SUP-1", prs: d.deliveredBy.slice(), artifact: d.artifact, note: d.note };
}
const LINKS_RULE = "LINK-1: provider-authored declared table (DEDUP-1 precedent): the FIRST link whose regex matches the signal statement gives its key/components; registerItem / inFlight links make the signal a DUPLICATE of that existing item (it reinforces it, never re-creates it); a statement matching no link gets no component ⇒ the deny-by-default gate refuses it NO_COMPONENT_ATTACHED (never an invented target)";

/* ── 1 DETECT ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
function sig(origin: string, source: string, statement: string, extra?: any): any {
  return Object.assign({ origin, sources: [source], statement: String(statement) }, extra || {});
}
function walkNotMeasured(o: any, ptr: string, out: any[]): void {
  if (Array.isArray(o)) { o.forEach((v, i) => walkNotMeasured(v, `${ptr}[${i}]`, out)); return; }
  if (!isObj(o)) return;
  if (o.status === "NOT_MEASURED") { out.push(ptr); return; }
  for (const k of Object.keys(o)) walkNotMeasured(o[k], `${ptr}.${k}`, out);
}

/* detectSignals(src) — src: { register, outcome, production, checkpoint, precedence, nb1Validation, nativeBuild,
 * externalRadar[], testReports[] } each { path, data } | null. Returns { signals, ignored, absent }. */
function detectSignals(src: any): any {
  const S: any[] = [], ignored: any[] = [], absent: any[] = [];
  const has = (k: string) => src && src[k] && isObj(src[k].data);
  // A — register NOT_MEASURED criteria (by criterion, items cited)
  if (has("register")) {
    const R = src.register, items: any[] = Array.isArray(R.data.register && R.data.register.items) ? R.data.register.items : [];
    for (const c of REG.CRITERIA) {
      const nm = items.filter((it: any) => it.criteria && it.criteria[c.name] && it.criteria[c.name].status === "NOT_MEASURED").map((it: any) => it.id);
      if (items.length && nm.length / items.length >= NM_THRESHOLD)
        S.push(sig("REGISTER_NOT_MEASURED", `${R.path}#register.items[*].criteria.${c.name}`, `criterion ${c.name} NOT_MEASURED on ${nm.length}/${items.length} register items`, { claimStatus: "OBSERVED", before: { name: `register.${c.name}.notMeasuredItems`, value: nm.length, of: items.length, items: nm } }));
    }
    const det = R.data.register && R.data.register.contradictions && Array.isArray(R.data.register.contradictions.detected) ? R.data.register.contradictions.detected : [];
    det.forEach((d: any, i: number) => { if (d && d.state === "OPEN") S.push(sig("REGISTER_CONTRADICTION", `${R.path}#register.contradictions.detected[${i}]`, `${d.rule} ${d.kind}: ${d.a} vs ${d.b}`, { claimStatus: "OBSERVED", before: { name: `register.contradictions.${d.rule}`, value: "OPEN" } })); });
  } else absent.push("register");
  // B — outcome-learning findings (HYPOTHESIS: the record exists; its content is a hypothesis, never a fact)
  if (has("outcome")) (Array.isArray(src.outcome.data.findings) ? src.outcome.data.findings : []).forEach((f: any, i: number) =>
    S.push(sig("OUTCOME_FINDING", `${src.outcome.path}#findings[${i}]`, `${f.id}: ${f.statement}`, { claimStatus: String(f.status || "HYPOTHESIS"), before: { name: `outcomeLearning.${f.id}.n`, value: Number.isFinite(f.n) ? f.n : null, support: f.support || [] } })));
  else absent.push("outcome");
  // C — production-metric gaps
  if (has("production")) {
    const P = src.production, ws = P.data.windowShare || {};
    if (ws.nativeCodeLinesMerged === 0) S.push(sig("PRODUCTION_GAP", `${P.path}#windowShare.nativeCodeLinesMerged`, `nativeCodeLinesMerged = 0 in window ${ws.prs} (providerLinesMerged ${ws.providerLinesMerged})`, { claimStatus: "OBSERVED", before: { name: "windowShare.nativeCodeLinesMerged", value: 0, providerLinesMerged: ws.providerLinesMerged } }));
    const nm: string[] = []; walkNotMeasured(P.data.missions, "missions", nm); walkNotMeasured(P.data.prTimeline, "prTimeline", nm);
    const byField: any = {};
    for (const p of nm) { const f = p.replace(/\[\d+\]/g, "[*]"); (byField[f] = byField[f] || []).push(p); }
    for (const f of Object.keys(byField).sort()) {
      if (byField[f].length < PM_MIN_COUNT) continue;
      const leaf = f.split(".").pop();
      S.push(sig("PRODUCTION_GAP", `${P.path}#${f}`, `${leaf} NOT_MEASURED ${byField[f].length} times (${f})`, { claimStatus: "OBSERVED", before: { name: `productionMetric.${leaf}.notMeasured`, value: byField[f].length } }));
    }
    const ag = P.data.prTimeline && P.data.prTimeline.aggregate, sp = ag && ag.split;
    if (sp && typeof sp.afterOpenUntilLastCommitShare === "number" && sp.afterOpenUntilLastCommitShare >= REWORK_SHARE)
      S.push(sig("PRODUCTION_GAP", `${P.path}#prTimeline.aggregate.split.afterOpenUntilLastCommitShare`, `open→last-commit share ${sp.afterOpenUntilLastCommitShare} of summed open→merge time; ${(ag.withInspectionFindingCommits || []).length}/${ag.prs} PRs carry inspection-finding commits`, { claimStatus: "OBSERVED", before: { name: "prTimeline.aggregate.split.afterOpenUntilLastCommitShare", value: sp.afterOpenUntilLastCommitShare, prsWithInspectionFindingCommits: (ag.withInspectionFindingCommits || []).length, prs: ag.prs } }));
  } else absent.push("production");
  // D/E — latest checkpoint open gaps + open owner decisions
  if (has("checkpoint")) {
    const C = src.checkpoint;
    (Array.isArray(C.data.openGaps) ? C.data.openGaps : []).forEach((g: any, i: number) => S.push(sig("OPEN_GAP", `${C.path}#openGaps[${i}]`, String(g), { claimStatus: "OBSERVED", before: { name: "checkpoint.openGap", value: "OPEN" } })));
    (Array.isArray(C.data.ownerDecisionsOpen) ? C.data.ownerDecisionsOpen : []).forEach((g: any, i: number) => S.push(sig("OWNER_DECISION", `${C.path}#ownerDecisionsOpen[${i}]`, String(g), { claimStatus: "OBSERVED", ownerGatedKind: "owner_decision", before: { name: "checkpoint.ownerDecisionOpen", value: "OPEN" } })));
  } else absent.push("checkpoint");
  if (has("precedence")) (Array.isArray(src.precedence.data.ownerQuestions) ? src.precedence.data.ownerQuestions : []).forEach((q: any, i: number) => {
    if (q && (q.answer === null || q.answer === undefined)) S.push(sig("OWNER_DECISION", `${src.precedence.path}#ownerQuestions[${i}]`, `${q.id} (blocking=${q.blocking === true}): ${q.question}`, { claimStatus: "OBSERVED", ownerGatedKind: "owner_decision", before: { name: `ownerQuestions.${q.id}.answer`, value: null } }));
  });
  else absent.push("precedence");
  // F — native-build lessons (NB1)
  if (has("nb1Validation")) (Array.isArray(src.nb1Validation.data.limits) ? src.nb1Validation.data.limits : []).forEach((l: any, i: number) => {
    const p = `${src.nb1Validation.path}#limits[${i}]`;
    if (/not a defect/i.test(String(l))) { ignored.push({ source: p, reason: "RB-NB-1: the record itself states 'not a defect'" }); return; }
    S.push(sig("NATIVE_LESSON", p, String(l), { claimStatus: "OBSERVED", before: { name: "nb1.limit", value: "OPEN" } }));
  });
  else absent.push("nb1Validation");
  if (has("nativeBuild") && typeof src.nativeBuild.data.integration === "string" && /^OWNER_GATED/.test(src.nativeBuild.data.integration)) {
    const sites = (src.nativeBuild.data.detection && Array.isArray(src.nativeBuild.data.detection.defectiveSites)) ? src.nativeBuild.data.detection.defectiveSites : [];
    S.push(sig("NATIVE_LESSON", `${src.nativeBuild.path}#integration`, src.nativeBuild.data.integration, { claimStatus: "OBSERVED", ownerGatedKind: "owner_decision", defectiveSites: sites.map((s: any) => s.file).filter((f: any) => typeof f === "string"), before: { name: "detection.defectiveSites.length", value: sites.length } }));
  } else if (!has("nativeBuild")) absent.push("nativeBuild");
  // H — ADMITTED external Radar observations only (single-source / not admitted ⇒ ignored, counted)
  for (const E of (Array.isArray(src.externalRadar) ? src.externalRadar : [])) {
    if (!E || !isObj(E.data)) continue;
    (Array.isArray(E.data.results) ? E.data.results : []).forEach((r: any, i: number) => {
      const p = `${E.path}#results[${i}]`;
      if (!(Number(r.admitted) > 0)) { ignored.push({ source: p, reason: "RB-EXT-1: external observation not admitted (single-source or rejected) — never a build signal" }); return; }
      S.push(sig("EXTERNAL_ADMITTED", p, `${r.claim} — capability: ${r.capability}`, { claimStatus: `ADMITTED_FACT; application=${r.verdict || "NOT_STATED"}`, externalSources: Array.isArray(r.sources) ? r.sources.slice() : [], before: { name: "external.application", value: r.verdict || null } }));
    });
  }
  // I — committed failing/stale test report (none committed ⇒ recorded absent, never assumed green)
  if (!(Array.isArray(src.testReports) && src.testReports.length)) absent.push("testReport (no committed failing/stale test report: NOT_MEASURED, not assumed green)");
  else for (const T of src.testReports) ((T.data && Array.isArray(T.data.failing)) ? T.data.failing : []).forEach((t: any, i: number) => S.push(sig("TEST_REPORT", `${T.path}#failing[${i}]`, `failing test ${typeof t === "string" ? t : JSON.stringify(t)}`, { claimStatus: "OBSERVED", before: { name: "failingTests", value: T.data.failing.length } })));
  return { signals: S, ignored, absent };
}

/* ── 2/3 ANALYSE + COMPARE ─────────────────────────────────────────────────────────────────────────────────────────── */
function reverseClosure(graph: any, m: string): string[] {
  const seen = new Set<string>(); const stack = [m];
  while (stack.length) { const n = stack.pop() as string; for (const c of (graph.consumers[n] || [])) if (!seen.has(c) && c !== m) { seen.add(c); stack.push(c); } }
  return Array.from(seen).sort();
}
function multiplierOf(components: string[], graph: any): any {
  const per = components.map((c) => {
    if (!graph || !Array.isArray(graph.modules) || !graph.modules.includes(c)) return { component: c, inCoreGraph: false, directConsumers: null, transitiveDependents: null, note: "outside the runtime/core import graph ⇒ NOT_MEASURED" };
    return { component: c, inCoreGraph: true, directConsumers: (graph.consumers[c] || []).length, transitiveDependents: reverseClosure(graph, c).length };
  });
  const measured = per.filter((p) => p.inCoreGraph);
  return { perComponent: per, maxDirectConsumers: measured.length ? Math.max(...measured.map((p) => p.directConsumers as number)) : null, maxTransitiveDependents: measured.length ? Math.max(...measured.map((p) => p.transitiveDependents as number)) : null, source: "change-impact-graph.buildGraph (runtime/core import graph, injected)" };
}
function analyse(signals: any[], ctx: any): any[] {
  return signals.map((s) => {
    const L = LINKS.find((l: any) => l.re.test(s.statement)) || null;
    let id: string, components: string[] = [], link: any = { rule: "LINK-1", matched: false };
    if (L && L.registerItem) { id = L.registerItem; components = ["odg-strategic-register"]; link = { rule: "LINK-1", matched: true, duplicateOf: { kind: "REGISTER_ITEM", id: L.registerItem } }; }
    else if (L && (L.inFlight || L.inFlightFromText)) {
      const name = L.inFlightFromText ? (L.re.exec(s.statement) as any)[1] : L.inFlight;
      id = L.inFlightFromText ? name : `IN_FLIGHT:${slug(name)}`; components = ["odg-strategic-register"];
      link = { rule: "LINK-1", matched: true, duplicateOf: { kind: "IN_FLIGHT_BUILD", id, name } };
    } else if (L) {
      id = L.key; components = L.componentsFrom === "defectiveSites" ? Array.from(new Set((s.defectiveSites || []).map((f: string) => f.replace(/^runtime\/core\//, "").replace(/\.ts$/, "")))).sort() as string[] : L.components.slice();
      link = { rule: "LINK-1", matched: true, key: L.key };
    } else { id = `RB-UNMAPPED-${s.origin}-${sha8(s.sources[0])}`; components = []; }
    const ownerGatedKind = s.ownerGatedKind || (L && L.ownerGatedKind) || null;   // a link may declare the owner gate (e.g. a € budget)
    return Object.assign({}, s, { id, link, ownerGatedKind, targetComponents: components, multiplier: multiplierOf(components, ctx.graph), _link: L });
  });
}

/* ── 4 PRIORITISE (existing loop gate + existing selector) ─────────────────────────────────────────────────────────── */
function knownKeys(src: any, inFlight: string[]): string[] {
  const reg: string[] = src.register && src.register.data && src.register.data.register && Array.isArray(src.register.data.register.items) ? src.register.data.register.items.map((it: any) => String(it.id)) : [];
  const con = src.contracts && src.contracts.data && Array.isArray(src.contracts.data.contracts) ? src.contracts.data.contracts.map((c: any) => String(c.scenario)) : [];
  return (Array.from(new Set(reg.concat(con).concat(inFlight))) as string[]).sort();
}
function inFlightBuilds(src: any): string[] {
  const out: string[] = [];
  const C = src.checkpoint && src.checkpoint.data;
  for (const g of (C && Array.isArray(C.openGaps) ? C.openGaps : [])) { const m = /\(build in progress: ([^)]+)\)/.exec(String(g)); if (m) out.push(`IN_FLIGHT:${slug(m[1])}`); }
  for (const l of (src.nb1Validation && src.nb1Validation.data && Array.isArray(src.nb1Validation.data.limits) ? src.nb1Validation.data.limits : [])) { const m = /target of (V\d+-NB\d+)/.exec(String(l)); if (m) out.push(m[1]); }
  return Array.from(new Set(out)).sort();
}
function criterion(status: string, value: any, rule: string, basis: string): any { return status === "MEASURED" ? { status, value, rule, basis } : { status: "NOT_MEASURED", value: null, rule, reason: basis }; }
function crc1(draft: any): number { return Math.min(1, (draft.acceptance_criteria.length + draft.write_set.paths.length) / 10 + (draft.ownerGate.required ? 0.3 : 0)); }
function candidateCriteria(group: any[], draft: any): any {
  const files = new Set<string>(); for (const s of group) for (const p of s.sources) files.add(String(p).split("#")[0]);
  const rep = group[0], mx = rep.multiplier.maxDirectConsumers;
  const out: any = {};
  for (const c of REG.CRITERIA) out[c.name] = criterion("NOT_MEASURED", null, "RB-0", "no committed evidence measures this criterion for an internal-improvement proposal (cost/benefit unknown ⇒ NOT_MEASURED, never a default)");
  out.evidenceLevel = criterion("MEASURED", Math.min(1, files.size / 4), "RB-EVD", `k=${files.size} distinct committed source files cite this improvement (EVD-1 n/4 scale)`);
  out.blockerRepetitionReduction = criterion("MEASURED", Math.min(1, group.length / 4), "RB-BLK", `n=${group.length} independent signal(s) map to this improvement (repetition; BLK-2 n/4 scale)`);
  out.reusability = mx === null ? criterion("NOT_MEASURED", null, "RB-REU", "no target component inside the runtime/core import graph") : criterion("MEASURED", Math.min(1, mx / 4), "RB-REU", `max direct consumers of the target components = ${mx} (n/4 scale)`);
  out.costRiskComplexity = criterion("MEASURED", crc1(draft), "CRC-1", "CRC-1 applied verbatim to the PROPOSED draft (write_set is an ESTIMATE ⇒ the size term is an estimate)");
  return out;
}

/* ── 5 DESIGN ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
function designContract(rep: any, group: any[], gate: any, ctx: any): any {
  const L = rep._link || {};
  const ownerRequired = gate.verdict === "OWNER_GATED";
  const ws = Array.isArray(L.writeSet) ? L.writeSet.slice() : [];
  const cls = (p: string) => (ctx.classifyPath ? ctx.classifyPath(p) : "NOT_CLASSIFIED");
  const radarStage = ws.filter((p: string) => cls(p) === "RADAR_STAGE");
  const before = group.map((s) => Object.assign({ source: s.sources[0] }, s.before));
  return {
    id: rep.id, kind: "WORK_ITEM_CONTRACT_DRAFT", state: "PROPOSED", authorizedBy: null,
    objective: L.objective || `NOT_DERIVED: no declared objective for ${rep.id}`,
    source: { directive: "owner CTO directive V176 2026-11-24 §4 (Radar → construction)", signals: group.map((s) => s.sources[0]) },
    scope: `improve ${rep.targetComponents.join(", ") || "(no component)"} only; no Radar egress, no spend, no canonical-authority change`,
    write_set: { estimate: true, paths: ws, basis: "provider-declared LINK-1 guess — an ESTIMATE to be confirmed when the contract is authored; NOT an authorized write_set" },
    acceptance_criteria: (Array.isArray(L.acceptance) ? L.acceptance : []).concat(["tsc clean; each touched test file passes run one at a time", "the before-metric is recomputed from committed evidence and compared (MEASURE/LEARN)"]),
    invariants: ["PROPOSED ≠ AUTHORIZED ≠ EXECUTED", "score ≠ authorization", "hypothesis ≠ fact", "no network / no spend / no protected path"],
    stop_conditions: ["write_set must grow beyond the authorized one", "a protected path (Master/Constitution/CTO directives/ROADMAP.json/secrets/deploy) is needed", "an owner question blocks"],
    rollback: "revert the single PR (additive change)",
    evidence_required: ["test output per file", "recomputed before/after metric record", "independent inspection verdict"],
    multiplier: Object.assign({}, rep.multiplier, { rationale: rep.multiplier.maxTransitiveDependents === null ? "target outside the core import graph: reach NOT_MEASURED" : `a change to ${rep.targetComponents.join("/")} reaches ≤ ${rep.multiplier.maxTransitiveDependents} transitive dependents (${rep.multiplier.maxDirectConsumers} direct) — reach, not benefit` }),
    ownerGate: { required: ownerRequired, status: ownerRequired ? "OWNER_GATED" : "PROPOSED_AWAITING_AUTHORIZATION", reason: gate.reasons.slice() },
    governance: { classes: ws.map((p: string) => ({ path: p, class: cls(p) })), radarStagePaths: radarStage, anchorIfRadarStage: radarStage.length ? "V12.4 I CM-RADAR-GATE-CHAIN / V14.4 phase 1 (RADAR-1 interim; never a V15.0-campaign contract)" : null, v150Campaign: false },
    measure: { before, after: null, compareRule: "LEARN-1: a later run recomputes each before-metric from the then-committed source at the same pointer; improved iff it moved in the objective's direction; unchanged ⇒ NOT_IMPROVED; source missing ⇒ NOT_MEASURED (never assumed)" },
  };
}

/* buildProposals(src, ctx) — ctx: { graph, nowEpochMs, sourceEpochMs:{path:ms}, classifyPath(p) }. */
function buildProposals(src: any, ctx: any): any {
  const det = detectSignals(src);
  const analysed = analyse(det.signals, ctx);
  const inFlight = inFlightBuilds(src);
  const seenKeys = knownKeys(src, inFlight);
  const loopSignals = analysed.map((s: any) => ({
    id: s.id, scope: LOOP.INTERNAL_SCOPE, synthetic: false, provenance: "OBSERVED_EVIDENCE", sources: s.sources.slice(),
    consultedEpochMs: (ctx.sourceEpochMs || {})[String(s.sources[0]).split("#")[0]], targetComponents: s.targetComponents, ownerGatedKind: s.ownerGatedKind || null,
  }));
  const run = LOOP.runLoop(loopSignals, { nowEpochMs: ctx.nowEpochMs, seenKeys });
  const signals = analysed.map((s: any, i: number) => {
    const t = run.traces[i]; const { _link, defectiveSites, ...pub } = s;
    return Object.assign(pub, { gate: { verdict: t.gate.verdict, reasons: t.gate.reasons.slice(), authorized: t.gate.authorized, executed: t.gate.executed }, assess: { ageDays: t.assess.ageDays, fresh: t.assess.fresh, corroboration: t.assess.corroboration.level }, qualification: t.qualify.tier });
  });
  // group admitted proposals by key (first admitted signal = representative; later same-key signals are DUPLICATE ⇒ reinforce)
  const groups: any = {};
  analysed.forEach((s: any, i: number) => { (groups[s.id] = groups[s.id] || []).push({ s, t: run.traces[i] }); });
  const proposals: any[] = [], reinforces: any[] = [];
  for (const key of Object.keys(groups).sort()) {
    const g = groups[key], head = g.find((x: any) => x.t.gate.verdict !== "REFUSED");
    const dupOnly = g.every((x: any) => x.t.gate.reasons.includes("DUPLICATE"));
    if (dupOnly) { reinforces.push({ existing: key, kind: seenKeys.includes(key) ? (inFlight.includes(key) ? "IN_FLIGHT_BUILD" : "REGISTER_ITEM_OR_CONTRACT") : "UNKNOWN", signals: g.map((x: any) => x.s.sources[0]) }); continue; }
    if (!head) continue;
    const group = g.filter((x: any) => x.t.gate.verdict !== "REFUSED" || x.t.gate.reasons.every((r: string) => r === "DUPLICATE")).map((x: any) => x.s);
    const draft = designContract(head.s, group, head.t.gate, ctx);
    proposals.push({ id: key, supersededBy: supersededOf(key, ctx), verdict: head.t.gate.verdict, status: "PROPOSED", requiresOwnerAuthorization: head.t.gate.verdict === "OWNER_GATED", ownerReason: head.t.gate.verdict === "OWNER_GATED" ? head.t.gate.reasons.join("; ") : null, components: head.s.targetComponents, signalCount: group.length, criteria: candidateCriteria(group, draft), draft });
  }
  const candidates = proposals.map((p) => ({ id: p.id, status: p.status, deps: [], requiresOwnerAuthorization: p.requiresOwnerAuthorization, ownerReason: p.ownerReason, criteria: Object.fromEntries(Object.entries(p.criteria).map(([k, v]: any) => [k, { status: v.status, value: v.value }])) }));
  const selection = SEL.selectNextExplained(candidates, { weights: REG.WEIGHTS, directions: REG.DIRECTIONS });
  const superseded = new Set(proposals.filter((p) => p.supersededBy).map((p) => p.id));
  const order = selection.ranking.filter((r: any) => r.autoSelectable && !superseded.has(r.id)).map((r: any) => r.id);
  const top = order.slice(0, TOP_N).map((id: string, i: number) => { const p = proposals.find((x) => x.id === id); const r = selection.ranking.find((x: any) => x.id === id); const tiedWith = selection.ranking.filter((x: any) => x.autoSelectable && !superseded.has(x.id) && x.id !== id && x.evidenceScore === r.evidenceScore).map((x: any) => x.id); return { rank: i + 1, id, evidenceScore: r.evidenceScore, uncertainty: r.uncertainty, upperBound: r.upperBound, tiedWith, rankNote: tiedWith.length ? "equal evidenceScore: order among tied proposals is the selector's display order (by id) — NOT a decision" : null, contract: p.draft }; });
  const byVerdict = run.byVerdict;
  return {
    counts: { signals: signals.length, byVerdict, proposals: proposals.length, ownerGated: proposals.filter((p) => p.requiresOwnerAuthorization).length, reinforcingExisting: reinforces.length, ignored: det.ignored.length },
    signals, ignored: det.ignored, absentSources: det.absent, inFlightBuilds: inFlight, knownKeysCount: seenKeys.length,
    proposals: proposals.map(({ draft, ...p }) => p), reinforcesExisting: reinforces,
    superseded: { rule: SUPERSEDED_RULE, items: proposals.filter((p) => p.supersededBy).map((p) => ({ id: p.id, prs: p.supersededBy.prs, artifact: p.supersededBy.artifact })) },
    convertedContracts: convertedContractsOf(src),
    selection: { decision: selection.decision, selected: selection.selected ? selection.selected.id : null, proposed: selection.proposed ? selection.proposed.id : null, tiedSet: selection.tiedSet || [], justification: selection.justification, ranking: selection.ranking.map((r: any) => ({ id: r.id, evidenceScore: r.evidenceScore, uncertainty: r.uncertainty, upperBound: r.upperBound, autoSelectable: r.autoSelectable })), selectionIsNotAuthorization: selection.selectionIsNotAuthorization },
    top,
    loopInvariants: { canonicalWritesPerformed: run.canonicalWritesPerformed, executionsPerformed: run.executionsPerformed, authorizedCount: signals.filter((s: any) => s.gate.authorized).length, executedCount: signals.filter((s: any) => s.gate.executed).length },
  };
}

/* ── CONVERT (RB-CONV-1) ────────────────────────────────────────────────────────────────────────────────────────────── */
const CONVERSION_N = 3;
const CONVERSION_BATCH = "V176-R2C-1";
const CONVERTED_BY = "runtime/core/odg-radar-build-engine.ts convertToContracts (RB-CONV-1)";
const OWNER_RECORD = "docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json";
const CONVERSION_RULE = "RB-CONV-1: walk `top` (selector rank order, superseded already excluded) and convert the first N eligible drafts; a draft is SKIPPED when: SUPERSEDED (SUP-1) · DUPLICATE (its id is already a contract scenario or a register item id, or names an in-flight build / IN_FLIGHT link) · OWNER_GATED (engine gate or draft.ownerGate.required) · NO_DECLARED_OBJECTIVE (objective NOT_DERIVED) · NO_WRITE_SET_ESTIMATE · OWN1_MATCH (the contract text would trip the register's OWN-1 owner rule ⇒ never silently converted). One batch id per conversion: a batch already present in the contracts file ⇒ ALREADY_CONVERTED, nothing appended (idempotent). Append-only: existing entries are never rewritten; only the header count / initialStatusCounts are recomputed from the array.";

function convertedContractsOf(src: any): any[] {
  const cs = src && src.contracts && src.contracts.data && Array.isArray(src.contracts.data.contracts) ? src.contracts.data.contracts : [];
  return cs.filter((c: any) => c && isObj(c.origin) && c.origin.detectedBy === CONVERTED_BY).map((c: any) => ({ scenario: String(c.scenario), state: c.state, authorizedBy: c.authorizedBy || null, sourceProposal: c.origin.sourceProposal, conversionBatch: c.origin.conversionBatch }));
}

function contractFromDraft(t: any, opts: any): any {
  const d = t.contract;
  const testFile = d.write_set.paths.find((p: string) => /\.test\.ts$/.test(p)) || null;
  const named = (Array.isArray(d.acceptance_criteria) ? d.acceptance_criteria : []).filter((a: string) => !/^tsc clean|^the before-metric is recomputed/.test(a));
  // the test FILE lives in the structured acceptance_tests (a module path in the criterion text would be scanned by OWN-1)
  const ac = named.map((a: string, i: number) => `AC${i + 1} test '${t.id}/AC${i + 1}' (file: acceptance_tests[${i}]): ${a}`);
  const tests = named.map((a: string, i: number) => ({ id: `${t.id}/AC${i + 1}`, file: testFile || "NOT_DERIVED — name it when binding", criterion: `AC${i + 1}` }));
  ac.push(`AC${named.length + 1} measure: every entry of beforeMetric is recomputed from the then-committed source at the same pointer and moved in the objective's direction (LEARN-1); unchanged ⇒ NOT_IMPROVED; source missing ⇒ NOT_MEASURED`);
  ac.push(`AC${named.length + 2} tsc clean; each touched test file passes run one at a time`);
  return {
    scenario: t.id,
    title: d.objective,
    state: "PROPOSED",
    authorizedBy: null,
    origin: {
      detectedBy: CONVERTED_BY,
      sourceProposal: t.id,
      sourceRecord: opts.sourceRecord || null,
      sourceRecordSha256AtConversion: opts.sourceRecordSha256 || null,
      conversionBatch: opts.batch,
      ownerRecord: OWNER_RECORD,
      signals: d.source.signals.slice(),
      selection: { rank: t.rank, evidenceScore: t.evidenceScore, uncertainty: t.uncertainty, upperBound: t.upperBound, tiedWith: t.tiedWith.slice(), scoreIsNotAuthorization: true },
      multiplier: { maxDirectConsumers: d.multiplier.maxDirectConsumers, maxTransitiveDependents: d.multiplier.maxTransitiveDependents, perComponent: d.multiplier.perComponent.map((x: any) => Object.assign({}, x)), rationale: d.multiplier.rationale },
    },
    binding: { status: "UNBOUND", rule: "binding = make write_set concrete (replace the ESTIMATE) + independent inspection ACCEPT of the bound contract; done per contract when GO selects it; the owner record covers GO executing it only once bound and inspected" },
    initialState: {
      status: "NOT_STARTED",
      note: "converted from a Radar build proposal (RB-CONV-1); PROPOSED, not bound, not inspected, not executed",
      evidence: [],
      missingForPass: "bind the contract (concrete write_set replacing the ESTIMATE) and record an independent inspection ACCEPT; then a GO-dispatched build meeting every acceptance criterion",
      asOf: opts.asOf || null,
    },
    beforeMetric: d.measure.before.map((b: any) => Object.assign({}, b)),
    measure: { after: null, compareRule: d.measure.compareRule },
    WORK_ITEM_CONTRACT: {
      objective: d.objective,
      scope: d.scope,
      write_set: d.write_set.paths.slice(),
      write_set_estimate: { estimate: true, basis: d.write_set.basis, mustBeConcreteBefore: "independent inspection (binding step)" },
      authorized_symbols: [],
      invariants: d.invariants.slice(),
      acceptance_criteria: ac,
      acceptance_tests: tests,
      stop_conditions: d.stop_conditions.slice(),
      rollback: d.rollback,
      evidence_required: d.evidence_required.slice(),
    },
  };
}

/* recount initialState.status; keeps the existing header's key order (append-only diff), new statuses appended sorted */
function statusCounts(cs: any[], prior: any): any {
  const out: any = {};
  for (const c of cs) { const k = String(c && c.initialState ? c.initialState.status : "UNKNOWN"); out[k] = (out[k] || 0) + 1; }
  const order = Object.keys(isObj(prior) ? prior : {}).filter((k) => k in out).concat(Object.keys(out).filter((k) => !(isObj(prior) && k in prior)).sort());
  return Object.fromEntries(order.map((k) => [k, out[k]]));
}

/* convertToContracts(result, contractsData, opts) — PURE. result = buildProposals(...) output; contractsData = the parsed
 * contracts file; opts: { n, batch, registerItemIds, sourceRecord, sourceRecordSha256, asOf }. Returns
 * { status, batch, n, appended:[contract], skipped:[{id,reason}], cut, data } where data is the NEW file object (the input
 * is never mutated; prior entries are carried by reference-equal JSON). */
function convertToContracts(result: any, contractsData: any, opts?: any): any {
  const o = Object.assign({ n: CONVERSION_N, batch: CONVERSION_BATCH, registerItemIds: [] }, opts || {});
  if (!isObj(contractsData) || !Array.isArray(contractsData.contracts)) throw new Error("contracts data missing or malformed");
  const cs: any[] = contractsData.contracts;
  const base = { batch: o.batch, n: o.n, rule: CONVERSION_RULE };
  if (cs.some((c: any) => c && isObj(c.origin) && c.origin.conversionBatch === o.batch)) return Object.assign(base, { status: "ALREADY_CONVERTED", appended: [], skipped: [], cut: null, data: contractsData });
  const known = new Set<string>(cs.map((c: any) => String(c.scenario)).concat((o.registerItemIds || []).map(String)).concat((result.inFlightBuilds || []).map(String)));
  const props = new Map<string, any>((result.proposals || []).map((p: any) => [p.id, p]));
  const appended: any[] = [], skipped: any[] = [], eligible: any[] = [];
  for (const t of (Array.isArray(result.top) ? result.top : [])) {
    const p = props.get(t.id) || {}, d = t.contract || {};
    let reason: string | null = null;
    if (p.supersededBy) reason = `SUPERSEDED by ${p.supersededBy.prs.join("/")}`;
    else if (cs.some((c: any) => String(c.scenario) === t.id)) reason = "DUPLICATE (already a contract scenario)";
    else if (/^IN_FLIGHT:/.test(t.id) || (result.inFlightBuilds || []).map(String).includes(t.id)) reason = "DUPLICATE (IN_FLIGHT link: names an in-flight build, not a new improvement)";
    else if (known.has(t.id)) reason = "DUPLICATE (already a register item)";
    else if (p.requiresOwnerAuthorization === true || p.verdict === "OWNER_GATED" || (d.ownerGate && d.ownerGate.required)) reason = "OWNER_GATED";
    else if (!d.objective || /^NOT_DERIVED/.test(String(d.objective))) reason = "NO_DECLARED_OBJECTIVE";
    else if (!(d.write_set && Array.isArray(d.write_set.paths) && d.write_set.paths.length)) reason = "NO_WRITE_SET_ESTIMATE";
    let c: any = null;
    if (!reason) {
      c = contractFromDraft(t, o);
      const scanned = [c.WORK_ITEM_CONTRACT.objective, ...c.WORK_ITEM_CONTRACT.acceptance_criteria, c.initialState.missingForPass].join(" ‖ ");
      const om = REG.ownerMatches(scanned);
      if (om.length) reason = `OWN1_MATCH [${om.join(", ")}]`;
    }
    if (reason) { skipped.push({ id: t.id, rank: t.rank, reason }); continue; }
    eligible.push({ t, c });
  }
  for (const e of eligible.slice(0, o.n)) appended.push(e.c);
  const last = eligible[o.n - 1], next = eligible[o.n];
  const cut = { lastConvertedScore: last ? last.t.evidenceScore : null, firstNotConvertedScore: next ? next.t.evidenceScore : null, clean: !last || !next || next.t.evidenceScore < last.t.evidenceScore, note: "clean ⇔ the cut does not split a tie (first eligible draft left out scores strictly lower)" };
  const all = cs.concat(appended);
  const note = appended.length ? ` V17.6 R2C (batch ${o.batch}, owner record ${OWNER_RECORD}): ${appended.map((c: any) => c.scenario).join(", ")} appended by RB-CONV-1 from the Radar build proposals as NEW contracts (state PROPOSED, authorizedBy null, write_set ESTIMATE, initial state NOT_STARTED); every other entry unchanged.` : "";
  const data = Object.assign({}, contractsData, typeof contractsData["//"] === "string" ? { "//": contractsData["//"] + note } : {}, { count: all.length, initialStatusCounts: statusCounts(all, contractsData.initialStatusCounts), contracts: all });
  return Object.assign(base, { status: appended.length ? "CONVERTED" : "NOTHING_ELIGIBLE", appended, skipped, cut, notConvertedEligible: eligible.slice(o.n).map((e) => e.t.id), data });
}

const RADAR_BUILD_ENGINE_CONTRACT = Object.freeze({
  id: "V176-RADAR-BUILD-ENGINE",
  rules: Object.freeze({ NM: `RB-NM-1: register criterion NOT_MEASURED on ≥ ${NM_THRESHOLD * 100}% of items ⇒ signal`, PM: `RB-PM-1: production-metric NOT_MEASURED field recurring ≥ ${PM_MIN_COUNT} ⇒ signal; RB-PM-2: open→last-commit share ≥ ${REWORK_SHARE} ⇒ signal`, LINK: LINKS_RULE, EXT: "RB-EXT-1: only ADMITTED external Radar observations are signals", TOP: `top ${TOP_N} auto-selectable, not-superseded proposals by the existing selector ranking get a contract draft`, SUP: SUPERSEDED_RULE, CONV: CONVERSION_RULE }),
  invariants: Object.freeze([
    "composition only: reuses odg-radar-to-mission-loop (gate+dedup), mission-priority-selector (ranking with the register's WEIGHTS/DIRECTIONS), odg-strategic-register (CRITERIA, CRC-1), change-impact-graph (multiplier) — no second radar/scheduler/registry/formula",
    "every signal cites a committed source pointer; external observations only when ADMITTED",
    "deny-by-default: nothing authorized, nothing executed; owner questions ⇒ OWNER_GATED; duplicates of register items / contracts / in-flight builds reinforce them, never re-create them",
    "unknown cost/benefit ⇒ NOT_MEASURED; write_set is an ESTIMATE; score ≠ authorization; hypothesis ≠ fact",
    "pure: no file write, no network, no store; deterministic given the injected sources, graph and epochs",
  ]),
});

module.exports = { SCHEMA, LINKS, LINKS_RULE, SUPERSEDED, SUPERSEDED_RULE, supersededOf, CONVERSION_N, CONVERSION_BATCH, CONVERSION_RULE, CONVERTED_BY, convertToContracts, convertedContractsOf, contractFromDraft, NM_THRESHOLD, PM_MIN_COUNT, REWORK_SHARE, TOP_N, detectSignals, analyse, multiplierOf, inFlightBuilds, knownKeys, designContract, buildProposals, RADAR_BUILD_ENGINE_CONTRACT };
export {};
