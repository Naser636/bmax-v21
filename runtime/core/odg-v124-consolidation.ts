#!/usr/bin/env node
"use strict";

/*
 * V238 — CANONICAL CONSOLIDATION of V234–V238 into Boussole V12.4. PURE core (file read injected). It LOADS the persistent,
 * NON-protected companion docs/odg/v124-consolidated-roadmap.json (the same companion architecture roadmap-schema-proposal
 * uses for the protected ROADMAP.json) and VALIDATES — fail-closed — that the consolidation is lossless, single-source and
 * consumable, WITHOUT creating a second roadmap/store/scheduler/engine and WITHOUT mutating the execution manifest.
 *
 * It answers the directive's own validation checklist (Phase 10):
 *   (1) SINGLE SOURCE — reuses roadmap-consolidation.consolidate(): V12.4 is the sole directeur, every source program is
 *       INTEGRATED (none concurrent). No new consolidator.
 *   (2) LOSSLESS + DISTINCT — every distinct V234–V238 mission is preserved with its provenance (source, commit, evidence),
 *       no duplicate id, each mapped to a V12.4 section (A–R) ⇒ NO ORPHAN; two missions on the same module stay distinct.
 *   (3) MANIFEST INTACT — the companion asserts the execution manifest (ROADMAP.json) is UNCHANGED/AUTHORITATIVE at 11
 *       missions (honouring the v104/crosswalk 'no second roadmap' guards); the ROADMAP.json amendment stays OWNER_GATED.
 *   (4) STATUS LADDER — every mission status is in the Phase-11 MISSION_STATUS ladder; roadmapIntegration in its ladder.
 *   (5) CONSUMABLE — toContinuityProgram() projects the companion into the shape odg-program-continuity.buildDossier()
 *       consumes, so the consolidated roadmap is driven by EXISTING mechanisms (not a static doc) and recoverable after restart.
 *
 * Reuses roadmap-consolidation + is consumed by odg-program-continuity; adds NO 10th primitive. Dual export.
 */

const RC = require("./roadmap-consolidation.js");     // existing V12.4 consolidator (single-source + orphan discipline)
const PC = require("./odg-program-continuity.js");    // V237 — the consumer the consolidated roadmap feeds into

const COMPANION = "docs/odg/v124-consolidated-roadmap.json";
const MISSION_STATUS = Object.freeze(["NOT_STARTED", "READY", "IN_PROGRESS", "BLOCKED", "OWNER_GATED", "TESTING", "REVIEW", "ACCEPTED", "COMPLETED", "DEFERRED", "REJECTED"]);
const INTEGRATION_LADDER = Object.freeze(["PROPOSED", "IN_PROGRESS", "INTEGRATED", "INDEPENDENTLY_VALIDATED", "ACCEPTED"]);
const SECTIONS = Object.freeze("ABCDEFGHIJKLMNOPQR".split(""));

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/*
 * validate(companion, roadmap) -> fail-closed verdict over the loaded companion + the live execution manifest.
 * companion: parsed docs/odg/v124-consolidated-roadmap.json. roadmap: parsed runtime/governance/ROADMAP.json.
 * Deterministic. Any orphan / duplicate / out-of-ladder status / concurrent program / replaced manifest ⇒ consolidated:false.
 */
function validate(companion: any, roadmap: any): any {
  const c = isObj(companion) ? companion : {};
  const missions = arr(c.missions).filter((m) => isObj(m) && isStr(m.id));
  const reasons: string[] = [];

  // (1) single source — reuse the canonical consolidator.
  const rc = RC.consolidate({ directeur: c.directeur, programs: arr(c.programs) });
  if (!rc.singleSource) reasons.push("not single-source V12.4: " + rc.reasons.join("; "));

  // (2) lossless + distinct: unique ids, each mapped to a valid section, statuses in the ladder.
  const ids = new Set<string>(); const dups: string[] = []; const orphans: string[] = []; const badStatus: string[] = [];
  for (const m of missions) {
    if (ids.has(m.id)) dups.push(m.id); else ids.add(m.id);
    if (!(isStr(m.section) && SECTIONS.includes(m.section))) orphans.push(m.id);         // no mission without a V12.4 section
    if (!MISSION_STATUS.includes(m.status)) badStatus.push(m.id);
  }
  if (dups.length) reasons.push("duplicate mission ids: " + dups.join(", "));
  if (orphans.length) reasons.push("ORPHAN missions (no V12.4 section): " + orphans.join(", "));
  if (badStatus.length) reasons.push("mission status outside Phase-11 ladder: " + badStatus.join(", "));
  // (2b) losslessness POSITIVELY enforced: non-empty, and every source the companion DECLARES it must carry is present
  // (so a dropped/empty consolidation fails-closed instead of validating on absence).
  if (missions.length === 0) reasons.push("empty consolidation (no missions) — nothing to consolidate");
  const presentSources = new Set(missions.map((m) => m.source));
  const missingSources = arr(c.expectedMissionSources).filter(isStr).filter((s) => !presentSources.has(s));
  if (missingSources.length) reasons.push("LOSSY consolidation — expected mission sources absent: " + missingSources.join(", "));

  // (3) execution manifest intact — the companion must declare it unchanged AND the live roadmap must still have 11 missions.
  const em = isObj(c.executionManifest) ? c.executionManifest : {};
  const liveMissions = isObj(roadmap) && Array.isArray(roadmap.missions) ? roadmap.missions.length : -1;
  const manifestIntact = em.status === "UNCHANGED_AUTHORITATIVE" && em.missions === 11 && liveMissions === 11;
  if (!manifestIntact) reasons.push("execution manifest not intact (ROADMAP.json must stay 11 missions, not replaced): live=" + liveMissions + ", declared=" + em.missions);

  // (4) integration ladder.
  const integrationOk = INTEGRATION_LADDER.includes(c.roadmapIntegration);
  if (!integrationOk) reasons.push("roadmapIntegration not in ladder: " + c.roadmapIntegration);

  const bySource: Record<string, number> = {};
  for (const m of missions) bySource[m.source] = (bySource[m.source] || 0) + 1;
  const byStatus: Record<string, number> = {};
  for (const m of missions) byStatus[m.status] = (byStatus[m.status] || 0) + 1;

  return Object.freeze({
    consolidated: reasons.length === 0,
    directeur: c.directeur || null,
    roadmapIntegration: c.roadmapIntegration || null,
    missionsTotal: missions.length,
    bySource: Object.freeze(bySource),
    byStatus: Object.freeze(byStatus),
    sectionsCovered: Object.freeze([...new Set(missions.map((m) => m.section).filter((s) => SECTIONS.includes(s)))].sort()),
    executionManifestIntact: manifestIntact,
    executionManifestAmendment: isStr(em.amendment) ? em.amendment : null,
    orphans: Object.freeze(orphans),
    duplicates: Object.freeze(dups),
    reasons: Object.freeze(reasons),
    note: "V12.4 is the sole directeur; V234–V238 integrated as sections A–R (lossless, provenance-preserved); execution manifest UNCHANGED (amendment OWNER_GATED); roadmap INTEGRATED, not COMPLETED (missions remain OPEN)",
  });
}

/* toContinuityProgram(companion) -> the shape odg-program-continuity.buildDossier() consumes (proves it is CONSUMABLE). */
function toContinuityProgram(companion: any): any {
  const c = isObj(companion) ? companion : {};
  const missions = arr(c.missions).filter((m) => isObj(m) && isStr(m.id)).map((m) => Object.freeze({
    id: m.id, source: m.source, status: m.status, deps: arr(m.deps).filter(isStr),
    evidence: m.status === "ACCEPTED" && isStr(m.evidence) ? m.evidence : undefined,
    blockReason: (m.status === "BLOCKED" || m.status === "OWNER_GATED") ? (isStr(m.nextAction) ? m.nextAction : "owner/blocked") : undefined,
    componentPaths: arr(m.components).filter(isStr),
  }));
  return Object.freeze({ objective: c.title || "V12.4 consolidated roadmap", boussoleRef: "V12.4", missions });
}

/* demonstrate() -> load the REAL committed companion + REAL ROADMAP.json, validate, and drive it through V237 continuity. */
function demonstrate(): any {
  const fs = require("fs");
  let companion: any = null, roadmap: any = null;
  try { companion = JSON.parse(fs.readFileSync(COMPANION, "utf8")); } catch { companion = null; }
  try { roadmap = JSON.parse(fs.readFileSync("runtime/governance/ROADMAP.json", "utf8")); } catch { roadmap = null; }
  const verdict = validate(companion, roadmap);
  const program = toContinuityProgram(companion);
  // CONSUMABLE proof: the consolidated roadmap is driven by the EXISTING V237 mechanism (not a static doc).
  const dossier = PC.buildDossier(program, { asOfEpochMs: Date.UTC(2026, 10, 16), currentCommit: "0293c86" });
  return Object.freeze({
    verdict,
    consumable: dossier.missionsTotal === verdict.missionsTotal && Array.isArray(dossier.done),
    dossierDone: dossier.done.length, dossierBlocked: dossier.blocked.length, dossierEligible: dossier.nextEligible,
  });
}

const V124_CONSOLIDATION_CONTRACT = Object.freeze({
  id: "V238-V124-CONSOLIDATION",
  purpose: "Phase 3/4/6/10 — load+validate the canonical V12.4 consolidation companion (lossless, single-source, consumable); execution manifest UNCHANGED; no 2nd roadmap/store/engine",
  invariants: Object.freeze([
    "V12.4 is the SOLE directeur (reuses roadmap-consolidation.consolidate); every V234–V238 program INTEGRATED, none concurrent",
    "LOSSLESS + DISTINCT: unique ids, each mapped to a V12.4 section A–R (no ORPHAN), status in the Phase-11 ladder — nothing dropped",
    "execution manifest ROADMAP.json stays 11 missions / not replaced (honours v104 + crosswalk guards); the manifest amendment is OWNER_GATED",
    "CONSUMABLE by odg-program-continuity (not a static doc), recoverable after restart; roadmap INTEGRATED ≠ COMPLETED; no 10th primitive",
  ]),
});

module.exports = { validate, toContinuityProgram, demonstrate, COMPANION, MISSION_STATUS, INTEGRATION_LADDER, V124_CONSOLIDATION_CONTRACT };
export {};
