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
