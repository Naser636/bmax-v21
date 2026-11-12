#!/usr/bin/env node
"use strict";
/*
 * V175 (§2 — ISO/IEC 27001:2022 mutualized evidence crosswalk for the 5 métiers ISO 27001 covers). PURE, deterministic,
 * fail-closed, READ-ONLY. Maps representative Annex A controls to ODG's REAL existing control modules with a STRICT maturity
 * ladder — the directive's core requirement: never conflate document-written / control-implemented / control-tested /
 * operational-proof / internal-audit / external-audit / certification-obtained.
 *
 * Reference (radar, grant V141 valid→2026-11-19, read-only public, 2026-11-12 WebSearch): ISO/IEC 27001:2022 Annex A = 93
 * controls in 4 themes — A.5 Organizational (37), A.6 People (8), A.7 Physical (14), A.8 Technological (34).
 *
 * HONESTY (strict §2): NO audit is declared performed; NO certification is declared obtained; NO fictitious evidence. The
 * MAX maturity attainable in-repo is CONTROL_TESTED (a real module + test). OPERATIONAL_PROOF, INTERNAL_AUDIT, EXTERNAL_AUDIT
 * and CERTIFIED are ALL OWNER_GATED (require real operation over time + an accredited body). People/Physical themes are
 * largely OWNER_GATED (real HR) or inherited from the hosting provider (shared responsibility).
 */
const PLANNER = require("./odg-metier-certification-planner.js");

// strict maturity ladder — each level is a distinct, non-conflatable claim (§2).
const MATURITY = Object.freeze(["DOCUMENTED", "CONTROL_IMPLEMENTED", "CONTROL_TESTED", "OPERATIONAL_PROOF", "INTERNAL_AUDIT", "EXTERNAL_AUDIT", "CERTIFIED"]);
const MATURITY_RANK: any = {}; MATURITY.forEach((m, i) => (MATURITY_RANK[m] = i));
const OWNER_GATED_FROM = "OPERATIONAL_PROOF"; // everything at/above this requires real operation/audit/body — OWNER_GATED

// Representative Annex A controls ↔ ODG REAL modules. maturity = the honest highest level supported by repo evidence.
const CONTROLS = Object.freeze([
  { ref: "A.8.2", theme: "Technological", name: "Privileged access rights", odg: ["capability-authorization", "third-party-agent-gate"], maturity: "CONTROL_TESTED" },
  { ref: "A.8.5", theme: "Technological", name: "Secure authentication", odg: ["agent-identity (Ed25519 + nonce)"], maturity: "CONTROL_TESTED" },
  { ref: "A.8.8", theme: "Technological", name: "Management of technical vulnerabilities", odg: ["cra-remediation-engine", "multi-ecosystem SBOM"], maturity: "CONTROL_IMPLEMENTED" },
  { ref: "A.8.12", theme: "Technological", name: "Data leakage / secrets protection", odg: ["secret-rotation-hygiene", "lethal-trifecta-gate"], maturity: "CONTROL_TESTED" },
  { ref: "A.8.15", theme: "Technological", name: "Logging", odg: ["audit-log (keyed-HMAC tamper-evident chain)"], maturity: "CONTROL_TESTED" },
  { ref: "A.8.16", theme: "Technological", name: "Monitoring activities", odg: ["performance-observability", "otel-execution-trace (V167)"], maturity: "CONTROL_TESTED" },
  { ref: "A.8.24", theme: "Technological", name: "Use of cryptography", odg: ["agent-identity Ed25519", "audit-log HMAC", "supply-chain-attest"], maturity: "CONTROL_TESTED" },
  { ref: "A.8.25", theme: "Technological", name: "Secure development lifecycle", odg: ["odg-closed-executor (no eval/new Function)", "patch-executor confinement"], maturity: "CONTROL_TESTED" },
  { ref: "A.8.28", theme: "Technological", name: "Secure coding", odg: ["odg-ast-operations", "odg-closed-executor"], maturity: "CONTROL_TESTED" },
  { ref: "A.8.31", theme: "Technological", name: "Separation of dev/test/prod", odg: ["delegate-isolation (bwrap worktree isolation)"], maturity: "CONTROL_IMPLEMENTED", note: "full isolation bwrap-gated in this environment" },
  { ref: "A.5.7", theme: "Organizational", name: "Threat intelligence", odg: ["radar (V171 scheduler) + opportunity radar (V174-A)"], maturity: "CONTROL_IMPLEMENTED", note: "real scheduled run NOT_MEASURED (owner/root timer)" },
  { ref: "A.5.19", theme: "Organizational", name: "Supplier / ICT supply-chain security", odg: ["provider-capability-contract", "supply-chain-attest", "p8-slsa-level-gate"], maturity: "CONTROL_TESTED" },
  { ref: "A.5.24", theme: "Organizational", name: "Incident management", odg: ["emergency-stop", "build-recovery-engine", "recovery drill"], maturity: "CONTROL_IMPLEMENTED" },
  { ref: "A.5.1", theme: "Organizational", name: "Policies for information security", odg: [], maturity: "DOCUMENTED", note: "requires management approval ⇒ OWNER_GATED" },
  { ref: "A.5.9", theme: "Organizational", name: "Inventory of information & assets", odg: [], maturity: "DOCUMENTED", note: "partial — asset register to complete" },
  { ref: "A.5.35", theme: "Organizational", name: "Independent review / internal audit", odg: [], maturity: "DOCUMENTED", note: "internal audit = OWNER_GATED (must be performed for real)" },
  { ref: "A.6.1", theme: "People", name: "Screening / awareness / terms of employment", odg: [], maturity: "DOCUMENTED", note: "OWNER_GATED — real HR process" },
  { ref: "A.7.1", theme: "Physical", name: "Physical security perimeters", odg: [], maturity: "DOCUMENTED", note: "inherited from hosting provider (shared responsibility) / OWNER_GATED" },
]);

function ownerGated(c: any): boolean {
  // a control is owner-gated to PROGRESS if its next step needs real operation/audit/HR/physical/management.
  return c.theme === "People" || c.theme === "Physical" || /OWNER_GATED/.test(c.note || "") || c.odg.length === 0;
}

/* crosswalk() — per-control: Annex A ref/theme/name, ODG modules, honest maturity, owner-gated flag, next step. */
function crosswalk(): any {
  const rows = CONTROLS.map((c: any) => Object.freeze({
    ref: c.ref, theme: c.theme, name: c.name, odgModules: Object.freeze(c.odg.slice()),
    maturity: c.maturity, maturityRank: MATURITY_RANK[c.maturity],
    ownerGatedToProgress: ownerGated(c),
    nextStep: MATURITY_RANK[c.maturity] >= MATURITY_RANK[OWNER_GATED_FROM] ? "already at an owner-gated level" : (ownerGated(c) ? `next step (${MATURITY[MATURITY_RANK[c.maturity] + 1]}) is OWNER_GATED` : `can advance toward ${MATURITY[Math.min(MATURITY_RANK[c.maturity] + 1, MATURITY_RANK["CONTROL_TESTED"])]} locally`),
    note: c.note || null,
  }));
  return Object.freeze(rows);
}

/* maturitySummary — counts by level + the honest MAX reached + what remains owner-gated. */
function maturitySummary(): any {
  const rows = crosswalk();
  const byLevel: any = {}; for (const m of MATURITY) byLevel[m] = 0; for (const r of rows) byLevel[r.maturity] += 1;
  const maxReached = rows.reduce((a: number, r: any) => Math.max(a, r.maturityRank), 0);
  return Object.freeze({
    totalControlsMapped: rows.length,
    byLevel: Object.freeze(byLevel),
    maxMaturityReached: MATURITY[maxReached],
    ownerGatedControls: rows.filter((r: any) => r.ownerGatedToProgress).length,
    auditPerformed: false, certified: false,
    honestCeiling: "MAX in-repo = CONTROL_TESTED. OPERATIONAL_PROOF (real operation over time), INTERNAL_AUDIT, EXTERNAL_AUDIT (accredited body Stage 1/2) and CERTIFIED are ALL OWNER_GATED — NONE reached. No audit performed; no certification obtained; no fictitious evidence.",
  });
}

/* soaApplicability — a minimal Statement-of-Applicability stance per theme (applicable / inherited / owner-gated). */
function soaApplicability(): any {
  return Object.freeze({
    Technological: "APPLICABLE — ODG's strongest coverage (CONTROL_TESTED on most mapped controls)",
    Organizational: "APPLICABLE — mixed (supplier/logging TESTED; policies/asset-inventory/internal-audit DOCUMENTED/owner-gated)",
    People: "OWNER_GATED — real HR screening/awareness/terms required",
    Physical: "INHERITED/SHARED — hosting provider responsibility; ODG scope is logical not physical",
  });
}

function mutualizedMetiers(): any {
  const iso = PLANNER.MUTUALIZATION.find((m: any) => /27001/.test(m.cert));
  return Object.freeze({ cert: iso.cert, covers: Object.freeze(iso.covers.slice()), note: "ONE ISMS evidence base reused across the 5 métiers WITHOUT confusing their specific scopes — each métier scopes the SoA to its product." });
}

const ISO27001_CROSSWALK_CONTRACT = Object.freeze({
  id: "V175-ISO27001-EVIDENCE-CROSSWALK",
  purpose: "§2 — map ISO 27001:2022 Annex A controls to ODG's REAL controls with a STRICT maturity ladder; mutualized for the 5 métiers; nothing audited/certified",
  reference: "ISO/IEC 27001:2022 Annex A — 93 controls / 4 themes (A.5 Org 37, A.6 People 8, A.7 Physical 14, A.8 Tech 34); verified via WebSearch 2026-11-12",
  maturityLadder: MATURITY,
  invariants: Object.freeze([
    "STRICT separation: DOCUMENTED ≠ CONTROL_IMPLEMENTED ≠ CONTROL_TESTED ≠ OPERATIONAL_PROOF ≠ INTERNAL_AUDIT ≠ EXTERNAL_AUDIT ≠ CERTIFIED",
    "MAX in-repo = CONTROL_TESTED; OPERATIONAL_PROOF/audits/CERTIFIED are OWNER_GATED — NONE declared reached",
    "maps to ODG's REAL existing modules only; People/Physical = OWNER_GATED/inherited; no fictitious evidence, no audit declared performed",
    "mutualized evidence base for the 5 métiers (P3/P4/P5/P10/P13 from the canonical planner) without confusing their specific scopes",
    "READ-ONLY; deterministic; fail-closed; no certification invented",
  ]),
});
module.exports = { CONTROLS, MATURITY, crosswalk, maturitySummary, soaApplicability, mutualizedMetiers, ISO27001_CROSSWALK_CONTRACT };
export {};
