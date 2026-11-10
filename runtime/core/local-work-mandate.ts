#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V77 §3/§4 — LOCAL-WORK MANDATE. Represents the OWNER's explicit, standing authorization for local,
 * reversible work (granted repeatedly in the CTO directives V61–V77) as a canonical, BOUNDED, REVOCABLE, TRACEABLE
 * authorization object — so the action-gate/roadmap-manager recognise an authorization that was actually granted by the
 * human owner. This is NOT ODG self-authorizing: the authorizer is the OWNER (provenance recorded), selfAuthored=false.
 * It authorizes ONLY Level-A actions (local/reversible); Level-B (human sign-off) and Level-C (external/irreversible) are
 * NEVER authorized here — they stay PROPOSED/BLOCKED. Pure/deterministic; dual export; fail-closed on unknown actions.
 */

const LEVEL_A = Object.freeze(["read", "analyze", "code_edit_local", "test", "benchmark", "synthetic_data", "doc", "refactor", "checkpoint", "commit_local", "update_registry"]);
const LEVEL_B = Object.freeze(["human_sign_off", "canonization", "legal_validation", "insurance", "client_validation", "owner_acceptance"]);
const LEVEL_C = Object.freeze(["push", "merge", "deploy", "vps", "ssh", "sudo", "spend", "subscription", "contract", "prospection", "publish", "dns", "tls", "firewall", "expose_secret", "modify_production", "modify_third_party"]);

const PROVENANCE = "OWNER explicit standing mandate — CTO directives V61–V84 (local reversible work + public read-only research)";

// V84 §2 — the 10 named PERMANENT capability-permissions granted by the owner. Each is bounded to local/public-read-only
// work and EXCLUDES every Level-C action; revocable; provenance recorded. These map onto the mandate, not a new registry.
const PERMISSIONS = Object.freeze([
  "LOCAL_ENGINEERING", "PUBLIC_WEB_RESEARCH", "PUBLIC_DATABASE_READ", "OPEN_DATASET_READ", "PUBLIC_REPOSITORY_RESEARCH",
  "PUBLIC_BENCHMARK_RESEARCH", "LOCAL_DATA_ANALYSIS", "LOCAL_SIMULATION_AND_BENCHMARK", "LOCAL_CONNECTOR_AND_ADAPTER_BUILD", "LOCAL_CAPABILITY_IMPROVEMENT",
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/* permits(capability, opts) -> { permitted, provenance, reason }. The 10 named permanent permissions are granted by the
 * owner (provenance recorded); revocable via opts.revoked; an unknown capability is NOT permitted (fail-closed); Level-C
 * is never granted here. ODG checks this itself — the provider cannot widen it. */
function permits(capability: any, opts: any = {}): any {
  if (isObj(opts) && opts.revoked === true) return Object.freeze({ permitted: false, capability, reason: "mandate REVOKED (revocable)" });
  const ok = typeof capability === "string" && PERMISSIONS.includes(capability);
  return Object.freeze({ permitted: ok, capability, provenance: ok ? PROVENANCE : null, scope: "LOCAL_OR_PUBLIC_READ_ONLY", excludesLevelC: true, reason: ok ? "granted by the owner's permanent mandate (public read-only / local reversible)" : "not a recognized permanent permission ⇒ not granted (fail-closed)" });
}

// V84 §3 — separate a blocked parent's sub-work into the 7 categories; categories 1–5 PROCEED, 6–7 stay reserved.
const CATEGORIES = Object.freeze(["LOCAL_DONE", "PUBLIC_RESEARCH", "PUBLIC_DATA", "LOCAL_SIMULATION", "PREP", "HUMAN_DECISION", "EXTERNAL_DEPENDENCY"]);
function separateBlockedParent(parent: any): any {
  const p = isObj(parent) ? parent : {};
  const subs = Array.isArray(p.subWork) ? p.subWork : [];
  const map: any = { LOCAL_DONE: [], PUBLIC_RESEARCH: [], PUBLIC_DATA: [], LOCAL_SIMULATION: [], PREP: [], HUMAN_DECISION: [], EXTERNAL_DEPENDENCY: [] };
  for (const s of subs) { const cat = CATEGORIES.includes(s.category) ? s.category : "PREP"; map[cat].push(s.id || s); }
  const proceed = [].concat(map.LOCAL_DONE, map.PUBLIC_RESEARCH, map.PUBLIC_DATA, map.LOCAL_SIMULATION, map.PREP);
  const reserved = [].concat(map.HUMAN_DECISION, map.EXTERNAL_DEPENDENCY);
  return Object.freeze({ parent: p.id || null, byCategory: map, proceedNow: proceed, reservedOnly: reserved,
    note: `${proceed.length} sub-work item(s) PROCEED now (categories 1–5); ${reserved.length} reserved (human/external) — a gated parent never immobilizes its computable sub-work` });
}

function classifyAction(a: string): string {
  if (LEVEL_C.includes(a)) return "C";
  if (LEVEL_B.includes(a)) return "B";
  if (LEVEL_A.includes(a)) return "A";
  return "UNKNOWN";
}

/*
 * authorizeLocalMission(mission, opts) -> an authorization decision. mission: { id, actions:[tags] }.
 * opts.revoked === true ⇒ the mandate is revoked ⇒ not authorized (revocability). Fail-closed: an UNKNOWN action ⇒ not
 * authorized. Authorizes ONLY when every action is Level-A.
 */
function authorizeLocalMission(mission: any, opts: any = {}): any {
  const m = isObj(mission) ? mission : {};
  const actions = Array.isArray(m.actions) ? m.actions.map(String) : [];
  if (isObj(opts) && opts.revoked === true) return Object.freeze({ authorized: false, level: null, reason: "local-work mandate REVOKED (revocable) — not authorized", actionLevels: {} });
  if (actions.length === 0) return Object.freeze({ authorized: false, level: null, reason: "no declared actions ⇒ fail-closed (not authorized)", actionLevels: {} });
  const actionLevels: any = {}; for (const a of actions) actionLevels[a] = classifyAction(a);
  const levels = Object.values(actionLevels);
  const hasC = levels.includes("C"); const hasB = levels.includes("B"); const hasUnknown = levels.includes("UNKNOWN");
  if (hasC) return Object.freeze({ authorized: false, level: "C", reason: "Level-C action (external/irreversible) — REFUSED; outside the local mandate (no push/deploy/VPS/spend/...)", actionLevels });
  if (hasB) return Object.freeze({ authorized: false, level: "B", reason: "Level-B action needs a specific human sign-off — PREPARE locally, do NOT accept/close (sign-off not invented)", actionLevels });
  if (hasUnknown) return Object.freeze({ authorized: false, level: "UNKNOWN", reason: "unrecognized action ⇒ fail-closed (not authorized)", actionLevels });
  // all Level-A ⇒ authorized by the OWNER's standing mandate (NOT self-authorized).
  return Object.freeze({
    authorized: true, level: "A",
    authorization: Object.freeze({ approved: true, authorizedBy: "owner", provenance: PROVENANCE, selfAuthored: false, scope: "LOCAL_REVERSIBLE", revocable: true, excludes: LEVEL_C }),
    reason: "all actions Level-A (local/reversible) ⇒ authorized by the owner's explicit standing mandate (provenance recorded); ODG does not self-authorize",
    actionLevels,
  });
}

const LOCAL_WORK_MANDATE_CONTRACT = Object.freeze({
  id: "V77-LOCAL-WORK-MANDATE", source: "CTO V77 §3/§4 — owner's standing local-work authorization, canonically represented",
  levels: Object.freeze({ A: LEVEL_A, B: LEVEL_B, C: LEVEL_C }), provenance: PROVENANCE,
  notAuthority: "it does NOT create authority — it represents the OWNER's explicit grant; authorizer=owner, selfAuthored=false; revocable + bounded to local reversible work",
  permanentPermissions: PERMISSIONS,
  invariants: Object.freeze([
    "10 named permanent owner-permissions (public read-only + local) granted with provenance; revocable; Level-C never granted",
    "authorizes ONLY Level-A (local/reversible); Level-B needs human sign-off (prepare, never accept); Level-C REFUSED",
    "authorizer is the OWNER (provenance = the explicit directive), never ODG (selfAuthored=false) — not self-authorization",
    "revocable (opts.revoked) + verifiable by the action-gate; unknown action ⇒ fail-closed (not authorized)",
    "pure/deterministic; the gate still runs — this only lets it recognise an authorization already granted by the owner",
  ]),
});

module.exports = { LEVEL_A, LEVEL_B, LEVEL_C, PERMISSIONS, CATEGORIES, PROVENANCE, classifyAction, authorizeLocalMission, permits, separateBlockedParent, LOCAL_WORK_MANDATE_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(LOCAL_WORK_MANDATE_CONTRACT, null, 2) + "\n"); }
export {};
