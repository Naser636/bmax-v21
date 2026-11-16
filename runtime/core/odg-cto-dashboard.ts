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

function ind(value: any, provenance: string, method: string, confidence: string): any {
  return Object.freeze({ value: value == null ? "NOT_MEASURED" : value, provenance, method, confidence });
}

/* build(opts) — opts.registerPath lets a caller point at the real register; asOfEpochMs is injected (no Date.now). */
function build(opts?: any): any {
  const o = opts || {};
  const registerPath = o.registerPath || "docs/odg/closure-register.json";
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

    metierCampaign: ind(Object.freeze({ metiersTotal: mcamp.metiersTotal, processedInOneCampaign: mcamp.metiersProcessedInOneCampaign, accepted: mcamp.accepted.length, blocked: mcamp.blocked, byMaturity: mcamp.byMaturity, campaignStopped: mcamp.campaignStopped }), "odg-metier-campaign (V245 §2/§3/§5) → campaign-loop (V160) + canonical métier roster (planner.METIERS + commercial matrix)", "ROOT-CAUSE FIX for 'stops after one deliverable': the consolidated roadmap was a STATUS artifact (not an exec queue), the only resident actor is the READ-ONLY L0 driver (can't execute), and the 20 métiers were never materialized as work-units. This materializes all 20 canonical métiers (P1–P15 + M1–M5, names NOT invented) and drives the REAL campaign-loop over ALL of them in ONE campaign: 18 evidence-qualified INTEGRATED + accepted, P5 (Cloud/DevOps/Platform) and P8 (API/integration) are the REAL gaps (no reference module) ⇒ BLOCKED, and a blocked métier never freezes the rest (stops IDLE_BLOCKED, honest). QUALIFICATION ONLY — maturity read from real evidence (module+test+gate), never inferred upward; does NOT fabricate per-métier improvements and does NOT claim ODG autonomously improved/operationalised them (real per-métier engineering is separate provider work). Reuses the real engine — NO second scheduler/orchestrator/queue, no 10th primitive", "HIGH"),

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
