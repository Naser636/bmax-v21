#!/usr/bin/env node
"use strict";
/*
 * V361-D P1 — COMPONENT JUDGMENT. PURE, deterministic, READ-ONLY. Refines the odg-component-census DECISION SURFACE
 * (modules with no detected STATIC importer) into a grounded per-module DISPOSITION using the 13-status taxonomy the
 * mandate asks for. It COMPOSES the census (it does NOT re-scan the graph) and assigns ONE status per module from
 * injected, GROUNDED signals — never a second graph, never a fabricated consumer.
 *
 * HONESTY (the mandate: "Ne pas déclarer orphelin sur la seule absence d'import statique ; pas de consommateurs artificiels"):
 *  - ORPHANED_CONFIRMED is NEVER inferred. A module reaches it ONLY if an explicit `confirmedOrphans` input (a human/owner
 *    confirmation) names it. Static-import absence alone ⇒ DORMANT_* or UNKNOWN, never "confirmed orphan".
 *  - "consumed" verdicts (APP_DYNAMIC_CONSUMED / INDIRECTLY_CONSUMED) require POSITIVE evidence (an import-context app
 *    reference or an explicit dynamic-use signal), not the mere absence of a static importer.
 *  - LEGITIMATE_LIBRARY requires POSITIVE membership evidence (an index/registry lists it) — exporting an API is NOT enough
 *    (the export convention is near-universal in core; see odg-component-census).
 *  - SUPERSEDED/EXPERIMENTAL from a NAME signal alone is LOW confidence and labelled as such; a registry hit is HIGH.
 *  - Every disposition carries its evidence + a confidence; nothing is auto-activated, retired or merged.
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function setOf(v: any): Set<string> { return new Set(arr(v).filter((x) => typeof x === "string")); }

// LOW-confidence lexical signals (a name HINT, never a verdict).
const SUPERSEDED_NAME_RE = /(-v[2-9]\d*|-old|-legacy|-deprecated|-superseded|-prev)$/;
const EXPERIMENTAL_NAME_RE = /(-experimental|-poc|-prototype|-draft|-spike|-wip|-sandbox)$/;

const STATUSES = Object.freeze([
  "APP_DYNAMIC_CONSUMED", "INDIRECTLY_CONSUMED", "LEGITIMATE_LIBRARY", "MISSING_CONSUMER", "MISSING_ENTRYPOINT",
  "DEMONSTRATOR", "EXPERIMENTAL", "SUPERSEDED", "DORMANT_ACTIONABLE", "DORMANT_INTENTIONAL", "ORPHANED_CONFIRMED",
  "BLOCKED", "UNKNOWN",
]);
const ACTIONABLE = new Set(["MISSING_CONSUMER", "MISSING_ENTRYPOINT", "DORMANT_ACTIONABLE"]);

/**
 * judgeModule(m, sig) -> { module, status, confidence, actionable, evidence[] }. `sig` is the grounded per-module signal
 * bundle (all injected; no I/O here). Precedence is positive-evidence-first; the absence of a static importer is treated
 * as a REASON TO JUDGE, never as proof of death.
 */
function judgeModule(m: string, sig: any): any {
  const s = isObj(sig) ? sig : {};
  const ev: string[] = [];
  const out = (status: string, confidence: string): any =>
    freeze({ module: m, status, confidence, actionable: ACTIONABLE.has(status), evidence: freeze(ev.slice()) });

  // 0) Explicit owner/human confirmation — the ONLY path to ORPHANED_CONFIRMED.
  if (s.confirmedOrphan === true) { ev.push("owner/human confirmation lists this module as a confirmed orphan"); return out("ORPHANED_CONFIRMED", "HIGH"); }

  // 1) POSITIVE dynamic/app consumption (beyond the static graph).
  if (s.dynamicUse === true) { ev.push("explicit dynamic-use signal (spawn/require(var)/registry) names this module"); return out("APP_DYNAMIC_CONSUMED", "HIGH"); }
  if (s.appRef === "IMPORT") { ev.push("referenced in src/ app in an import/require/path context"); return out("APP_DYNAMIC_CONSUMED", "MEDIUM"); }
  if (s.indirectConsumer === true) { ev.push("consumed indirectly via a connected module (injected evidence)"); return out("INDIRECTLY_CONSUMED", "MEDIUM"); }

  // 2) Gated / blocked activation — NOT an orphan; it is waiting on an authorization/blocked dependency.
  //    ownerGated is frequently derived from a SOURCE-TEXT marker (a module may only MENTION the gate), so it is MEDIUM
  //    confidence — a candidate gate, not a verified one. An explicit blockedDependency FACT is HIGH.
  if (s.ownerGated === true) { ev.push("source declares/mentions an OWNER_GATED / owner-decision activation gate (text-marker ⇒ candidate, not verified)"); return out("BLOCKED", "MEDIUM"); }
  if (s.blockedDependency === true) { ev.push("depends on a known-blocked capability (external research/egress/systemd/frozen-métier)"); return out("BLOCKED", "HIGH"); }

  // 3) Intentionally parked (registry) vs. demonstrator (name).
  if (s.intentionalDormant === true) { ev.push("a registry marks this module intentionally parked (started=false / PARKED)"); return out("DORMANT_INTENTIONAL", "HIGH"); }
  if (s.demonstrator === true) { ev.push("demonstrator/bench/selftest-named entry (runnable example, not a wired consumer)"); return out("DEMONSTRATOR", "HIGH"); }

  // 4) Superseded / experimental — registry = HIGH, name-only = LOW.
  if (s.supersededByRegistry === true) { ev.push("a registry marks this module superseded by a successor"); return out("SUPERSEDED", "HIGH"); }
  if (SUPERSEDED_NAME_RE.test(m)) { ev.push("name hints supersession (-v2/-old/-legacy/…) — LOW-confidence lexical signal only"); return out("SUPERSEDED", "LOW"); }
  if (EXPERIMENTAL_NAME_RE.test(m)) { ev.push("name hints an experiment (-poc/-prototype/-wip/…) — LOW-confidence lexical signal only"); return out("EXPERIMENTAL", "LOW"); }

  // 5) Meant-to-be-run but not wired — ONLY a CLI-primary module (a `require.main` entry AND no consumable export surface).
  //    A module that EXPORTS an API and merely carries a `require.main` SELF-DEMO is a library missing a caller, not a
  //    missing entrypoint — it falls through to MISSING_CONSUMER below (the demo block is incidental).
  if (s.hasRequireMain === true && s.binWired !== true && s.exportsApi !== true) { ev.push("a `require.main` CLI entry, no bin/package wiring, and no export API ⇒ a runnable entrypoint is missing"); return out("MISSING_ENTRYPOINT", "MEDIUM"); }

  // 6) Library membership (POSITIVE) vs. an unwired API.
  if (s.indexMember === true) { ev.push("listed in a documented index/registry as a reusable library"); return out("LEGITIMATE_LIBRARY", "MEDIUM"); }
  if (s.exportsApi === true) {
    ev.push("exports an API with NO detected consumer (static core + app/bin scan) ⇒ a caller is missing OR it is an un-indexed reusable library (not upgraded to LEGITIMATE_LIBRARY without positive index/registry evidence — honest conservative default)");
    if (s.hasTest === true) ev.push("has a test (behaviour pinned) — wiring a consumer is low-risk");
    return out("MISSING_CONSUMER", s.hasTest === true ? "MEDIUM" : "LOW");
  }

  // 7) No API, no consumer, no positive reason — an ACTIONABLE dormant candidate (wire or retire), NOT a confirmed orphan.
  if (s.exportsApi === false) { ev.push("no export surface and no detected consumer ⇒ dormant; needs a wire-or-retire decision (NOT auto-retired)"); return out("DORMANT_ACTIONABLE", "LOW"); }

  ev.push("insufficient grounded signal to disposition ⇒ UNKNOWN (never defaulted to orphan)");
  return out("UNKNOWN", "LOW");
}

/**
 * judge({ modules, signals }) -> frozen report. `modules` = the decision-surface module ids (e.g. census.decisionSurface);
 * `signals` = { [module]: signalBundle }. Pure: everything injected. Returns per-module dispositions + a reconciled
 * distribution + the actionable subset. Fabricates nothing: a module with no bundle is judged UNKNOWN honestly.
 */
function judge(input: any): any {
  const i = isObj(input) ? input : {};
  const modules = arr(i.modules).filter((m: any) => typeof m === "string");
  const signals = isObj(i.signals) ? i.signals : {};
  const confirmed = setOf(i.confirmedOrphans); // explicit owner/human confirmation set (the ONLY orphan source)

  const dispositions = modules.map((m: string) => {
    const sig = Object.assign({}, isObj(signals[m]) ? signals[m] : {});
    delete sig.confirmedOrphan; // the per-module signal bundle CANNOT self-confirm an orphan — the top-level
    if (confirmed.has(m)) sig.confirmedOrphan = true; // `confirmedOrphans` owner set is the ONLY orphan source.
    return judgeModule(m, sig);
  });

  const byStatus: Record<string, number> = {};
  for (const s of STATUSES) byStatus[s] = 0;
  for (const d of dispositions) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
  const actionable = dispositions.filter((d: any) => d.actionable).map((d: any) => d.module).sort();

  return freeze({
    total: modules.length,
    byStatus: freeze(byStatus),
    actionable: freeze(actionable),           // the wire-or-retire candidates (MISSING_CONSUMER/ENTRYPOINT + DORMANT_ACTIONABLE)
    orphanConfirmed: byStatus.ORPHANED_CONFIRMED, // ONLY from explicit confirmation — 0 unless an owner confirmed one
    dispositions: freeze(dispositions),
    note: "Per-module disposition over the census DECISION SURFACE (no static importer). ORPHANED_CONFIRMED is NEVER inferred — " +
      "it requires explicit owner/human confirmation; static-absence ⇒ DORMANT_*/UNKNOWN. 'Consumed'/'library' verdicts need " +
      "POSITIVE evidence; name-based SUPERSEDED/EXPERIMENTAL are LOW confidence. Nothing is auto-activated, retired or merged.",
  });
}

const COMPONENT_JUDGMENT_CONTRACT = Object.freeze({
  id: "V361D-COMPONENT-JUDGMENT",
  purpose: "Refine the component-census decision surface into a grounded 13-status per-module disposition; composes the census (no second graph); 'consumed'/'library'/'blocked' verdicts come from POSITIVE injected evidence, while SUPERSEDED/EXPERIMENTAL from a module-name pattern are computed in-module and labelled LOW-confidence lexical (not injected evidence)",
  statuses: STATUSES,
  invariants: Object.freeze([
    "ORPHANED_CONFIRMED is NEVER inferred — ONLY an explicit owner/human confirmation reaches it; static-import absence ⇒ DORMANT_*/UNKNOWN",
    "'consumed' (APP_DYNAMIC_CONSUMED/INDIRECTLY_CONSUMED) and LEGITIMATE_LIBRARY require POSITIVE evidence, never the absence of a static importer",
    "name-based SUPERSEDED/EXPERIMENTAL are LOW confidence and labelled lexical; a registry hit is HIGH",
    "PURE/deterministic/frozen READ-ONLY; composes the census; fabricates no consumer; auto-activates/retires/merges nothing",
  ]),
});

module.exports = { judge, judgeModule, STATUSES, COMPONENT_JUDGMENT_CONTRACT };
export {};
