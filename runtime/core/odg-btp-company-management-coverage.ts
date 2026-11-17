#!/usr/bin/env node
"use strict";

/*
 * V269 — PHASE A (§27) coverage & anti-duplication audit of the owner-authored "ODG BTP INTERNATIONAL — MASTER ROADMAP —
 * AUTONOMOUS COMPANY MANAGEMENT & WORLD-CLASS SPEED MARKETING V1.0" additive extension to the Boussole V12.4. READ-ONLY,
 * deterministic. This is the Phase-A deliverable the roadmap itself mandates: "cartographier toutes les capacités, les relier
 * à V12.4, identifier présentes/partielles/absentes, dépendances, risques → matrice de couverture COMPLÈTE et SANS DOUBLONS".
 *
 * It maps the 20 mega-domains + 20 functional assistants + the 4-level decision taxonomy (§2.3) to EXISTING fs-verified
 * repository components (the test grounds every backing module on disk), with an honest status ladder — a module on disk is
 * NOT a claim that its function is operational (§30). It does NOT mutate any canonical register and does NOT force the
 * OWNER_GATED v124 consolidation guard (V261).
 *
 * HONESTY (§26.1/§26.3/§30): additive ONLY — NO 10th primitive, NO second orchestrator, NO second Radar, NO concurrent register,
 * NO parallel permission system, NO new independent source of truth. Anti-duplication: where a capability already exists it is
 * REUSED/IMPROVED, never duplicated. The Speed-Marketing domain OVERLAPS the V268 growth-roadmap map and REUSES it. Nothing
 * OPERATIONAL/world-class is claimed; "autonomous company direction" is an AMBITION pursued with evidence, not a delivered fact.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const COVERAGE_STATUS = Object.freeze(["ABSENT", "PARTIAL", "EXISTING", "TESTED", "PRODUCTION_READY", "INDEPENDENTLY_VALIDATED"]);  // §28 honesty ladder
const PRIMITIVES = Object.freeze(["IDENTITY", "STATE", "CONTRACT", "POLICY", "RESOLVER", "EXECUTOR", "EVIDENCE", "RECOVERY", "ALLOCATOR"]);  // the nine — no 10th

// §2.3 decision classification — every domain declares the HIGHEST authority level its actions can reach.
const DECISION_LEVELS = Object.freeze([
  Object.freeze({ level: "A", name: "Exécution autonome autorisée", rule: "répétitif, déterministe, réversible, couvert par les permissions" }),
  Object.freeze({ level: "B", name: "Exécution conditionnelle", rule: "seuils + contrats + autorisations explicites respectés" }),
  Object.freeze({ level: "C", name: "Validation humaine", rule: "conséquence financière/contractuelle/sociale/juridique/assurantielle/sécurité significative" }),
  Object.freeze({ level: "D", name: "Intervention professionnelle obligatoire", rule: "acte réservé / qualification / validation réglementaire — ODG prépare, ne décide pas" }),
]);

const MASTER_ARTIFACT = "ODG_BTP_AUTONOMOUS_COMPANY_MANAGEMENT_ROADMAP_V1.md";

// ---- the 20 mega-domains → existing components (every `modules` entry fs-grounded by the test). ----
const MEGA_DOMAINS = Object.freeze([
  Object.freeze({ id: "D01", ref: "§3", name: "Direction générale autonome", status: "PARTIAL", decisionLevelMax: "C", modules: Object.freeze(["odg-cto-dashboard", "chantier-profitability", "net-cash-model", "odg-metier-business-matrix"]), gap: "dashboards + profitability + cash model exist; a unified predictive CEO view with 7/30/90/365-day forecasts is PARTIAL (forecasts are estimates, not facts)" }),
  Object.freeze({ id: "D02", ref: "§4", name: "Gestion complète des chantiers", status: "EXISTING", decisionLevelMax: "C", modules: Object.freeze(["odg-btp-project-workflow", "chantier-cockpit", "chantier-profitability"]), gap: "project lifecycle + cockpit + P&L exist (V266); delay-prediction + change-order avenant automation are PARTIAL" }),
  Object.freeze({ id: "D03", ref: "§5", name: "Assistant du maçon et des équipes (voix terrain)", status: "PARTIAL", decisionLevelMax: "B", modules: Object.freeze(["odg-btp-vision-voice-pipeline", "odg-btp-project-workflow"]), gap: "ingestion/structured-event layer exists (V263); voice RECOGNITION (STT) is BLOCKED — no engine, never fabricated" }),
  Object.freeze({ id: "D04", ref: "§6", name: "Achats, fournisseurs et livraisons", status: "PARTIAL", decisionLevelMax: "B", modules: Object.freeze(["parc-stock-engine"]), gap: "stock engine exists; a qualified-supplier DB + total-cost comparator + delivery planner are largely ABSENT (prices never invented — source/date/unit/region required)" }),
  Object.freeze({ id: "D05", ref: "§7", name: "Flotte, véhicules et matériel", status: "PARTIAL", decisionLevelMax: "B", modules: Object.freeze(["fleet-collector", "fleet-dispatcher", "fleet-envelope", "parc-stock-engine"]), gap: "fleet collection/dispatch/envelope + stock exist; full asset register (insurance/CT/maintenance echéances) + fleet optimization are PARTIAL" }),
  Object.freeze({ id: "D06", ref: "§8", name: "Direction financière et trésorerie", status: "EXISTING", decisionLevelMax: "C", modules: Object.freeze(["net-cash-model", "first-cash-activation", "chantier-profitability", "cost-accounting", "odg-btp-billing-engine"]), gap: "cash model + per-chantier P&L + billing/collection exist (V267); predictive treasury tension detection is PARTIAL; unpaid invoices ≠ collected cash" }),
  Object.freeze({ id: "D07", ref: "§9", name: "Comptabilité & relation expert-comptable (pré-compta + e-facturation)", status: "PARTIAL", decisionLevelMax: "D", modules: Object.freeze(["cost-accounting", "einvoice-validator", "einvoice-export", "document-intelligence"]), gap: "cost accounting + EN 16931 e-invoice validation/export + doc extraction exist; a full pre-accounting pipeline + agréé-platform e-reporting is PARTIAL; the expert-comptable's acts stay level D" }),
  Object.freeze({ id: "D08", ref: "§10", name: "Ressources humaines et organisation", status: "PARTIAL", decisionLevelMax: "C", modules: Object.freeze(["workforce-labour-engine"]), gap: "workforce/labour cost engine exists; competence/qualification registry + preparatory payroll variables are PARTIAL; disciplinary/licenciement decisions are level C (never autonomous)" }),
  Object.freeze({ id: "D09", ref: "§11", name: "Assurances, conformité et risques", status: "PARTIAL", decisionLevelMax: "D", modules: Object.freeze(["regulatory-assurance", "odg-btp-normative-registry"]), gap: "regulatory-assurance (source-cite-or-refuse) + normative registry exist; a dedicated insurance-policy manager (RC Pro/décennale échéances/exclusions) is largely ABSENT; a valid attestation ≠ full coverage" }),
  Object.freeze({ id: "D10", ref: "§12", name: "Sécurité, qualité et environnement", status: "PARTIAL", decisionLevelMax: "D", modules: Object.freeze(["safety-fmea", "p10-serious-incident-deadline", "incident-recurrence"]), gap: "safety FMEA + incident deadline/recurrence exist; DUERP/PPSPS prep + per-métier quality controls + waste traceability (Trackdéchets) are ABSENT; no AI declares a site physically safe" }),
  Object.freeze({ id: "D11", ref: "§13", name: "Clients, contrats et SAV", status: "PARTIAL", decisionLevelMax: "C", modules: Object.freeze(["client-intake", "commercial-pipeline", "odg-btp-billing-engine"]), gap: "intake + pipeline + billing exist; a full client portal + proactive comms + complaint/litige workflow are PARTIAL" }),
  Object.freeze({ id: "D12", ref: "§14-§17", name: "Speed Marketing — moteur mondial d'acquisition", status: "PARTIAL", decisionLevelMax: "C", modules: Object.freeze(["market-intelligence", "commercial-intelligence-chain", "campaign-engine", "odg-btp-growth-roadmap-reconciliation"]), gap: "market-intel + campaign engine exist; the 30 marketing functions OVERLAP the V268 growth roadmap and REUSE it (no duplication) — most are PARTIAL/to-build in Phase F; real spend/publication are OWNER_GATED" }),
  Object.freeze({ id: "D13", ref: "§18", name: "Intelligence concurrentielle mondiale", status: "PARTIAL", decisionLevelMax: "A", modules: Object.freeze(["frontier-radar", "odg-global-opportunity-radar", "market-intelligence", "odg-metier-business-matrix"]), gap: "radar + opportunity + benchmark matrix exist; a maintained competitor matrix (source/date per solution) is not populated; no 2nd Radar — reuse the existing one" }),
  Object.freeze({ id: "D14", ref: "§19", name: "Internationalisation (multi-pays)", status: "PARTIAL", decisionLevelMax: "D", modules: Object.freeze(["odg-language-management", "odg-btp-normative-registry"]), gap: "language management + per-jurisdiction normative records exist (never auto-certified); full country adapters (fiscalité/compta/droit-travail/facturation) per market are not populated — FR rules NOT exported automatically" }),
  Object.freeze({ id: "D15", ref: "§20", name: "Documents, communications et administration", status: "PARTIAL", decisionLevelMax: "B", modules: Object.freeze(["document-intelligence", "odg-btp-billing-engine", "quote"]), gap: "doc intelligence + quote/invoice generation exist; a unified versioned document center (classement/expiry/missing-doc detection) is PARTIAL; PDF rendering ABSENT" }),
  Object.freeze({ id: "D16", ref: "§21", name: "Automatisation et connecteurs", status: "ABSENT", decisionLevelMax: "B", modules: Object.freeze([]), gap: "no production integration layer (banques/compta/e-facturation/CRM/paie/signature) is built; each connector needs a contract + minimal permissions + journaling + recovery. To be built later (prefer official integrations)." }),
  Object.freeze({ id: "D17", ref: "§22", name: "Intelligence artificielle et autonomie (model routing + learning)", status: "EXISTING", decisionLevelMax: "C", modules: Object.freeze(["odg-mission-orchestrator", "odg-owasp-agentic-matrix", "odg-observation-currency"]), gap: "orchestrator (single, no 2nd) + agentic-threat matrix + observation-currency exist; deterministic-first model routing is the rule (don't call an LLM for a deterministic calc); a memorized datum ≠ current fact; a simulation ≠ a real outcome" }),
  Object.freeze({ id: "D18", ref: "§23", name: "Performance et expérience utilisateur (mobile/vocal/offline)", status: "ABSENT", decisionLevelMax: "A", modules: Object.freeze([]), gap: "the mobile/tablet/offline UI layer is out of this backend repository's scope; performance targets must be MEASURED on representative devices, never asserted" }),
  Object.freeze({ id: "D19", ref: "§24", name: "Sécurité, confiance et gouvernance", status: "EXISTING", decisionLevelMax: "C", modules: Object.freeze(["odg-api-security-posture", "security-control-plane", "odg-owasp-agentic-matrix"]), gap: "API posture + control plane + agentic matrix exist; per-tenant isolation + full audit of every sensitive action is PARTIAL (no cross-company leakage)" }),
  Object.freeze({ id: "D20", ref: "§25", name: "Modèle économique et valeur client", status: "EXISTING", decisionLevelMax: "C", modules: Object.freeze(["odg-business-model-families", "odg-economic-scaling-model", "odg-three-person-economic-model"]), gap: "business-model/scaling + 3-person constraint modelled; measured customer-outcome (time saved / errors prevented) requires real pilot data — not yet measured" }),
]);

// §2.2 — the 20 functional assistants, all under ONE orchestrator (no second orchestrator allowed).
const ASSISTANTS = Object.freeze([
  "Direction Générale", "Direction Financière", "Comptabilité Préparatoire", "Administration", "Commercial", "Marketing",
  "Planning", "Conducteur de Travaux", "Chef de Chantier", "Approvisionnement", "Logistique", "Flotte Automobile",
  "Ressources Humaines", "Sécurité et Prévention", "Qualité", "SAV", "Juridique Documentaire", "Assurances",
  "Relation Client", "Développement International",
]);

const PHASES = Object.freeze(["A — Audit de couverture & architecture", "B — Direction & vision", "C — Gestion opérationnelle", "D — Finance & administration", "E — RH/qualité/sécurité", "F — Speed Marketing", "G — Internationalisation", "H — Validation intégrale (5 entreprises SYNTHÉTIQUES)"]);

const PROHIBITIONS = Object.freeze({
  noTenthPrimitive: true, noSecondOrchestrator: true, noSecondRadar: true, noConcurrentRegister: true, noParallelPermissionSystem: true, noNewTruthSource: true,
  antiDuplication: "existing capability ⇒ IMPROVE/INTEGRATE, never duplicate (§26.3)",
  canonicalIntegration: "OWNER_GATED (V261 v124-consolidation guard — section∉A-R ⇒ ORPHAN)",
  speedMarketingOverlap: "OVERLAPS the V268 growth-roadmap program map — REUSE odg-btp-growth-roadmap-reconciliation, do NOT build a parallel marketing map",
});

/** auditCoverage() -> honest tally + the critical anti-duplication / no-operational-claim checks. */
function auditCoverage(): any {
  const count = (s: string) => MEGA_DOMAINS.filter((d: any) => d.status === s).length;
  const tally = Object.freeze({ ABSENT: count("ABSENT"), PARTIAL: count("PARTIAL"), EXISTING: count("EXISTING"), TESTED: count("TESTED"), PRODUCTION_READY: count("PRODUCTION_READY"), INDEPENDENTLY_VALIDATED: count("INDEPENDENTLY_VALIDATED") });
  const allModules = MEGA_DOMAINS.flatMap((d: any) => d.modules);
  return Object.freeze({
    domainCount: MEGA_DOMAINS.length, assistantCount: ASSISTANTS.length, tally,
    moduleRefCount: allModules.length, uniqueModuleCount: new Set(allModules).size,
    noOperationalClaim: tally.PRODUCTION_READY === 0 && tally.INDEPENDENTLY_VALIDATED === 0,     // §30: module existing ≠ operational
    everyDomainHasDecisionLevel: MEGA_DOMAINS.every((d: any) => DECISION_LEVELS.some((l: any) => l.level === d.decisionLevelMax)),
    note: "20 mega-domains + 20 assistants mapped to EXISTING components; honest ladder (nothing PRODUCTION_READY here); reserved acts stay level D; a module on disk is not a claim of operability (§30).",
  });
}

/** reconcile() -> the full Phase-A coverage matrix + anti-duplication proof + OWNER_GATED integration status. */
function reconcile(): any {
  const audit = auditCoverage();
  return Object.freeze({
    phase: "PHASE_A (§27) — matrice de couverture complète et SANS DOUBLONS + graphe de dépendances",
    masterArtifact: MASTER_ARTIFACT, started: false,
    decisionLevels: DECISION_LEVELS, megaDomains: MEGA_DOMAINS, assistants: ASSISTANTS, phases: PHASES,
    audit, prohibitions: PROHIBITIONS,
    canonicalIntegration: "OWNER_GATED — the v124 consolidation guard (V261) rejects any section∉A-R; these mega-domains are NOT appended to docs/odg/v124-consolidated-roadmap.json here; a guard evolution is the owner's to authorize.",
    note: "Phase-A audit ONLY: maps the Autonomous-Company-Management V1.0 roadmap to existing components (anti-duplication, fs-grounded), classifies every domain's maximum decision level (A/B/C/D — reserved acts stay D), preserves every canonical register. No 10th primitive / 2nd orchestrator / 2nd Radar / concurrent register / parallel permission system / new truth source. Nothing OPERATIONAL/world-class; autonomous direction is an AMBITION pursued with evidence.",
  });
}

const COMPANY_MANAGEMENT_COVERAGE_CONTRACT = Object.freeze({
  id: "V269-ODG-BTP-COMPANY-MANAGEMENT-COVERAGE",
  source: "Autonomous Company Management & Speed Marketing V1.0 — Phase A (§27) coverage & anti-duplication audit",
  coverageStatuses: COVERAGE_STATUS, primitives: PRIMITIVES, decisionLevels: DECISION_LEVELS.map((l: any) => l.level),
  reuses: Object.freeze(["odg-btp-project-workflow/billing/metre/devis/normative/vision-voice (V260-V267)", "odg-btp-growth-roadmap-reconciliation (V268 marketing map — reused, not duplicated)", "odg-mission-orchestrator (the single orchestrator)", "frontier-radar/odg-global-opportunity-radar (the existing Radar)", "odg-v124-consolidation (the OWNER_GATED guard)"]),
  invariants: Object.freeze([
    "additive ONLY — NO 10th primitive, NO 2nd orchestrator, NO 2nd Radar, NO concurrent register, NO parallel permission system, NO new independent truth source (§26.1)",
    "anti-duplication (§26.3): an existing capability is IMPROVED/INTEGRATED, never duplicated; the Speed-Marketing domain REUSES the V268 map",
    "coverage map is fs-grounded (every backing module exists on disk); honest ladder — a module on disk ≠ operational (§30); nothing PRODUCTION_READY/INDEPENDENTLY_VALIDATED claimed here",
    "every domain declares its MAX decision level (A/B/C/D §2.3); reserved/qualified acts stay level D (ODG prepares a complete dossier, never decides); significant financial/legal/social/safety acts stay level C",
    "canonical v124 integration OWNER_GATED (V261 guard); started=false; NO canonical register mutated; deterministic/read-only (no Date.now/Math.random/I/O); nothing OPERATIONAL/world-class — autonomous direction is an AMBITION with evidence",
  ]),
});

module.exports = {
  COVERAGE_STATUS, PRIMITIVES, DECISION_LEVELS, MASTER_ARTIFACT, MEGA_DOMAINS, ASSISTANTS, PHASES, PROHIBITIONS,
  auditCoverage, reconcile, COMPANY_MANAGEMENT_COVERAGE_CONTRACT,
};

export {};
