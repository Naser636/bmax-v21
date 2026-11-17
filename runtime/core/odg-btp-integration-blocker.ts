#!/usr/bin/env node
"use strict";

/*
 * V261 §2/§22 — BTP↔V12.4 canonical-integration BLOCKER DIAGNOSTIC (read-only), now a RESOLUTION record. In V261 an attempt
 * to integrate the BTP programme ADDITIVELY into docs/odg/v124-consolidated-roadmap.json was made and REVERTED: it failed the
 * EXISTING, by-design consolidation guards in odg-v124-consolidation.validate(). Per master roadmap §22 this was recorded as a
 * REAL blocker rather than forced with a dishonest mapping. It has since been RESOLVED by EXPLICIT owner authorization
 * (CTO directives V272 §4 / V273 §1) via an ADDITIVE validated section-S amendment (SECTIONS A–R → A–S) — see `resolution`.
 *
 * The companion is NOT a generic roadmap: odg-v124-consolidation fail-closes it to be the LOSSLESS, single-source V234–V238
 * consolidation plus the owner-authorized section-S strategic extension — every mission must map to a V12.4 section A–S (else
 * ORPHAN) and every expectedMissionSource must be present in a mission (else LOSSY). The resolution preserved every invariant
 * (ROADMAP 11 / closure 427 byte-identical, 9 primitives, single directeur, no validator weakened). Pure/deterministic/read-only.
 */

const BLOCKER = Object.freeze({
  mission: "CM-BTP-CANONICAL-INTEGRATION",
  target: "docs/odg/v124-consolidated-roadmap.json (non-protected companion)",
  attempted: "append a BTP program + 6 CM-BTP-* missions + V258–V261 to expectedMissionSources",
  status: "RESOLVED_BY_OWNER_AUTHORIZATION",                 // V261 recorded a REAL blocker; resolved by V272 §4 / V273 §1
  companionMutated: true,                                    // now integrated under explicit owner authorization (was reverted in V261)
  companionIntegrated: true,
  resolution: Object.freeze({
    authorizedBy: "CTO directives V272 §4 / V273 §1 (explicit owner authorization of the protected-path write)",
    amendment: "ADDITIVE validated section S (odg-v124-consolidation SECTIONS A–R → A–S); +10 ACCEPTED missions (V260–V271) with on-disk components + PR evidence #641–#651; expectedMissionSources extended",
    invariantsPreserved: "ROADMAP.json (11) + closure-register.json (427) BYTE-IDENTICAL; 9 primitives; single directeur V12.4; lossless (original 14 untouched); NO validator weakened or deleted; section 'Z' outside A–S still ORPHAN",
    evidence: "PR #654 — validator consolidated=true, odg-v124-consolidation + odg-program-continuity suites pass, independent inspection PASS",
  }),
  guards: Object.freeze([                                    // HISTORICAL — why it WAS blocked in V261 (the guards were by-design, not a bug)
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
  note: "V261 recorded a REAL, by-design blocker (§22 stop-and-diagnose) rather than forcing a dishonest A–R/source mapping. It is now RESOLVED by explicit owner authorization (V272 §4 / V273 §1) via an ADDITIVE validated section-S amendment — the hard registers (ROADMAP 11 / closure 427) stay byte-identical, no validator was weakened, and the fail-closed guards still reject anything outside A–S. The BTP programme (V260–V271) is now canonically integrated into the V12.4 companion as section S.",
});

function diagnose(): any { return BLOCKER; }

const BTP_INTEGRATION_BLOCKER_CONTRACT = Object.freeze({
  id: "V261-BTP-INTEGRATION-BLOCKER",
  source: "V261 §2/§22 — honest diagnostic of the BTP↔v124-companion integration blocker",
  notAuthority: "a read-only blocker record; it mutates nothing and self-authorizes nothing",
  invariants: Object.freeze([
    "§22 STOP-AND-DIAGNOSE (V261): the additive edit was reverted on hitting the by-design consolidation guards and recorded as a REAL blocker — NOT forced with a dishonest A–R/source mapping",
    "the block WAS real (section ∈ A–R, sources ∈ V234–V238, lossless/no-orphan), not fabricated; RESOLVED only after EXPLICIT owner authorization (V272 §4 / V273 §1), never self-authorized",
    "resolution is an ADDITIVE validated amendment (section S, A–R→A–S): no validator weakened/deleted; ROADMAP 11 + closure 427 byte-identical; original 14 missions untouched; section outside A–S still ORPHAN",
    "the BTP programme (V260–V271) is now canonically integrated into the V12.4 companion as section S; pure/deterministic/read-only; no new primitive; no 2nd strategic roadmap",
  ]),
});

module.exports = { BLOCKER, diagnose, BTP_INTEGRATION_BLOCKER_CONTRACT };

export {};
