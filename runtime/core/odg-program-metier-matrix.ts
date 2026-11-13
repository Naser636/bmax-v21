#!/usr/bin/env node
"use strict";
/*
 * V185 §4/§8 — 9 strategic programs × 20 métiers matrix (180 intersections). PURE, READ-ONLY, deterministic.
 *
 * A GOVERNANCE / REUSE VIEW crossing the V12.4-extension's 9 strategic programs (odg-v124-extension-registry.PROGRAMS)
 * with the canonical 20-métier roster (planner P1..P15 + commercial M1..M5). It is NOT a new architecture and builds
 * nothing. Each intersection is classified REUSE / IMPROVE / BUILD_CONDITIONAL / NOT_APPLICABLE / OWNER_GATED /
 * NOT_MEASURED with a basis. A program is a COMMON capability cluster — so REUSE is the honest default; IMPROVE marks a
 * program's primary métiers; OWNER_GATED preserves payment/certification; BUILD_CONDITIONAL mirrors the PARKED extension
 * (nothing engaged in this lot).
 */

const { PROGRAMS } = require("./odg-v124-extension-registry.js");
const { METIERS } = require("./odg-metier-certification-planner.js");
const { COMMERCIAL_METIERS } = require("./odg-commercial-metier-matrix.js");

const CLASS = Object.freeze(["REUSE", "IMPROVE", "BUILD_CONDITIONAL", "NOT_APPLICABLE", "OWNER_GATED", "NOT_MEASURED"]);

// the 20-métier roster (15 principal + 5 commercial), category-tagged, reused from canonical sources.
const ROSTER20 = Object.freeze([
  ...METIERS.map((m: any) => Object.freeze({ id: m.id, name: m.name, category: "PRINCIPAL" })),
  ...COMMERCIAL_METIERS.map((m: any) => Object.freeze({ id: m.id, name: m.name, category: "COMMERCIAL" })),
]);

// each program's PRIMARY métiers (⇒ IMPROVE), its OWNER_GATED métiers, and its BUILD_CONDITIONAL métiers. Default REUSE.
const PROGRAM_RULES = Object.freeze({
  P1_engine_reliability: { primary: ["P7", "P12"], ownerGated: [], build: [] },
  P2_financial_control: { primary: ["P9", "M3"], ownerGated: ["P9", "M3"], build: ["P9", "M3"] }, // payment execution owner-gated; 3-way-match conditional
  P3_document_contract_intelligence: { primary: ["P11", "M2"], ownerGated: [], build: ["M2"] },     // BTP DCE analyzer conditional
  P4_data_multi_org: { primary: ["P4", "M4"], ownerGated: [], build: ["P4", "M4"] },                // data-layer tenancy conditional
  P5_cyber_resilience: { primary: ["P3", "P13", "M1"], ownerGated: [], build: [] },
  P6_observability_qualification: { primary: ["P6", "P7"], ownerGated: [], build: [] },
  P7_product_design_distribution: { primary: ["P1", "M5"], ownerGated: ["M5"], build: [] },          // accessibility cert/legal owner-gated
  P8_continuous_improvement: { primary: ["P2", "P14", "P15"], ownerGated: [], build: [] },
  P9_fifteen_metier_application: { primary: ROSTER20.map((m: any) => m.id), ownerGated: [], build: [] }, // by definition applies to ALL métiers
});

function cellFor(prog: any, metier: any): any {
  const rule = (PROGRAM_RULES as any)[prog.id] || { primary: [], ownerGated: [], build: [] };
  // precedence: OWNER_GATED (strongest governance constraint — e.g. payment) > BUILD_CONDITIONAL > IMPROVE > REUSE.
  let cls = "REUSE";
  if (rule.ownerGated.includes(metier.id)) cls = "OWNER_GATED";
  else if (rule.build.includes(metier.id)) cls = "BUILD_CONDITIONAL";
  else if (rule.primary.includes(metier.id)) cls = "IMPROVE";
  const basis = cls === "BUILD_CONDITIONAL" ? "absence demonstrated (PARKED extension); NOT built in this lot"
    : cls === "OWNER_GATED" ? "payment/certification/legal action requires owner authorization"
    : cls === "IMPROVE" ? "this métier is a primary beneficiary — improve the common program capability"
    : "common program capability reused by this métier (anti-duplication)";
  return Object.freeze({ program: prog.id, metier: metier.id, metierName: metier.name, category: metier.category, classification: cls, basis });
}

function matrix(): any {
  const progs = PROGRAMS.map((p: any) => p.id);
  const cells: any[] = [];
  for (const p of PROGRAMS) for (const m of ROSTER20) cells.push(cellFor(p, m));
  const byClass: any = {}; for (const c of CLASS) byClass[c] = 0; for (const c of cells) byClass[c.classification] += 1;
  return Object.freeze({
    programs: Object.freeze(progs), programCount: progs.length, metierCount: ROSTER20.length, intersections: cells.length,
    cells: Object.freeze(cells), byClass: Object.freeze(byClass),
    note: "9 programs × 20 métiers = 180 intersections. REUSE default (programs are COMMON capability clusters, built once, reused). NO construction engaged (BUILD_CONDITIONAL is a label only, mirrors the PARKED extension).",
  });
}

const PROGRAM_METIER_MATRIX_CONTRACT = Object.freeze({
  id: "V185-PROGRAM-METIER-MATRIX",
  purpose: "§4/§8 — governance view crossing the 9 strategic programs with the 20 métiers; classify, build nothing",
  invariants: Object.freeze([
    "exactly 180 intersections (9 programs × 20 métiers); each classified + justified",
    "REUSE default: a program is a common capability cluster built ONCE and reused — no second canonical system",
    "NO construction engaged; BUILD_CONDITIONAL mirrors the PARKED V12.4 extension (nothing started)",
    "payment + certification stay OWNER_GATED; P9 applies to all métiers by definition",
    "reuses PROGRAMS (extension registry) + the 20-métier roster; deterministic; read-only",
  ]),
});

module.exports = { CLASS, ROSTER20, matrix, PROGRAM_METIER_MATRIX_CONTRACT };
export {};
