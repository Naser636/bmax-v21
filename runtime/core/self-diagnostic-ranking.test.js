"use strict";

/*
 * V33 — Optimal next-check selection. Covers the pure, deterministic rankChecks() ranker. It orders
 * candidate DIAGNOSTIC checks (most informative first) but decides no truth, mutates nothing, and never
 * collapses uncertainty. Pure input → pure output; no store, no repo I/O.
 */

const test = require("node:test");
const assert = require("node:assert");
const diag = require("./self-diagnostic.js");

// Build an incident-like object the ranker consumes (same shape raiseIncident produces).
function incident({ divergences, hypotheses }) {
  return { id: "I", severity: divergences.some((d) => d.severity === "CRITICAL") ? "CRITICAL" : "ERROR", divergences, hypotheses };
}

test("V33 rankChecks — severity then information-gain ordering", () => {
  const inc = incident({
    divergences: [
      { category: "missing-permission", severity: "ERROR" },
      { category: "missing-output", severity: "CRITICAL" },
    ],
    hypotheses: [
      { divergence: "missing-permission", at: "O1", candidates: [{ cause: "c", test: "contract.authorized_paths length > 0", supportedBy: [] }] },
      { divergence: "missing-output", at: "O2", candidates: [
        { cause: "a", test: "resolve(patch) is non-null for the objective", supportedBy: [] },
        { cause: "b", test: "patch-execution record status is FAILED with an error", supportedBy: [] },
      ] },
    ],
  });
  const ranked = diag.rankChecks(inc);
  assert.strictEqual(ranked.length, 3, "all checks ranked (uncertainty ordered, not collapsed)");
  assert.strictEqual(ranked[0].severity, "CRITICAL", "CRITICAL divergence's check ranked first");
  assert.ok(ranked[0].informationGain >= ranked[2].informationGain, "higher info-gain precedes lower");
  // nextCheck via diagnose-shaped attach would be ranked[0]:
  assert.strictEqual(ranked[0].divergence, "missing-output");
});

test("V33 rankChecks — adversarial 1–12 (never collapse uncertainty; safe fallback)", () => {
  // 8/9. high-risk / irreversible (MUTATE) check must never outrank a safe OBSERVE check.
  const mix = diag.rankChecks(incident({
    divergences: [{ category: "x", severity: "CRITICAL" }, { category: "y", severity: "ERROR" }],
    hypotheses: [
      { divergence: "x", at: "O", candidates: [{ cause: "risky", test: "apply the patch and rebuild to see", supportedBy: [] }] },
      { divergence: "y", at: "O", candidates: [{ cause: "safe", test: "evidence path present AND file non-empty", supportedBy: [] }] },
    ],
  }));
  assert.strictEqual(mix[0].safetyClass, "OBSERVE", "safe OBSERVE ranked before a high-severity MUTATE check");
  assert.strictEqual(mix[0].reversible, true);
  assert.strictEqual(mix[1].safetyClass, "MUTATE");
  // 5. equal-information checks ⇒ deterministic, stable tiebreak (same input ⇒ same order).
  const tied = { divergences: [{ category: "a", severity: "ERROR" }, { category: "b", severity: "ERROR" }],
    hypotheses: [
      { divergence: "b", at: "O", candidates: [{ cause: "c", test: "same-test", supportedBy: [] }] },
      { divergence: "a", at: "O", candidates: [{ cause: "c", test: "same-test", supportedBy: [] }] },
    ] };
  const r1 = diag.rankChecks(tied).map((c) => c.divergence);
  const r2 = diag.rankChecks(tied).map((c) => c.divergence);
  assert.deepStrictEqual(r1, r2, "deterministic");
  assert.deepStrictEqual(r1, ["a", "b"], "stable (category) tiebreak");
  // 11/12. corrupted / missing test ⇒ excluded, no throw; no valid check ⇒ [] (escalate, no suggestion).
  assert.doesNotThrow(() => diag.rankChecks(null));
  assert.deepStrictEqual(diag.rankChecks(null), []);
  assert.deepStrictEqual(diag.rankChecks({ hypotheses: [{ divergence: "z", candidates: [{ cause: "x" }] }], divergences: [] }), [], "candidate without a test excluded ⇒ no suggestion");
  // 1. incomplete evidence (empty candidates) ⇒ no checks, never a fabricated conclusion.
  assert.deepStrictEqual(diag.rankChecks({ divergences: [{ category: "z", severity: "ERROR" }], hypotheses: [{ divergence: "z", candidates: [] }] }), []);
});

test("V33 diagnose attaches advisory nextCheck without changing incident identity", () => {
  const plan = { mission: "M", objectives: [{ id: "OBJ_1", patch: { target: "runtime/core/x.js" } }], authorizedPaths: [] };
  const a = diag.diagnose({ plan, generatedDir: "/tmp/does-not-exist-v33", write: false, now: "T" });
  if (a.incident) {
    assert.ok("nextCheck" in a.incident && "rankedChecks" in a.incident, "advisory fields attached");
    // Identity is a pure function of divergences only — ranking must not perturb it.
    const b = diag.diagnose({ plan, generatedDir: "/tmp/does-not-exist-v33", write: false, now: "T2" });
    assert.strictEqual(a.incident.id, b.incident.id, "incident id stable across runs (ranking excluded from id)");
  }
});
