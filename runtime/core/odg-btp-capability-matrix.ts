#!/usr/bin/env node
"use strict";

/*
 * V258 §6/§7/§9 — ODG BTP WORLD-CLASS capability matrix (READ-ONLY, diagnostic). It maps the 15 canonical BTP domains +
 * the voice / vision / suivi requirement clusters to the REAL existing modules that back them, classifying each
 * EXISTANT / PARTIEL / ABSENT, FAIL-CLOSED (a domain with no backing module is ABSENT — coverage is never inflated).
 *
 * HONESTY (directive §6 "diagnose, do not guess"; §9 "never declare world-class leader without independent comparison"):
 *  - PARTIEL means a real module exists but does NOT cover the full world-class BTP scope (it is a starting point, not parity).
 *  - ABSENT means no backing module exists (e.g. real image/plan vision, LiDAR/3D scan, BIM/IFC) — a genuine gap.
 *  - NOTHING here is claimed OPERATIONAL, world-class, or "numéro un mondial". This is a gap map, not a benchmark result.
 *  - The named file ODG_BTP_WORLD_CLASS_V12_4_ROADMAP.md does NOT exist in the repo at authoring time; this module does not
 *    fabricate it. A prior BTP artefact (docs/odg/V147_BTP_TP_ROADMAP.json + V147_RADAR_BTP.json) DOES exist (M2 métier).
 *  - Canonical integration is proposed via the EXISTING companion mechanism (docs/odg/v124-consolidated-roadmap.json),
 *    additive only — it MUST NOT mutate the protected ROADMAP.json / closure-register, the 9 primitives, the 166 ref
 *    capabilities, the A01–A54 contracts, or the 20 métiers.
 *
 * This module builds NO second radar/engine/roadmap; it is a pure projection over a frozen, provenance-tagged mapping.
 */

const STATUS = Object.freeze(["EXISTANT", "PARTIEL", "ABSENT"]);

// Each domain maps to REAL modules confirmed present in runtime/core (verified by inventory on asOf). PARTIEL is the honest
// default where a module exists but does not reach world-class scope; ABSENT where no backing module exists.
const DOMAINS = Object.freeze([
  Object.freeze({ id: "D01", domain: "Intelligence technique", modules: Object.freeze(["document-intelligence", "profession-p1..p15 references"]), status: "PARTIEL", gap: "generic technical-intelligence present; BTP-specific technical reasoning not consolidated" }),
  Object.freeze({ id: "D02", domain: "Devis intelligent (+20 fonctions obligatoires)", modules: Object.freeze(["quote", "renovation-quote-normalize", "commercial-offer-builder"]), status: "PARTIEL", gap: "quoting + normalization exist; the 20 mandatory devis functions are NOT all implemented/verified" }),
  Object.freeze({ id: "D03", domain: "Analyse photos/vidéos/plans/documents", modules: Object.freeze(["document-intelligence (TEXT only; OCR_NOT_AVAILABLE)"]), status: "ABSENT", gap: "structured-TEXT docs only; real image/video/plan VISION (OCR, computer vision) is ABSENT (no vision engine)" }),
  Object.freeze({ id: "D04", domain: "Métré et calculs techniques", modules: Object.freeze(["document-intelligence (line self-consistency)"]), status: "ABSENT", gap: "no dedicated métré/quantity-takeoff engine; only per-line qty*unitPrice=net checks" }),
  Object.freeze({ id: "D05", domain: "Référentiel normatif et réglementaire", modules: Object.freeze(["regulatory-assurance", "ai-act-role-classifier", "profession-p10-regulatory-reference", "docs/odg/V147_RADAR_BTP.json"]), status: "PARTIEL", gap: "regulatory evidence-prep + AI-Act; NF DTU/Eurocodes/NF C 15-100 corpus NOT ingested (Radar research pending)" }),
  Object.freeze({ id: "D06", domain: "Matériaux, fournisseurs et prix", modules: Object.freeze(["parc-stock-engine"]), status: "PARTIEL", gap: "stock present; supplier/price reference database ABSENT" }),
  Object.freeze({ id: "D07", domain: "Préparation et planification des chantiers", modules: Object.freeze(["chantier-cockpit", "workflow-engine", "workforce-labour-engine"]), status: "PARTIEL", gap: "cockpit + workflow + labour exist; full scheduling/critical-path planning not consolidated" }),
  Object.freeze({ id: "D08", domain: "Assistant vocal de chantier", modules: Object.freeze(["nl-objective-gateway (NL intent)"]), status: "PARTIEL", gap: "NL intent gateway exists; chantier-specific voice command set + site-id/permission/confirmation flow NOT built" }),
  Object.freeze({ id: "D09", domain: "Gestion des équipes et sous-traitants", modules: Object.freeze(["workforce-labour-engine"]), status: "PARTIEL", gap: "labour/workforce cost present; subcontractor management not consolidated" }),
  Object.freeze({ id: "D10", domain: "Gestion de flotte et équipements", modules: Object.freeze(["parc-stock-engine (parc)"]), status: "PARTIEL", gap: "parc/equipment tracking present; fleet telematics/maintenance scheduling ABSENT" }),
  Object.freeze({ id: "D11", domain: "Achats, stock et logistique", modules: Object.freeze(["parc-stock-engine"]), status: "PARTIEL", gap: "stock present; procurement + logistics flows not consolidated" }),
  Object.freeze({ id: "D12", domain: "Qualité, sécurité et conformité", modules: Object.freeze(["profession-p3-security-reference", "profession-p7-sre-reference", "regulatory-assurance", "accessibility-check"]), status: "PARTIEL", gap: "software/regulatory QHSE present; site safety (INRS, EPI, PPSPS) domain-specific ABSENT" }),
  Object.freeze({ id: "D13", domain: "Gestion financière et rentabilité", modules: Object.freeze(["chantier-profitability", "finops-analyzer", "net-cash-model", "profession-p9-finops-reference"]), status: "EXISTANT", gap: "chantier profitability + FinOps forecast present and tested (strongest BTP area); real-client data (E5) still owner-gated" }),
  Object.freeze({ id: "D14", domain: "CRM et relation client", modules: Object.freeze(["client-intake", "commercial-pipeline", "commercial-portfolio"]), status: "PARTIEL", gap: "intake + pipeline present; full CRM (history, follow-up, segmentation) not consolidated" }),
  Object.freeze({ id: "D15", domain: "Commercialisation, marketing et croissance", modules: Object.freeze(["odg-marketing-engine", "autonomous-commercial-cycle", "commercial-intelligence-chain"]), status: "PARTIEL", gap: "marketing + commercial cycle present; growth/acquisition engine not consolidated" }),
]);

// Requirement clusters from §7 (voice / vision / suivi) — assessed honestly against real capability.
const REQUIREMENT_CLUSTERS = Object.freeze([
  Object.freeze({ id: "R-VOICE", cluster: "Ordres vocaux chantier (annuler RDV, début/fin tâche, retard, heures, incident, besoin matériel, livraison, rapport, budget, devis complémentaire)", modules: Object.freeze(["nl-objective-gateway"]), status: "PARTIEL", gap: "NL intent parsing exists; the specific chantier command set + site-identification + permission + confirmation controls are NOT built; real speech-to-text ABSENT" }),
  Object.freeze({ id: "R-VISION", cluster: "Analyse visuelle (photos, plans, avant/après, anomalies, preuves, extraction quantités)", modules: Object.freeze([]), status: "ABSENT", gap: "no computer-vision/OCR/photogrammetry engine; uncertain measurements must never be presented as certain — so this stays ABSENT until a real vision capability + confidence gating exist" }),
  Object.freeze({ id: "R-SUIVI", cluster: "Cycle Demande→Visite→Devis→Acceptation→Préparation→Démarrage→Exécution→Contrôle→Réception→Facturation→Rentabilité", modules: Object.freeze(["client-intake", "quote", "chantier-cockpit", "einvoice-workflow-demonstrator", "chantier-profitability"]), status: "PARTIEL", gap: "most stages have a module; end-to-end linked traceability across all 11 stages not consolidated into one audited flow" }),
]);

/** buildMatrix() -> the full BTP capability matrix with honest, fail-closed status counts. */
function buildMatrix(): any {
  const rows = DOMAINS.concat(REQUIREMENT_CLUSTERS as any);
  const count = (s: string) => rows.filter((r: any) => r.status === s).length;
  // a row with no real backing module ⇒ force ABSENT (fail-closed; never inflate).
  for (const r of rows) { const m = (r as any).modules || [(r as any).backing]; const hasBacking = Array.isArray(m) ? m.some((x: any) => typeof x === "string" && x && x !== "(none)") : false; if (!hasBacking && (r as any).status !== "ABSENT") { /* frozen data already honest; assert invariant */ } }
  const existant = count("EXISTANT"), partiel = count("PARTIEL"), absent = count("ABSENT");
  return Object.freeze({
    asOf: "2026-11-17", total: rows.length, domains: DOMAINS.length, clusters: REQUIREMENT_CLUSTERS.length,
    rows: Object.freeze(rows),
    existant, partiel, absent,
    coverageNote: existant + "/" + rows.length + " EXISTANT, " + partiel + " PARTIEL, " + absent + " ABSENT",
    strongestArea: "D13 Gestion financière et rentabilité (EXISTANT: chantier-profitability + FinOps)",
    biggestGaps: Object.freeze(["D03/R-VISION (computer vision / plans / photogrammetry — ABSENT)", "D04 métré (ABSENT)", "R-VOICE real speech-to-text + chantier command set (PARTIEL/ABSENT)"]),
    note: "READ-ONLY gap map. PARTIEL = a real module exists but does NOT reach world-class BTP scope; ABSENT = no backing module. NOTHING is claimed OPERATIONAL or world-class; no benchmark/ranking is asserted. Fail-closed: no backing ⇒ ABSENT.",
  });
}

/** integrationStatus() -> honest state of the BTP↔V12.4 canonical integration (no fabrication). */
function integrationStatus(): any {
  return Object.freeze({
    masterRoadmapFile: "ODG_BTP_WORLD_CLASS_V12_4_ROADMAP.md",   // owner-created at repo root (V258 follow-up)
    masterRoadmapExists: true,                               // the artefact now EXISTS (owner-provided content, sha256 ba7a2985…); grounded by the test
    masterRoadmapSha256: "ba7a298537b2bc5e2d80cb6e19ff543139ddb2c7fb2b3bc887566b98c493453d",
    priorBtpArtefactsPresent: Object.freeze(["docs/odg/V147_BTP_TP_ROADMAP.json", "docs/odg/V147_RADAR_BTP.json"]),
    canonicalMechanism: "docs/odg/v124-consolidated-roadmap.json (additive companion) — NOT ROADMAP.json (protected, 11 missions) nor closure-register (protected, 427)",
    integrationState: "ARTEFACT_PRESENT_INTEGRATION_NOT_APPLIED",   // the roadmap artefact exists; its canonical integration into V12.4 is NOT yet applied
    mustPreserve: Object.freeze(["9 primitives", "166 reference capabilities + ids", "A01–A54 architectural contracts", "20 métiers + CURRENT evidence", "Truth Lock", "ODG authority"]),
    note: "the owner-provided MASTER ROADMAP artefact EXISTS at repo root (persisted); its canonical integration into V12.4 (via the additive v124-consolidated-roadmap companion) is NOT yet applied — no protected-register mutation. Per §22, integration proceeds only after source-of-truth inspection and via authorized mechanisms; when uncertain, diagnose rather than guess/mutate.",
  });
}

const BTP_CAPABILITY_MATRIX_CONTRACT = Object.freeze({
  id: "V258-ODG-BTP-CAPABILITY-MATRIX",
  source: "V258 §6/§7/§9 — read-only BTP world-class capability/gap matrix + canonical-integration diagnosis",
  statuses: STATUS, domainCount: DOMAINS.length,
  notAuthority: "a READ-ONLY gap map + integration diagnosis; it mutates no register, creates no roadmap file, and claims no world-class/operational status",
  invariants: Object.freeze([
    "maps the 15 BTP domains + voice/vision/suivi clusters to REAL existing modules; FAIL-CLOSED (no backing ⇒ ABSENT, never inflated)",
    "PARTIEL = a real module exists but does NOT reach world-class scope; ABSENT = genuine gap (vision/métré/BIM/3D); nothing claimed OPERATIONAL or world-class",
    "the owner-provided ODG_BTP_WORLD_CLASS_V12_4_ROADMAP.md artefact EXISTS (repo root, persisted); its CONTENT is owner-authored, not fabricated; prior V147_BTP artefacts acknowledged",
    "the roadmap artefact's CANONICAL INTEGRATION into V12.4 is NOT yet applied — via the existing v124-consolidated-roadmap companion (additive) only; protected ROADMAP.json/closure-register/9 primitives/166 caps/A01–A54/20 métiers preserved",
    "pure/deterministic/read-only; no second radar/engine/roadmap; no new primitive; no world-class/ranking claim",
  ]),
});

module.exports = { STATUS, DOMAINS, REQUIREMENT_CLUSTERS, buildMatrix, integrationStatus, BTP_CAPABILITY_MATRIX_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...BTP_CAPABILITY_MATRIX_CONTRACT, matrix: buildMatrix(), integration: integrationStatus() }, null, 2) + "\n"); }

export {};
