// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// enterprise-lead-grade — §3 evidence grading + §4 anti-scam override; a lead is never a buyer, a budget never
// confirmed. JS/TS parity.
const assert = require("assert");
const TS = require("./enterprise-lead-grade.ts");
const JS = require("./enterprise-lead-grade.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

// 1. scam flag ⇒ REJECTED regardless of everything else (§4 overrides).
t("scam flag ⇒ REJECTED (anti-scam overrides)", () => {
  const r = TS.gradeLead({ existenceVerified: true, needEvidence: "explicit", budget: "published", decisionMakerIdentified: true, scamFlags: ["prepay-request"] });
  assert.strictEqual(r.grade, "REJECTED");
  assert.strictEqual(r.actionable, false);
});

// 2. contradictions ⇒ REJECTED.
t("contradictory evidence ⇒ REJECTED", () => {
  assert.strictEqual(TS.gradeLead({ existenceVerified: true, needEvidence: "explicit", budget: "published", decisionMakerIdentified: true, contradictions: true }).grade, "REJECTED");
});

// 3. full evidence ⇒ A, but never an acquired buyer / confirmed budget.
t("explicit need + budget + buyer ⇒ A (still not acquired/confirmed)", () => {
  const r = TS.gradeLead({ existenceVerified: true, needEvidence: "explicit", budget: "published", decisionMakerIdentified: true });
  assert.strictEqual(r.grade, "A");
  assert.strictEqual(r.actionable, true);
  assert.strictEqual(r.isAcquiredBuyer, false);
  assert.strictEqual(r.budgetConfirmed, false);
});

// 4. convergent / missing buyer ⇒ B.
t("convergent signals ⇒ B", () => {
  assert.strictEqual(TS.gradeLead({ existenceVerified: true, needEvidence: "convergent", budget: "unknown" }).grade, "B");
  assert.strictEqual(TS.gradeLead({ existenceVerified: true, needEvidence: "explicit", budget: "unknown", decisionMakerIdentified: false }).grade, "B");
});

// 5. theoretical / unverified existence ⇒ C; parity.
t("theoretical ⇒ C; unverified existence capped at C; parity", () => {
  assert.strictEqual(TS.gradeLead({ existenceVerified: true, needEvidence: "theoretical" }).grade, "C");
  assert.strictEqual(TS.gradeLead({ existenceVerified: false, needEvidence: "explicit", budget: "published", decisionMakerIdentified: true }).grade, "C");
  for (const ev of [
    { existenceVerified: true, needEvidence: "explicit", budget: "published", decisionMakerIdentified: true },
    { existenceVerified: true, needEvidence: "convergent" },
    { existenceVerified: false, needEvidence: "none" },
    { scamFlags: ["guaranteed-gains"] },
  ]) assert.deepStrictEqual(TS.gradeLead(ev), JS.gradeLead(ev));
});

console.log(`\nALL PASS — enterprise-lead-grade (${n} tests)`);
