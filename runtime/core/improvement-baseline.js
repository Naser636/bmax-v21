#!/usr/bin/env node
"use strict";

/*
 * IMPROVEMENT BASELINE (§V S4) — capture a baseline of REAL repo signals and measure a before→after delta,
 * so the learning-chain's EFFECTIVE state (§V S2) rests on a GROUNDED measurement, never a bare claim.
 *
 * It INVENTS no metric and builds no new collector: it COMPOSES existing signal sources via INJECTED
 * collectors (defaults wire the migration-campaign inventory counts, the incident-recurrence summary, and
 * capability-metrics stats). captureBaseline() snapshots them; measureDelta(before, after, senseMap) scores
 * each numeric signal as improved / regressed / flat under a per-signal sense (higher-is-better by default,
 * lower-is-better for debt signals like js-remaining / hazard-blocked / recurring-incidents).
 *
 * Pure core: captureBaseline/measureDelta are deterministic functions of their inputs. The only I/O is in the
 * DEFAULT collectors, each fail-closed (a throw ⇒ null signal), and fully overridable for hermetic tests.
 */

function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

const MODEL = "improvement-baseline/1";

// captureBaseline(collectors) — call each injected collector defensively; a throw/absent ⇒ null signal
// (honest "unmeasured", never a fabricated 0). Returns { model, signals: { [name]: value } }.
function captureBaseline(collectors) {
  const signals = {};
  const cs = isPlainObject(collectors) ? collectors : {};
  for (const name of Object.keys(cs)) {
    const fn = cs[name];
    try { signals[name] = typeof fn === "function" ? fn() : (fn === undefined ? null : fn); }
    catch { signals[name] = null; }
  }
  return { model: MODEL, signals };
}

// Per-signal sense: which direction is an IMPROVEMENT. "higher" (e.g. dual-ports, pass-rate) vs "lower"
// (debt: js-remaining, hazard-blocked, recurring/frozen incidents). Unknown signals default to "higher".
function directionOf(name, delta, senseMap) {
  if (delta === 0) return "flat";
  const sense = (isPlainObject(senseMap) && senseMap[name]) || "higher";
  const up = delta > 0;
  if (sense === "lower") return up ? "regressed" : "improved";
  return up ? "improved" : "regressed"; // higher-is-better
}

// measureDelta(before, after, senseMap) — compare two baselines signal-by-signal. Numeric signals get a
// delta + direction; non-numeric get a changed flag; a signal null on either side is "unmeasured".
function measureDelta(before, after, senseMap) {
  const b = isPlainObject(before) && isPlainObject(before.signals) ? before.signals : (isPlainObject(before) ? before : {});
  const a = isPlainObject(after) && isPlainObject(after.signals) ? after.signals : (isPlainObject(after) ? after : {});
  const names = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  const metrics = {};
  let improved = 0, regressed = 0, flat = 0, unmeasured = 0;
  for (const name of names) {
    const bv = b[name], av = a[name];
    if (typeof bv === "number" && typeof av === "number") {
      const delta = av - bv;
      const direction = directionOf(name, delta, senseMap);
      metrics[name] = { before: bv, after: av, delta, direction };
      if (direction === "improved") improved++; else if (direction === "regressed") regressed++; else flat++;
    } else if (bv == null || av == null) {
      metrics[name] = { before: bv == null ? null : bv, after: av == null ? null : av, direction: "unmeasured" };
      unmeasured++;
    } else {
      const changed = JSON.stringify(bv) !== JSON.stringify(av);
      metrics[name] = { before: bv, after: av, changed, direction: changed ? "changed" : "flat" };
      if (changed) improved++; else flat++;
    }
  }
  return { metrics, summary: { total: names.length, improved, regressed, flat, unmeasured } };
}

// DEFAULT collectors — compose EXISTING signal sources (all injectable/fail-closed). Returns a map of
// name → () => value. Debt signals (lower-is-better) are listed in DEFAULT_SENSE below.
function defaultCollectors(deps) {
  const d = isPlainObject(deps) ? deps : {};
  return {
    dualPorts: () => { const inv = (d.inventory || (() => require("../../src/runtime/migration-campaign").inventory(process.cwd())))(); return inv && Number.isFinite(inv.counts ? inv.counts.coreDual : inv.coreDual) ? (inv.counts ? inv.counts.coreDual : inv.coreDual) : null; },
    jsRemaining: () => { const inv = (d.inventory || (() => require("../../src/runtime/migration-campaign").inventory(process.cwd())))(); return inv && (inv.counts || inv) ? (inv.counts ? inv.counts.coreJs : inv.coreJs) : null; },
    hazardBlocked: () => { const inv = (d.inventory || (() => require("../../src/runtime/migration-campaign").inventory(process.cwd())))(); return inv && (inv.counts || inv) ? (inv.counts ? inv.counts.blocked : inv.blocked) : null; },
    recurringIncidents: () => { const rec = (d.recurrence || (() => require("./incident-recurrence").loadRecurrence({})))(); return rec && rec.summary ? rec.summary.recurring : null; },
    frozenIncidents: () => { const rec = (d.recurrence || (() => require("./incident-recurrence").loadRecurrence({})))(); return rec && rec.summary ? rec.summary.frozen : null; },
  };
}

// Which signals are DEBT (lower is better). Everything else is higher-is-better.
const DEFAULT_SENSE = Object.freeze({ jsRemaining: "lower", hazardBlocked: "lower", recurringIncidents: "lower", frozenIncidents: "lower" });

module.exports = { MODEL, captureBaseline, measureDelta, directionOf, defaultCollectors, DEFAULT_SENSE };

// Read-only CLI: capture + print the current real-signal baseline; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify(captureBaseline(defaultCollectors({})), null, 2) + "\n");
}
