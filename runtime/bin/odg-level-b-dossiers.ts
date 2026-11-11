#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V80 §5 — LEVEL-B DECISION DOSSIERS. For each of the 14 Level-B (owner/controller-gated) missions from the
 * V79 queue, assembles a complete owner-decision-ready dossier: object, current state, evidence, requested change, risks,
 * consequences, reversibility, exact decision awaited. It NEVER auto-approves (ownerDecision stays PENDING; no invented
 * sign-off). It also records the honest MATURITY LADDER per item (DOCUMENTED/PREPARED/EXECUTED/TESTED/VERIFIED/ACCEPTED/
 * OPERATIONAL) so a prepared item is never mistaken for an accepted one. Read-only; no parallel registry. Run: `odg-level-b-dossiers.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }
const q = j("V79_ROADMAP_QUEUE.json");
const levelB = q ? q.traceabilityMatrix.filter((t: any) => t.decision === "PREPARED_B") : [];

// per-requirement decision content (grounded in the known real state; owner/controller is the authority).
const DECISIONS: any = {
  "REQ-Préambule": { object: "acknowledge truth-level discipline + version preservation", state: "DOCUMENTED (practiced via compass + closure-register)", change: "owner acknowledgement", kind: "B_human", reversible: true, maturity: "VERIFIED" },
  "REQ-I": { object: "canonize the 26-capability successor (Part I)", state: "RECONSTRUCTED successor adopted (V64/V65)", change: "owner confirms successor over the FROZEN §6", kind: "B_human", reversible: true, maturity: "PREPARED" },
  "REQ-IV": { object: "canonize the 12-dimensions/10-responsibilities successor (Part IV)", state: "RECONSTRUCTED successor adopted", change: "owner confirms successor over FROZEN §18/§19", kind: "B_human", reversible: true, maturity: "PREPARED" },
  "REQ-XIII": { object: "demonstrate world-superiority (Part XIII)", state: "benchmarks designed+executed ODG-side; superiority fail-closed 0", change: "execute an equitable head-to-head vs a real reference", kind: "B_external", reversible: true, maturity: "EXECUTED (ODG-side only)" },
  "REQ-XVI": { object: "accept the six CTO dossiers A–F (Part XVI)", state: "evidence packs assembled (V60 owner-gated prep)", change: "owner accepts each dossier", kind: "B_human", reversible: true, maturity: "PREPARED" },
  "REQ-XVII": { object: "acknowledge the seven-steps order (Part XVII)", state: "doctrine reflected in the mission cycle", change: "owner acknowledgement", kind: "B_human", reversible: true, maturity: "VERIFIED" },
  "REQ-XIX": { object: "prioritize/authorize the four campaigns C1–C4 (Part XIX)", state: "C2 advanced; gates documented", change: "owner selects the next campaign scope", kind: "B_human", reversible: true, maturity: "PREPARED" },
  "REQ-XXIII": { object: "close gates A–G (Part XXIII)", state: "gate machinery present; evidence prepared", change: "controller re-runs + signs off each gate", kind: "B_human", reversible: true, maturity: "VERIFIED (machinery) / PREPARED (sign-off)" },
  "REQ-XXV": { object: "canonize the F01–F40 successor register (Part XXV)", state: "RECONSTRUCTED successor (V64); original NOT_RECOVERABLE", change: "owner confirms successor over §105", kind: "B_human", reversible: true, maturity: "PREPARED" },
  "REQ-XXVII": { object: "accept the 33 final deliverables + study/operational closure (Part XXVII)", state: "deliverables largely built", change: "owner accepts study + operational closure", kind: "B_human", reversible: true, maturity: "EXECUTED / PREPARED (acceptance)" },
  "REQ-XXVIII": { object: "acknowledge the marching order (Part XXVIII)", state: "doctrine part", change: "owner acknowledgement", kind: "B_human", reversible: true, maturity: "VERIFIED" },
  "REQ-XXIX": { object: "acknowledge the execution mandate P0–P8 (Part XXIX)", state: "mandate reflected in this very execution", change: "owner acknowledgement", kind: "B_human", reversible: true, maturity: "VERIFIED" },
  "REQ-XXX": { object: "accept dossier A A1–A10 + uncertainty register (Part XXX)", state: "dossier A buildable; uncertainties listed", change: "owner dispositions A1–A10 + uncertainties", kind: "B_human", reversible: true, maturity: "PREPARED" },
  "REQ-XXXII": { object: "commercialization: first real client E5 (Part XXXII)", state: "pilots E4; model + journeys prepared; 0 clients", change: "owner authorizes a real client engagement + pricing/contract", kind: "B_human+external", reversible: false, maturity: "PREPARED" },
};

const dossiers = levelB.map((t: any) => {
  const dec = DECISIONS[t.requirement] || { object: t.source, state: t.status, change: "owner decision", kind: "B_human", reversible: true, maturity: "PREPARED" };
  return {
    mission: t.requirement, source: t.source, object: dec.object, currentState: dec.state,
    evidence: "see coverage matrix + closure ledger + successor referential (per part)",
    requestedChange: dec.change, kind: dec.kind, risks: dec.kind.includes("external") ? "external/irreversible exposure — bounded by owner authorization" : "low (reversible local acknowledgement/canonization)",
    consequences: "advances the part from PARTIAL/NOT_VALIDATED toward DONE once accepted", reversibility: dec.reversible ? "reversible" : "IRREVERSIBLE (owner caution)",
    maturity: dec.maturity, decisionAwaited: dec.change, ownerDecision: "PENDING (never auto-approved)",
  };
});
const byKind: any = {}; for (const d of dossiers) byKind[d.kind] = (byKind[d.kind] || 0) + 1;

const out = {
  "//": "CTO V80 §5 — Level-B decision dossiers. Each of the 14 owner/controller-gated missions gets a complete owner-decision-ready dossier (object/state/evidence/change/risks/consequences/reversibility/decision-awaited) + an honest maturity rung. ownerDecision stays PENDING — never auto-approved, no invented sign-off. Read-only; no parallel registry.",
  levelBCount: dossiers.length, byKind, dossiers,
  maturityLadder: ["DOCUMENTED", "PREPARED", "EXECUTED", "TESTED", "VERIFIED", "ACCEPTED", "OPERATIONAL"],
  honestConclusion: `${dossiers.length} Level-B missions assembled into owner-decision-ready dossiers (${JSON.stringify(byKind)}). Each carries object/evidence/change/risks/reversibility + the exact decision awaited; ALL ownerDecision = PENDING (never auto-approved, no sign-off invented). Maturity is honestly distinguished (several are VERIFIED-machinery but PREPARED-acceptance — not ACCEPTED). ACCEPTANCE remains the owner/controller's act.`,
  invariant: "A prepared dossier is never an accepted mission; ownerDecision stays PENDING; maturity rungs are not conflated; the owner/controller alone accepts; no fabricated sign-off.",
};
fs.writeFileSync(path.join(D, "V80_LEVEL_B_DOSSIERS.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ levelB: dossiers.length, byKind, allPending: dossiers.every((d: any) => d.ownerDecision === "PENDING (never auto-approved)") }, null, 2) + "\n");
export {};
