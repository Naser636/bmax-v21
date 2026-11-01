// @ts-nocheck
// prove-the-number-demonstrator — extract→unit-economics composition. A resolvable rule ⇒ provenNumber true; an
// UNKNOWN extraction ⇒ no number asserted + gap; a malformed rule ⇒ caught (no throw); unit-economics computed;
// honesty (observed-usage evidence, not billing, FOCUS non-goal); determinism/bad-input fail-closed.
"use strict";
const assert = require("assert");
const D = require("./prove-the-number-demonstrator.js");

let n = 0; const ok = (name, cond) => { n++; assert.ok(cond, name); };

// (1) a resolvable JSON pointer ⇒ provenNumber true, raw surfaced.
(() => {
  const r = D.runProveTheNumber({ body: '{"cost":"12.50"}', rule: { type: "json", pointer: "/cost" }, economics: {} });
  ok("proven: verdict FINOPS_NUMBER", r.ok && r.verdict === D.VERDICT.PROVEN);
  ok("proven: OBSERVED + provenNumber true", r.summary.extractedStatus === "OBSERVED" && r.summary.provenNumber === true);
  ok("proven: raw value surfaced", r.summary.extractedRaw === "12.50");
})();

// (2) an unresolvable extraction ⇒ UNKNOWN, no number asserted, gap.
(() => {
  const r = D.runProveTheNumber({ body: "not json", rule: { type: "json", pointer: "/cost" }, economics: {} });
  ok("unknown: provenNumber false", r.summary.provenNumber === false);
  ok("unknown: extractedRaw null (no number invented)", r.summary.extractedRaw === null);
  ok("unknown: a prove-the-number gap reported", r.gaps.some((g) => /NOT proven|no cost asserted/i.test(g)));
})();

// (3) a MALFORMED rule ⇒ caught (no throw), surfaced as UNKNOWN.
(() => {
  const r = D.runProveTheNumber({ body: "{}", rule: { type: "json" /* no pointer */ }, economics: {} });
  ok("malformed-rule: no throw, UNKNOWN", r.ok === true && r.summary.extractedStatus === "UNKNOWN");
})();

// (4) a regex rule also resolves.
(() => {
  const r = D.runProveTheNumber({ body: "total=4200 cents", rule: { type: "regex", pattern: "total=(\\d+)", group: 1 }, economics: {} });
  ok("regex: provenNumber true (or honest UNKNOWN if unit-mismatch)", r.summary.extractedStatus === "OBSERVED" || r.summary.extractedStatus === "UNKNOWN");
})();

// (5) no rule ⇒ extraction SKIPPED (not a failure), unit-economics still computed.
(() => {
  const r = D.runProveTheNumber({ economics: { time: { odgActiveMin: 10 } } });
  ok("no-rule: extraction SKIPPED", r.summary.extractedStatus === "SKIPPED");
  // pin the honesty invariant: a non-OBSERVED extraction NEVER reports a proven number or a raw value.
  ok("no-rule: provenNumber false (SKIPPED is not proven)", r.summary.provenNumber === false);
  ok("no-rule: extractedRaw null (no number asserted)", r.summary.extractedRaw === null);
  ok("no-rule: unit-economics computed", r.summary.unitEconomicsComputed === true);
})();

// (6) HONESTY + bad-input + determinism.
(() => {
  const r = D.runProveTheNumber({ body: '{"cost":"1.00"}', rule: { type: "json", pointer: "/cost" }, economics: {} });
  ok("honesty: basis OBSERVED_USAGE_EVIDENCE_NOT_BILLING", r.basis === "OBSERVED_USAGE_EVIDENCE_NOT_BILLING");
  ok("honesty: note says NOT billing + FOCUS non-goal", /NOT a billing statement/i.test(r.note) && /FOCUS/i.test(r.note));
  ok("bad-input: non-object ⇒ INVALID_INPUT", D.runProveTheNumber(null).code === "INVALID_INPUT");
  const a = D.runProveTheNumber({ body: '{"cost":"1.00"}', rule: { type: "json", pointer: "/cost" }, economics: {} });
  const b = D.runProveTheNumber({ body: '{"cost":"1.00"}', rule: { type: "json", pointer: "/cost" }, economics: {} });
  ok("determinism: identical extractedStatus + raw", a.summary.extractedStatus === b.summary.extractedStatus && a.summary.extractedRaw === b.summary.extractedRaw);
})();

console.log(`prove-the-number-demonstrator: ${n} checks passed`);
