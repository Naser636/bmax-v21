#!/usr/bin/env node
"use strict";
/*
 * V360 P3 — BOUSSOLE (operational source of truth). PURE, deterministic, READ-ONLY. NOT a second roadmap: it is a VIEW over
 * V12.4 that reconciles the V360 capability connects to their REAL status + evidence, so ODG/owner can ask "where are we?
 * what's missing? which next improvement has the most value?" and get an answer consistent with the repo. Every status is
 * backed by a merged PR (evidence) or an explicit owner-dependency; nothing is declared done because a file exists.
 *
 * Status vocabulary: CONNECTED (built + real consumer, by a merged PR), DONE_OPERATIONAL (demonstrated live), OWNER_GATED
 * (needs an owner decision), BLOCKED (external/owner dependency), SUPERSEDED (kept, not re-woken). A DRIFT check is
 * injectable (opts.hasConsumer) to verify a CONNECTED capability still has a non-test consumer — honest, not assumed.
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// The V360 capability map — each row is anchored to the merged PR that connected it (verifiable evidence), not a claim.
const CAPABILITIES = Object.freeze([
  freeze({ id: "learning-intelligence", priority: 1, module: "odg-native-learning-pass", status: "CONNECTED", pr: 814, note: "learning-loop over real native outcomes (recurring failures → consolidated lessons)" }),
  freeze({ id: "radar-to-learning", priority: 1, module: "odg-radar-learning-bridge", status: "CONNECTED", pr: 826, note: "qualified radar signals → UNCONFIRMED candidate lessons (canonical memory + trust gate; external never auto-fact); retrieved + reused as mission context" }),
  freeze({ id: "learning-decision-loop", priority: 1, module: "odg-lesson-decision-loop", status: "CONNECTED", pr: 827, note: "Radar→Learning→DECISION→MEASURE: unconfirmed lesson doesn't auto-change a decision; corroborated+sealed does (before/after); outcome NOT_MEASURED (never fabricated)" }),
  freeze({ id: "system-coverage-matrix", priority: 1, module: "odg-system-coverage", status: "DONE_OPERATIONAL", pr: 828, note: "full-system GROUNDED coverage over the real require-graph (core+bin+app+scripts): status DERIVED (CONNECTED/NO_CONSUMER), orphan + REGRESSION detection; honest scope (FUNCTION/MEASURE/PROOF not graph-derivable); after the #829 graph fix + import-grounded scan the bin reports 531/767 CONNECTED, 236 candidate-dormant" }),
  freeze({ id: "self-improvement-cycle", priority: 1, module: "odg-self-improvement-cycle", status: "DONE_OPERATIONAL", pr: 830, note: "integrated cycle: radar/learning OBSERVE → coverage+compass GAP → SELECT → odg-lesson-decision-loop LEARN → governed DESIGN; PROPOSED-only (BUILD NOT_EXECUTED / INTEGRATE OWNER_GATED / MEASURE NOT_MEASURED); real-repo run = OWNER_DECISION_ONLY (no actionable gap ⇒ proposes nothing, never manufactures work)" }),
  freeze({ id: "night-cycle-scheduler", priority: 1, module: "odg-night-cycle-scheduler", status: "DONE_OPERATIONAL", pr: 831, note: "§7: exactly TWO night-only cycles/week (Europe/Paris, TUE+SAT 02:00–04:00) driving odg-self-improvement-cycle; reuses radar-scheduler primitives (no 2nd scheduler); due→trigger/daytime→refuse/duplicate→refuse/overlap→reject/error→safe-recovery/DST-correct all demonstrated; real controlled trigger EXECUTED in dev; OPERATIONAL (persistent auto-trigger) = OWNER_GATED systemd/cron (§12), realTrigger NOT_MEASURED" }),
  freeze({ id: "radar-self-evaluation", priority: 2, module: "frontier-radar-self-improvement", status: "CONNECTED", pr: 813, note: "wired into frontier-pipeline (precision/noise/miss, PROPOSED-only)" }),
  freeze({ id: "radar-live-collection", priority: 2, module: "odg-radar-live-collect", status: "DONE_OPERATIONAL", pr: 817, note: "governed bounded egress; demonstrated 2 COLLECTED from FR open-data (kill-switch DRY default)" }),
  freeze({ id: "radar-qualification", priority: 2, module: "odg-radar-collect-to-signals", status: "CONNECTED", pr: 818, note: "collection → runRadar qualify → PROPOSAL (proposals, not missions)" }),
  freeze({ id: "radar-governed-integration", priority: 2, module: "odg-radar-to-deferred-lot", status: "CONNECTED", pr: 821, note: "proposals → DEFERRED governed lots; activation owner-gated (never auto-selected)" }),
  freeze({ id: "radar-tech-sources", priority: 2, module: "odg-radar-tech-sources", status: "DONE_OPERATIONAL", pr: 824, note: "arXiv + GitHub (owner-authorized) integrated; live collection→qualification demonstrated (5+5 signals QUALIFIED); kill-switch DRY default" }),
  freeze({ id: "radar-anticipation", priority: 2, module: "odg-forecast-memory", status: "DONE_OPERATIONAL", pr: 832, note: "anticipation/foresight: forecast-with-horizon → retrospective resolution against OBSERVED reality → hit/false-signal/missed/lead-time + confidence calibration (Brier/ECE via canonical gate); a forecast is NEVER a fact, PENDING⇒NOT_MEASURED, no auto-confirm, EXPIRED=non-hit; demonstrated (SYNTHETIC) via bin; reuses calibration-trust-gate, no 2nd store" }),
  freeze({ id: "radar-foresight-calibration", priority: 2, module: "odg-radar-foresight-calibration", status: "DONE_OPERATIONAL", pr: 833, note: "closes anticipation→radar loop: PROPOSED source re-weighting (down-weight/trust/discount) driven by REALIZED forecast accuracy OVER TIME (per-source, DECIDED-only, fail-closed under minDecided ⇒ never on noise); re-grounds frontier-radar-self-improvement on resolved outcomes; selfAuthorized:false (radar never self-applies); composes forecast-memory + radar-self-improvement, no 2nd engine" }),
  freeze({ id: "knowledge-engine", priority: 3, module: "knowledge-engine", status: "CONNECTED", pr: 815, note: "producer → knowledge.json → decision-engine + stage-effect; regenerable via bin" }),
  freeze({ id: "cognitive-drivers", priority: 4, module: "cognitive-campaign-driver", status: "DONE_OPERATIONAL", pr: 815, note: "cognition → campaign-loop mission + P15 workflow (bin); POLICY-deny ⇒ nothing" }),
  freeze({ id: "mission-decomposition", priority: 4, module: "odg-mission-decompose-chain", status: "CONNECTED", pr: 820, note: "decompose → selectNextLot; SIGN_OFF_GATED reserved (human lock)" }),
  freeze({ id: "model-intelligence", priority: 7, module: "odg-model-intelligence", status: "DONE_OPERATIONAL", pr: 834, note: "§8: 'which model/route, and did it MEASURABLY win?' — calibrated P(success) selection (odg-execution-routing, evidence not popularity) + reproducible before/after latency (performance-observability) + latency-measure; activity≠intelligence (WIN needs calibrated+reliability-aligned+reproducible gain; RELIABILITY_OVERRIDES_SPEED when faster-but-escalated); regression surfaced, NOT_MEASURED honest; recommends only; composes, no 2nd selector/measurer" }),
  freeze({ id: "self-healing-diagnostic", priority: 6, module: "odg-self-healing-run", status: "CONNECTED", pr: 816, note: "Detection→Classification→RootCause→FixChoice→PLAN (plan-only)" }),
  freeze({ id: "cra-remediation", priority: 6, module: "odg-cra-remediation-chain", status: "CONNECTED", pr: 819, note: "sbom-audit → plan → verify (before/after); plan-only" }),
]);

// Owner decisions that gate further progress (not fabricatable); each names the exact dependency.
const OWNER_GATED = Object.freeze([
  freeze({ id: "aql-definition", status: "BLOCKED", dependency: "owner must provide the canonical AQL definition (0 repo matches; must not be invented)" }),
  freeze({ id: "deferred-activation", status: "OWNER_GATED", dependency: "DEFERRED → READY activation is an external owner authorization (never auto)" }),
  // RESOLVED #824: radar-tech-sources (arXiv/GitHub) — owner-authorized + integrated; now a DONE_OPERATIONAL capability above.
  freeze({ id: "proposal-to-mission", status: "OWNER_GATED", dependency: "real mission creation stays deny-by-default / owner-gated" }),
  freeze({ id: "repair-apply", status: "OWNER_GATED", dependency: "self-healing repair application is governed (plan-only until authorized)" }),
  freeze({ id: "resident-driver-level", status: "OWNER_GATED", dependency: "resident-driver L0_OBSERVE → higher execution level needs owner authorization" }),
  freeze({ id: "metiers", status: "OWNER_GATED", dependency: "20 métiers frozen; no de-freeze without explicit owner authorization" }),
]);

// Superseded capabilities — preserved (never deleted), intentionally NOT re-woken (canonical equivalent exists).
const SUPERSEDED = Object.freeze([
  freeze({ id: "engineering-scheduler", reason: "a 2nd scheduler; canonical selector = campaign-controller/mission-scheduler" }),
  freeze({ id: "p12-weighted-fair-share-scheduler", reason: "a 2nd scheduler; canonical selector is authoritative" }),
  freeze({ id: "odg-v251-repair-reconciliation", reason: "one-off V251 transform reconciliation; not an ongoing capability" }),
]);

/** buildCompass(opts?) -> { asOf, capabilities, counts, ownerDecisionsNeeded, superseded, nextPriority, drift, note }.
 *  opts.hasConsumer(module)->bool (optional DRIFT check): flags a CONNECTED capability whose module has no non-test consumer. */
function buildCompass(opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const hasConsumer = typeof o.hasConsumer === "function" ? o.hasConsumer : null;
  const drift: any[] = [];
  const capabilities = CAPABILITIES.map((c: any) => {
    let status = c.status;
    if (hasConsumer && (c.status === "CONNECTED" || c.status === "DONE_OPERATIONAL") && c.module && hasConsumer(c.module) !== true) {
      status = "DRIFT_NO_CONSUMER"; drift.push({ id: c.id, module: c.module, expected: c.status });
    }
    return freeze({ ...c, status });
  });
  const counts: any = {};
  for (const c of capabilities) counts[c.status] = (counts[c.status] || 0) + 1;
  // "next priority": the lowest-priority-number capability not yet CONNECTED/DONE (drift first), else the top owner decision.
  const open = capabilities.filter((c: any) => c.status !== "CONNECTED" && c.status !== "DONE_OPERATIONAL" && c.status !== "SUPERSEDED").sort((a: any, b: any) => a.priority - b.priority);
  const nextPriority = open.length > 0
    ? freeze({ kind: "capability", id: open[0].id, why: open[0].status })
    : freeze({ kind: "owner-decision", id: OWNER_GATED[1].id, why: "all connect-gaps closed; the highest-value next step is an owner decision", detail: OWNER_GATED[1].dependency });
  return freeze({
    asOf: typeof o.asOf === "string" ? o.asOf : null,
    capabilities: freeze(capabilities), counts: freeze(counts),
    ownerDecisionsNeeded: OWNER_GATED, superseded: SUPERSEDED,
    drift: freeze(drift),
    nextPriority,
    note: "BOUSSOLE: a READ-ONLY VIEW over V12.4 (not a second roadmap); statuses anchored to merged PRs (evidence); owner-gated/superseded explicit; nextPriority = highest-value non-blocked gap else the top owner decision. A capability is never CONNECTED on code alone — the optional hasConsumer drift check verifies it.",
  });
}

const V360_COMPASS_CONTRACT = Object.freeze({
  id: "V360-COMPASS-BOUSSOLE",
  purpose: "P3 — operational V12.4 boussole: reconcile the V360 capability connects to real status + PR evidence + owner dependencies; answer where-are-we / next-priority; a VIEW, not a second roadmap",
  reuses: Object.freeze(["merged-PR evidence (the connects #812–#821)", "optional injected consumer check (DRIFT) — no second roadmap/registry"]),
  invariants: Object.freeze([
    "a VIEW over V12.4 — creates no second roadmap/registry; preserves all history; statuses anchored to merged PRs (evidence)",
    "never CONNECTED on code alone — the optional hasConsumer check surfaces DRIFT (a CONNECTED capability with no non-test consumer)",
    "owner-gated and superseded are explicit with their exact dependency/reason; AQL stays BLOCKED (never invented)",
    "nextPriority is the lowest-priority non-blocked open capability, else the top owner decision; PURE/deterministic/frozen",
  ]),
});

module.exports = { buildCompass, CAPABILITIES, OWNER_GATED, SUPERSEDED, V360_COMPASS_CONTRACT };
export {};
