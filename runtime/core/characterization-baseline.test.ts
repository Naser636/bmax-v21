#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the characterization-baseline capability (G-01, Feathers discipline):
// capture a sealed behavioral baseline from recorded {input,observedOutput} samples, then prove an edit is
// behavior-preserving — fail-closed and honest: NO_BASELINE on empty, NONDETERMINISTIC_SOURCE on a dup-input-
// differing-output, INCOMPLETE on a coverage gap (NOT a pass), BASELINE_TAMPERED when the seal is altered,
// key-ORDER-independent input matching, deterministic digest, and basis=BEHAVIORAL_NOT_CORRECTNESS everywhere
// (BEHAVIOR_PRESERVED never claims correctness). Pure/deterministic (hermetic revision injected).
"use strict";
const assert = require("assert");
const C = require("./characterization-baseline.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const REV = { commit: "test0000", treeDirty: false, available: true }; // hermetic: no real git read

// (1) FAIL-CLOSED: empty samples ⇒ NO_BASELINE (you cannot characterize nothing — never a fake pass).
{
  const r = C.captureBaseline({ target: "legacy.fn", revision: REV, samples: [] });
  ok("empty samples ⇒ NO_BASELINE, ok:false, basis BEHAVIORAL_NOT_CORRECTNESS",
     r.ok === false && r.code === "NO_BASELINE" && r.basis === "BEHAVIORAL_NOT_CORRECTNESS");
  const r2 = C.captureBaseline({ target: "", revision: REV, samples: [{ input: 1, observedOutput: 1 }] });
  ok("missing target ⇒ INVALID_INPUT", r2.ok === false && r2.code === "INVALID_INPUT");
}

// (2) capture then compare IDENTICAL outputs ⇒ BEHAVIOR_PRESERVED (but note disclaims correctness).
let baseline;
{
  const cap = C.captureBaseline({ target: "legacy.fn", revision: REV, samples: [
    { input: { a: 1, b: 2 }, observedOutput: { sum: 3 } },
    { input: [1, 2, 3], observedOutput: 6 },
  ] });
  ok("capture ok, count 2, sealed with a provenance stamp", cap.ok && cap.baseline.count === 2 && cap.baseline.provenance && typeof cap.baseline.provenance.contentSha256 === "string");
  baseline = cap.baseline;
  const same = C.compareToBaseline(baseline, [
    { input: { a: 1, b: 2 }, observedOutput: { sum: 3 } },
    { input: [1, 2, 3], observedOutput: 6 },
  ]);
  ok("identical re-run ⇒ BEHAVIOR_PRESERVED, preserved=2, 0 findings",
     same.ok && same.verdict === "BEHAVIOR_PRESERVED" && same.counts.preserved === 2 && same.findings.length === 0);
  ok("BEHAVIOR_PRESERVED note explicitly does NOT claim correctness",
     /NOT that it is correct/.test(same.note) && same.basis === "BEHAVIORAL_NOT_CORRECTNESS");
}

// (3) a CHANGED output ⇒ BEHAVIOR_CHANGED + HIGH finding naming the change (requires explicit bless).
{
  const changed = C.compareToBaseline(baseline, [
    { input: { a: 1, b: 2 }, observedOutput: { sum: 4 } },   // changed 3 -> 4
    { input: [1, 2, 3], observedOutput: 6 },
  ]);
  ok("changed output ⇒ BEHAVIOR_CHANGED, 1 change, HIGH behavior finding w/ bless remediation",
     changed.verdict === "BEHAVIOR_CHANGED" && changed.counts.changed === 1 &&
     changed.findings.some((f) => f.area === "behavior" && f.severity === "HIGH" && /bless/.test(f.remediation)) &&
     changed.changed[0].baselineOutput !== changed.changed[0].newOutput);
}

// (4) FAIL-CLOSED: a compare run missing a baselined input ⇒ INCOMPLETE (coverage gap is NOT a pass).
{
  const incomplete = C.compareToBaseline(baseline, [{ input: { a: 1, b: 2 }, observedOutput: { sum: 3 } }]); // omits the array input
  ok("coverage gap ⇒ INCOMPLETE (not BEHAVIOR_PRESERVED), missing=1, MEDIUM coverage finding",
     incomplete.verdict === "INCOMPLETE" && incomplete.counts.missing === 1 &&
     incomplete.findings.some((f) => f.area === "coverage" && f.severity === "MEDIUM"));
}

// (5) FAIL-CLOSED: the same input observed with DIFFERING outputs ⇒ NONDETERMINISTIC_SOURCE at capture.
{
  const nd = C.captureBaseline({ target: "flaky.fn", revision: REV, samples: [
    { input: { x: 1 }, observedOutput: "A" },
    { input: { x: 1 }, observedOutput: "B" },
  ] });
  ok("dup input / differing output ⇒ NONDETERMINISTIC_SOURCE", nd.ok === false && nd.code === "NONDETERMINISTIC_SOURCE");
  // identical duplicate is fine (dedup):
  const dedup = C.captureBaseline({ target: "ok.fn", revision: REV, samples: [
    { input: { x: 1 }, observedOutput: "A" }, { input: { x: 1 }, observedOutput: "A" },
  ] });
  ok("identical duplicate input ⇒ dedup to count 1", dedup.ok && dedup.baseline.count === 1);
}

// (6) TAMPER-EVIDENCE: mutate a sealed baseline entry ⇒ compare refuses with BASELINE_TAMPERED.
{
  const cap = C.captureBaseline({ target: "legacy.fn", revision: REV, samples: [{ input: { a: 1 }, observedOutput: 1 }] });
  const tampered = JSON.parse(JSON.stringify(cap.baseline));
  tampered.entries[0].output = "99"; // alter the recorded behavior after sealing
  const r = C.compareToBaseline(tampered, [{ input: { a: 1 }, observedOutput: 1 }]);
  ok("altered sealed baseline ⇒ BASELINE_TAMPERED (verifyProvenance catches it)", r.ok === false && r.verdict === "BASELINE_TAMPERED");
}

// (7) key-ORDER independence: baseline input {a,b} matches compare input {b,a} (not a false change).
{
  const cap = C.captureBaseline({ target: "legacy.fn", revision: REV, samples: [{ input: { a: 1, b: 2 }, observedOutput: 3 }] });
  const r = C.compareToBaseline(cap.baseline, [{ input: { b: 2, a: 1 }, observedOutput: 3 }]);
  ok("reordered object keys ⇒ same input ⇒ BEHAVIOR_PRESERVED (order-independent)", r.verdict === "BEHAVIOR_PRESERVED" && r.counts.preserved === 1);
}

// (8) DETERMINISM: same samples + same revision ⇒ identical sealed content digest (reproducible).
{
  const a = C.captureBaseline({ target: "t", revision: REV, samples: [{ input: 1, observedOutput: 2 }, { input: 2, observedOutput: 4 }] });
  const b = C.captureBaseline({ target: "t", revision: REV, samples: [{ input: 1, observedOutput: 2 }, { input: 2, observedOutput: 4 }] });
  ok("deterministic seal: identical inputs+revision ⇒ identical contentSha256",
     a.baseline.provenance.contentSha256 === b.baseline.provenance.contentSha256);
}

// (9) extras (new inputs not in baseline) are reported but do NOT by themselves block a PRESERVED verdict.
{
  const cap = C.captureBaseline({ target: "t", revision: REV, samples: [{ input: 1, observedOutput: 1 }] });
  const r = C.compareToBaseline(cap.baseline, [{ input: 1, observedOutput: 1 }, { input: 2, observedOutput: 2 }]);
  ok("new extra input ⇒ still BEHAVIOR_PRESERVED, extras=1 reported", r.verdict === "BEHAVIOR_PRESERVED" && r.counts.extras === 1);
}

// (10) FAIL-CLOSED (hardening, independent-validator-flagged): a hand-crafted, validly-sealed ZERO-ENTRY
// baseline must NOT vacuously PRESERVE — compareToBaseline refuses it with NO_BASELINE.
{
  const EP = require("./evidence-provenance.js");
  const empty = EP.stampProvenance({ schema: C.SCHEMA, target: "x", basis: C.BASIS, count: 0, entries: [] }, { revision: REV });
  const r = C.compareToBaseline(empty, [{ input: 1, observedOutput: 1 }]);
  ok("zero-entry sealed baseline ⇒ NO_BASELINE (never a vacuous BEHAVIOR_PRESERVED)", r.ok === false && r.verdict === "NO_BASELINE");
}

console.log(`\ncharacterization-baseline: ${pass} assertions passed`);
