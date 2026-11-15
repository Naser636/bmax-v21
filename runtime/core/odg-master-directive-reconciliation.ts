#!/usr/bin/env node
"use strict";
/*
 * V195 / V12.4 MASTER DIRECTIVE — consolidation + continuity reconciliation. PURE, READ-ONLY, deterministic.
 *
 * This module does NOT build a second ODG, a second Radar, a second commercial engine, a new primitive, a new métier
 * or a fifth campaign. It is a READ-ONLY reconciliation VIEW that:
 *   (1) records the VERIFIED Truth-Lock of the canonical sources (anti-invention: the directive's historical counts are
 *       reconciled against the real files, never recopied);
 *   (2) records the governing sandbox blocker (the `odg-claude-sandbox` exec did NOT isolate this host session);
 *   (3) ATTACHES the two new functional dimensions — Market & Business Intelligence and Speed Marketing — to EXISTING
 *       architecture with §3.2 traceability, at honest status levels, asserting anti-duplication.
 *
 * Nothing here is declared operational. Real B2B collection and real campaigns stay BLOCKED until real connectors +
 * owner-gated access exist and real runs are proven (§8.15 / §9.17 / §XXV).
 */

// ─────────────────────────────────────────────────────────────────────────────
// (1) VERIFIED Truth-Lock — read from the real canonical files on 2026-11-15.
const TRUTH_LOCK = Object.freeze({
  head: "b70fa41 (main, V193 merged)",
  branch: "main",
  roadmapJson: Object.freeze({ path: "runtime/governance/ROADMAP.json", contractVersion: "1.1.0", missions: 11, verified: true }),
  closureRegister: Object.freeze({ path: "docs/odg/closure-register.json", items: 427, verified: true }),
  masterRoadmapMd: Object.freeze({ path: "docs/odg-operational/ODG_MASTER_ROADMAP_V12.4.md", exists: true, provenance: "owner-supplied 2026-11-08", note: "canonical path confirmed — do NOT create a duplicate copy" }),
  registersUntouched: true,
});

// Directive reference counts → reconciliation status against the verified sources. The directive states these are
// HISTORICAL references to reconcile, never to recopy blindly. We mark what the real files actually confirm.
const REFERENCE_RECONCILIATION = Object.freeze([
  { item: "9 primitives", directive: 9, status: "VERIFIED", source: "master roadmap md states 'neuf primitives'; architecture unchanged (no 10th primitive introduced)" },
  { item: "20 métiers (P1–P15 + M1–M5)", directive: 20, status: "VERIFIED_STRUCTURE", source: "V183-C + lots 1-5: 15 principal + 5 commercial; intitulés P1–P15 NOT re-invented here" },
  { item: "4 campaigns C1–C4", directive: 4, status: "DOCUMENTED", source: "master roadmap md states '4 campagnes'; no 5th campaign created" },
  { item: "166 capabilities", directive: 166, status: "HISTORICAL_DOCUMENTED", source: "master roadmap md states '166 capacités'; a full capability-by-capability re-count is NOT performed this turn — stated honestly" },
  { item: "54 architecture points", directive: 54, status: "HISTORICAL_UNVERIFIED", source: "not confirmed verbatim in the master roadmap md grep; remains a historical reference to reconcile" },
  { item: "7 CTO studies", directive: 7, status: "HISTORICAL_UNVERIFIED", source: "phrasing not confirmed verbatim this turn" },
  { item: "6 dossiers A–F", directive: 6, status: "DOCUMENTED", source: "master roadmap md states '6 dossiers'" },
  { item: "11 canonical missions", directive: null, status: "VERIFIED", source: "ROADMAP.json missions.length === 11 (M0000..DEPLOY_BMAX_DASHBOARD_PROD_V1)" },
  { item: "427 closure-register items", directive: null, status: "VERIFIED", source: "closure-register.json items.length === 427" },
]);

// ─────────────────────────────────────────────────────────────────────────────
// (2) Governing sandbox blocker — the SINGLE most consequential fact for §F / §XVII / the 8 improvement contracts / V195.
const SANDBOX_STATUS = Object.freeze({
  state: "NOT_ACTIVE",
  probe: "post-`exec $HOME/bin/odg-claude-sandbox`: cwd=/home/ubuntu/bmax-v21, user=ubuntu, /work ABSENT, canonical .git ACCESSIBLE + WRITABLE, no proxy env, ANTHROPIC_API_KEY SET, ollama :11434 LISTENING",
  conclusion: "the exec did NOT isolate this session — this is the SAME non-isolated host session (consistent with V189/V190/V192/V193).",
  governs: Object.freeze([
    "V195 sandbox-closure criteria CANNOT be met from inside (not inside the sandbox)",
    "the 8+ improvement construction contracts stay BLOCKED_AWAITING_ISOLATION",
    "egress allowlist stays OWNER_GATED (V193 §2); network NOT qualified secured",
  ]),
  ownerAction: "launch the isolated session via the V193 reproducible procedure (ODG write-set copy → owner egress allowlist → bwrap → post-checks → importGate).",
});

// ─────────────────────────────────────────────────────────────────────────────
// (3) Attach the two new dimensions to EXISTING architecture (§4.6 + §3.2). NO new primitive / métier / campaign / radar.
const NEW_DIMENSION_ATTACHMENT = Object.freeze([
  {
    dimension: "Market & Business Intelligence",
    attachTo: "the EXISTING Radar (odg-global-opportunity-radar + odg-radar-collection-adapter + odg-radar-to-mission-loop)",
    primitive: "RESOLVER/EVIDENCE (discovery+provenance) — no new primitive",
    metierLink: "cross-cutting over existing métiers (feeds P-metiers + M1–M5); NOT a new métier",
    traceability: "EXIGENCE(§VIII B2B signals) → SOURCE(public registers/funding/technographics) → OBJECTIF(qualified opportunity) → PRIMITIVE(RESOLVER+EVIDENCE) → MÉTIER(existing) → CAPACITÉ(radar collection+qualification) → MISSION(radar-to-mission PROPOSAL) → CONTRAT(deny-by-default gate) → TEST(adapter determinism) → PREUVE(real collection, pending) → ACCEPTATION(ODG governance)",
    status: "DOCUMENTED (attachment defined); collection capability NOT operational — needs real connectors + owner-gated API access + proven real runs (§8.15)",
    antiDuplication: "reuses the single Radar + provenance/dedup/qualification/governance; no 2nd radar, no parallel registry",
  },
  {
    dimension: "Speed Marketing",
    attachTo: "the EXISTING commercial engine + economic model (client-intake-seam / commercial-operating-system / odg-economic-model) and the experiment/learning loops",
    primitive: "POLICY/EXECUTOR (governed experiments) — no new primitive",
    metierLink: "capability over the commercial métiers (M-family + services); NOT a new métier or 2nd CRM",
    traceability: "EXIGENCE(§IX acquisition+conversion) → SOURCE(radar-qualified signals) → OBJECTIF(measured acquisition) → PRIMITIVE(POLICY+EXECUTOR) → MÉTIER(existing commercial) → CAPACITÉ(segment/offer/experiment/measure) → MISSION(governed campaign) → CONTRAT(budget+consent gated) → TEST(experiment reproducibility) → PREUVE(real campaign metrics, pending) → ACCEPTATION(ODG governance)",
    status: "DOCUMENTED (attachment defined); capability NOT operational — needs a really-executed + measured campaign (§9.17); all sends/spend OWNER_GATED",
    antiDuplication: "reuses the existing commercial engine + memory/learning loops; no 2nd commercial engine, no parallel memory",
  },
]);

// Candidate B2B/market sources (§8.8) — recorded as CANDIDATES only. Pricing + rights are NOT_VERIFIED here and any
// paid call/subscription is OWNER_GATED. A real pricing/rights sweep (WebSearch, grant V141) is a prepared next step.
const MBI_SOURCE_CATALOG = Object.freeze([
  { id: "sec-edgar", category: "funding/filings", access: "public API", pricing: "free (rate-limited)", rights: "public; verify UA policy", status: "CANDIDATE" },
  { id: "opencorporates", category: "company registry", access: "API (key)", pricing: "NOT_VERIFIED", rights: "licence terms apply", status: "CANDIDATE_OWNER_GATED" },
  { id: "crunchbase", category: "funding", access: "API (key)", pricing: "NOT_VERIFIED", rights: "commercial licence", status: "CANDIDATE_OWNER_GATED" },
  { id: "github-api", category: "oss/product", access: "API (token)", pricing: "free tier (quota)", rights: "ToS apply", status: "CANDIDATE" },
  { id: "builtwith/wappalyzer", category: "technographics", access: "API", pricing: "NOT_VERIFIED", rights: "licence terms apply", status: "CANDIDATE_OWNER_GATED" },
  { id: "public-tender-ocds", category: "appels d'offres", access: "OCDS feeds", pricing: "free", rights: "open data; ceiling≠revenue", status: "CANDIDATE" },
]);

function reconcile(): any {
  const verifiedCount = REFERENCE_RECONCILIATION.filter((r) => /^VERIFIED/.test(r.status)).length;
  return Object.freeze({
    truthLock: TRUTH_LOCK,
    referenceReconciliation: REFERENCE_RECONCILIATION,
    verifiedReferences: verifiedCount,
    sandbox: SANDBOX_STATUS,
    newDimensions: NEW_DIMENSION_ATTACHMENT,
    mbiSourceCatalog: MBI_SOURCE_CATALOG,
    extensionStatus: "PARKED (unchanged; no implicit activation — §II.2.4)",
    headline: "canonical state VERIFIED + reconciled; sandbox NOT_ACTIVE (governing blocker); M&BI + Speed Marketing ATTACHED to existing architecture (DOCUMENTED, not operational); no duplication; registers byte-identical.",
  });
}

const MASTER_RECONCILIATION_CONTRACT = Object.freeze({
  id: "V195-MASTER-DIRECTIVE-RECONCILIATION",
  purpose: "§XXVIII — recover/verify/reconcile real state; attach M&BI + Speed Marketing to existing architecture; record sandbox blocker; invent nothing",
  invariants: Object.freeze([
    "reads real canonical sources (ROADMAP.json 1.1.0 / 11 missions, closure 427 items, master roadmap md); historical counts reconciled NOT recopied",
    "sandbox exec did NOT isolate the session — stated honestly; governs the BLOCKED construction work and V195 closure",
    "M&BI + Speed Marketing attach to the EXISTING Radar + commercial engine; no new primitive/métier/campaign/radar/memory",
    "no capability declared operational; real B2B collection + real campaigns stay BLOCKED until proven runs (§8.15/§9.17)",
    "Extension stays PARKED; registers byte-identical; deterministic; read-only",
  ]),
});

module.exports = { TRUTH_LOCK, REFERENCE_RECONCILIATION, SANDBOX_STATUS, NEW_DIMENSION_ATTACHMENT, MBI_SOURCE_CATALOG, reconcile, MASTER_RECONCILIATION_CONTRACT };
export {};
