#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves dora-metrics (G-06): a denominator-explicit DORA four-key read-model
// over a campaign transition stream — honest null-with-reason where unobservable (deploymentFrequency null
// unless explicit deployments[]; lead-time/MTTR null without `t` stamps; change-failure-rate null when its
// denominator is 0), never fabricating an unmeasured key; deployment frequency is NEVER inferred from mission
// completions. Pure/deterministic.
"use strict";
const assert = require("assert");
const D = require("./dora-metrics.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) change-failure-rate from counts only (no stamps needed); denominator explicit.
{
  const r = D.fourKeys({ transitions: [{ lot: "a", event: "COMPLETED" }, { lot: "b", event: "FAILED" }, { lot: "c", event: "COMPLETED" }] });
  const cfr = r.keys.changeFailureRate;
  ok("CFR = 1 failed / 3 outcomes = 0.333, denominator 3, observed", cfr.observed && cfr.value === 0.333 && cfr.denominator === 3 && cfr.failed === 1 && cfr.completed === 2);
}

// (2) CFR denominator 0 (only WAITING/RETRY) ⇒ observed:false, value null, reason (survivorship-safe).
{
  const r = D.fourKeys({ transitions: [{ lot: "a", event: "RUNNING" }, { lot: "a", event: "WAITING_FOR_CI" }, { lot: "b", event: "RETRY_WAIT" }] });
  ok("no terminal change outcomes ⇒ CFR null + reason (WAITING/RETRY excluded)", r.keys.changeFailureRate.observed === false && r.keys.changeFailureRate.value === null);
}

// (3) HONESTY: deploymentFrequency is NEVER inferred from COMPLETED missions.
{
  const r = D.fourKeys({ transitions: [{ lot: "a", event: "RUNNING" }, { lot: "a", event: "COMPLETED" }] });
  ok("completions alone ⇒ deploymentFrequency observed:false, null, reason (pre-deployment, not fabricated)",
     r.keys.deploymentFrequency.observed === false && r.keys.deploymentFrequency.value === null && /NOT a production deployment/.test(r.keys.deploymentFrequency.reason));
}

// (4) deploymentFrequency observed ONLY from explicit deployments[].
{
  const r = D.fourKeys({ transitions: [], deployments: [{ t: 1 }, { t: 2 }], startedAt: 0, endedAt: 1000 });
  ok("explicit deployments[] ⇒ observed, value 2, window recorded", r.keys.deploymentFrequency.observed === true && r.keys.deploymentFrequency.value === 2 && r.keys.deploymentFrequency.windowMs === 1000);
}

// (5) lead-time: null without `t` stamps; computed (proxy) with stamps; denominator explicit.
{
  const noT = D.fourKeys({ transitions: [{ lot: "a", event: "RUNNING" }, { lot: "a", event: "COMPLETED" }] });
  ok("no timestamps ⇒ leadTime observed:false + 'no timestamp' reason", noT.keys.leadTimeForChanges.observed === false && /no timestamp|without an injected clock/.test(noT.keys.leadTimeForChanges.reason));
  const withT = D.fourKeys({ transitions: [{ lot: "a", event: "RUNNING", t: 0 }, { lot: "a", event: "COMPLETED", t: 100 }, { lot: "b", event: "RUNNING", t: 100 }, { lot: "b", event: "COMPLETED", t: 300 }] });
  ok("with timestamps ⇒ leadTime observed, mean 150, denominator 2, labelled a proxy", withT.keys.leadTimeForChanges.observed && withT.keys.leadTimeForChanges.value === 150 && withT.keys.leadTimeForChanges.denominator === 2 && /proxy/.test(withT.keys.leadTimeForChanges.basis));
}

// (6) time-to-restore: FAILED → next same-lot COMPLETED, only with stamps; else null.
{
  const r = D.fourKeys({ transitions: [{ lot: "b", event: "RUNNING", t: 0 }, { lot: "b", event: "FAILED", t: 50 }, { lot: "b", event: "RUNNING", t: 60 }, { lot: "b", event: "COMPLETED", t: 90 }] });
  ok("stamped failure→restore ⇒ MTTR observed, value 40 (90-50), denominator 1", r.keys.timeToRestore.observed && r.keys.timeToRestore.value === 40 && r.keys.timeToRestore.denominator === 1);
  const none = D.fourKeys({ transitions: [{ lot: "a", event: "COMPLETED", t: 1 }] });
  ok("no failures ⇒ MTTR observed:false + 'no failures' reason (not fabricated)", none.keys.timeToRestore.observed === false && /no failures/.test(none.keys.timeToRestore.reason));
}

// (7) observedCount + note reflect how many keys are genuinely observable.
{
  const full = D.fourKeys({ transitions: [{ lot: "a", event: "RUNNING", t: 0 }, { lot: "a", event: "FAILED", t: 10 }, { lot: "a", event: "RUNNING", t: 20 }, { lot: "a", event: "COMPLETED", t: 50 }], deployments: [{ t: 1 }] });
  ok("all 4 keys observable ⇒ observedCount 4", full.observedCount === 4);
  const partial = D.fourKeys({ transitions: [{ lot: "a", event: "COMPLETED" }, { lot: "b", event: "FAILED" }] });
  ok("counts-only run ⇒ only CFR observed (1/4), note explains the rest are null", partial.observedCount === 1 && /never fabricate/.test(partial.note));
}

// (8) fail-soft: malformed/empty run never throws.
{
  ok("empty run ⇒ ok, 0 observed, no throw", D.fourKeys({}).ok === true && D.fourKeys({}).observedCount === 0);
  ok("garbage transitions ⇒ fail-soft (no throw)", (() => { try { const r = D.fourKeys({ transitions: [null, 7, { event: "RUNNING" }] }); return r.ok === true; } catch { return false; } })());
  // null / non-object run ⇒ literal fail-soft (validator-flagged: default param guarded only undefined).
  ok("null run ⇒ ok, 0 observed, no throw (literal fail-soft)", (() => { try { const r = D.fourKeys(null); return r.ok === true && r.observedCount === 0; } catch { return false; } })());
  ok("non-object run ('x') ⇒ ok, no throw", (() => { try { return D.fourKeys("x").ok === true; } catch { return false; } })());
}

console.log(`\ndora-metrics: ${pass} assertions passed`);
