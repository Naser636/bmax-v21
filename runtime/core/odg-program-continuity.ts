#!/usr/bin/env node
"use strict";

/*
 * V237 Phase-2 (P0-3) — PROGRAM CONTINUITY DOSSIER. PURE, deterministic (asOf + commit injected). The resumable record
 * that lets any authorized worker answer, WITHOUT full rediscovery, "what is done / blocked / eligible, which evidence is
 * still valid, what must be re-observed, and how to resume" for a consolidated program (V234 + V235 + V236 missions, kept
 * DISTINCT — a dossier, not a merge). It is NOT a second queue/scheduler/engine: it READS a program's missions as the
 * canonical campaign-controller register and COMPOSES the existing deciders.
 *
 * Its genuine, non-duplicative value is fusing the THREE independent staleness sources that no module combined:
 *   (1) DEPENDENCY regression  — campaign-controller.staleAcceptances (an ACCEPTED item whose dep is no longer ACCEPTED);
 *   (2) OBSERVATION currency    — odg-observation-currency (V235): an ACCEPTED mission whose supporting observation is now
 *       HISTORICAL (commit/scope/time boundary crossed) ⇒ its evidence is no longer a CURRENT fact;
 *   (3) COMPONENT content-change — odg-cartography-reconcile (V236): an ACCEPTED mission whose underlying component file
 *       content changed since acceptance ⇒ must be re-validated.
 * The union ⇒ requiresRevalidation. FAIL-CLOSED & IDEMPOTENT: an ACCEPTED mission is "safely done" only if deps intact AND
 * evidence CURRENT AND component unchanged; otherwise it is FLAGGED (never silently trusted) — but never auto-re-executed
 * and never auto-demoted (that is a validation/owner decision). Eligible selection reuses campaign-controller.selectNextLot,
 * so a BLOCKED mission never freezes independent work. No evidence ⇒ not done. Dual export.
 */

const CC = require("./campaign-controller.js");            // selectNextLot / staleAcceptances / summary — the canonical register (no 2nd queue)
const OCUR = require("./odg-observation-currency.js");     // V235 — observation currency
const CRC = require("./odg-cartography-reconcile.js");     // V236 — component reconciliation

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function pathsOf(mission: any): string[] { // the component paths a mission's evidence stands on
  if (isObj(mission.observation) && Array.isArray(mission.observation.scope)) return mission.observation.scope.filter(isStr);
  return arr(mission.componentPaths).filter(isStr);
}
function intersects(paths: string[], changed: Set<string>): boolean {
  return paths.some((p) => changed.has(p) || [...changed].some((c) => c === p || c.startsWith(p + "/") || p.startsWith(c + "/")));
}

/*
 * buildDossier(program, context) -> the resumable continuity dossier.
 * program: { objective, boussoleRef, missions:[{id,source,status,deps,evidence,observation?,componentPaths?}], prevSnapshot?, currSnapshot? }
 * context: { asOfEpochMs, currentCommit }. Deterministic.
 */
function buildDossier(program: any, context: any): any {
  const p = isObj(program) ? program : {};
  const ctx = isObj(context) ? context : {};
  const asOf = Number.isFinite(ctx.asOfEpochMs) ? ctx.asOfEpochMs : 0;
  const missions = arr(p.missions).filter((m) => isObj(m) && isStr(m.id));
  const register = { version: "program-continuity", items: missions };

  // (reuse) eligible-mission selection + dependency-staleness + summary from the canonical controller.
  const sel = CC.selectNextLot(register);
  const depStale = new Set<string>(arr(CC.staleAcceptances(register)).map((x: any) => (isObj(x) ? x.id : x)).filter(isStr));
  const sm = CC.summary(register);

  // (V236) which component paths changed between the two cartography snapshots.
  let changedPaths: string[] = [];
  const haveSnapshots = isObj(p.prevSnapshot) && isObj(p.currSnapshot);
  if (haveSnapshots) changedPaths = arr(CRC.reconcile(p.prevSnapshot, p.currSnapshot, { asOfEpochMs: asOf }).contentChangedPaths);
  const changedSet = new Set<string>(changedPaths);

  // per ACCEPTED mission: fuse the three staleness sources.
  const doneValid: any[] = [], mustRevalidate: any[] = [];
  for (const m of missions) {
    if (m.status !== "ACCEPTED") continue;
    const reasons: string[] = [];
    if (!isStr(m.evidence)) reasons.push("NO_EVIDENCE");                                    // ACCEPTED must carry evidence
    if (depStale.has(m.id)) reasons.push("DEPENDENCY_REGRESSED");                           // (1) campaign-controller
    const paths = pathsOf(m);
    if (haveSnapshots && paths.length > 0 && intersects(paths, changedSet)) reasons.push("COMPONENT_CHANGED"); // (3) V236
    if (isObj(m.observation)) {                                                             // (2) V235
      const a = OCUR.assess(m.observation, { asOfEpochMs: asOf, currentCommit: ctx.currentCommit, changedPathsKnown: haveSnapshots, changedPaths });
      if (a.mayAssertCurrent !== true) reasons.push("EVIDENCE_HISTORICAL(" + a.currency + ")");
    }
    const row = Object.freeze({ id: m.id, source: isStr(m.source) ? m.source : null, reasons: Object.freeze(reasons) });
    (reasons.length === 0 ? doneValid : mustRevalidate).push(row);
  }

  const blocked = missions.filter((m) => m.status === "BLOCKED").map((m) => Object.freeze({ id: m.id, source: isStr(m.source) ? m.source : null, blockReason: isStr(m.blockReason) ? m.blockReason : "blocked" }));
  const sources = Object.freeze({ V234: missions.filter((m) => m.source === "V234").length, V235: missions.filter((m) => m.source === "V235").length, V236: missions.filter((m) => m.source === "V236").length, other: missions.filter((m) => !["V234", "V235", "V236"].includes(m.source)).length });

  return Object.freeze({
    objective: isStr(p.objective) ? p.objective : null,
    boussoleRef: isStr(p.boussoleRef) ? p.boussoleRef : "V12.4",
    missionsTotal: missions.length,
    consolidatedSources: sources,                                                           // Phase-1: lossless, kept distinct
    done: Object.freeze(doneValid),                                                         // ACCEPTED & evidence still valid
    mustRevalidate: Object.freeze(mustRevalidate),                                          // ACCEPTED but flagged (NOT re-executed)
    blocked: Object.freeze(blocked),
    nextEligible: sel && sel.lot ? sel.lot.id : null,                                       // independent work proceeds while blocked
    eligibleReason: sel ? sel.reason || "eligible" : null,
    summary: Object.freeze({ accepted: (sm && sm.counts && sm.counts.ACCEPTED) || 0, open: sm && sm.counts ? (sm.counts.READY || 0) + (sm.counts.IN_PROGRESS || 0) : 0, blocked: blocked.length, revalidate: mustRevalidate.length }),
    resumeNote: "IDEMPOTENT resume: 'done' missions are NOT re-executed; 'mustRevalidate' is a FLAG (dependency-regressed / component-changed / evidence-historical), never an auto-redo or auto-demote; a BLOCKED mission never freezes 'nextEligible'",
  });
}

/* demonstrate() -> drives the REAL campaign-controller + V235 + V236 on the consolidated V234/V235/V236 program. */
function demonstrate(): any {
  const T0 = Date.UTC(2026, 10, 16);
  const d = (s: string) => CRC.fingerprint(s);
  const P = (s: string) => "runtime/core/" + s;
  const missions = [
    { id: "M-V234", source: "V234", status: "ACCEPTED", deps: [], evidence: "continuation-diagnostic merged #602",
      observation: { claim: "continuation forensic", kind: "OBSERVATION", observedAtEpochMs: T0, observedCommit: "d1c042f", scope: [P("odg-continuation-diagnostic.ts")], method: "exercise campaign-loop" } },
    { id: "M-V235", source: "V235", status: "ACCEPTED", deps: [], evidence: "observation-currency merged #603",
      observation: { claim: "memory currency decider", kind: "OBSERVATION", observedAtEpochMs: T0, observedCommit: "bd13eef", scope: [P("odg-observation-currency.ts")], method: "259k brute-force" } },
    { id: "M-V236", source: "V236", status: "ACCEPTED", deps: ["M-V235"], evidence: "cartography-reconcile merged #604",
      observation: { claim: "cartography reconcile", kind: "OBSERVATION", observedAtEpochMs: T0, observedCommit: "389e32e", scope: [P("odg-cartography-reconcile.ts")], method: "per-component reconcile" } },
    { id: "M-DRIVER", source: "V234", status: "BLOCKED", deps: [], blockReason: "resident cross-session driver — OWNER_GATED (Phase 6)" },
    { id: "M-NEXT", source: "V237", status: "READY", deps: [] },  // independent eligible work
  ];
  // V236 snapshots: V234's component content CHANGED since acceptance; V235/V236 components UNCHANGED.
  const prevSnapshot = { commit: "389e32e", entries: [
    { id: "cont", path: P("odg-continuation-diagnostic.ts"), digest: d("cont-v1") },
    { id: "ocur", path: P("odg-observation-currency.ts"), digest: d("ocur-v1") },
    { id: "carto", path: P("odg-cartography-reconcile.ts"), digest: d("carto-v1") }] };
  const currSnapshot = { commit: "newhead", entries: [
    { id: "cont", path: P("odg-continuation-diagnostic.ts"), digest: d("cont-v2") },   // MODIFIED
    { id: "ocur", path: P("odg-observation-currency.ts"), digest: d("ocur-v1") },      // UNCHANGED
    { id: "carto", path: P("odg-cartography-reconcile.ts"), digest: d("carto-v1") }] }; // UNCHANGED

  const dossier = buildDossier({ objective: "Consolidate V234–V236 into one resumable program (V237)", boussoleRef: "V12.4", missions, prevSnapshot, currSnapshot }, { asOfEpochMs: T0 + 2 * 86400000, currentCommit: "newhead" });
  return Object.freeze({ dossier,
    consolidationLossless: dossier.consolidatedSources.V234 >= 1 && dossier.consolidatedSources.V235 === 1 && dossier.consolidatedSources.V236 === 1 && dossier.missionsTotal === 5,
    v234FlaggedComponentChanged: dossier.mustRevalidate.some((m: any) => m.id === "M-V234" && m.reasons.includes("COMPONENT_CHANGED") && m.reasons.some((r: string) => /EVIDENCE_HISTORICAL/.test(r))),
    v235v236StillValid: dossier.done.some((m: any) => m.id === "M-V235") && dossier.done.some((m: any) => m.id === "M-V236"),
    blockedDoesNotFreeze: dossier.nextEligible === "M-NEXT" && dossier.blocked.some((b: any) => b.id === "M-DRIVER"),
    idempotentResume: !dossier.done.some((m: any) => m.id === "M-DRIVER") && !dossier.mustRevalidate.some((m: any) => m.id === "M-NEXT") });
}

const PROGRAM_CONTINUITY_CONTRACT = Object.freeze({
  id: "V237-PROGRAM-CONTINUITY",
  purpose: "Phase-2 P0-3 — resumable program dossier fusing the 3 staleness sources (dependency / observation-currency / component-change); no 2nd queue/engine",
  invariants: Object.freeze([
    "an ACCEPTED mission is 'done' ONLY if deps intact AND evidence CURRENT (V235) AND component unchanged (V236) AND evidence present — else FLAGGED requiresRevalidation",
    "FAIL-CLOSED + IDEMPOTENT: mustRevalidate is a flag, never an auto-redo or auto-demote; 'done' missions are not re-executed",
    "REUSES campaign-controller.selectNextLot/staleAcceptances (no 2nd scheduler); COMPOSES V235 + V236; a BLOCKED mission never freezes nextEligible",
    "consolidation is lossless and DISTINCT (source V234/V235/V236 preserved); deterministic (asOf + commit injected); reads, writes nothing, grants no authority",
  ]),
});

module.exports = { buildDossier, demonstrate, PROGRAM_CONTINUITY_CONTRACT };
export {};
