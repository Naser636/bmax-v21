#!/usr/bin/env node
"use strict";

/*
 * IMPROVEMENT BASELINE (§V S4) — TypeScript port; parity with runtime/core/improvement-baseline.js.
 *
 * Capture a baseline of REAL repo signals and measure a before→after delta, so the learning-chain's
 * EFFECTIVE state (§V S2) rests on a GROUNDED measurement, never a bare claim. INVENTS no metric and builds
 * no new collector: it COMPOSES existing signal sources via INJECTED collectors (defaults wire the
 * migration-campaign inventory counts, the incident-recurrence summary, and capability-metrics stats).
 *
 * Pure core: captureBaseline/measureDelta are deterministic functions of their inputs. The only I/O is in the
 * DEFAULT collectors, each fail-closed (a throw ⇒ null signal), and fully overridable for hermetic tests.
 * Strict TS port: public exports (MODEL, captureBaseline, measureDelta, directionOf, defaultCollectors,
 * DEFAULT_SENSE), signal naming, sense rules, metric/summary shapes are preserved EXACTLY vs the .js.
 */

function isPlainObject(v: unknown): v is Record<string, any> { return v !== null && typeof v === "object" && !Array.isArray(v); }

const MODEL = "improvement-baseline/1";

export interface Baseline { model: string; signals: Record<string, any>; }

// captureBaseline(collectors) — call each injected collector defensively; a throw/absent ⇒ null signal
// (honest "unmeasured", never a fabricated 0). Returns { model, signals: { [name]: value } }.
function captureBaseline(collectors: any): Baseline {
  const signals: Record<string, any> = {};
  const cs = isPlainObject(collectors) ? collectors : {};
  for (const name of Object.keys(cs)) {
    const fn = cs[name];
    try { signals[name] = typeof fn === "function" ? fn() : (fn === undefined ? null : fn); }
    catch { signals[name] = null; }
  }
  return { model: MODEL, signals };
}

// Per-signal sense: which direction is an IMPROVEMENT. "higher" vs "lower" (debt). Unknown ⇒ "higher".
function directionOf(name: string, delta: number, senseMap: any): string {
  if (delta === 0) return "flat";
  const sense = (isPlainObject(senseMap) && senseMap[name]) || "higher";
  const up = delta > 0;
  if (sense === "lower") return up ? "regressed" : "improved";
  return up ? "improved" : "regressed"; // higher-is-better
}

export interface DeltaResult {
  metrics: Record<string, any>;
  summary: { total: number; improved: number; regressed: number; flat: number; unmeasured: number };
}

// measureDelta(before, after, senseMap) — compare two baselines signal-by-signal. Numeric signals get a
// delta + direction; non-numeric get a changed flag; a signal null on either side is "unmeasured".
function measureDelta(before: any, after: any, senseMap?: any): DeltaResult {
  const b: Record<string, any> = isPlainObject(before) && isPlainObject(before.signals) ? before.signals : (isPlainObject(before) ? before : {});
  const a: Record<string, any> = isPlainObject(after) && isPlainObject(after.signals) ? after.signals : (isPlainObject(after) ? after : {});
  const names = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  const metrics: Record<string, any> = {};
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
//
// DEPENDENCY INVERSION (V70, closure-clean): the inventory source (migration-campaign) lives in the
// src/runtime DEV tooling, OUTSIDE this runtime/core module's dist closure. A hardcoded cross-tree
// `require("../../src/runtime/migration-campaign")` makes the compiled dist/core module non-self-contained
// (build-dist-closure rejects the out-of-tree require) AND resolves to the WRONG path from dist/core anyway.
// So the inventory source is now INJECTED by the caller (see src/runtime/learning-review-cli.ts); with no
// injected `inventory`, the inventory-derived signals are honestly `null` (unmeasured), never fabricated.
// The recurrence source is a runtime/core SIBLING (co-located in dist) and stays a fail-closed default.
function defaultCollectors(deps?: any): Record<string, () => any> {
  const d = isPlainObject(deps) ? deps : {};
  const noInventory = () => null;
  return {
    dualPorts: () => { const inv: any = (d.inventory || noInventory)(); return inv && Number.isFinite(inv.counts ? inv.counts.coreDual : inv.coreDual) ? (inv.counts ? inv.counts.coreDual : inv.coreDual) : null; },
    jsRemaining: () => { const inv: any = (d.inventory || noInventory)(); return inv && (inv.counts || inv) ? (inv.counts ? inv.counts.coreJs : inv.coreJs) : null; },
    hazardBlocked: () => { const inv: any = (d.inventory || noInventory)(); return inv && (inv.counts || inv) ? (inv.counts ? inv.counts.blocked : inv.blocked) : null; },
    recurringIncidents: () => { const rec: any = (d.recurrence || (() => require("./incident-recurrence").loadRecurrence({})))(); return rec && rec.summary ? rec.summary.recurring : null; },
    frozenIncidents: () => { const rec: any = (d.recurrence || (() => require("./incident-recurrence").loadRecurrence({})))(); return rec && rec.summary ? rec.summary.frozen : null; },
  };
}

// Which signals are DEBT (lower is better). Everything else is higher-is-better.
const DEFAULT_SENSE = Object.freeze({ jsRemaining: "lower", hazardBlocked: "lower", recurringIncidents: "lower", frozenIncidents: "lower" });

export { MODEL, captureBaseline, measureDelta, directionOf, defaultCollectors, DEFAULT_SENSE };
module.exports = { MODEL, captureBaseline, measureDelta, directionOf, defaultCollectors, DEFAULT_SENSE };

// Read-only CLI: capture + print the current real-signal baseline; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify(captureBaseline(defaultCollectors({})), null, 2) + "\n");
}
