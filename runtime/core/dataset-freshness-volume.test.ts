#!/usr/bin/env node
"use strict";
const assert = require("assert");
const D = require("./dataset-freshness-volume");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 21 — DATASET FRESHNESS + VOLUME (5-pillar completion)");

// FRESHNESS: fresh within SLA; stale beyond SLA; future timestamp; missing ⇒ fail-closed.
{
  check(D.assessFreshness({ asOf: 1000, lastUpdatedAt: 990, maxStalenessMs: 50 }).fresh === true, "10ms old < 50ms SLA ⇒ fresh");
  const stale = D.assessFreshness({ asOf: 1000, lastUpdatedAt: 900, maxStalenessMs: 50 });
  check(stale.fresh === false && stale.findings.some((f: any) => f.id === "freshness:stale"), "100ms old > 50ms SLA ⇒ STALE finding");
  check(D.assessFreshness({ asOf: 1000, lastUpdatedAt: 1100, maxStalenessMs: 50 }).findings.some((f: any) => f.id === "freshness:future-timestamp"), "future lastUpdatedAt ⇒ finding");
  check(D.assessFreshness({ asOf: 1000 }).fresh === false, "missing lastUpdatedAt ⇒ fail-closed (not fresh)");
}

// VOLUME: within range; drop; spike; empty; missing baseline ⇒ fail-closed.
{
  check(D.assessVolume({ rowCount: 100, baseline: 100 }).ok === true, "rowCount == baseline ⇒ ok");
  check(D.assessVolume({ rowCount: 40, baseline: 100, maxDropPct: 50 }).findings.some((f: any) => f.id === "volume:drop"), "60% drop > 50% threshold ⇒ volume:drop");
  check(D.assessVolume({ rowCount: 400, baseline: 100, maxSpikePct: 200 }).findings.some((f: any) => f.id === "volume:spike"), "300% spike > 200% threshold ⇒ volume:spike");
  check(D.assessVolume({ rowCount: 0, baseline: 100 }).findings.some((f: any) => f.id === "volume:empty"), "0 rows ⇒ volume:empty HIGH");
  check(D.assessVolume({ rowCount: 100 }).ok === false, "missing baseline ⇒ fail-closed (not ok)");
}

// combined assess: a clean dataset passes; a stale+dropped one is not clean.
{
  check(D.assess({ asOf: 1000, lastUpdatedAt: 990, maxStalenessMs: 50, rowCount: 100, baseline: 100 }).clean === true, "fresh + in-range volume ⇒ clean");
  const bad = D.assess({ asOf: 1000, lastUpdatedAt: 900, maxStalenessMs: 50, rowCount: 10, baseline: 100, maxDropPct: 50 });
  check(bad.clean === false && bad.findings.length >= 2, "stale + dropped ⇒ not clean, multiple findings");
}

// 5-pillar completion: freshness + volume are now covered by THIS module (sibling to the inline registry).
{
  const A = require("./dataset-quality-assertions");
  const fresh = A.ASSERTION_TYPES.find((a: any) => a.name === "freshness");
  const vol = A.ASSERTION_TYPES.find((a: any) => a.name === "volume");
  // the inline registry stays honestly NOT_YET_IMPLEMENTED (scoped to its own assertions) but points to this module.
  check(/dataset-freshness-volume/.test(fresh.description) && /dataset-freshness-volume/.test(vol.description), "inline registry points to this module for freshness + volume (honest cross-reference)");
  check(D.assessFreshness({ asOf: 1000, lastUpdatedAt: 990, maxStalenessMs: 50 }).fresh === true && D.assessVolume({ rowCount: 100, baseline: 100 }).ok === true, "this module actually implements freshness + volume (the 2 missing pillars)");
}

check(D.DATASET_FRESHNESS_VOLUME_CONTRACT.invariants.some((i: any) => /no clock/.test(i)), "contract: pure, timestamps as inputs (no clock)");

console.log(failures === 0 ? "ALL PASS — SÉRIE 21 DATASET FRESHNESS + VOLUME" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
