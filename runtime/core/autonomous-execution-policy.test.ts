// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// autonomous-execution-policy (LOT A) — ODG does what it can; CTO time only for genuinely-human steps;
// automatable-work-left-to-human flagged; mandatory human/security controls never downgraded.
const assert = require("assert");
const JS = require("./autonomous-execution-policy.js");
const TS = require("./autonomous-execution-policy.ts");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

// (1) internal technical step ⇒ ODG.
t("internal technical step ⇒ ODG", () => {
  assert.strictEqual(JS.classifyStep({ label: "generate the SBOM and sign the attestation" }).actor, "ODG");
  assert.strictEqual(JS.classifyStep({ goal: "refactor the parser and run tests" }).actor, "ODG");
});

// (3) genuinely-human via classifier (requiresHuman) ⇒ HUMAN.
t("requiresHuman goal ⇒ HUMAN", () => {
  const r = JS.classifyStep({ goal: "deploy to production" });
  assert.strictEqual(r.actor, "HUMAN");
  assert.strictEqual(r.mandatoryControl, true);
});

// external-gated (requiresExternal, not human) ⇒ EXTERNAL_GATED (neither ODG-alone nor human-residual).
t("external-gated goal ⇒ EXTERNAL_GATED", () => {
  assert.strictEqual(JS.classifyStep({ goal: "send email to the client" }).actor, "EXTERNAL_GATED");
});

// (5) explicit mandatory human control is NEVER downgraded, even if the text looks automatable.
t("mandatory signature ⇒ HUMAN (never downgraded)", () => {
  const r = JS.classifyStep({ label: "generate and format the document", mandatory: "signature" });
  assert.strictEqual(r.actor, "HUMAN");
  assert.strictEqual(r.mandatoryControl, true);
});

// fail-safe: unclassifiable/empty ⇒ HUMAN review (never auto-automated).
t("empty step ⇒ HUMAN fail-safe", () => {
  assert.strictEqual(JS.classifyStep({}).actor, "HUMAN");
});

// (4) auditImputation flags automatable work imputed to a human + splits time correctly.
t("auditImputation: flags automatable-left-to-human; splits time", () => {
  const audit = JS.auditImputation([
    { label: "generate the evidence pack", minutes: 120, imputedTo: "HUMAN" }, // ODG-automatable but charged to human ⇒ FLAG
    { label: "sign the engagement letter", minutes: 30, mandatory: "signature", imputedTo: "HUMAN" }, // genuinely human
    { label: "run the verification suite", minutes: 60 }, // ODG
  ]);
  assert.strictEqual(audit.odgMinutes, 180);            // 120 (mis-imputed, still ODG) + 60
  assert.strictEqual(audit.residualHumanMinutes, 30);   // only the signature
  assert.strictEqual(audit.misimputedHumanMinutes, 120);
  assert.ok(audit.flags.some((f) => f.code === "AUTOMATABLE_LEFT_TO_HUMAN"));
});

// JS/TS parity.
t("JS/TS parity", () => {
  const steps = [{ label: "generate SBOM", minutes: 50, imputedTo: "HUMAN" }, { label: "approve", mandatory: "approval", minutes: 10 }];
  assert.deepStrictEqual(JS.auditImputation(steps), TS.auditImputation(steps));
});

console.log(`\nALL PASS — autonomous-execution-policy (${n} tests)`);
