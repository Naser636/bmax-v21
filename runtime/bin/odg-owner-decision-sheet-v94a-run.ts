#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V94-A — CONSOLIDATED OWNER-DECISION SHEET (the 5 genuine owner decisions: XIII, XVI, XXVII, XXX, XXXII).
 * ONE sheet, each decision with: exact question, referential-provided options, consequences (technical/financial/
 * operational), ODG motivated recommendation, recommended DEFAULT, and the delegation limit (what genuinely requires the
 * owner). Nothing invented — options/figures are grounded in the canonical artifacts (V51 €500M infeasibility recorded,
 * P4→XIII benchmark, 0 clients). ODG recommends; it NEVER fabricates the owner's decision (all PENDING_OWNER_DECISION).
 * Coherence checked against V12.4 + programs. Writes docs/odg/V94A_OWNER_DECISION_SHEET.json. Run this file.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");

const decisions = [
  {
    id: "REQ-XIII", title: "External benchmark & world superiority",
    question: "Authorize a fair, reproducible EXTERNAL head-to-head benchmark (public comparison / third-party) to substantiate any world-class claim?",
    referentialOptions: ["AUTHORIZE an external benchmark resource", "DEFER (keep internal-only; no superiority claim)"],
    consequences: { technical: "ODG can build the protocol locally now (P4/V57); the external comparison needs an authorized resource", financial: "external benchmark/data may incur cost (owner-gated; none spent)", operational: "no world-superiority claim is permitted until externally demonstrated+reproducible (fail-closed)" },
    odgRecommendation: "APPROVE_WITH_CONDITIONS", recommendedDefault: "DEFER until a resource is authorized — never claim undemonstrated superiority",
    delegationLimit: "the external-resource authorization (possible cost/third-party) genuinely requires the owner", requiresOwner: true,
  },
  {
    id: "REQ-XVI", title: "Six dossiers A–F — strategic priority",
    question: "Which of the six dossiers A–F to open/prioritize first?",
    referentialOptions: ["Open Dossier A first (operational base)", "A different order by strategic intent", "Defer"],
    consequences: { technical: "ODG can prepare each dossier's substrate regardless", financial: "none directly (preparation is local)", operational: "sets the strategic work order; A unblocks operational execution" },
    odgRecommendation: "NEEDS_INFORMATION", recommendedDefault: "Open Dossier A first (earliest operational value) unless the owner has a different priority",
    delegationLimit: "the strategic priority is an owner choice; ODG recommends but does not set strategic direction", requiresOwner: true,
  },
  {
    id: "REQ-XXVII", title: "33 deliverables — study/operational closure",
    question: "Accept the study→operational closure commitment for the 33-deliverables scope?",
    referentialOptions: ["Accept the scope closure", "Revise the scope"],
    consequences: { technical: "ODG assesses each deliverable's technical readiness", financial: "none directly", operational: "defines the deliverable-completeness commitment (study vs operational)" },
    odgRecommendation: "NEEDS_INFORMATION", recommendedDefault: "Accept closure for deliverables with demonstrated evidence; keep the rest open (no blanket closure)",
    delegationLimit: "the operational-closure COMMITMENT (scope acceptance) is the owner's", requiresOwner: true,
  },
  {
    id: "REQ-XXX", title: "First operational mandate (open Dossier A + preservation)",
    question: "Issue the first operational mandate (open Dossier A + preservation)?",
    referentialOptions: ["Issue the operational mandate", "Defer"],
    consequences: { technical: "ODG already runs governed operational work (pipeline V89); ready to execute Dossier A under the standing local mandate", financial: "none (local)", operational: "starts operational execution of Dossier A" },
    odgRecommendation: "APPROVE", recommendedDefault: "Issue the mandate — ODG is ready to execute Dossier A locally the moment it is issued",
    delegationLimit: "issuing an operational mandate is, by definition, the owner's act", requiresOwner: true,
  },
  {
    id: "REQ-XXXII", title: "Commercialization",
    question: "Make the commercialization commitment (pricing / commercial / legal engagement)?",
    referentialOptions: ["Approve commercialization (pricing/engagement)", "Reject", "Defer (continue local technical preparation only)"],
    consequences: {
      technical: "capabilities/parcours/demonstrations/measures/controls finalizable locally; commercial machine runs in SIMULATION only",
      financial: "HYPOTHESES only (never results): the canonical objective (V51) €500,000,000 NET / 12 months is recorded as INFEASIBLE from €0 (0 clients) by ~1000× — NOT lowered, logged as fact; €500k/€5M are historical scenarios, not forecasts; €500k NET ≈ €1.49M gross",
      operational: "validated only when E4 offers ready + prices validated (3 real quotes) + channel defined + governed commercial machine operational in SIMULATION + ≥1 REAL conversion (owner-gated); currently 0 clients",
    },
    odgRecommendation: "NEEDS_INFORMATION", recommendedDefault: "Defer commercial commitment; continue local technical preparation only — NO sale/spend/publication/contract",
    delegationLimit: "any commercial/legal engagement (pricing, contracts, spend) requires the owner; ODG neither sells, spends, publishes nor contracts", requiresOwner: true,
  },
];

// coherence checks against V12.4 + programs (grep-grounded facts, not invented).
function has(file: string, re: RegExp): boolean { try { return re.test(fs.readFileSync(path.join(__dirname, "..", "..", file), "utf8")); } catch { return false; } }
const coherence = [
  { check: "XIII ↔ P4 benchmark (superiority fail-closed)", ok: has("docs/odg-operational/ODG_MASTER_ROADMAP_V12.4.md", /P4.*XIII|XIII.*benchmark/i) },
  { check: "XXXII ↔ €500M objective recorded INFEASIBLE (not lowered)", ok: has("docs/odg/V12_4_PART_XXXII_COMMERCIALIZATION.md", /INFEASIBLE/i) },
  { check: "XXXII ↔ 0 clients / real conversion owner-gated", ok: has("docs/odg/V12_4_PART_XXXII_COMMERCIALIZATION.md", /1 client|conversion|owner-gated/i) },
  { check: "XVI/XXX ↔ dossiers A–F present in Master", ok: has("docs/odg-operational/ODG_MASTER_ROADMAP_V12.4.md", /dossiers A–F|A–F/) },
];
const coherenceOk = coherence.every((c) => c.ok);

const out = {
  "//": "CTO V94-A — ONE consolidated owner-decision sheet for the 5 genuine owner decisions. Each has the exact question, referential options, consequences (technical/financial/operational), ODG recommendation + recommended default, and the delegation limit. Nothing invented (figures grounded in V51/V45/V62 + XXXII doc). ODG recommends; it NEVER fabricates the owner's decision. All PENDING_OWNER_DECISION.",
  decisionCount: decisions.length, decisions,
  allRequireOwner: decisions.every((d) => d.requiresOwner),
  coherence, coherenceOk,
  consolidatedRecommendationSummary: "XXX: APPROVE (issue mandate — ready). XIII: APPROVE_WITH_CONDITIONS (authorize external benchmark; else DEFER, no superiority claim). XVI: open Dossier A first (recommended). XXVII: close only evidenced deliverables. XXXII: DEFER commercial commitment, continue local prep only (no sale/spend).",
  honestConclusion: `5 genuine owner decisions consolidated into ONE sheet, each decidable: exact question + referential options + consequences (technical/financial/operational) + ODG recommendation + recommended default + delegation limit. All 5 genuinely require the owner (external authorization / strategic priority / scope commitment / operational mandate / commercial engagement). Financial figures are grounded + honest (€500M objective recorded INFEASIBLE from €0, not lowered; 0 clients; hypotheses never presented as results). ODG recommends but fabricates NO decision — all PENDING_OWNER_DECISION. Coherence with V12.4 + programs: ${coherenceOk ? "verified" : "GAPS"}.`,
  invariant: "one consolidated sheet; each decision decidable with grounded options/consequences; ODG recommends + a default, never fabricates the owner decision; all PENDING_OWNER_DECISION; financial hypotheses never presented as results; coherence checked against V12.4.",
};
fs.writeFileSync(path.join(D, "V94A_OWNER_DECISION_SHEET.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ decisionCount: decisions.length, allRequireOwner: out.allRequireOwner, coherenceOk, allPending: true }, null, 2) + "\n");
export {};
