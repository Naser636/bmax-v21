#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./p7-burn-rate-alert");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 13 P7 — MULTI-WINDOW BURN-RATE ALERT");

// burnRate: 2% error vs 99.9% SLO (0.1% budget) ⇒ 20× burn.
{
  check(P.burnRate(0.02, 0.999) === 20, "2% error at 99.9% SLO ⇒ 20× burn");
  check(P.burnRate(0.001, 0.999) === 1, "0.1% error ⇒ exactly 1× (at budget)");
  check(P.burnRate(0.05, 1.0) === Infinity, "zero budget (100% SLO) ⇒ Infinity burn (fail-closed)");
}

// multi-window: a PAGE fires only when BOTH windows exceed the threshold.
{
  const both = P.evaluateAlert({ slo: 0.999, longErrorRate: 0.02, shortErrorRate: 0.02, burnThreshold: 14.4 });
  check(both.fire === true && both.severity === "PAGE", "both windows over threshold ⇒ PAGE");
  const onlyLong = P.evaluateAlert({ slo: 0.999, longErrorRate: 0.02, shortErrorRate: 0.0005, burnThreshold: 14.4 });
  check(onlyLong.fire === false, "only the long window over threshold ⇒ NO page (multi-window reduces false alarms)");
  const onlyShort = P.evaluateAlert({ slo: 0.999, longErrorRate: 0.0005, shortErrorRate: 0.02, burnThreshold: 14.4 });
  check(onlyShort.fire === false, "only the short window over threshold ⇒ NO page (needs sustained burn)");
}

// classify: higher sustained burn ⇒ PAGE severity; low burn ⇒ OK.
{
  check(P.classify({ slo: 0.999, errorRate: 0.02 }).severity === "PAGE", "20× burn ⇒ PAGE tier");
  check(P.classify({ slo: 0.999, errorRate: 0.0001 }).severity === "OK", "0.1× burn ⇒ OK (within budget)");
  check(P.classify({ slo: 0.999, errorRate: 0.004 }).severity === "TICKET", "4× burn ⇒ TICKET tier (3× exceeded, not 6×)");
}

check(P.P7_BURN_RATE_CONTRACT.invariants.some((i: any) => /BOTH the long and short windows/.test(i)), "contract documents multi-window fail-closed");

console.log(failures === 0 ? "ALL PASS — SÉRIE 13 P7 BURN-RATE ALERT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
