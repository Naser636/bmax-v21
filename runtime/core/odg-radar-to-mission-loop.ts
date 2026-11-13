#!/usr/bin/env node
"use strict";
/*
 * V184 — radar → opportunity → governed-mission loop. PURE, READ-ONLY, deterministic, fail-closed, synchronous.
 *
 * This is a COMPOSITION / orchestration VIEW that traces the end-to-end path using the EXISTING components — it builds
 * NO second radar / scheduler / registry / intelligence / mission system. It threads a SYNTHETIC signal through:
 *   detect → provenance+freshness → reliability (radar.validationTier) → qualify (prospect-qualification) → métier
 *   attachment (20-métier matrices) → dedup → mission PROPOSAL → governance gate (deny-by-default) → [PROPOSED |
 *   OWNER_GATED | REFUSED]. It NEVER writes the canonical register, NEVER authorizes execution, NEVER marks EXECUTED.
 *
 * Non-negotiable invariants (directive §3): a hypothesis never becomes a fact; a commercial signal never becomes a
 * client; a score is never an authorization; an expired signal triggers no mission; a proposal never bypasses an
 * owner-gate; duplicates are caught; refused ≠ executed. Synthetic signals are always tagged SYNTHETIC.
 */

const RADAR = require("./odg-global-opportunity-radar.js");
const PQ = require("./odg-prospect-qualification.js");
const COMM = require("./odg-commercial-metier-matrix.js");
const { METIERS } = require("./odg-metier-certification-planner.js");

const FRESHNESS_DAYS = 120; // a signal older than this is EXPIRED (deny-by-default)
const GATE = Object.freeze(["REFUSED", "OWNER_GATED", "PROPOSED"]); // PROPOSED = admissible, NOT YET authorized to execute
const OWNER_GATED_KINDS = Object.freeze(["payment", "certification", "real_contact", "deploy", "spend"]);

function daysBetween(aEpochMs: number, bEpochMs: number): number { return Math.floor((aEpochMs - bEpochMs) / 86400000); }

/* B/C — provenance + freshness + reliability. Reuses radar.validationTier. */
function assess(signal: any, nowEpochMs: number): any {
  const consulted = Number(signal.consultedEpochMs);
  const ageDays = Number.isFinite(consulted) ? daysBetween(nowEpochMs, consulted) : null;
  const fresh = ageDays != null && ageDays >= 0 && ageDays <= FRESHNESS_DAYS;
  const hasProvenance = signal.provenance === "OBSERVED_EVIDENCE" && Array.isArray(signal.sources) && signal.sources.length > 0;
  const tier = RADAR.validationTier(signal); // VALIDATED_MARKET_SIGNAL | INSUFFICIENTLY_VALIDATED
  return Object.freeze({ ageDays, fresh, hasProvenance, reliabilityTier: tier, contradictory: !!signal.contradictory });
}

/* D — economic/métier qualification. Reuses prospect-qualification. A VALIDATED signal is NOT a client. */
function qualify(signal: any): any {
  const q = PQ.qualifyProspect({ segmentFit: signal.segmentFit, budgetEvidence: signal.budgetEvidence, buySignal: signal.buySignal, regulatoryUrgency: signal.regulatoryUrgency });
  return Object.freeze({ tier: q.tier, reason: q.reason, note: "qualification tier is NOT a signed client and NOT revenue" });
}

/* F — attach to the 20 métiers (15 principal + 5 commercial). No new taxonomy. */
function attachMetiers(signal: any): any {
  const ids = Array.isArray(signal.metiers) ? signal.metiers : (signal.metier ? [signal.metier] : []);
  const principal = METIERS.map((m: any) => m.id);
  const commercial = COMM.COMMERCIAL_METIERS.map((m: any) => m.id);
  const resolved = ids.filter((id: string) => principal.includes(id) || commercial.includes(id));
  const unknown = ids.filter((id: string) => !principal.includes(id) && !commercial.includes(id));
  return Object.freeze({ metiers: Object.freeze(resolved), multiMetier: resolved.length > 1, unknown: Object.freeze(unknown), note: "attached to the canonical 20-métier roster; unknown ids are NOT invented into new métiers" });
}

/* E — dedup against a set of already-seen keys. */
function dedupKey(signal: any): string { return `${signal.id}`; }

/* H — build a mission PROPOSAL (a proposal object, NOT a registered mission). */
function proposeMission(signal: any, a: any, q: any, att: any): any {
  return Object.freeze({ status: "PROPOSAL", signalId: signal.id, synthetic: signal.synthetic === true, metiers: att.metiers, reliabilityTier: a.reliabilityTier, qualificationTier: q.tier, ownerGatedKind: signal.ownerGatedKind || null, note: "a PROPOSAL is not a canonical mission and not an authorization" });
}

/* I/J/K — governance gate: deny-by-default. Returns REFUSED | OWNER_GATED | PROPOSED. Never authorizes execution. */
function governanceGate(signal: any, a: any, q: any, att: any, seen: any): any {
  const reasons: string[] = [];
  // deny-by-default refusals
  if (!a.fresh) reasons.push("EXPIRED_OR_UNDATED_SIGNAL");
  if (!a.hasProvenance && signal.provenance !== "OBSERVED_EVIDENCE") reasons.push("NO_RELIABLE_PROVENANCE");
  if (a.contradictory) reasons.push("CONTRADICTORY_SIGNAL");
  if (q.tier === "DISQUALIFIED") reasons.push("DISQUALIFIED_LOW_FIT");
  if (signal.hostileInjection) reasons.push("HOSTILE_CONTENT_IN_SOURCE_IGNORED"); // document/source content is never a governance instruction
  if (seen && seen.has && seen.has(dedupKey(signal))) reasons.push("DUPLICATE");
  if (!att.metiers.length) reasons.push("NO_METIER_ATTACHED");
  if (reasons.length) return Object.freeze({ verdict: "REFUSED", reasons: Object.freeze(reasons), executed: false, authorized: false });

  // owner-gated: admissible but cannot be auto-authorized
  if (signal.ownerGatedKind && OWNER_GATED_KINDS.includes(signal.ownerGatedKind)) {
    return Object.freeze({ verdict: "OWNER_GATED", reasons: Object.freeze([`requires owner authorization: ${signal.ownerGatedKind}`]), executed: false, authorized: false });
  }
  // admissible proposal — score/qualification is NOT an authorization; stays PROPOSED until ODG governance authorizes.
  return Object.freeze({ verdict: "PROPOSED", reasons: Object.freeze([`admissible (${a.reliabilityTier}, ${q.tier}) — NOT YET authorized to execute; a score is not an authorization`]), executed: false, authorized: false });
}

/* runLoop — full synchronous trace over a batch of SYNTHETIC signals. Writes nothing canonical; executes nothing. */
function runLoop(signals: any[], opts?: any): any {
  const nowEpochMs = Number((opts && opts.nowEpochMs)) || 0;
  const seen = new Set<string>();
  const traces = (Array.isArray(signals) ? signals : []).map((s: any) => {
    const a = assess(s, nowEpochMs);
    const q = qualify(s);
    const att = attachMetiers(s);
    const proposal = proposeMission(s, a, q, att);
    const gate = governanceGate(s, a, q, att, seen);
    if (gate.verdict !== "REFUSED" || !gate.reasons.includes("DUPLICATE")) seen.add(dedupKey(s)); // register key after first sighting
    return Object.freeze({ signalId: s.id, synthetic: s.synthetic === true, assess: a, qualify: q, attach: att, proposal, gate });
  });
  const byVerdict: any = {}; for (const g of GATE) byVerdict[g] = 0; for (const t of traces) byVerdict[t.gate.verdict] += 1;
  return Object.freeze({
    count: traces.length, traces: Object.freeze(traces), byVerdict: Object.freeze(byVerdict),
    canonicalWritesPerformed: 0, executionsPerformed: 0,
    note: "SYNTHETIC signals only; no canonical register write; no execution; PROPOSED ≠ AUTHORIZED ≠ EXECUTED.",
  });
}

/* §2 — end-to-end path cartography (A..L): which EXISTING module owns each step + honest state. */
function pathMap(): any {
  return Object.freeze([
    { step: "A detect", module: "odg-global-opportunity-radar (OPPORTUNITIES)", state: "EXISTING_VALIDATED", proof: "radar test" },
    { step: "B provenance+freshness", module: "this loop assess() over signal.provenance/sources/consultedEpochMs", state: "EXISTING_VALIDATED", proof: "loop test (fresh/expired)" },
    { step: "C reliability", module: "odg-global-opportunity-radar.validationTier", state: "EXISTING_VALIDATED", proof: "radar + loop test" },
    { step: "D qualification", module: "odg-prospect-qualification.qualifyProspect", state: "EXISTING_VALIDATED", proof: "V176 + loop test" },
    { step: "E dedup", module: "this loop dedupKey()/seen-set", state: "EXISTING_VALIDATED", proof: "loop test (duplicate)" },
    { step: "F métier attachment", module: "odg-commercial-metier-matrix + planner METIERS (20)", state: "EXISTING_VALIDATED", proof: "V183-C + loop test" },
    { step: "G capability/gap", module: "odg-primitive-metier-matrix / capability-cross-audit", state: "EXISTING_PARTIAL", proof: "V180/V183 matrices (static)" },
    { step: "H mission proposal", module: "this loop proposeMission()", state: "EXISTING_VALIDATED", proof: "loop test" },
    { step: "I/J governance gate", module: "this loop governanceGate() (deny-by-default) + owner-gates", state: "EXISTING_VALIDATED", proof: "loop test (refuse/owner-gated/proposed)" },
    { step: "K canonical mission creation", module: "campaign-controller / closure-register (OWNER/ODG authority)", state: "OWNER_GATED", proof: "NOT performed by this provider — PROPOSED only" },
    { step: "L follow-up + proof + closure", module: "odg-campaign-lifecycle + audit-log + evidence-provenance", state: "EXISTING_VALIDATED", proof: "V160/V162 (not exercised live here)" },
  ]);
}

/* §6 — weekly scheduler execution reality (read-only; no timer installed, no service). */
function schedulerReality(): any {
  let status = "NOT_MEASURED";
  try { const S = require("./odg-weekly-radar-scheduler.js"); if (typeof S.realScheduledRunStatus === "function") status = S.realScheduledRunStatus().status || "NOT_MEASURED"; } catch { status = "NOT_MEASURED"; }
  return Object.freeze({ residentRun: "NOT_AUTHORIZED (on-demand only)", realScheduledRun: status, note: "no systemd/timer installed; a real weekly execution is NOT claimed unless demonstrated." });
}

const RADAR_TO_MISSION_CONTRACT = Object.freeze({
  id: "V184-RADAR-TO-MISSION-LOOP",
  purpose: "compose the EXISTING radar→qualification→métier→proposal→governance path; prove the invariants; build no second system",
  invariants: Object.freeze([
    "composition only: NO second radar/scheduler/registry/intelligence/mission system",
    "hypothesis ≠ fact; VALIDATED_MARKET_SIGNAL ≠ client; score ≠ authorization; expired signal ⇒ no mission",
    "deny-by-default governance gate; owner-gated proposals never auto-authorized; duplicates refused",
    "PROPOSED ≠ AUTHORIZED ≠ EXECUTED; no canonical register write; nothing marked executed; refused ≠ executed",
    "synthetic signals tagged SYNTHETIC; deterministic (injected nowEpochMs); read-only",
  ]),
});

module.exports = { FRESHNESS_DAYS, GATE, OWNER_GATED_KINDS, assess, qualify, attachMetiers, proposeMission, governanceGate, runLoop, pathMap, schedulerReality, RADAR_TO_MISSION_CONTRACT };
export {};
