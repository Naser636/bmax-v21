#!/usr/bin/env node
"use strict";
/*
 * CAPABILITY MATURITY LADDER (V324 Global-Restoration §9). PURE, deterministic, fail-closed. Makes the integration
 * standard EXECUTABLE: a capability's honest maturity is the HIGHEST rung for which every lower rung also has evidence
 * — it CANNOT be promoted past its first missing rung. This prevents overclaim ("code exists / unit test passes" is
 * NOT "operational").
 *
 * Ladder (monotonic, §9):
 *   BUILT → TESTED → CONNECTED → FED → INVOKED → EXECUTED → CONSUMED → EVIDENCED → INTEGRATED → DEMONSTRATED
 *     BUILT       implementation exists
 *     TESTED      relevant behaviour verified
 *     CONNECTED   wired to its real consumer
 *     FED         meaningful (non-empty, real/realistic) inputs reach it
 *     INVOKED     the real execution path calls it
 *     EXECUTED    its intended action actually occurs (N/A for planning/analysis-only capabilities — see §4D)
 *     CONSUMED    downstream logic uses its result
 *     EVIDENCED   actual behaviour + provenance are traceable
 *     INTEGRATED  the complete intended workflow works
 *     DEMONSTRATED end-to-end behaviour shown with valid evidence
 *
 * Honesty: this classifier ENFORCES the ladder; the evidence booleans it is GIVEN must themselves be truthful (e.g. a
 * read-only dashboard view is NOT "INVOKED by the execution path" and NOT "EXECUTED"). A planning/analysis-only
 * capability (executionApplicable:false) legitimately skips EXECUTED — its boundary is planning (§4D) — but still
 * needs its result CONSUMED by the appropriate next stage to climb higher. No network/clock/randomness.
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const LADDER = Object.freeze(["BUILT", "TESTED", "CONNECTED", "FED", "INVOKED", "EXECUTED", "CONSUMED", "EVIDENCED", "INTEGRATED", "DEMONSTRATED"]);
// evidence key per rung (EXECUTED handled specially for planning-only capabilities).
const RUNG_KEY: Record<string, string> = { BUILT: "built", TESTED: "tested", CONNECTED: "connected", FED: "fed", INVOKED: "invoked", EXECUTED: "executed", CONSUMED: "consumed", EVIDENCED: "evidenced", INTEGRATED: "integrated", DEMONSTRATED: "demonstrated" };

function rungSatisfied(rung: string, ev: any): boolean {
  if (rung === "EXECUTED") return ev.executionApplicable === false ? true : ev.executed === true; // planning-only skips EXECUTED
  return ev[RUNG_KEY[rung]] === true;
}

/**
 * classifyMaturity(evidence) -> { ok, level, levelIndex, firstGap, executionApplicable, satisfied, note }.
 *   evidence: booleans per rung { built, tested, connected, fed, invoked, executed, consumed, evidenced, integrated,
 *   demonstrated } + optional executionApplicable (default true). The level is the highest rung with ALL lower rungs
 *   satisfied; the first unsatisfied rung is the gap. Fail-closed: a non-object ⇒ typed refusal.
 */
function classifyMaturity(evidence: any): any {
  if (!isObj(evidence)) return freeze({ ok: false, code: "BAD_EVIDENCE", detail: "evidence must be an object of per-rung booleans" });
  const executionApplicable = evidence.executionApplicable !== false;
  const satisfied: Record<string, boolean> = {};
  let levelIndex = -1;
  let firstGap: string | null = null;
  let stillConsecutive = true;
  for (let i = 0; i < LADDER.length; i++) {
    const ok = rungSatisfied(LADDER[i], evidence);
    satisfied[LADDER[i]] = ok;
    if (stillConsecutive) {
      if (ok) levelIndex = i;
      else { stillConsecutive = false; firstGap = LADDER[i]; }
    }
  }
  return freeze({
    ok: true,
    level: levelIndex >= 0 ? LADDER[levelIndex] : "NONE",
    levelIndex,
    firstGap,
    executionApplicable,
    satisfied: freeze(satisfied),
    note: "maturity = the highest rung with EVERY lower rung satisfied; a capability is NEVER promoted past its first missing rung (code existing / a passing unit test is NOT 'operational'). A planning/analysis-only capability skips EXECUTED but must still be CONSUMED by the appropriate next stage to climb. The evidence booleans must be truthful — a read-only view is not INVOKED-by-execution.",
  });
}

/**
 * aggregateMaturity(capabilities) -> { ok, total, byLevel, atOrBelow, items, note }.
 * capabilities: [{ name, ...evidence }]. Each is classified; byLevel counts per level; atOrBelow flags how many have
 * NOT reached INTEGRATED/DEMONSTRATED (the honest "not yet operational end-to-end" count). NO blended score.
 */
function aggregateMaturity(capabilities: any): any {
  if (!Array.isArray(capabilities)) return freeze({ ok: false, code: "BAD_INPUT", detail: "capabilities must be an array" });
  const byLevel: Record<string, number> = {};
  for (const l of LADDER) byLevel[l] = 0; byLevel["NONE"] = 0;
  const items = capabilities.map((c: any) => {
    const m = classifyMaturity(c || {});
    const name = c && typeof c.name === "string" ? c.name : null;
    const level = m.ok ? m.level : "NONE";
    byLevel[level] = (byLevel[level] || 0) + 1;
    return freeze({ name, level, levelIndex: m.ok ? m.levelIndex : -1, firstGap: m.ok ? m.firstGap : "BUILT" });
  });
  const demonstratedIdx = LADDER.indexOf("DEMONSTRATED");
  const integratedIdx = LADDER.indexOf("INTEGRATED");
  const notYetIntegrated = items.filter((i: any) => i.levelIndex < integratedIdx).length;
  const demonstrated = items.filter((i: any) => i.levelIndex === demonstratedIdx).length;
  return freeze({
    ok: true,
    total: items.length,
    byLevel: freeze(byLevel),
    notYetIntegrated,
    demonstrated,
    items: freeze(items),
    note: "per-capability maturity over the §9 ladder; NO blended score. notYetIntegrated = capabilities below INTEGRATED (honestly NOT operational end-to-end). A capability is only as mature as its weakest connected link.",
  });
}

const CAPABILITY_MATURITY_CONTRACT = Object.freeze({
  id: "CAPABILITY-MATURITY-LADDER",
  purpose: "make V324 §9 executable — classify a capability's honest maturity on the BUILT→DEMONSTRATED integration ladder, enforcing that it is never promoted past its first missing rung (prevents 'code exists / unit test passes' being counted as operational)",
  reuses: Object.freeze(["distinct from odg-metier-campaign's ABSENT→OPERATIONAL (métier qualification) and odg-iso27001-crosswalk's DOCUMENTED→CERTIFIED (ISO) ladders — this is the integration-lifecycle ladder (§9)"]),
  invariants: Object.freeze([
    "monotonic: the level is the highest rung with EVERY lower rung satisfied — a capability is NEVER promoted past its first missing rung (firstGap)",
    "BUILT/passing-unit-test is NOT operational: CONNECTED/FED/INVOKED/EXECUTED/CONSUMED/INTEGRATED/DEMONSTRATED each need their own evidence",
    "a planning/analysis-only capability (executionApplicable:false) skips EXECUTED (preserves its boundary, §4D) but must still be CONSUMED by the appropriate next stage to climb",
    "the classifier enforces the ladder; the supplied evidence booleans must be truthful (a read-only dashboard view is NOT INVOKED-by-execution nor EXECUTED)",
    "fail-closed on a non-object evidence / non-array capability set; NO blended score; PURE/deterministic/frozen",
  ]),
});

module.exports = { classifyMaturity, aggregateMaturity, LADDER, CAPABILITY_MATURITY_CONTRACT };
export {};
