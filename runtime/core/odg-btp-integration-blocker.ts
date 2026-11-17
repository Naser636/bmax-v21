#!/usr/bin/env node
"use strict";

/*
 * V261 §2/§22 — BTP↔V12.4 canonical-integration BLOCKER DIAGNOSTIC (read-only). An attempt to integrate the BTP programme
 * ADDITIVELY into docs/odg/v124-consolidated-roadmap.json was made and then REVERTED: it fails the EXISTING, by-design
 * consolidation guards in odg-v124-consolidation.validate(). Per the master roadmap §22 ("if the canonical structure cannot
 * be integrated safely, STOP the mutation and produce an evidence-backed blocker — do not guess"), this records WHY, honestly,
 * rather than forcing a dishonest mapping. The companion is left UNCHANGED (the V234–V238 consolidation).
 *
 * The companion is NOT a generic roadmap: odg-v124-consolidation fail-closes it to be the LOSSLESS, single-source V234–V238
 * consolidation — every mission must map to a V12.4 section A–R (else ORPHAN) and every expectedMissionSource must be a
 * V234–V238 source present in a mission (else LOSSY). A BTP extension introduces a NEW domain (section "BTP" ∉ A–R) and NEW
 * sources (V258–V261 ∉ V234–V238), which those guards reject BY DESIGN. Pure/deterministic; no file mutated.
 */

const BLOCKER = Object.freeze({
  mission: "CM-BTP-CANONICAL-INTEGRATION",
  target: "docs/odg/v124-consolidated-roadmap.json (non-protected companion)",
  attempted: "append a BTP program + 6 CM-BTP-* missions + V258–V261 to expectedMissionSources",
  status: "BLOCKED_BY_CONSOLIDATION_GUARD",
  companionMutated: false,                                   // the edit was reverted; companion is at its V234–V238 baseline
  guards: Object.freeze([
    Object.freeze({ guard: "odg-v124-consolidation.validate() ORPHAN check", constraint: "every mission.section ∈ V12.4 sections A–R", violation: "a BTP mission needs section 'BTP' which is NOT in A–R ⇒ ORPHAN ⇒ consolidated:false" }),
    Object.freeze({ guard: "odg-v124-consolidation.validate() LOSSLESS check", constraint: "every expectedMissionSource must be present in a mission.source (and the set is the V234–V238 consolidation)", violation: "adding V258–V261 introduces sources outside the V234–V238 consolidation ⇒ LOSSY / out-of-scope" }),
    Object.freeze({ guard: "odg-program-continuity consumer", constraint: "the companion drives odg-program-continuity's dossier over the V234–V238 consolidation", violation: "injecting BTP missions changes what the continuity consumer validates ⇒ its tests fail" }),
  ]),
  // honest resolution paths — ALL owner-gated (not taken here).
  resolutionOptionsOwnerGated: Object.freeze([
    "(a) OWNER authorizes extending the V12.4 section set + expectedMissionSources + the odg-v124-consolidation validators to admit a BTP section/sources (changes a governance validator ⇒ owner decision)",
    "(b) a DISTINCT owner-approved BTP registry — but §11 forbids a second strategic roadmap, so this needs explicit owner authority",
  ]),
  // what IS true today (the BTP programme is tracked without the companion edit):
  btpTrackedVia: Object.freeze(["ODG_BTP_WORLD_CLASS_V12_4_ROADMAP.md (persisted master spec, PR #638)", "runtime/core/odg-btp-capability-matrix.ts (PR #637)", "runtime/core/odg-btp-devis-engine.ts (PR #641)"]),
  note: "the additive companion edit was ATTEMPTED and REVERTED on hitting the existing consolidation guards; per §22 this is a documented BLOCKER, not a failure. The companion remains the untouched V234–V238 consolidation. The BTP programme is real and tracked via its merged artefacts; its canonical mission-registry integration is OWNER_GATED pending a governance decision.",
});

function diagnose(): any { return BLOCKER; }

const BTP_INTEGRATION_BLOCKER_CONTRACT = Object.freeze({
  id: "V261-BTP-INTEGRATION-BLOCKER",
  source: "V261 §2/§22 — honest diagnostic of the BTP↔v124-companion integration blocker",
  notAuthority: "a read-only blocker record; it mutates nothing and self-authorizes nothing",
  invariants: Object.freeze([
    "§22 STOP-AND-DIAGNOSE: the additive companion edit was reverted on hitting the existing consolidation guards; the companion is UNCHANGED (V234–V238 consolidation)",
    "the block is REAL (by-design guards: section ∈ A–R, sources ∈ V234–V238, lossless/no-orphan), not fabricated; a dishonest forced A–R/source mapping was explicitly NOT done",
    "resolution is OWNER_GATED (extend validators OR a separate owner-approved registry — §11 forbids a 2nd strategic roadmap); nothing self-authorized",
    "the BTP programme remains tracked via its merged artefacts (master roadmap / capability-matrix / devis-engine); only the companion mission-registry entry is blocked; pure/deterministic/read-only; no new primitive",
  ]),
});

module.exports = { BLOCKER, diagnose, BTP_INTEGRATION_BLOCKER_CONTRACT };

export {};
