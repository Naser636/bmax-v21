#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-10 (P5 deploy / P14 devex — world-research gap) — FEATURE-FLAG STALENESS / RETIREMENT AUDIT. PURE,
 * deterministic. World reference: GrowthBook "The Engineer's Guide To Feature Flag Technical Debt [2026]" +
 * LaunchDarkly — platforms classify every flag as Active / Stale / Dead from evaluation traffic with the reason
 * (fully rolled out, rolled back, no traffic, never used); a flag pinned to one variation is the clearest staleness
 * signal and is routed to a removal PR ("feature-flag graveyard" debt). ODG has flag REGISTRIES (vnext/activation,
 * ollama-control-plane) that turn flags ON but NOTHING ever decides a flag should be RETIRED (grep-verified absent: no
 * stale-flag / flag-lifecycle / RETIRE verdict). This composes state-transition.canonicalize (decide whether a flag's
 * observed values ever differ across the window ⇒ constant = staleness) and mirrors p8-deprecation-window's announce-
 * before-remove discipline (REMOVE-eligible only if the removal was pre-announced). It authorizes nothing — archive/
 * removal stay owner/canonical actions. Deterministic: the "window" is a caller-supplied observation count. Dual export.
 */

const ST = require("./state-transition");              // canonicalize — constant-across-window detection

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const STALENESS = Object.freeze(["ACTIVE", "FULLY_ROLLED_OUT", "DEAD", "INSUFFICIENT"]);

/** constantValue(observations) -> { constant, value } via canonicalize equality across the window. */
function constantValue(observations: any[]): any {
  if (observations.length === 0) return { constant: false, value: undefined };
  const first = ST.canonicalize(observations[0]);
  for (let i = 1; i < observations.length; i++) if (ST.canonicalize(observations[i]) !== first) return { constant: false, value: undefined };
  return { constant: true, value: observations[0] };
}

/**
 * audit({ flags, minWindow }) -> { flags: [{name, staleness, removeEligible, reason}], summary }.
 *   flag: { name, observations: any[], deprecated?, stillReferenced? }. minWindow: minimum observations to judge (default 5).
 * Fail-closed: a window below minWindow, or missing observations ⇒ INSUFFICIENT (never auto-RETIRE); REMOVE-eligible
 * only if provably constant across a sufficient window AND removal pre-announced (deprecated) AND not still referenced.
 */
function audit(input: any): any {
  const o = isObj(input) ? input : {};
  const minWindow = typeof o.minWindow === "number" && o.minWindow > 0 ? Math.floor(o.minWindow) : 5;
  const out: any[] = [];

  for (const raw of arr(o.flags)) {
    const f = isObj(raw) ? raw : {};
    const name = typeof f.name === "string" ? f.name : null;
    const obs = arr(f.observations);
    let staleness: string; let reason: string;

    if (obs.length < minWindow) { staleness = "INSUFFICIENT"; reason = `only ${obs.length} observations (< minWindow ${minWindow}) — cannot judge staleness (fail-closed, never auto-retire)`; }
    else {
      const c = constantValue(obs);
      if (!c.constant) { staleness = "ACTIVE"; reason = "observed evaluations VARY across the window — the flag is doing work"; }
      else if (c.value === true) { staleness = "FULLY_ROLLED_OUT"; reason = "observed evaluations constant TRUE across the window — fully rolled out (dead branch behind it)"; }
      else { staleness = "DEAD"; reason = "observed evaluations constant FALSE/never-true across the window — dead / never shipped"; }
    }

    const isStale = staleness === "FULLY_ROLLED_OUT" || staleness === "DEAD";
    // announce-before-remove (mirrors p8-deprecation-window): REMOVE-eligible only if pre-announced AND not still referenced.
    const removeEligible = isStale && f.deprecated === true && f.stillReferenced !== true;
    if (isStale && !removeEligible) reason += f.stillReferenced === true ? "; still referenced by consumers ⇒ not REMOVE-eligible" : "; removal not pre-announced (deprecated!=true) ⇒ not REMOVE-eligible (deny-by-default)";

    out.push(Object.freeze({ name, staleness, removeEligible, reason }));
  }

  const stale = out.filter((x) => x.staleness === "FULLY_ROLLED_OUT" || x.staleness === "DEAD").length;
  const removable = out.filter((x) => x.removeEligible).length;
  return Object.freeze({ flags: Object.freeze(out), summary: Object.freeze({ total: out.length, stale, removable, active: out.filter((x) => x.staleness === "ACTIVE").length, insufficient: out.filter((x) => x.staleness === "INSUFFICIENT").length }) });
}

const FEATURE_FLAG_STALENESS_CONTRACT = Object.freeze({
  id: "V124-FEATURE-FLAG-STALENESS-AUDIT",
  source: "SÉRIE 23/W10 P5/P14 — feature-flag technical-debt / stale-flag retirement (GrowthBook 2026; LaunchDarkly)",
  staleness: STALENESS,
  reuses: Object.freeze(["state-transition.canonicalize (constant-across-window detection)", "mirrors p8-deprecation-window announce-before-remove discipline", "data source: vnext/activation + ollama-control-plane flag registries"]),
  notAuthority: "emits a staleness/retirement verdict; it archives and removes nothing (owner/canonical action)",
  invariants: Object.freeze([
    "ACTIVE ⇔ observed evaluations VARY across the window; constant TRUE ⇒ FULLY_ROLLED_OUT; constant FALSE ⇒ DEAD",
    "a window below minWindow or missing observations ⇒ INSUFFICIENT — never auto-retire (fail-closed)",
    "REMOVE-eligible ONLY if provably stale across a sufficient window AND removal pre-announced (deprecated) AND not still referenced (deny-by-default)",
    "pure/deterministic: the window is a caller-supplied observation count; no clock, no random, no network",
  ]),
});

module.exports = { constantValue, audit, FEATURE_FLAG_STALENESS_CONTRACT };

if (require.main === module) {
  const demo = audit({ flags: [
    { name: "new-ui", observations: [true, false, true, true, false] },
    { name: "legacy-path", observations: [true, true, true, true, true], deprecated: true, stillReferenced: false },
  ], minWindow: 5 });
  process.stdout.write(JSON.stringify({ ...FEATURE_FLAG_STALENESS_CONTRACT, demo: demo.summary }, null, 2) + "\n");
}

export {};
