#!/usr/bin/env node
"use strict";

/*
 * PHASE 0 — CANONICAL INTEGRATION of the ODG MASTER TECHNOLOGICAL SUPERIORITY program (V5.0, extension of V12.4).
 * PURE, deterministic. This is the PILOTABLE side of the integration: it loads the program manifest
 * (docs/odg/master-technological-superiority-program.json) and verifies — fail-closed — that the program is a
 * legitimate, non-duplicating, honestly-staged decomposition that ODG can drive:
 *   (1) PRESERVATION — the manifest preserves the 9 primitives, 15 métiers, 4 campaigns, dossiers A-F, control
 *       points, and DEC-V60-166-RETIREMENT (nothing historical deleted).
 *   (2) HONEST STAGING — every phase/mission status is in the canonical ladder; NO build-mission claims COMPLETED/
 *       VALIDATED/ACCEPTED without evidence (anti-fabrication: proposed ≠ executed ≠ validated).
 *   (3) NON-DUPLICATION — every reuseMap pointer resolves to a REAL existing runtime/core module (injected set),
 *       so the program EXTENDS existing components rather than inventing competitors.
 *   (4) AUTHORITY — ODG is the sole authority; Claude Code is a delegated provider; promotion stays canonical.
 * It integrates but does NOT execute any capability and grants no authority. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const REQUIRED_PRESERVATION = Object.freeze(["ninePrimitives", "fifteenMetiers", "fourCampaigns", "dossiers", "controlPoints", "decisions", "elevenHistoricalMetiers"]);
const NINE_PRIMITIVES = Object.freeze(["IDENTITY", "STATE", "CONTRACT", "POLICY", "RESOLVER", "EXECUTOR", "EVIDENCE", "RECOVERY", "ALLOCATOR"]);
const CANONICAL_LADDER = Object.freeze(["PROPOSED", "AUTHORIZED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "VALIDATED", "REJECTED", "ACCEPTED", "DEFERRED"]);
const EXECUTED_STATES = Object.freeze(["COMPLETED", "VALIDATED", "ACCEPTED"]);   // may not appear without evidence

/** validateProgram(manifest, { existingModules }) -> { ok, verdict, checks, violations }. Fail-closed. */
function validateProgram(manifest: any, opts: any): any {
  const m = isObj(manifest) ? manifest : {};
  const existing = new Set(arr(opts && opts.existingModules).map(String));
  const violations: string[] = []; const checks: any = {};

  // (0) directeur + authority — V12.4 must remain the référentiel directeur; ODG the authority.
  checks.directeurIsV124 = m.directeur === "V12.4";
  if (!checks.directeurIsV124) violations.push("directeur must remain V12.4 (this program is an EXTENSION, not a replacement)");
  checks.odgAuthority = typeof m.authority === "string" && /ODG/.test(m.authority);
  if (!checks.odgAuthority) violations.push("ODG must be the declared exclusive authority");

  // (1) preservation of historical acquis.
  const pres = isObj(m.preservation) ? m.preservation : {};
  checks.preservationComplete = REQUIRED_PRESERVATION.every((k) => pres[k] !== undefined);
  if (!checks.preservationComplete) violations.push(`preservation block missing keys: ${REQUIRED_PRESERVATION.filter((k) => pres[k] === undefined).join(", ")}`);
  checks.ninePrimitives = Array.isArray(pres.ninePrimitives) && NINE_PRIMITIVES.every((p) => pres.ninePrimitives.includes(p));
  if (!checks.ninePrimitives) violations.push("the 9 canonical primitives must be preserved verbatim");
  checks.fifteenMetiers = Array.isArray(pres.fifteenMetiers) && pres.fifteenMetiers.length === 15;
  if (!checks.fifteenMetiers) violations.push("the 15 métiers (P1-P15) must be preserved");
  checks.dec166Preserved = arr(pres.decisions).some((d: any) => /DEC-V60-166-RETIREMENT/.test(String(d)));
  if (!checks.dec166Preserved) violations.push("DEC-V60-166-RETIREMENT must be preserved by reference (166 historical capabilities NOT deleted)");

  // (2) honest staging — statuses in the canonical ladder; no build-mission claims executed without evidence.
  const phases = arr(m.phases); const missions = arr(m.missions);
  const badPhaseStatus = phases.filter((p: any) => !CANONICAL_LADDER.includes(p && p.status));
  checks.phaseStatusesValid = badPhaseStatus.length === 0;
  if (!checks.phaseStatusesValid) violations.push(`phase(s) with non-canonical status: ${badPhaseStatus.map((p: any) => p && p.id).join(", ")}`);
  const badMissionStatus = missions.filter((x: any) => !CANONICAL_LADDER.includes(x && x.status));
  checks.missionStatusesValid = badMissionStatus.length === 0;
  if (!checks.missionStatusesValid) violations.push(`mission(s) with non-canonical status: ${badMissionStatus.map((x: any) => x && x.id).join(", ")}`);
  // anti-fabrication: a build-mission in an EXECUTED state must carry evidence.
  const fabricated = missions.filter((x: any) => isObj(x) && EXECUTED_STATES.includes(x.status) && !(typeof x.evidence === "string" && x.evidence.length > 0));
  checks.noFabricatedExecution = fabricated.length === 0;
  if (!checks.noFabricatedExecution) violations.push(`mission(s) claim an executed state without evidence (fabrication): ${fabricated.map((x: any) => x.id).join(", ")}`);

  // (3) non-duplication — every reuseMap pointer resolves to a real existing module (when an existingModules set is supplied).
  const reuse = arr(m.reuseMap);
  checks.reuseMapNonEmpty = reuse.length > 0;
  if (!checks.reuseMapNonEmpty) violations.push("reuseMap must enumerate existing components to EXTEND (non-duplication rule)");
  if (existing.size > 0) {
    const unresolved = reuse.filter((r: any) => isObj(r) && typeof r.existingModule === "string" && !existing.has(r.existingModule));
    checks.reusePointersResolve = unresolved.length === 0;
    if (!checks.reusePointersResolve) violations.push(`reuseMap pointer(s) do not resolve to a real module: ${unresolved.map((r: any) => r.existingModule).join(", ")}`);
  } else { checks.reusePointersResolve = "NOT_CHECKED (no existingModules supplied)"; }

  // (4) programs A-D + 8 transversal domains present.
  const progIds = arr(m.programs).map((p: any) => p && p.id).sort();
  checks.fourPrograms = JSON.stringify(progIds) === JSON.stringify(["A", "B", "C", "D"]);
  if (!checks.fourPrograms) violations.push("the four strategic programs A-D must be present");
  checks.eightDomains = arr(m.transversalDomains).length === 8;
  if (!checks.eightDomains) violations.push("the eight transversal domains must be present");

  const ok = violations.length === 0;
  return Object.freeze({ ok, verdict: ok ? "INTEGRATED" : "INTEGRATION_INVALID", checks: Object.freeze(checks), violations: Object.freeze(violations) });
}

/** summarize(manifest) -> counts by status/phase/program, so the program is visible/pilotable in the planner. */
function summarize(manifest: any): any {
  const m = isObj(manifest) ? manifest : {};
  const missions = arr(m.missions);
  const byStatus: any = {}; const byPhase: any = {}; const byProgram: any = {};
  for (const x of missions) { if (!isObj(x)) continue; byStatus[x.status] = (byStatus[x.status] || 0) + 1; byPhase[x.phase] = (byPhase[x.phase] || 0) + 1; byProgram[x.program] = (byProgram[x.program] || 0) + 1; }
  return Object.freeze({ programs: arr(m.programs).length, domains: arr(m.transversalDomains).length, phases: arr(m.phases).length, chantiers: arr(m.chantiers).length, missions: missions.length, reuseComponents: arr(m.reuseMap).length, byStatus: Object.freeze(byStatus), byPhase: Object.freeze(byPhase), byProgram: Object.freeze(byProgram) });
}

const MASTER_PROGRAM_INTEGRATION_CONTRACT = Object.freeze({
  id: "V5-MASTER-PROGRAM-INTEGRATION",
  source: "ODG MASTER TECHNOLOGICAL SUPERIORITY program V5.0 — Phase 0 canonical integration (extension of V12.4)",
  reuses: Object.freeze(["validates docs/odg/master-technological-superiority-program.json against the canonical register + existing runtime/core modules"]),
  notAuthority: "integrates and verifies the program decomposition; it executes NO capability, promotes nothing, and grants no authority",
  invariants: Object.freeze([
    "V12.4 remains the référentiel directeur; this program is an EXTENSION (fail if directeur != V12.4)",
    "preservation: the 9 primitives, 15 métiers, 4 campaigns, dossiers A-F, control points and DEC-V60-166-RETIREMENT are preserved (fail-closed)",
    "honest staging: every phase/mission status is in the canonical ladder; a build-mission in an executed state WITHOUT evidence is a fabrication (rejected)",
    "non-duplication: every reuseMap pointer must resolve to a REAL existing module (when the module set is supplied)",
    "pure/deterministic: manifest + injected module set in → verdict out; no clock/random/network; integrates, never executes",
  ]),
});

module.exports = { validateProgram, summarize, NINE_PRIMITIVES, CANONICAL_LADDER, MASTER_PROGRAM_INTEGRATION_CONTRACT };

if (require.main === module) {
  const manifest = require("../../docs/odg/master-technological-superiority-program.json");
  const r = validateProgram(manifest, {});
  process.stdout.write(JSON.stringify({ ...MASTER_PROGRAM_INTEGRATION_CONTRACT, verdict: r.verdict, summary: summarize(manifest) }, null, 2) + "\n");
}

export {};
