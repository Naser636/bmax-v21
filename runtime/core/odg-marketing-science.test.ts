#!/usr/bin/env node
"use strict";
/* V319 Addendum §6.14 — tests for odg-marketing-science (descriptive attribution, incrementality+CI, evidence-gated allocation). PURE. */
const M = require("./odg-marketing-science.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const journeys = [
    { converted: true, touches: ["seo", "email", "ads"] },
    { converted: true, touches: ["ads", "ads", "email"] },
    { converted: false, touches: ["seo"] },
  ];
  // attribution: models differ, always non-causal
  const first = M.attribute(journeys, "first");
  const last = M.attribute(journeys, "last");
  const lin = M.attribute(journeys, "linear");
  check("attribute first/last/linear ok + DESCRIPTIVE_NOT_CAUSAL", first.ok && last.ok && lin.ok && first.verdict === "DESCRIPTIVE_NOT_CAUSAL" && last.verdict === "DESCRIPTIVE_NOT_CAUSAL");
  check("first-touch credits seo+ads (the two first touches of the 2 converters)", first.credit.seo === 1 && first.credit.ads === 1);
  check("last-touch credits ads+email", last.credit.ads === 1 && last.credit.email === 1);
  check("linear splits credit fractionally (sums to #converters=2)", Math.abs(Object.values(lin.credit).reduce((a: number, b: any) => a + b, 0) - 2) < 1e-9);
  check("only converting journeys credited (converting=2, the false one excluded)", first.converting === 2);
  check("bad model ⇒ BAD_MODEL", M.attribute(journeys, "magic").code === "BAD_MODEL");

  // incrementality: control REQUIRED
  check("no control ⇒ NO_CONTROL (no causal claim)", M.incrementality({ treated: { conversions: 50, n: 1000 } }).code === "NO_CONTROL");
  check("bad counts (conv>n) ⇒ BAD_COUNTS", M.incrementality({ treated: { conversions: 5, n: 2 }, control: { conversions: 1, n: 10 } }).code === "BAD_COUNTS");

  // clearly significant lift: 120/1000 vs 60/1000
  const sig = M.incrementality({ treated: { conversions: 120, n: 1000 }, control: { conversions: 60, n: 1000 } });
  check("significant lift ⇒ CI excludes 0, significant=true, CAUSAL_LIFT_DETECTED", sig.ok && sig.absoluteLiftRate === 0.06 && sig.significant === true && sig.ci95[0] > 0 && sig.verdict === "CAUSAL_LIFT_DETECTED");
  check("incrementality reports a CI + SE (not a bare point)", typeof sig.standardError === "number" && Array.isArray(sig.ci95) && sig.ci95.length === 2);
  // null effect: equal rates ⇒ CI includes 0 ⇒ not significant
  const nul = M.incrementality({ treated: { conversions: 50, n: 1000 }, control: { conversions: 50, n: 1000 } });
  check("equal rates ⇒ not significant (CI includes 0), NO_SIGNIFICANT_LIFT", nul.ok && nul.significant === false && nul.ci95[0] <= 0 && nul.ci95[1] >= 0 && nul.verdict === "NO_SIGNIFICANT_LIFT");

  // allocation: evidence-gated
  const alloc = M.allocationGuidance([
    { channel: "ads", incrementality: sig, cac: { incrementalMinor: 4000 }, maxAcceptableCacMinor: 5000 },   // proven + profitable ⇒ FUND
    { channel: "ads-expensive", incrementality: sig, cac: { incrementalMinor: 9000 }, maxAcceptableCacMinor: 5000 }, // proven but unprofitable ⇒ HOLD
    { channel: "email", incrementality: nul },                                                               // no significant lift ⇒ HOLD
    { channel: "billboard" },                                                                                // no evidence ⇒ UNMEASURED
  ]);
  const by = (n: string) => alloc.rows.find((r: any) => r.channel === n);
  check("FUND only proven-lift + acceptable CAC", by("ads").decision === "FUND" && by("ads").funded === true);
  check("proven lift but CAC>threshold ⇒ HOLD (unprofitable, not funded)", by("ads-expensive").decision === "HOLD" && by("ads-expensive").funded === false);
  check("no significant lift ⇒ HOLD (not funded)", by("email").decision === "HOLD" && by("email").funded === false);
  check("no evidence ⇒ UNMEASURED (never funded on clicks)", by("billboard").decision === "UNMEASURED" && by("billboard").funded === false);
  check("no channels ⇒ NO_CHANNELS", M.allocationGuidance([]).code === "NO_CHANNELS");
  check("allocation with no evidence anywhere ⇒ UNMEASURED verdict", M.allocationGuidance([{ channel: "x" }]).verdict === "UNMEASURED");

  // determinism + frozen
  const sig2 = M.incrementality({ treated: { conversions: 120, n: 1000 }, control: { conversions: 60, n: 1000 } });
  check("deterministic (same inputs ⇒ same CI)", sig2.ci95[0] === sig.ci95[0] && sig2.ci95[1] === sig.ci95[1]);
  check("frozen outputs", Object.isFrozen(sig) && Object.isFrozen(alloc) && Object.isFrozen(alloc.rows));

  // contract
  check("contract: attribution non-causal, incrementality needs control, allocation evidence-gated", M.MARKETING_SCIENCE_CONTRACT.invariants.some((s: string) => /DESCRIPTIVE_NOT_CAUSAL/.test(s)) && M.MARKETING_SCIENCE_CONTRACT.invariants.some((s: string) => /REAL control/.test(s)) && M.MARKETING_SCIENCE_CONTRACT.invariants.some((s: string) => /EVIDENCE-GATED/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-marketing-science (§6.14: attribution DESCRIPTIVE-not-causal; incrementality requires a control + reports 95% CI; budget allocation EVIDENCE-GATED, unmeasured⇒held not funded; deterministic)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
