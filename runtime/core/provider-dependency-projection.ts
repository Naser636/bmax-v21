#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 (ODG-native autonomy / PRIORITÉ 4 — world-research gap) — PROVIDER-DEPENDENCY PROJECTION. PURE,
 * deterministic. World reference: graceful degradation for AI agents (buildmvpfast 2026 — "fallback-trigger rate =
 * % of requests routed to a fallback model"; AI Infrastructure Sovereignty, arXiv 2602.10900 2026 — "operational
 * sovereignty under degraded conditions"). ODG has RETROSPECTIVE autonomy accounting (autonomy-measure / autonomy-
 * program-aggregate), a per-MISSION provider predicate (provider-port.missionRequiresProvider), and a provider-
 * availability verdict — but NOTHING composes them into a FORWARD, queue-level projection answering the literal
 * question: given a QUEUE of candidate missions plus the provider-up/down verdict, what GUARANTEED fraction can ODG
 * still progress NATIVELY if every provider is down right now? (grep-verified: no nativeContinuityFloor / provider-
 * dependency-share / queue-level projection; missionRequiresProvider is only ever called on ONE mission.) This makes
 * ODG's own provider-dependency exposure measurable at the portfolio level — the precondition for reducing it.
 *
 * DIST-CLEANLINESS: the canonical per-mission predicate lives in src/providers/provider-port.ts (missionRequiresProvider);
 * a runtime/core module must stay self-contained in its dist closure, so the SAME rule is mirrored inline here (READ-
 * ONLY ⇒ native; engineering/authorizedPaths ⇒ provider-dependent). The caller may also INJECT a `needsProvider`
 * predicate to use the canonical one verbatim. Honesty mirrors autonomy-measure: bad input ⇒ measurable:false. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function round(n: number): number { return Number(n.toFixed(4)); }

// mirrors src/providers/provider-port.missionRequiresProvider (kept in sync; canonical rule lives there).
const READ_ONLY_MODES = new Set(["AUDIT", "READ_ONLY", "REPORT", "STATUS", "SELF_AUDIT"]);
const ENGINEERING_MODES = new Set(["ENGINEERING", "IMPLEMENT", "FIX", "REPAIR", "REFACTOR"]);
function missionNeedsProvider(m: any): boolean {
  if (m.requiresEngineering === true) return true;
  const mode = String(m.mode == null ? "" : m.mode).toUpperCase();
  if (READ_ONLY_MODES.has(mode)) return false;
  if (ENGINEERING_MODES.has(mode)) return true;
  return Array.isArray(m.authorizedPaths) && m.authorizedPaths.length > 0;
}

const CLASS = Object.freeze(["NATIVE_GUARANTEED", "PROVIDER_DEPENDENT", "UNKNOWN"]);

/**
 * projectProviderDependency({ missions, providerAvailable, needsProvider? }) ->
 *   { measurable, denominator, nativeGuaranteed, providerDependent, unknown, nativeContinuityFloor, blockedIfProviderDown, perMission, reason }.
 * Fail-closed: a mission whose dependency cannot be determined is UNKNOWN and NEVER counted as native;
 * a provider-dependent mission is NEVER optimistically counted native (the floor is a GUARANTEED lower bound).
 */
function projectProviderDependency(input: any): any {
  const o = isObj(input) ? input : {};
  const missions = arr(o.missions);
  const predicate = typeof o.needsProvider === "function" ? o.needsProvider : missionNeedsProvider;
  if (missions.length === 0) return Object.freeze({ measurable: false, denominator: 0, nativeGuaranteed: 0, providerDependent: 0, unknown: 0, nativeContinuityFloor: null, blockedIfProviderDown: 0, perMission: Object.freeze([]), reason: "empty/invalid mission queue — no continuity fraction fabricated" });

  const perMission: any[] = [];
  let nativeGuaranteed = 0; let providerDependent = 0; let unknown = 0;
  for (const m of missions) {
    if (!isObj(m)) { unknown++; perMission.push(Object.freeze({ id: null, klass: "UNKNOWN" })); continue; }
    let needs: any;
    try { needs = predicate(m); } catch { needs = null; }
    if (needs === true) { providerDependent++; perMission.push(Object.freeze({ id: m.id, klass: "PROVIDER_DEPENDENT" })); }
    else if (needs === false) { nativeGuaranteed++; perMission.push(Object.freeze({ id: m.id, klass: "NATIVE_GUARANTEED" })); }
    else { unknown++; perMission.push(Object.freeze({ id: m.id, klass: "UNKNOWN" })); }
  }

  const denominator = missions.length;
  const measurable = denominator > 0 && unknown < denominator;   // all-unknown ⇒ not measurable
  const nativeContinuityFloor = measurable ? round(nativeGuaranteed / denominator) : null;   // GUARANTEED lower bound
  const blockedIfProviderDown = o.providerAvailable === false ? providerDependent : 0;

  return Object.freeze({
    measurable, denominator, nativeGuaranteed, providerDependent, unknown,
    nativeContinuityFloor,            // fraction of the queue ODG progresses with NO provider (guaranteed)
    blockedIfProviderDown,            // forward analogue of mission-scheduler providerUnavailable⇒BLOCKED
    perMission: Object.freeze(perMission),
    reason: measurable ? "native-continuity floor computed (UNKNOWN excluded from the native numerator — honest lower bound)" : "every mission UNKNOWN ⇒ not measurable (no fabricated continuity)",
  });
}

const PROVIDER_DEPENDENCY_PROJECTION_CONTRACT = Object.freeze({
  id: "V124-PROVIDER-DEPENDENCY-PROJECTION",
  source: "SÉRIE 23 ODG-native — forward queue-level provider-dependency / native-continuity floor (graceful degradation 2026; arXiv 2602.10900)",
  classes: CLASS,
  reuses: Object.freeze(["mirrors src/providers/provider-port.missionRequiresProvider (or inject needsProvider)", "autonomy-measure honesty discipline (bad input ⇒ measurable:false)", "forward analogue of mission-scheduler providerUnavailable⇒BLOCKED"]),
  notAuthority: "a read-only portfolio projection; it schedules nothing and calls no provider",
  invariants: Object.freeze([
    "nativeContinuityFloor is a GUARANTEED lower bound: only missions that need NO provider count in the numerator",
    "a mission whose dependency cannot be determined is UNKNOWN and NEVER counted as native (fail-closed)",
    "a PROVIDER_DEPENDENT mission is never optimistically counted native even though local-first MIGHT complete some",
    "empty/all-unknown queue ⇒ measurable:false with an explicit reason — never a fabricated continuity percentage",
    "pure/deterministic; mirrors the canonical provider-port predicate (or uses an injected one); no fs/clock/network",
  ]),
});

module.exports = { missionNeedsProvider, projectProviderDependency, PROVIDER_DEPENDENCY_PROJECTION_CONTRACT };

if (require.main === module) {
  const demo = projectProviderDependency({ missions: [{ id: "a", mode: "AUDIT" }, { id: "b", mode: "IMPLEMENT" }, { id: "c", requiresEngineering: true }, { id: "d", mode: "REPORT" }], providerAvailable: false });
  process.stdout.write(JSON.stringify({ ...PROVIDER_DEPENDENCY_PROJECTION_CONTRACT, demo: { nativeContinuityFloor: demo.nativeContinuityFloor, blockedIfProviderDown: demo.blockedIfProviderDown } }, null, 2) + "\n");
}

export {};
