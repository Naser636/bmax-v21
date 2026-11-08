#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-8 (P6 eval / P1 SWE — world-research gap) — FLAKY-TEST ROOT-CAUSE CLASSIFIER. PURE, deterministic.
 * World reference: the iDFlakies taxonomy (Lam et al. ICST'19) + GMU 2026 reproducible-flaky-test work + JS-TOD
 * (arXiv 2509.00466 2026) split flaky tests into ORDER-DEPENDENT (OD — stable within each fixed order, differs across
 * orders / isolation) vs NON-ORDER-DEPENDENT / NON-DETERMINISTIC (NOD — varies within a single fixed order) by
 * rerunning in different orders and in isolation; the remediation differs entirely (OD ⇒ fix shared state/coupling;
 * NOD ⇒ fix timing/randomness). ODG's p2-passk-reliability DETECTS flakiness (pass^1 ≠ pass^k) but assigns NO cause —
 * it sees one undifferentiated rollout stream, never run configuration (grep-verified: no orderDependent / flaky-cause
 * / isolation classifier). This composes p2-passk-reliability.passAtK (reused per configuration bucket to get
 * stability) and adds only the cross-configuration DIFFERENTIAL. It executes nothing. Fail-closed ⇒ UNCLASSIFIED. Dual export.
 */

const PASSK = require("./p2-passk-reliability");       // passAtK — reused per bucket for "all-pass / all-fail / mixed"

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const CAUSE = Object.freeze(["DETERMINISTIC", "ORDER_DEPENDENT", "NON_DETERMINISTIC", "UNCLASSIFIED"]);

/** stabilityOf(bucket) -> "PASS" | "FAIL" | "MIXED" | null, via passAtK (all k pass / none pass / varies). */
function stabilityOf(bucket: any): string | null {
  const rs = arr(bucket).filter((x) => typeof x === "boolean");
  if (rs.length === 0) return null;
  const r = PASSK.passAtK({ t: rs });
  if (r.passAt1 === 0) return "FAIL";          // none passed
  if (r.passAtK === 1) return "PASS";          // all passed
  return "MIXED";                               // passes sometimes, not always (flaky within this fixed config)
}

/**
 * classifyFlakiness({ testId, sameOrder, altOrders, isolated }) -> { testId, cause, reasons, evidence }.
 *   sameOrder: bool[] (reruns in the default order); altOrders: { [orderId]: bool[] }; isolated: bool[] (reruns alone).
 * Fail-closed: no data / insufficient configuration to separate OD vs NOD ⇒ UNCLASSIFIED (treated as NOT clean).
 */
function classifyFlakiness(input: any): any {
  const o = isObj(input) ? input : {};
  const testId = typeof o.testId === "string" ? o.testId : null;
  const fixedBuckets: Array<string | null> = [stabilityOf(o.sameOrder)];
  const altOrders = isObj(o.altOrders) ? o.altOrders : {};
  for (const k of Object.keys(altOrders)) fixedBuckets.push(stabilityOf(altOrders[k]));
  const fixed = fixedBuckets.filter((s): s is string => s !== null);
  const isoStab = stabilityOf(o.isolated);
  const numConfigs = fixed.length + (isoStab !== null ? 1 : 0);
  const reasons: string[] = [];

  if (fixed.length === 0 && isoStab === null) return gate(testId, "UNCLASSIFIED", ["no rollout data in any configuration (fail-closed)"], { fixed, isoStab });

  // NON_DETERMINISTIC: varies WITHIN a single fixed configuration (order held constant, outcome still varies).
  if (fixed.includes("MIXED") || isoStab === "MIXED") { reasons.push("outcome varies within a fixed order/isolation ⇒ non-deterministic (timing/randomness)"); return gate(testId, "NON_DETERMINISTIC", reasons, { fixed, isoStab }); }

  // all configurations are now STABLE (PASS or FAIL).
  const stableSet = Array.from(new Set(fixed));
  // ORDER_DEPENDENT: different stable outcomes across different orders.
  if (stableSet.length >= 2) { reasons.push("stable within each order but outcome differs ACROSS orders ⇒ order-dependent"); return gate(testId, "ORDER_DEPENDENT", reasons, { fixed, isoStab }); }
  // ORDER_DEPENDENT via isolation: isolated run disagrees with the (single) suite outcome ⇒ shared-state pollution / victim.
  if (isoStab !== null && stableSet.length === 1 && isoStab !== stableSet[0]) { reasons.push(`isolated run (${isoStab}) disagrees with the suite outcome (${stableSet[0]}) ⇒ order-dependent (shared-state pollution / victim)`); return gate(testId, "ORDER_DEPENDENT", reasons, { fixed, isoStab }); }
  // DETERMINISTIC: stable and consistent across every observed configuration.
  if (stableSet.length === 1 && (isoStab === null || isoStab === stableSet[0])) { reasons.push(`consistent ${stableSet[0]} across ${numConfigs} configuration(s)`); return gate(testId, "DETERMINISTIC", reasons, { fixed, isoStab }); }
  return gate(testId, "UNCLASSIFIED", ["insufficient configuration evidence to separate order-dependence from non-determinism (fail-closed)"], { fixed, isoStab });
}

function gate(testId: any, cause: string, reasons: string[], evidence: any): any {
  return Object.freeze({ testId, cause, clean: cause === "DETERMINISTIC", reasons: Object.freeze(reasons), evidence: Object.freeze({ fixedOrderStabilities: Object.freeze(evidence.fixed), isolatedStability: evidence.isoStab }) });
}

const P2_FLAKY_ROOT_CAUSE_CONTRACT = Object.freeze({
  id: "V124-P2-FLAKY-ROOT-CAUSE",
  source: "SÉRIE 23/W8 P6/P1 — flaky-test root-cause OD vs NOD (iDFlakies ICST'19; GMU 2026; JS-TOD arXiv 2509.00466 2026)",
  causes: CAUSE,
  reuses: Object.freeze(["p2-passk-reliability.passAtK (per-configuration stability) — adds only the cross-configuration differential"]),
  notAuthority: "an observational classifier over supplied rollout matrices; it executes no test and reruns nothing",
  invariants: Object.freeze([
    "NON_DETERMINISTIC ⇔ the outcome varies WITHIN a single fixed order/isolation (timing/randomness)",
    "ORDER_DEPENDENT ⇔ stable within each order but the outcome differs ACROSS orders, OR the isolated run disagrees with the suite (shared-state pollution)",
    "DETERMINISTIC ⇔ stable and consistent across every observed configuration",
    "fail-closed: no data, or insufficient configuration to separate OD from NOD ⇒ UNCLASSIFIED (never a fabricated cause, never silently clean)",
    "pure/deterministic: operates on boolean rollout matrices only; no clock, no random, no spawn",
  ]),
});

module.exports = { stabilityOf, classifyFlakiness, P2_FLAKY_ROOT_CAUSE_CONTRACT };

if (require.main === module) {
  const od = classifyFlakiness({ testId: "t1", sameOrder: [true, true], altOrders: { B: [false, false] }, isolated: [true, true] });
  const nod = classifyFlakiness({ testId: "t2", sameOrder: [true, false, true], isolated: [true, false] });
  process.stdout.write(JSON.stringify({ ...P2_FLAKY_ROOT_CAUSE_CONTRACT, demo: { t1: od.cause, t2: nod.cause } }, null, 2) + "\n");
}

export {};
