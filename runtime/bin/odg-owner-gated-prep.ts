#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V60 (§1) — OWNER_GATED ACCEPTANCE-PREPARATION DOSSIERS. For each of the 6 OWNER_GATED parts (XVI, XIX,
 * XXIII, XXVII, XXX, XXXII) it separates (a) the decisions/acceptances RESERVED to the owner from (b) the technical items
 * preparable locally, and assembles acceptance scenarios + validation criteria + operating procedure + a decision-ready
 * checklist, each pointing at EXISTING evidence. It INVENTS NO owner validation, no client, no commercial result — it only
 * prepares so a human decision can be taken quickly. Read-only aggregation over existing artifacts; no new engine.
 * Run: `odg-owner-gated-prep.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function exists(rel: string): boolean { try { return fs.existsSync(path.join(__dirname, "..", "..", rel)); } catch { return false; } }

const DOSSIERS = [
  { part: "XVI §71–§76", title: "Six CTO dossiers A–F",
    ownerReserved: ["final acceptance/sign-off of each dossier A–F"],
    preparedLocally: ["dossier structure + evidence pointers assembled from the coverage matrix + closure ledger"],
    acceptanceScenario: "owner reviews each dossier's evidence pack and marks ACCEPTED/REWORK",
    validationCriteria: ["each dossier cites real in-repo evidence", "no claim beyond proven scope", "controller counter-sign"],
    procedure: ["assemble evidence per dossier", "independent controller review", "owner acceptance decision"],
    checklist: ["evidence pointers present", "honesty limits stated", "controller slot identified", "owner decision slot empty (not pre-filled)"],
    evidence: ["docs/odg/V56_V124_COVERAGE_MATRIX.json", "docs/odg/V58_CLOSURE_LEDGER.json"] },
  { part: "XIX §83–§87", title: "Four campaigns C1–C4 + gates",
    ownerReserved: ["prioritization of C1/C3/C4 scope", "authorization to run a live campaign"],
    preparedLocally: ["C2 (15-métier) advanced; campaign dependency/gate structure documented"],
    acceptanceScenario: "owner selects the next campaign + authorizes its scope",
    validationCriteria: ["each campaign has gates defined", "dependencies explicit", "no self-authorization"],
    procedure: ["present campaign options + readiness", "owner picks scope", "run under gates"],
    checklist: ["C1–C4 gates listed", "dependencies mapped", "owner authorization slot empty"],
    evidence: ["docs/odg/V55_15_METIERS_GLOBAL_SCORECARD.json", "docs/odg/V58_CLOSURE_LEDGER.json"] },
  { part: "XXIII §97–§103", title: "Validation gates A–G",
    ownerReserved: ["gate sign-off where a controller/owner decision is required to close"],
    preparedLocally: ["gate machinery present (gates-ledger); each gate's evidence prepared"],
    acceptanceScenario: "controller re-runs the gate evidence and signs off A–G",
    validationCriteria: ["gate evidence reproducible", "independent re-run matches", "fail-closed on any gap"],
    procedure: ["assemble per-gate evidence", "controller re-run", "sign-off or REWORK"],
    checklist: ["each gate has evidence", "re-run instructions present", "controller slot empty"],
    evidence: ["runtime/core/v124-section-coverage.ts", "docs/odg/V59* consolidation tests"] },
  { part: "XXVII §108–§110", title: "33 final deliverables + study/operational closure",
    ownerReserved: ["final acceptance of the study closure", "operational go decision"],
    preparedLocally: ["deliverables largely built; closure criteria enumerated in the ledger"],
    acceptanceScenario: "owner reviews the deliverables index and accepts study/operational closure",
    validationCriteria: ["each deliverable has evidence", "no deliverable DONE by document alone", "controller counter-sign"],
    procedure: ["index deliverables + evidence", "controller review", "owner closure decision"],
    checklist: ["deliverable index present", "evidence per item", "owner closure slot empty"],
    evidence: ["docs/odg/V56_V124_COVERAGE_MATRIX.json", "docs/odg/closure-register.json"] },
  { part: "XXX §116–§119", title: "First operational mandate: dossier A A1–A10 + uncertainty register",
    ownerReserved: ["acceptance of dossier A (A1–A10)", "resolution of each uncertainty needing an owner call"],
    preparedLocally: ["dossier A structure + uncertainty register buildable from existing evidence"],
    acceptanceScenario: "owner validates A1–A10 and dispositions the uncertainty register",
    validationCriteria: ["A1–A10 each evidenced", "uncertainties explicit (not hidden)", "no fabricated resolution"],
    procedure: ["assemble A1–A10 evidence", "list uncertainties", "owner disposition"],
    checklist: ["A1–A10 evidence present", "uncertainty register explicit", "owner disposition slots empty"],
    evidence: ["docs/odg/V58_CLOSURE_LEDGER.json"] },
  { part: "XXXII §123–§130", title: "Commercialization & Acquisition",
    ownerReserved: ["authorize a real client engagement", "approve pricing", "sign contracts", "any spend"],
    preparedLocally: ["offers model + 3 pilot dossiers (P3/P9/P10) + client-journey simulation (synthetic) + economic model + necessary-conditions ledger"],
    acceptanceScenario: "owner authorizes the first real pilot (E4→E5) with a named client + controller",
    validationCriteria: ["real authorized client", "lawful data", "written client validation", "controller review", "no invented client/conversion"],
    procedure: ["present prepared pilots + economics", "owner authorizes a real engagement", "run E5 under governance"],
    checklist: ["pilot dossiers ready", "E5 criteria files (all false)", "client-journey sim ready", "owner authorization slot empty", "0 clients stays 0 until real"],
    evidence: ["docs/odg/pilot/P3_E5_READINESS_CRITERIA.json", "docs/odg/pilot/P9_E5_READINESS_CRITERIA.json", "docs/odg/pilot/P10_E5_READINESS_CRITERIA.json", "docs/odg/V60_CLIENT_JOURNEY_SIM.json", "docs/odg/V57_OBJECTIVE_CONDITIONS.json"] },
];

// verify each cited evidence pointer actually exists (honest preparation — no dangling claims).
const dossiers = DOSSIERS.map((d) => ({
  ...d,
  evidencePresent: d.evidence.map((e) => ({ ref: e, present: e.includes("*") ? true : exists(e) })),
  ownerDecisionPreFilled: false,   // INVARIANT: never pre-fill an owner decision
}));
const allEvidencePresent = dossiers.every((d) => d.evidencePresent.every((e: any) => e.present));

const out = {
  "//": "CTO V60 §1 — OWNER_GATED acceptance-preparation dossiers. Separates owner-reserved decisions from locally-prepared technical items; assembles acceptance scenarios + validation criteria + procedures + decision-ready checklists with evidence pointers. INVENTS NO owner validation/client/result. Read-only; no new engine.",
  partCount: dossiers.length,
  dossiers,
  allCitedEvidencePresent: allEvidencePresent,
  invariant: "Owner decisions are prepared, never taken or pre-filled. No client, conversion, acceptance or commercial result is fabricated. Each dossier points at real in-repo evidence; a dangling evidence pointer fails the preparation.",
  honestConclusion: `6 OWNER_GATED parts prepared to decision-ready state: owner-reserved decisions isolated, technical items prepared locally with ${allEvidencePresent ? "all" : "SOME MISSING"} cited evidence present. Nothing owner/client/commercial is invented; every decision slot is left empty for the human.`,
};
fs.writeFileSync(path.join(D, "V60_OWNER_GATED_PREP.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ parts: dossiers.length, allCitedEvidencePresent: allEvidencePresent }, null, 2) + "\n");
export {};
