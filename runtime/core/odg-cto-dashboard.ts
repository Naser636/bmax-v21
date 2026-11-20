#!/usr/bin/env node
"use strict";
/*
 * V183 Livrable C — canonical CTO dashboard. PURE, READ-ONLY projection over the EXISTING canonical sources.
 *
 * This is a VIEW, not a new source of truth. It reads the real closure-register (via odg-closure-register-ops), the
 * canonical métier roster, the 9 primitives, and the governance matrices (Livrables A/B), and renders a pilot view.
 * It NEVER mutates a canonical status and NEVER invents a result. Every indicator carries provenance + method +
 * confidence; a missing value renders NOT_MEASURED / UNKNOWN / NOT_AVAILABLE — never a fabricated number.
 */

const { auditClosureRegister } = require("./odg-closure-register-ops.js");
const { METIERS } = require("./odg-metier-certification-planner.js");
const BIZ = require("./odg-metier-business-matrix.js");
const PMX = require("./odg-primitive-metier-matrix.js");
const IDX = require("./odg-metier-improvement-index.js");         // V208 — consumer of the 16 V207 improvements
const GM = require("./odg-production-gate-matrix.js");            // V205 — consolidated production gates
const VID = require("./odg-radar-video-sources.js");             // V213 — owner-designated radar video sources
const SCH = require("./odg-sandbox-certification-harness.js");   // V215 — 8-test sandbox-certification preparation harness
const OB = require("./odg-opportunity-5m-bridge.js");            // V216 — opportunity × €5M-net bridge (aggregate target)
const DCA = require("./odg-data-chain-audit.js");               // V217 — data-chain qualification matrix (§6 audit)
const RSP = require("./odg-radar-source-provenance.js");        // V218 — radar source-provenance resolver (source-registry consumer)
const VAC = require("./odg-video-analysis-chain.js");           // V220 — multimodal video-analysis chain gate (§3)
const COR = require("./odg-claim-corroboration.js");            // V221 — cross-source claim corroboration (§2.1/§5.3)
const GOR = require("./odg-global-opportunity-radar.js");       // radar opportunities (for corroboration demonstration)
const KAQ = require("./odg-knowledge-acquisition.js");          // V227 — autonomous knowledge acquisition (real cycle)
const DEP = require("./odg-deployment-dossier.js");             // V228 — deployment protocol dossier (DRAFT, computed GO/NO-GO)
const RMAP = require("./odg-radar-roadmap.js");                 // V229-R — radar roadmap from corroborated benchmarks
const SIG = require("./odg-sandbox-integration-gate.js");       // V232 — deny-by-default sandbox auto-integration decision gate
const ICHAIN = require("./odg-improvement-chain.js");           // V233 — end-to-end chain consuming the gate's 3 verdicts
const CDIAG = require("./odg-continuation-diagnostic.js");      // V234 — forensic proof of continuation + owner-gated boundary
const OCUR = require("./odg-observation-currency.js");         // V12.4-EXT §18 — observation-currency decider (memoire != etat actuel)
const CRC = require("./odg-cartography-reconcile.js");         // V234-A §5 — per-component cartography reconciliation (move≠delete, reuse-vs-restudy)
const PCY = require("./odg-program-continuity.js");           // V237 §P0-3 — program continuity dossier (fuses dependency/currency/component staleness)
const V124 = require("./odg-v124-consolidation.js");          // V238 — canonical V234–V238 → V12.4 consolidation (companion-based; manifest unchanged)
const AZ = require("./odg-az-scenario.js");                   // V239 — end-to-end A-Z scenario on the real components (accept+reject, interrupt/resume)
const OSC = require("./odg-orchestration-scenario.js");       // V240 — multi-executor orchestration on the real odg-mission-orchestrator
const RDRV = require("./odg-resident-driver.js");             // V241 — resident-driver L0 OBSERVE (read-only adapter; composes program-continuity + emergency-stop)
const BAUD = require("./odg-benchmark-audit.js");             // V243 — world-benchmark audit (CM-BENCHMARK-AUDIT; fail-closed, no score/ranking)
const MCAMP = require("./odg-metier-campaign.js");            // V245 — materialize the 20 métiers + drive the real campaign-loop over all in one campaign
const LMC = require("./odg-local-model-capability.js");       // V247 — REAL local-model capability qualification + deny-by-default tool gate
const NEA = require("./odg-native-engineering-audit.js");     // V249 — honest actor attribution (V247/V248) + deterministic native-capability census
const NEL = require("./odg-native-engineering-loop.js");      // V250 — decide→drive loop that REALLY executes deterministic repairs natively
const AMR = require("./odg-autonomy-maturity-report.js");     // V324 §6.4 — native/assisted/escalated maturity over the REAL mission-ledger
const MO = require("./odg-mission-orchestrator.js");          // V324 §3/§13-P1 — connect the real orchestrator plan (routes + write-safety + agent-count) to the cockpit
const NEP = require("./odg-native-engineering-plan.js");      // V324 §2.4/§13-P1 — connect ODG's native next-mission selection + multi-agent plan to the cockpit
const PM = require("./patch-memory.js");                       // V324 §13-P1 — real reuse-precedent store (freshness snapshot)
const RVG = require("./odg-reuse-validity-gate.js");           // V324 §13-P1 — forward reuse-validity (memory freshness) over the real store
const CM = require("./odg-capability-maturity.js");           // V324 §9 — honest integration-maturity ladder (BUILT→DEMONSTRATED)

function ind(value: any, provenance: string, method: string, confidence: string): any {
  return Object.freeze({ value: value == null ? "NOT_MEASURED" : value, provenance, method, confidence });
}

/* build(opts) — opts.registerPath lets a caller point at the real register; asOfEpochMs is injected (no Date.now). */
function build(opts?: any): any {
  const o = opts || {};
  const registerPath = o.registerPath || "docs/odg/closure-register.json";
  // V324 §6.4/§14 — autonomy maturity over the REAL mission-ledger (read-only; unreadable ⇒ NOT_MEASURED).
  const ledgerPath = o.ledgerPath || "runtime/generated/mission-ledger.json";
  let maturity: any = null;
  try { maturity = AMR.reportMaturityFromLedger(JSON.parse(require("fs").readFileSync(ledgerPath, "utf8"))); } catch { maturity = null; }
  // V324 §3/§13-P1 — the REAL native orchestrator plan over the open-mission inventory (routes + write-safe waves +
  // derived agent-count). Read-only; the orchestrator executes nothing. Unavailable ⇒ NOT_MEASURED.
  let dispatch: any = null;
  try { dispatch = MO.buildDispatchPlan(); } catch { dispatch = null; }
  // V324 §2.4/§13-P1 — ODG's NATIVE next-mission selection + multi-agent plan over the dispatchable (dependency-ready)
  // open missions. Reuses the already-computed dispatch.routes (no extra I/O). Read-only; selects/plans, executes nothing.
  // Only plan when the dispatch is actually available — if it is not, leave nextPlan null so the indicator collapses
  // to NOT_MEASURED (like its sibling), rather than emitting an empty plan that would mislabel the cause.
  // V324 §13-P1 — freshness snapshot of the REAL reuse-precedent store (odg-reuse-validity-gate over patch-memory).
  // Read-only; file-drift is NOT checked here, so this is a conservative "cannot-certify-fresh" view, not the live gate.
  let reuseFresh: any = null;
  try {
    const asOf = Number.isFinite(o.asOfEpochMs) ? o.asOfEpochMs : Date.UTC(2026, 10, 16);
    const precedents = PM.list();
    const tally: any = { total: Array.isArray(precedents) ? precedents.length : 0, REUSABLE_AS_PROVEN: 0, REQUIRES_REVALIDATION: 0, STALE: 0, unclassified: 0 };
    for (const p of (Array.isArray(precedents) ? precedents : [])) { const v = RVG.classifyReuseValidity(p, { asOfMs: asOf }); if (v && v.ok && tally[v.verdict] !== undefined) tally[v.verdict] += 1; else tally.unclassified += 1; }
    reuseFresh = tally;
  } catch { reuseFresh = null; }
  // V324 §9 — honest integration-maturity of this session's intelligence capabilities (conservative maintainer
  // evidence; all are planning/measurement ⇒ executionApplicable:false). INTEGRATED/DEMONSTRATED require the runtime
  // execution loop (OWNER/runtime-gated) and are honestly NOT yet reached. The classifier enforces monotonicity.
  const SESSION_CAPS = [
    { name: "writeset-contention(#739→#742)", built: true, tested: true, connected: true, fed: true, invoked: true, executionApplicable: false, consumed: true, evidenced: true, integrated: false, demonstrated: false },
    { name: "calibrated-psuccess(#740→#741)", built: true, tested: true, connected: true, fed: true, invoked: false, executionApplicable: false },
    { name: "reuse-validity-gate(#743→#759)", built: true, tested: true, connected: true, fed: true, invoked: true, executionApplicable: false, consumed: true, evidenced: true, integrated: false },
    { name: "autonomy-maturity(#744→#749)", built: true, tested: true, connected: true, fed: true, invoked: true, executionApplicable: false, consumed: true, evidenced: true, integrated: false },
    { name: "hypothesis-adjudicator(#745/#750)", built: true, tested: true, connected: false },
    { name: "orchestration-plan(#755)", built: true, tested: true, connected: true, fed: true, invoked: true, executionApplicable: false, consumed: true, evidenced: true, integrated: false },
    { name: "native-engineering-plan(#756→#758)", built: true, tested: true, connected: true, fed: true, invoked: true, executionApplicable: false, consumed: true, evidenced: true, integrated: false },
  ];
  let capMaturity: any = null;
  try { capMaturity = CM.aggregateMaturity(SESSION_CAPS); } catch { capMaturity = null; }
  let nextPlan: any = null;
  if (dispatch && Array.isArray(dispatch.routes)) {
    try {
      const ready = dispatch.routes.filter((r: any) => r.route === "ODG_NATIVE" || r.route === "DELEGATE_PROVIDER").map((r: any) => ({ id: r.id, deps: [], route: r.route, objective: r.reason }));
      nextPlan = NEP.planNextProgram(ready, []);
    } catch { nextPlan = null; }
  }
  let reg: any = null, regErr: string | null = null;
  try {
    const r = auditClosureRegister(registerPath);
    if (r && r.ok !== false && typeof r.total === "number") reg = r;
    else regErr = (r && (r.reason || r.code)) || "register unreadable";
  } catch (e: any) { regErr = String(e && e.message || e); }

  const bizM = BIZ.matrix();
  const pmx = PMX.matrix();
  const idx = IDX.integrate();                 // V208: 16 improvement capabilities — built/integrated reconciliation
  const gm = GM.productionGateMatrix({});      // V205: consolidated production-gate status
  const vid = VID.register();                  // V213: owner-designated radar videos (content NOT_ANALYZED)
  const sch = SCH.certify();                    // V215: 8-test sandbox certification readiness (certifies NOTHING here)
  const ob = OB.compare({ opportunities: [] }); // V216: aggregate €5M-net revenue-required (MODEL condition, not a forecast)
  const dca = DCA.audit();                      // V217: §6 data-chain qualification matrix (dated audit snapshot)
  const rsp = RSP.audit();                      // V218: radar-cited sources cross-checked vs canonical source-registry
  const vac = VAC.analyzeDesignatedVideos();    // V220: multimodal capability for the designated videos (toolchain absent ⇒ NOT_ANALYZED)
  // V221: corroborate the radar's EAA regulatory claim with the REAL retrieved official EUR-Lex source (2026-11-16).
  const eaaOpp = GOR.OPPORTUNITIES.find((o: any) => /eaa|accessibility/i.test(o.id || ""));
  const cor = eaaOpp ? COR.corroborateOpportunity(eaaOpp, [{ url: "https://eur-lex.europa.eu/eli/dir/2019/882/oj/eng", stance: "SUPPORTS", date: "2026-11-16" }], Number.isFinite(o.asOfEpochMs) ? o.asOfEpochMs : undefined) : null;
  const kaq = KAQ.acquire(KAQ.REAL_CYCLE);     // V227: the REAL executed autonomous research cycle (SWE-bench, corroborated)
  const dep = DEP.assess({});                  // V228: deployment dossier (DRAFT) — computed GO/NO-GO from the real gates
  const rmap = RMAP.synthesize();              // V229-R: radar roadmap from the REAL corroborated Toyota-jidoka benchmark
  const sigDeny = SIG.decide({});              // V232: deny-by-default demo — no evidence ⇒ REJECT (hard conditions unsatisfied); never INTEGRATE
  const ich = ICHAIN.demonstrate();            // V233: the improvement chain consuming the gate's 3 verdicts on a real cycle
  const cdiag = CDIAG.diagnose();              // V234: forensic proof the continuation engine works + the owner-gated break point
  const ocur = OCUR.demonstrate();            // V12.4-EXT §18: observation-currency — CURRENT demoted to HISTORICAL across a commit/scope/time boundary
  const crc = CRC.demonstrate();              // V234-A §5: cartography reconciliation — move≠delete + reuse-vs-restudy driven by observation-currency
  const pcy = PCY.demonstrate();              // V237 §P0-3: program continuity dossier — fuses dependency/currency/component staleness over the real register
  const v124 = V124.demonstrate();            // V238: canonical consolidation of V234–V238 into V12.4 (real companion + real ROADMAP.json; manifest unchanged)
  const az = AZ.demonstrate();                // V239: end-to-end A-Z scenario driving the real campaign-controller + program-continuity (+V235/V236)
  const osc = OSC.demonstrate();              // V240: multi-executor orchestration driving the real odg-mission-orchestrator (+controller +continuity)
  const rdrv = RDRV.observe({ program: V124.toContinuityProgram(JSON.parse(require("fs").readFileSync("docs/odg/v124-consolidated-roadmap.json", "utf8"))), context: { asOfEpochMs: Number.isFinite(o.asOfEpochMs) ? o.asOfEpochMs : Date.UTC(2026, 10, 16), currentCommit: "head" } }); // V241: a REAL read-only L0 cycle over the committed roadmap
  const baud = BAUD.audit();                  // V243: fail-closed audit of the 8 external world benchmarks (no score, no ranking)
  const mcamp = MCAMP.demonstrate();          // V245: one campaign driving the real campaign-loop over all 20 métiers (qualification)
  const lmc = LMC.qualify();                   // V247: REAL measured local-model (qwen2.5-coder:3b) capability + tool-gate
  const nea = NEA.demonstrate();              // V249: honest V247/V248 actor attribution + deterministic native-capability census
  const nel = NEL.demonstrate();              // V250: the native decide→drive loop, actually run over deterministic transforms
  const nrr = NEL.demonstrateRealReach();     // V251: driveSource — COMPOSED native repair over a REAL multi-defect file source

  return Object.freeze({
    asOfEpochMs: Number.isFinite(o.asOfEpochMs) ? o.asOfEpochMs : null, // injected; NOT_MEASURED if absent
    sourceOfTruth: "canonical sources (closure-register.json, planner roster, matrices) — this dashboard is a READ-ONLY projection, NOT a new source of truth",

    roadmap: ind("V12.4 (single master); V12.4 extension = PARKED", "ROADMAP.json + V124_EXTENSION_PARKED_ROADMAP.json", "static canonical reference", "HIGH"),

    missions: reg ? Object.freeze({
      total: ind(reg.total, registerPath, "odg-closure-register-ops.auditClosureRegister", "HIGH"),
      counts: ind(reg.counts, registerPath, "status tally", "HIGH"),
      open: ind(reg.openCount, registerPath, "open missions (BLOCKED/IN_PROGRESS/DEFERRED)", "HIGH"),
      acceptedWithEvidence: ind(reg.acceptedWithEvidence, registerPath, "accepted-with-evidence count", "HIGH"),
    }) : ind(null, registerPath, regErr ? `register read FAILED: ${regErr}` : "register unavailable", "NONE"),

    primitives: ind(Object.freeze(PMX.PRIMITIVES.map((p: string) => ({ primitive: p, state: "EXISTING_VALIDATED (code+tests)", runtimeProof: "NOT_MEASURED" }))), "9 canonical primitives", "code presence + gate; runtime unmeasured", "MEDIUM"),

    metiers: ind(Object.freeze(bizM.metiers.map((m: any) => ({ id: m.id, name: m.name, technical: m.maturity.tested ? "TESTED" : "NOT_MEASURED", integrated: m.maturity.integrated, commercialResult: m.maturity.realCommercialResult }))), "Livrable A business matrix", "maturity levels (honest)", "HIGH"),

    useMatrix: ind(pmx.byClass, "Livrable B 9×15 matrix", "135-intersection classification", "HIGH"),

    improvements: ind(Object.freeze({ total: idx.total, built: idx.registerReconciliation.built, integrated: idx.integrated, allIntegrated: idx.allIntegrated, byMetier: idx.byMetier }), "odg-metier-improvement-index (V208) + odg-blocked-contracts-register", "16 V207 improvement capabilities: BUILT+TESTED+INTEGRATED (consumer wired); NOT REAL_WORLD_VALIDATED", "HIGH"),

    speedMarketingChain: ind("MODEL-ONLY E2E (defineSegment→scoreOfferSegmentFit→funnelMetrics); verdicts STRONG/MODERATE/WEAK/NO_FIT + STOPPED_NO_FIT/INVALID_SEGMENT/MODEL_PROMISING/NOT_VIABLE; UNDETERMINED propagated", "odg-speed-marketing-chain (V209)", "composed chain; score ≠ qualified client ≠ sale; no real campaign", "HIGH"),

    productionGates: ind(Object.freeze({ productionReady: gm.productionReady, byStatus: gm.byStatus, ownerGatedActions: gm.ownerGatedActions.length }), "odg-production-gate-matrix (V205)", "5 consolidated gates, deny-by-default; contracts/sandbox/exposure/iso OWNER_GATED or BLOCKED", "HIGH"),

    sandboxCertification: ind(Object.freeze({ certified: sch.certified, totalTests: sch.total, locallyProvenMechanism: sch.locallyProvenMechanism, inSessionRequired: sch.inSessionRequired, v198Patch: sch.v198Patch }), "odg-sandbox-certification-harness (V215 §9)", "8 tests enumerated; certified:false — mechanisms 1/7/8 locally proven, 2/3/4/5/6 require the owner-launched isolated session (OWNER_GATED); certifies NOTHING here", "HIGH"),

    economicTarget: ind(Object.freeze({ targetNet: ob.targetNet, revenueRequiredFor5MNet: ob.aggregate.conditions ? ob.aggregate.conditions.revenueNeededFor5MNet : null, customersNeeded: ob.aggregate.conditions ? ob.aggregate.conditions.customersNeeded_atBlendedAvgPrice : null, feasibleWith5: ob.aggregate.conditions ? ob.aggregate.conditions.feasibleWith5People_servicesOnly : null }), "odg-opportunity-5m-bridge (V216 §5) → odg-economic-model.targetConditions", "€5M-net is a TARGET, not a forecast/result; blended-métier MODEL condition; demand UNVALIDATED + OWNER_GATED; €0 real clients; CA ≠ net", "MEDIUM"),

    dataChains: ind(Object.freeze({ total: dca.total, integrated: dca.summary.integratedCount, notIntegrated: dca.summary.notIntegratedIds, findings: dca.findings.map((f: any) => f.id), asOf: dca.asOf }), "odg-data-chain-audit (V217 §6)", "§6 qualification matrix (dated snapshot, not a live checker); " + dca.summary.integratedCount + "/" + dca.total + " chains integrated; findings OWNER_GATED (D8 not activated; no xlsx dep) — synthetic test PASS ≠ real data quality", "MEDIUM"),

    radarSourceProvenance: ind(Object.freeze({ opportunities: rsp.total, allOfficial: rsp.byVerification.ALL_OFFICIAL.length, partial: rsp.byVerification.PARTIAL.length, noneRegistered: rsp.byVerification.NONE_REGISTERED.length, noSources: rsp.byVerification.NO_SOURCES.length, registrySources: rsp.registry.count }), "odg-radar-source-provenance (V218 §2/§3) → source-registry", "radar-cited source URLs cross-checked vs the canonical source-registry (wires the previously-unconsumed registry); UNREGISTERED provenance stays AS-DECLARED, never upgraded; REGISTERED_OFFICIAL ≠ a true claim or a real opportunity", "MEDIUM"),

    multimodalVideo: ind(Object.freeze({ verdict: vac.capability.verdict, analyzable: vac.capability.analyzable, designatedVideos: vac.count, designatedNotAnalyzed: vac.videos.filter((v: any) => v.determination === "NOT_ANALYZED").length, missingTools: vac.capability.missingTools, ownerGatedInstall: vac.capability.ownerGatedInstall }), "odg-video-analysis-chain (V220 §3) → odg-radar-video-sources", "local multimodal toolchain ABSENT (ffmpeg/yt-dlp/whisper/tesseract + vision model) ⇒ NOT_ANALYZABLE; the 2 designated videos stay NOT_ANALYZED — content never fabricated; install is OWNER_GATED; a text LLM cannot understand video", "HIGH"),

    claimCorroboration: cor ? ind(Object.freeze({ opportunity: cor.id, level: cor.level, confidence: cor.confidence, independentSupportCount: cor.independentSupportCount, officialCorroboration: cor.officialCorroboration, freshness: cor.freshness, superseded: cor.supersededByNewerContradiction }), "odg-claim-corroboration (V221/V222) → odg-radar-source-provenance + REAL EUR-Lex retrieval 2026-11-16", "radar EAA claim corroborated by ≥2 INDEPENDENT sources incl. official EUR-Lex (Dir (EU) 2019/882, applies 28 Jun 2025); V222 TEMPORAL: freshness from injected asOf + consultedDate; a single source is NOT corroboration; ANY contradiction ⇒ CONTESTED; STALE/SUPERSEDED surfaced; still a MODEL conclusion, not an absolute fact", "MEDIUM") : ind(null, "odg-claim-corroboration (V221/V222)", "no EAA opportunity found to corroborate", "NONE"),

    knowledgeAcquisition: ind(Object.freeze({ query: kaq.query, capability: kaq.capability, accessible: kaq.accessibleCount, inaccessible: kaq.inaccessibleCount, verifiedFacts: kaq.verifiedCount }), "odg-knowledge-acquisition (V227 §2) → odg-claim-corroboration", "REAL autonomous cycle (WebSearch+WebFetch, 2026-11-16): discover→access→extract→corroborate→classify; SWE-bench '500 tasks' FACT_CORROBORATED by 2 INDEPENDENT accessible sources (official primary was 403, not circumvented); a retrieved page is NOT verified knowledge; 403 recorded/not counted; opinion≠fact", "MEDIUM"),

    deploymentDossier: ind(Object.freeze({ dossierStatus: dep.dossierStatus, goNoGo: dep.goNoGo, sections: dep.totalSections, deployPackageOk: dep.deployPackageOk, productionReady: dep.productionReady, ownerGatedInterventions: dep.ownerGatedInterventions.length }), "odg-deployment-dossier (V228 §6) → deploy-package-check + odg-production-gate-matrix", "DRAFT dossier: 20 sections mapped to REAL artifacts; goNoGo COMPUTED = NO_GO (production gates not green); deploy package ok but nothing DEPLOYED/READY; owner-gated interventions (secrets/TLS/systemd/VPS) listed, never done", "HIGH"),

    autoIntegrationGate: ind(Object.freeze({ denyByDefaultVerdict: sigDeny.verdict, conditions: sigDeny.total, integrateRequiresAll12: true, deployAlwaysOwnerGated: sigDeny.deployStillOwnerGated }), "odg-sandbox-integration-gate (V232 §8)", "deny-by-default sandbox auto-integration DECISION gate: with no evidence the verdict is " + sigDeny.verdict + " (not INTEGRATE); INTEGRATE needs ALL 12 §8 conditions; contract/permission/security violation ⇒ REJECT; significant change w/o inspection ⇒ RETURN; INTEGRATE = merge-eligible ONLY — deploy/secrets/destructive/production stay OWNER_GATED", "HIGH"),

    continuationEngine: ind(Object.freeze({ withinSessionContinuationProven: cdiag.withinSessionContinuationProven, dagCompleted: cdiag.proofs.continuesBeyondOneMission.verdict, blockedNoFreeze: cdiag.proofs.blockedDoesNotFreezeIndependent.proven, resumeSkipsAccepted: cdiag.proofs.resumeSkipsCompleted.proven, crossSessionDriver: "OWNER_GATED" }), "odg-continuation-diagnostic (V234 §5) → campaign-loop + campaign-controller", "FORENSIC: ODG does NOT stop after one mission — the REAL campaign-loop runs a 4-mission DAG to COMPLETED in one call, resumes without redo, and a BLOCKED lot never freezes independent work (all proven). The 'stop after each mission' across turns is the CROSS-SESSION resident DRIVER (OWNER_GATED — no resident campaign-loop process; a user-systemd timer exists+runs so it is feasible). odg-schedule-tick canary ≠ the campaign-loop driver. No fabricated fix", "HIGH"),

    improvementChain: ind(Object.freeze({ integrateDemonstrated: ich.integrateDemonstrated, rejectDemonstrated: ich.rejectDemonstrated, returnDemonstrated: ich.returnDemonstrated, idempotent: ich.idempotent }), "odg-improvement-chain (V233 §5) → odg-sandbox-integration-gate", "the end-to-end auto-improvement chain CONSUMES the V232 gate's 3 verdicts on a REAL cycle: V231 jidoka (merged #599, gate 672/672, inspection PASS) ⇒ INTEGRATE/MERGE_ELIGIBLE; a security-violation ⇒ REJECTED; an incomplete experiment ⇒ RETURNED; idempotent (no repeated integration); INTEGRATE = controlled merge ONLY — deploy stays OWNER_GATED; ODG is the authority", "HIGH"),

    nativeEngineeringLoop: ind(Object.freeze({ nativeRepaired: nel.result.nativeRepaired, nativelyExecuted: nel.result.nativelyExecuted, refusedOutOfScope: nel.result.refusedOutOfScope, deferredToProvider: nel.result.deferredToProvider, nativeSharePct: nel.result.dependencyReduction.nativeShare }), "odg-native-engineering-loop (V250 §3) → odg-transform-catalog (real deterministic repair) + delegate-isolation (write-set)", "FIRST REAL native dependency-reduction (answers V249's NOT_YET): the decide→drive loop (OBSERVE→DECIDE→SCOPE→EXECUTE→VERIFY→IMPACT→propose-ACCEPT) ACTUALLY RUNS — it drove odg-transform-catalog to repair 5/5 deterministic transform classes NATIVELY (no Claude Code, no Ollama; each NATIVE_REPAIRED_GREEN + structurally verified). A filePath outside the write-set is REFUSED before any action (deny-by-default via delegate-isolation); a NOVEL task (no deterministic transform) is honestly DEFERRED to a provider mandate (never faked as native). The loop PROPOSES acceptance and NEVER self-accepts — ODG/independent decides. Real execution, not a simulation/dashboard. Scope = deterministic transforms only; novel code + judgment still provider. No 2nd engine/orchestrator, no 10th primitive", "HIGH"),
    catalogRealReach: ind(Object.freeze({ composedTransforms: nrr.compoundRepair.composedTransforms, composedNativeProven: nrr.composedNativeProven, scopeEnforced: nrr.scopeEnforced, cleanRecognised: nrr.cleanRecognised, wroteToDisk: nrr.compoundRepair.wroteToDisk, measuredRealInstances: 230 }), "odg-native-engineering-loop.driveSource (V251 §3) → odg-transform-catalog.scanSource/repairSource (composed, verified, idempotent) + delegate-isolation (write-set)", "V251 REAL-SOURCE REACH: the catalog now DIAGNOSES (scanSource) and COMPOSES deterministic repairs (repairSource) on a REAL multi-defect file — not one synthetic fault at a time. driveSource drove a compound-defect source (missing \"use strict\" + dual-export + loose ==) to NATIVE_REPAIRED by composing >=3 transforms, each STRUCTURALLY verified (no eval) and the result proven IDEMPOTENT by re-scan; a clean file ⇒ ALREADY_CLEAN; an out-of-scope path ⇒ REFUSED before any action. GROUNDED, not theoretical: a repo scan measured 230 real deterministic repair instances across 641 core source files (217 defective, 13 compound). The loop NEVER writes to disk (real-repo write OWNER_GATED) and NEVER self-accepts — it PROPOSES. Honest §2.3 finding: new per-defect transform CLASSES (final-newline/blank-lines/var) measured 0 frequency = vanity counters, so the catalog was expanded in REACH + COMPOSITION, not class count. No 2nd catalog/engine, no 10th primitive", "HIGH"),

    nativeEngineeringAudit: ind(Object.freeze({ odgRuntimeAutonomousActions: nea.attribution.odgRuntimeAutonomousActions, providerActions: nea.attribution.providerActions, deterministicEnginesPresent: nea.census.presentCount + "/" + nea.census.total, realReduction: nea.dependencyHonest.realReduction.split(" —")[0] }), "odg-native-engineering-audit (V249 §1/§2) → git authorship + real module presence", "HONEST ACTOR ATTRIBUTION (CTO §1): in V247/V248 the gap-selection, research, planning and NOVEL CODE WRITING were done by the PROVIDER (Claude Code); the gate was run by the provider; the independent inspection was a DISTINCT agent context (real author≠reviewer, but a spawned model, not the ODG runtime); merge/acceptance was the OWNER's. ODG-RUNTIME autonomous actions = 0 (NOT_PROVEN) — an action is never credited to ODG just because a directive addressed it. The deterministic native engines (task-fix-*/ast/transform/change-impact/scope/executor) all EXIST but were NOT the execution path ⇒ PRESENT ≠ autonomously driven; real dependency-reduction is NOT_YET and needs a wired ODG decide→drive loop (owner/L1-L2-gated), NOT more provider code. No false autonomy claim; no 2nd engine, no 10th primitive", "HIGH"),

    localModelCapability: ind(Object.freeze({ model: lmc.model, overall: lmc.overall, nativeCapable: lmc.nativeCapable, partial: lmc.partial, delegate: lmc.delegate }), "odg-local-model-capability (V247 §3/§4/§5) → REAL Ollama /api/generate runs (2026-11-16) + delegate-isolation (tool-gate scope)", "NATIVE-ENGINEERING REALITY CHECK (directive §3): qwen2.5-coder:3b (CPU, ~2.2GB, 4096 ctx) was REALLY invoked on bounded tasks. Measured honestly: schema-JSON ⇒ NATIVE_CAPABLE; a trivial TS bug-fix ⇒ PARTIAL (correct but markdown-fenced, ODG must strip); a destructive-change risk judgment ⇒ DELEGATE (it called deleting a DB table LOW risk — WRONG, not reframed as success). Overall PROPOSER_ONLY: a model that proposes a patch is NOT an engine that verifies/corrects/integrates it safely — ODG's deterministic executor + independent tests verify everything. The DENY-BY-DEFAULT tool gate makes a model output powerless to act (a valid JSON output is NOT an authorization): tool must be allowlisted, path in the write-set (no absolute/traversal), no forbidden token, no arbitrary shell — composes delegate-isolation. HONEST: this native capability is STILL maturing; the real engineering this checkpoint was provider-executed. No second engine, no 10th primitive", "MEDIUM"),

    metierCampaign: ind(Object.freeze({ metiersTotal: mcamp.metiersTotal, processedInOneCampaign: mcamp.metiersProcessedInOneCampaign, accepted: mcamp.accepted.length, blocked: mcamp.blocked, byMaturity: mcamp.byMaturity, campaignStopped: mcamp.campaignStopped }), "odg-metier-campaign (V245 §2/§3/§5) → campaign-loop (V160) + canonical métier roster (planner.METIERS + commercial matrix)", "ROOT-CAUSE FIX for 'stops after one deliverable': the consolidated roadmap was a STATUS artifact (not an exec queue), the only resident actor is the READ-ONLY L0 driver (can't execute), and the 20 métiers were never materialized as work-units. This materializes all 20 canonical métiers (P1–P15 + M1–M5, names NOT invented) and drives the REAL campaign-loop over ALL of them in ONE campaign. V245 surfaced P5 (Cloud/DevOps/Platform) and P8 (API/integration) as REAL gaps (no reference module); V246 BUILT both (profession-p5-platform-reference + profession-p8-api-reference, real executable functions + tests) ⇒ the campaign now qualifies ALL 20 INTEGRATED and runs to COMPLETED (no blocked gaps). A blocked métier would never freeze the rest. QUALIFICATION ONLY — maturity read from real evidence (module+test+gate), never inferred upward; does NOT fabricate per-métier improvements and does NOT claim ODG autonomously improved/operationalised them (real per-métier engineering is separate provider work). Reuses the real engine — NO second scheduler/orchestrator/queue, no 10th primitive", "HIGH"),

    benchmarkAudit: ind(Object.freeze({ total: baud.total, usableAsReference: baud.usableAsReference, auditOnly: baud.auditOnly, insufficient: baud.insufficient, anyScoreEmitted: baud.anyScoreEmitted }), "odg-benchmark-audit (V243 §8, CM-BENCHMARK-AUDIT) → odg-source-authority + authorized WebSearch 2026-11-16", "WORLD-BENCHMARK AUDIT (executes the roadmap's nextEligible mission): the 8 external benchmarks (BrowseComp/GDPval/τ-bench/WebArena/OSWorld/METR/SciAgentArena/SWE-bench) qualified on availability/licence/reproducibility/compatibility — NOT run. NO score is ever emitted (auditing ≠ running) and NO ranking (cross-run comparison is INVALID_INCOMPARABLE across differing models/tools/budgets). FACT_CORROBORATED via real sources: SWE-bench (MIT), OSWorld (Apache-2.0), τ-bench (MIT) ⇒ USABLE_AS_REFERENCE; the other 5 stay INSUFFICIENT_EVIDENCE (availability/licence UNVERIFIED — fail-closed, not fabricated). Reuses source-authority; no second benchmark harness, no 10th primitive", "MEDIUM"),

    residentDriver: ind(Object.freeze({ level: rdrv.level, state: rdrv.state, modifiedBusinessState: rdrv.modifiedBusinessState, writes: rdrv.writes.length, executedMission: rdrv.executedMission, workAvailable: rdrv.observation ? rdrv.observation.workAvailable : null, nextEligible: rdrv.observation ? rdrv.observation.nextEligible : null, l2Activated: RDRV.l2Contract().activated }), "odg-resident-driver (V241 Phase-2/3) → odg-program-continuity + emergency-stop (read-only L0 cycle over the committed V12.4 roadmap)", "RESIDENT DRIVER minimal adapter, L0 OBSERVE — a REAL read-only cycle over the committed consolidated roadmap: it reports program state (workAvailable / nextEligible / blocked / mustRevalidate) and returns to standby, modifying NO business state (writes=0, no execution, no accept/reject, no status change, no provider call). Composes odg-program-continuity for state and honours the canonical emergency-stop (its engaged signal injected by the resident wrapper; the pure L0 core does no I/O) — NO second stop-system/scheduler/orchestrator/registry/recovery/memory, no 10th primitive. The driver has NO strategic authority; no level self-promotes (L1 SIMULATE prepared but cannot trigger L2; L2 is a DECLARED contract, activated=false; L3 disabled). MATURITY (V242): the L0 driver is now INSTALLED + ENABLED as a user-systemd unit (root-free, linger-backed) on the host (= the private VPS) and has fired REAL resident cycles (ExecMainStatus=0, no business-state change, registers intact); reversible via scripts/odg-resident-driver-install.sh uninstall. V244 PRECOMPILE (measured, same systemd accounting): the resident cycle now runs a transpile-not-bundle node build via a freshness-guarded launcher ⇒ cgroup MemoryPeak 111MB→~17MB (~85% less), CPU ~2.7s→~0.59s (~78% less), max-RSS ~113MB→~71MB; a stale build is never run (rebuild-or-tsx-fallback). Still NOT declared OPERATIONAL unattended until independent inspection + a sustained multi-cycle wake/idle/resume proof. L1/L2 remain prepared-not-activated", "HIGH"),

    orchestration: ind(Object.freeze({ allHold: osc.allHold, permissionLeastPrivilege: osc.verdicts.permissionLeastPrivilege, isolationEnforced: osc.verdicts.isolationEnforced, independentEval: osc.verdicts.independentEvalNoSelfCert, parentClosesOnlyWhenChildrenAdmit: osc.verdicts.parentClosesOnlyWhenChildrenAdmit, blockedNotFreeze: osc.verdicts.blockedChildNotFreeze, resumeNoRedo: osc.verdicts.resumeNoRedo }), "odg-orchestration-scenario (V240 Phase-1, CM-V237-ORCHESTRATION) → odg-mission-orchestrator (V167) + campaign-controller + odg-program-continuity", "MULTI-EXECUTOR ORCHESTRATION driving the REAL dispatcher (odg-mission-orchestrator already composes dep-planner + provider-capability-contract + evaluator-independence + delegate-isolation — NO second orchestrator built). Demonstrates parent→children: least-privilege permissions (overreach/undeclared/self-authorizing executor DENIED), scope isolation (out-of-scope write REFUSED), INDEPENDENT evaluation (producer≠validator; self-certification and shared critical dependency ⇒ REJECT; no evidence ⇒ REJECT), parent closes ONLY when every child ADMITted, a BLOCKED child never freezes independent children, resume without re-executing ACCEPTED, obsolete-proof revalidation. HONEST: hermetic executors ⇒ INTEGRATED demonstration on real components, NOT live production / NOT operational unattended orchestration. No 10th primitive", "HIGH"),

    azScenario: ind(Object.freeze({ allHold: az.allHold, accepted: az.verdicts.acceptedReached, reject: az.verdicts.rejectDecision, parentAfterChildren: az.verdicts.parentAfterChildren, blockedNotFrozen: az.verdicts.blockedNotFrozen, resumedNoRedo: az.verdicts.resumedNoRedo, historicalFlagged: az.verdicts.historicalProofFlagged, modifiedFlagged: az.verdicts.modifiedComponentFlagged }), "odg-az-scenario (V239 Phase-5, CM-V237-AZ-SCENARIO) → campaign-controller + odg-program-continuity + observation-currency (V235) + cartography-reconcile (V236)", "END-TO-END A–Z scenario driving the REAL ODG components (NOT a model): objective→decompose into a mission DAG→select admissible→execute→qualify evidence→ACCEPT and REJECT (a real reject distinct from blocked; ACCEPTED requires non-empty evidence)→interrupt→recover via program-continuity→RESUME without re-executing ACCEPTED→a BLOCKED (owner-gated) lot never freezes independent work→parent accepted only after its children→a proof gone HISTORICAL (V235) and a MODIFIED component (V236) both surface for revalidation→closure only when criteria met. HONEST: hermetic EXECUTOR stand-in ⇒ INTEGRATED demonstration on real components, NOT live production / NOT operational unattended autonomy. No 2nd orchestrator, no 10th primitive", "HIGH"),

    v124Consolidation: ind(Object.freeze({ consolidated: v124.verdict.consolidated, missions: v124.verdict.missionsTotal, bySource: v124.verdict.bySource, sections: v124.verdict.sectionsCovered.length, manifestIntact: v124.verdict.executionManifestIntact, consumable: v124.consumable, integration: v124.verdict.roadmapIntegration }), "odg-v124-consolidation (V238) → roadmap-consolidation + odg-program-continuity + REAL docs/odg/v124-consolidated-roadmap.json", "CANONICAL CONSOLIDATION of V234–V238 into Boussole V12.4: V12.4 is the SOLE directeur (reuses roadmap-consolidation), every distinct capability-build mission preserved with provenance across sections A–R (lossless, no orphan/duplicate), and the roadmap is CONSUMABLE by odg-program-continuity (not a static doc). The execution manifest ROADMAP.json stays 11 missions / NOT replaced (honours the v104+crosswalk guards); ROADMAP.json carries only an additive 'consolidation' reference. roadmapIntegration=INTEGRATED, NOT COMPLETED — missions remain OPEN; cramming completed builds into the runnable manifest stays OWNER_GATED. No 2nd roadmap/store/scheduler/engine, no 10th primitive", "HIGH"),

    programContinuity: ind(Object.freeze({ consolidationLossless: pcy.consolidationLossless, missions: pcy.dossier.missionsTotal, done: pcy.dossier.done.length, mustRevalidate: pcy.dossier.mustRevalidate.length, nextEligible: pcy.dossier.nextEligible, blocked: pcy.dossier.blocked.length }), "odg-program-continuity (V237 P0-3) → campaign-controller.selectNextLot/staleAcceptances + observation-currency (V235) + cartography-reconcile (V236)", "RESUMABLE CONTINUITY DOSSIER consolidating V234+V235+V236 (kept DISTINCT, lossless). An ACCEPTED mission is 'done' ONLY if deps intact (campaign-controller) AND its evidence is still CURRENT (V235) AND its component content is unchanged (V236) AND evidence is present — else FLAGGED requiresRevalidation. In the demo, V234's evidence is correctly flagged because its component changed; V235/V236 stay valid; the OWNER_GATED resident-driver mission is BLOCKED but never freezes the independent eligible work. FAIL-CLOSED + IDEMPOTENT (flag ≠ auto-redo; 'done' not re-executed). Reuses the canonical register — NO 2nd queue/scheduler/engine, NO 10th primitive", "HIGH"),

    cartographyReconcile: ind(Object.freeze({ classificationsProven: crc.classificationsProven, moveNotDeleted: crc.moveNotDeleted, antiRediscoveryProven: crc.antiRediscoveryProven, reuse: crc.result.reuseSet.length, restudy: crc.result.restudySet.length }), "odg-cartography-reconcile (V234-A §5/§12) → composes evidence-provenance.contentDigest + odg-observation-currency (V235)", "§5 INCREMENTAL RECONCILIATION: classifies each component UNCHANGED/MODIFIED/ADDED/MOVED/REMOVED from content digests. A MOVED component (digest reappears at a new path) is NEVER declared REMOVED (the §5 trap). Reuse-vs-restudy is driven by the V235 observation-currency decider over the computed content-changed set: content provably unchanged ⇒ REUSE (skip re-study); content changed ⇒ RE-STUDY. A pure LENS over two snapshots — adds NO second graph/store (persistent-impact-graph owns the persisted graph), NO 10th primitive; reuses the canonical digest; §19 anti-rediscovery", "HIGH"),

    observationCurrency: ind(Object.freeze({ demotionProven: ocur.demotionProven, v234SameCommit: ocur.scenarios.v234_sameCommitFresh.currency, v234CommitAdvanced: ocur.scenarios.v234_commitAdvancedScopeTouched.currency, reusable: ocur.reconcileExample.reusableCount, reverify: ocur.reconcileExample.reverifyCount }), "odg-observation-currency (V12.4-EXT §18/§19/§20) → composes memory-taxonomy.isStale", "MÉMOIRE ≠ ÉTAT ACTUEL: a memorized observation is CURRENT only while its world is PROVABLY unchanged (same commit, or a known changed-set that misses its scope). The V234 'no resident driver @2026-11-16 / d1c042f' fact is CURRENT_OBSERVED at that commit but DEMOTES to HISTORICAL_OBSERVED (must re-verify) once the commit advances into its scope. Hypothesis/superseded/expired/malformed never assert present state. Deny-by-default; adds NO second store, NO 10th primitive — the §19 anti-rediscovery decision over existing stores", "HIGH"),

    radarRoadmap: ind(Object.freeze({ benchmarks: rmap.benchmarksTotal, corroborated: rmap.corroboratedCount, proposed: rmap.proposedCount, accepted: rmap.acceptedCount, notApplicable: rmap.notApplicableCount, officialClaimOnly: rmap.officialClaimOnlyCount, topPractice: rmap.roadmap[0] ? rmap.roadmap[0].practice : null }), "odg-radar-roadmap (V230/V231) → knowledge-acquisition + source-authority + jidoka-completeness + REAL retrievals 2026-11-16", "Radar roadmap from 4 REAL world-class cycles: Toyota jidoka + NVIDIA CUDA CORROBORATED (≥2 INDEPENDENT OWNERS); Amazon/Google are OFFICIAL vendor CLAIMS (single owner / vendor-only) — official ≠ independently demonstrated, NOT benchmarks. V231: the Radar RECOMPUTED jidoka → ACCEPTED via a behavioral acceptance check (every fail-closed verdict demonstrably consumed, 4/4). CUDA NOT_APPLICABLE; PROPOSES not implements; full 20-métier needs repeated real cycles", "MEDIUM"),

    gates: ind(null, "gate is run on demand (not a stored metric here)", "the dashboard does not re-run the gate; last known full gate = 613/613 at build-time per campaign reports (verify live before relying)", "LOW"),

    radar: ind("scheduler present; realScheduledRun NOT_MEASURED; " + vid.count + " owner-designated videos RECORDED (content " + vid.defaultStatus.status + ")", "odg-weekly-radar-scheduler.ts + grant V141 + odg-radar-video-sources.ts", "no resident timer observed in the 2026-11-13 audit; designated video content NOT fabricated (needs transcript)", "MEDIUM"),

    runtime: ind("NOT_MEASURED", "2026-11-13 read-only VPS audit", "no resident ODG process/service observed; ODG runs on demand", "HIGH"),

    ownerGates: ind(Object.freeze([
      "ROADMAP.json canonical integration", "resident runtime / systemd / network exposure",
      "payment execution + legally-required certification", "BMAX HFT/AO asset provision (audits BLOCKED_ASSET_ABSENT)",
      "real deploy / secret / trading / commercial-contact",
    ]), "campaign history + matrices", "owner-gated items awaiting authorization", "HIGH"),

    gaps: ind(Object.freeze([
      "P0: none", "P1: no resident runtime (deployment decision, OWNER_GATED)",
      "P2: business/use matrices now built; BTP DCE analyzer + ext programs NOT built; most métiers not métier-qualified",
      "BLOCKED: BMAX HFT/AO forensic audits (assets absent)",
    ]), "2026-11-13 audit + Livrables A/B", "prioritized gap list", "HIGH"),

    autonomyMaturity: maturity ? ind(Object.freeze({
      distinctMissions: maturity.distinctMissions,
      nativeAutonomyMeasurable: maturity.nativeAutonomyMeasurable,
      actorCoverageRate: maturity.attribution.actorCoverageRate,
      nativeDemonstrated: maturity.maturity.buckets.NATIVE_DEMONSTRATED.count,
      assisted: maturity.maturity.buckets.ASSISTED.count,
      escalated: maturity.maturity.buckets.ESCALATED.count,
      notMeasurable: maturity.maturity.notMeasurable.count,
      measuredDenominator: maturity.maturity.measuredDenominator,
    }), ledgerPath + " → odg-autonomy-maturity-report (composes autonomy-program-aggregate.latestPerMission + odg-autonomy-maturity-trichotomy)", maturity.note, maturity.nativeAutonomyMeasurable ? "MEDIUM" : "NONE") : ind(null, ledgerPath, "mission-ledger unreadable — autonomy maturity NOT_MEASURED", "NONE"),

    orchestrationDispatch: dispatch ? ind(Object.freeze({
      totalOpen: dispatch.totalOpen,
      dispatchableNow: dispatch.dispatchableNow,
      byRoute: dispatch.byRoute,
      agentCount: dispatch.agentCount,
      parallelDispatchProvenSafe: dispatch.parallelDispatchProvenSafe,
    }), "odg-mission-orchestrator.buildDispatchPlan over the REAL open-mission inventory (routes + write-safety #742 + derived agent-count)", (dispatch.agentRationale || "") + " — PLAN only: the orchestrator executes/dispatches NOTHING; no native autonomy counted here (ODG alone accepts deliverables).", "LOW") : ind(null, "odg-mission-orchestrator.buildDispatchPlan", "dispatch plan unavailable — NOT_MEASURED", "NONE"),

    nativeNextPlan: nextPlan && nextPlan.ok ? ind(Object.freeze({
      selected: nextPlan.selected ? nextPlan.selected.id : null,
      selectionJustification: nextPlan.selectionJustification,
      eligibleCount: nextPlan.eligibleCount,
      agentCount: nextPlan.orchestrationPlan ? nextPlan.orchestrationPlan.agentCount : 0,
    }), "odg-native-engineering-plan.planNextProgram over the REAL dispatchable open missions (mission-priority-selector + odg-orchestration-plan)", "ODG's NATIVE next-mission selection + multi-agent plan — a PLAN only: selects/ranks/plans, executes NOTHING; no native autonomy counted (needs real execution provenance)", "LOW") : ind(null, "odg-native-engineering-plan.planNextProgram", "dispatch plan unavailable — native next-plan NOT_MEASURED", "NONE"),

    reuseMemoryFreshness: reuseFresh ? ind(Object.freeze(reuseFresh), "odg-reuse-validity-gate.classifyReuseValidity over the REAL patch-memory store", "freshness snapshot of the stored reuse precedents as of the injected time. Because file-drift is NOT checked here, a live drift check is never supplied ⇒ REUSABLE_AS_PROVEN is never asserted by this snapshot; every precedent requires a live drift check (plus recent age and known provenance) before replay — remembered ≠ currently valid. A read-only snapshot, NOT the live reuse gate; replay remains the caller's decision.", "LOW") : ind(null, "odg-reuse-validity-gate over patch-memory", "reuse-precedent store unavailable — freshness NOT_MEASURED", "NONE"),

    capabilityMaturity: capMaturity && capMaturity.ok ? ind(Object.freeze({
      total: capMaturity.total,
      byLevel: capMaturity.byLevel,
      notYetIntegrated: capMaturity.notYetIntegrated,
      demonstrated: capMaturity.demonstrated,
      items: capMaturity.items,
    }), "odg-capability-maturity.aggregateMaturity over this session's intelligence capabilities (maintainer evidence, conservative)", "V324 §9 integration-maturity ladder. These are planning/measurement capabilities: most reach EVIDENCED (connected to a real consumer + surfaced with provenance) but are NOT INTEGRATED into the mission-execution workflow — INTEGRATED/DEMONSTRATED require the runtime execution loop (OWNER/runtime-gated) and are honestly NOT yet reached. No capability is promoted past its first missing rung; code existing / a passing unit test is NOT operational.", "MEDIUM") : ind(null, "odg-capability-maturity", "maturity classification unavailable — NOT_MEASURED", "NONE"),

    nextRecommended: ind("await two owner decisions (ROADMAP.json integration; runtime intent) before any PARKED-extension build; non-blocking next = BTP DCE product-design behind demand-validation", "CTO recommendation", "dependency analysis", "MEDIUM"),

    note: "every indicator carries provenance/method/confidence; missing ⇒ NOT_MEASURED. No canonical status mutated; no result invented.",
  });
}

const CTO_DASHBOARD_CONTRACT = Object.freeze({
  id: "V183-CTO-DASHBOARD",
  purpose: "Livrable C — read-only pilot projection over canonical sources; not a new source of truth",
  invariants: Object.freeze([
    "READ-ONLY projection; never mutates a canonical status; never invents a result",
    "every indicator carries provenance + method + confidence; missing ⇒ NOT_MEASURED/UNKNOWN/NOT_AVAILABLE",
    "reads the REAL register via odg-closure-register-ops; reuses the canonical roster + matrices",
    "runtime state is NOT_MEASURED (no resident process observed); gate is not re-run here",
    "deterministic given injected asOfEpochMs; no Date.now; no new canonical system",
  ]),
});

module.exports = { build, CTO_DASHBOARD_CONTRACT };
export {};
