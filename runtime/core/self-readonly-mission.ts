#!/usr/bin/env node
"use strict";
/*
 * V136 — SELF-ORIGINATED READ-ONLY MISSION FORMULATION. PURE, deterministic, fail-closed. Closes the exact autonomy gap
 * surfaced by the V136 canary run: the pure-read-only canary queue was EXHAUSTED (every read-only mission already proven)
 * and ODG had no way to ORIGINATE its own eligible read-only backlog. The self-mission-proposer turns discovered gaps into
 * PROPOSED *engineering* missions (add-a-test) — which the read-only canary correctly REFUSES. This module adds the missing
 * READ-ONLY path: from a REAL discovered discrepancy (codebase-diagnostic → global-improvement-engine.analyzeGaps target),
 * it formulates a bounded read-only DIAGNOSTIC mission that INVESTIGATES/REPORTS the discrepancy (never fixes it) — so the
 * canary can run it. It is canary-safe BY CONSTRUCTION (mode AUDIT, authorized_paths:[], no network/spend/destructive).
 *
 * GOVERNANCE BOUNDARIES (all preserved):
 *  - selfAuthored:false, status PROPOSED — ODG originates + proposes; it does NOT authorize or self-admit to the allowlist.
 *  - It returns a mission SPEC only; admission to ODG_CANARY_ALLOWLIST remains an operator/Truth-Lock-gated step (deny-by-
 *    default is NOT bypassed — this module cannot execute or enqueue anything).
 *  - No fabrication: a spec is produced ONLY from a real COVERAGE target with concrete items; an owner-gated/empty/injected
 *    target ⇒ null (fail-closed). Reuses frontier-radar.sanitizeExternal so an injected gap detail is QUARANTINED, never
 *    turned into a mission objective.
 *  - Deterministic id (stable for dedup): SELF_AUDIT_<KIND>_<stable-token> so re-discovering the same gap dedups to ONE.
 * Dual export. No new primitive, no second mission system (it emits the canonical runtime/missions spec shape).
 */
const RADAR = require("./frontier-radar.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
// A stable, filesystem-safe token derived from the gap kind + count of items (NOT the free-text detail, which is untrusted
// and variable) — so the same structural gap always yields the same mission id (dedup), with no injected text in the id.
function stableToken(kind: string, itemCount: number): string { return String(kind).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") + "_" + itemCount; }

// The read-only mission kinds this formulator can originate. ONLY COVERAGE today (a concrete, evidence-backed, read-only-
// investigable discrepancy: library modules lacking a same-named test). Everything else ⇒ not self-originated (fail-closed).
const READONLY_ORIGINABLE = Object.freeze({ COVERAGE: true });

/** formulateReadOnlyMission(gapTarget, opts?) -> a frozen canary-safe read-only mission SPEC, or null (fail-closed).
 * gapTarget is one entry of global-improvement-engine.analyzeGaps().targets. opts.now (ISO) stamps provenance. */
function formulateReadOnlyMission(gapTarget: any, opts?: any): any {
  const t = isObj(gapTarget) ? gapTarget : null;
  const o = isObj(opts) ? opts : {};
  if (!t || typeof t.kind !== "string" || (READONLY_ORIGINABLE as any)[t.kind] !== true) return null;  // only read-only-originable kinds
  const items = arr(t.items).filter((x) => typeof x === "string" && x.trim().length > 0);
  if (items.length === 0) return null;                                                                 // no concrete evidence ⇒ no mission (fail-closed)
  const detail = typeof t.detail === "string" ? t.detail : "";
  // UNTRUSTED gap detail: an injected instruction ⇒ refuse to formulate (never embed it as an objective).
  const meta = RADAR.sanitizeExternal({ title: detail, body: items.join(", ") });
  if (meta && meta.untrusted === true) return null;
  const id = "SELF_AUDIT_" + stableToken(t.kind, items.length);
  const spec = {
    mission: id,
    mode: "AUDIT",                                   // canary read-only set ⇒ canary-safe
    priority: "P2",
    status: "PROPOSED",                              // PROPOSED ≠ AUTHORIZED ≠ EXECUTING
    selfAuthored: false,                             // ODG originates + proposes; it does NOT self-authorize
    requires_engineering: false,
    authorized_paths: [],                            // 0 paths ⇒ pure read-only (canary-decision-pack admits)
    network: false, requires_network: false, spend: false, destructive: false,
    description: "Read-only self-audit of a discovered internal discrepancy (" + stableToken(t.kind, items.length) + "): produce an evidence-based report of the affected items. No code modification, no patch, no provider — report only.",
    objectives: [
      { id: "ENUMERATE_AFFECTED", goal: "Enumerate the affected items from real evidence.", done_when: ["every affected item listed with its path"] },
      { id: "EVIDENCE_REPORT", goal: "Produce an evidence-only report (no guessing, no fix).", done_when: ["a report artifact names each item and the discrepancy"] },
    ],
    definition_of_done: ["Evidence-based report produced.", "No source code modified (read-only mission)."],
    provenance: {
      origin: "SELF_ORIGINATED",
      discoveredBy: "codebase-diagnostic.scanCore → global-improvement-engine.analyzeGaps",
      gapKind: t.kind, gapDetail: detail.slice(0, 160), affectedCount: items.length,
      affectedSample: Object.freeze(items.slice(0, 8)),
      formulatedAt: typeof o.now === "string" ? o.now : null,
      selfAuthorized: false,
      admissionNote: "formulated + PROPOSED by ODG from real evidence; admission to ODG_CANARY_ALLOWLIST remains operator/Truth-Lock-gated (deny-by-default NOT bypassed).",
    },
  };
  return Object.freeze(spec);
}

const SELF_READONLY_MISSION_CONTRACT = Object.freeze({
  id: "V136-SELF-READONLY-MISSION",
  purpose: "ODG self-originates a bounded, canary-safe READ-ONLY diagnostic mission from a real discovered discrepancy — closing the exhausted-read-only-queue autonomy gap WITHOUT bypassing the allowlist or self-authorizing.",
  reuses: ["global-improvement-engine.analyzeGaps (real gap evidence)", "codebase-diagnostic.scanCore (coverage evidence)", "frontier-radar.sanitizeExternal (injection quarantine)", "runtime/missions canonical spec shape"],
  invariants: Object.freeze([
    "canary-safe by construction: mode AUDIT + authorized_paths:[] + no network/spend/destructive",
    "selfAuthored:false + status PROPOSED — originates, never authorizes; cannot enqueue/execute (returns a spec only)",
    "fail-closed: only a COVERAGE target with concrete items ⇒ a spec; owner-gated/empty/injected ⇒ null",
    "deterministic id (dedup-stable) from kind+count; no untrusted free-text in the id",
    "admission to the canary allowlist stays operator/Truth-Lock-gated — deny-by-default preserved",
  ]),
});

module.exports = { formulateReadOnlyMission, READONLY_ORIGINABLE, SELF_READONLY_MISSION_CONTRACT };
export {};
