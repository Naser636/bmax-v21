// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// objective-authorization (CM-5) — governance-mapped authorization stamping; ANTI-INFLATION: reserved/external/
// human objectives are NEVER eligible; unclassifiable fails closed; integrates with eligibilityFromObjectives so
// a reserved objective can never raise the autonomy numerator. JS/TS parity.
const assert = require("assert");
const TS = require("./objective-authorization.ts");
const JS = require("./objective-authorization.js");
const AM = require("./autonomy-measure.js"); // eligibilityFromObjectives (reused, not duplicated)

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

// 1. internal technical objective ⇒ eligible + authorized.
t("internal technical ⇒ eligible+authorized", () => {
  const a = TS.declareAuthorization({ id: "O1", goal: "refactor the parser module and add tests" });
  assert.strictEqual(a.eligible, true);
  assert.strictEqual(a.authorized, true);
});

// 2. reserved FINANCIAL objective ⇒ excluded, NEVER eligible (anti-inflation core).
t("reserved/financial ⇒ excluded, never eligible", () => {
  const a = TS.declareAuthorization({ id: "O2", goal: "pay the supplier invoice by card" });
  assert.strictEqual(a.excluded, true);
  assert.notStrictEqual(a.eligible, true);
  assert.ok(/reserved|human-gated|externalEffect/.test(a.reason));
});

// 3. unclassifiable ⇒ excluded (fail-closed, never defaulted eligible).
t("unclassifiable ⇒ excluded fail-closed", () => {
  assert.strictEqual(TS.declareAuthorization({ id: "O3" }).excluded, true);        // no goal
  assert.strictEqual(TS.declareAuthorization(null).excluded, true);
});

// 4. stampObjectives: preserves an existing (human) declaration; stamps the missing ones.
t("stampObjectives preserves existing, stamps missing", () => {
  const human = { id: "H", goal: "pay invoice", authorization: { eligible: true, authorized: true } }; // human-set (preserved verbatim)
  const auto = { id: "A", goal: "optimize the local cache" };
  const out = TS.stampObjectives([human, auto]);
  assert.deepStrictEqual(out[0].authorization, { eligible: true, authorized: true }); // untouched
  assert.ok(out[1].authorization && typeof out[1].authorization === "object");         // stamped
});

// 5. ANTI-INFLATION integration: a reserved objective can NEVER raise the autonomy numerator.
t("integration: reserved objective never inflates eligibility", () => {
  const stamped = TS.stampObjectives([
    { id: "ENG", goal: "migrate the module to TypeScript with parity" }, // internal ⇒ eligible
    { id: "PAY", goal: "transfer money to the vendor account" },         // reserved ⇒ excluded
  ]);
  const elig = AM.eligibilityFromObjectives(stamped);
  assert.strictEqual(elig.map.ENG.eligible, true);
  assert.strictEqual(elig.map.PAY.eligible, false);   // excluded ⇒ eligible:false (cannot count)
  assert.strictEqual(elig.complete, true);            // both objectives declared (no missing)
  // A mislabel attempt: even if someone sets PAY eligible, declareAuthorization refuses it.
  const forced = TS.declareAuthorization({ id: "PAY", goal: "transfer money to the vendor account", authorization: { eligible: true } });
  assert.strictEqual(forced.excluded, true);
});

// 6. parity.
t("JS/TS parity", () => {
  for (const g of ["refactor the parser", "pay the invoice", "deploy to production", ""]) {
    assert.deepStrictEqual(TS.declareAuthorization({ id: "x", goal: g }), JS.declareAuthorization({ id: "x", goal: g }));
  }
});

console.log(`\nALL PASS — objective-authorization (${n} tests)`);
