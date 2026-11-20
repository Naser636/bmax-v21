#!/usr/bin/env node
"use strict";
/* Tests for odg-git-change-signal (V326 §7 — the missing changedPaths source for the pre-reuse freshness gate). PURE.
 * Proves: real git-text → signals → EXISTING classifyReuseValidity yields BOTH valid reuse AND drift/fail-closed rejection. */
const G = require("./odg-git-change-signal.js");
const GATE = require("./odg-reuse-validity-gate.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const asOf = Date.parse("2026-11-20T00:00:00Z");
  const recent = "2026-11-01T00:00:00Z";
  const prec = { learnedAt: recent, authoredBy: "ODG_CAPABILITY", edits: [{ file: "runtime/core/x.ts" }] };

  // ── parse ──
  check("parseGitNameOnly dedupes + trims + drops blanks", JSON.stringify(G.parseGitNameOnly("a.ts\n\n a.ts \nb.ts\n")) === JSON.stringify(["a.ts", "b.ts"]));
  check("parseGitNameOnly non-string ⇒ null (signal unavailable, NOT empty)", G.parseGitNameOnly(42) === null && G.parseGitNameOnly(undefined) === null);
  check("parseGitNameOnly empty/whitespace string ⇒ [] (query ran, no changes)", JSON.stringify(G.parseGitNameOnly("   \n\n")) === JSON.stringify([]));

  // ── buildReuseSignals: changedPaths present iff git text is a string (fail-closed on absence) ──
  check("buildReuseSignals omits changedPaths when git text unavailable (non-string)", !("changedPaths" in G.buildReuseSignals(null, { asOfMs: asOf })));
  check("buildReuseSignals includes changedPaths when git text supplied", "changedPaths" in G.buildReuseSignals("a.ts", { asOfMs: asOf }));
  check("buildReuseSignals passes asOfMs/maxAgeDays/suppressed/fileScope through", (() => { const s = G.buildReuseSignals("a.ts", { asOfMs: asOf, maxAgeDays: 30, suppressed: true, fileScope: false }); return s.asOfMs === asOf && s.maxAgeDays === 30 && s.suppressed === true && s.fileScope === false; })());

  // ── end-to-end through the REAL gate: VALID REUSE ──
  const clean = G.assessPrecedentFreshness(prec, "runtime/core/z.ts\ndocs/readme.md\n", { asOfMs: asOf });
  check("clean drift (no overlap) + provenanced + recent ⇒ REUSABLE_AS_PROVEN (valid reuse)", clean.verdict === "REUSABLE_AS_PROVEN" && clean.driftSignalAvailable === true);
  const empty = G.assessPrecedentFreshness(prec, "", { asOfMs: asOf });
  check("empty git (no files changed since learned) ⇒ REUSABLE_AS_PROVEN, 0 paths considered", empty.verdict === "REUSABLE_AS_PROVEN" && empty.changedPathsConsidered === 0);

  // ── end-to-end: REJECTION ──
  const drift = G.assessPrecedentFreshness(prec, "runtime/core/x.ts\nruntime/core/y.ts\n", { asOfMs: asOf });
  check("real drift (target path changed since learned) ⇒ REQUIRES_REVALIDATION, changedTarget surfaced", drift.verdict === "REQUIRES_REVALIDATION" && drift.changedTargets.indexOf("runtime/core/x.ts") >= 0 && drift.changedPathsConsidered === 2);
  const missing = G.assessPrecedentFreshness(prec, null, { asOfMs: asOf });
  check("git signal UNAVAILABLE ⇒ fail-closed REQUIRES_REVALIDATION (drift not checked), driftSignalAvailable false", missing.verdict === "REQUIRES_REVALIDATION" && missing.driftSignalAvailable === false);
  const stale = G.assessPrecedentFreshness(prec, "runtime/core/z.ts", { asOfMs: asOf, suppressed: true });
  check("suppressed (prior net-regression) ⇒ STALE even with clean drift", stale.verdict === "STALE");
  const aged = G.assessPrecedentFreshness({ learnedAt: "2026-01-01T00:00:00Z", authoredBy: "ODG_CAPABILITY", edits: [{ file: "runtime/core/x.ts" }] }, "runtime/core/z.ts", { asOfMs: asOf });
  check("aged > maxAgeDays ⇒ REQUIRES_REVALIDATION (age alone never upgrades)", aged.verdict === "REQUIRES_REVALIDATION");
  const unprov = G.assessPrecedentFreshness({ learnedAt: recent, authoredBy: "UNKNOWN", edits: [{ file: "runtime/core/x.ts" }] }, "runtime/core/z.ts", { asOfMs: asOf });
  check("UNKNOWN provenance ⇒ REQUIRES_REVALIDATION (remembered, not validated) even with clean drift + recent", unprov.verdict === "REQUIRES_REVALIDATION");

  // ── the verdict is the EXISTING gate's (consistency), not a reimplementation ──
  const sig = G.buildReuseSignals("runtime/core/x.ts", { asOfMs: asOf });
  check("assessPrecedentFreshness verdict === classifyReuseValidity on the same signals (no divergent logic)", G.assessPrecedentFreshness(prec, "runtime/core/x.ts", { asOfMs: asOf }).verdict === GATE.classifyReuseValidity(prec, sig).verdict);

  // ── honesty + determinism + frozen + contract ──
  check("note/contract: fail-closed on non-string git text; SOURCES one input, no 2nd memory/gate",
    G.GIT_CHANGE_SIGNAL_CONTRACT.invariants.some((s: string) => /non-string git text ⇒ changedPaths OMITTED/.test(s)) &&
    G.GIT_CHANGE_SIGNAL_CONTRACT.invariants.some((s: string) => /NO second memory system and NO new gate/.test(s)) &&
    G.GIT_CHANGE_SIGNAL_CONTRACT.reuses.some((s: string) => /classifyReuseValidity/.test(s)));
  check("deterministic", JSON.stringify(G.assessPrecedentFreshness(prec, "a.ts\nb.ts", { asOfMs: asOf })) === JSON.stringify(G.assessPrecedentFreshness(prec, "a.ts\nb.ts", { asOfMs: asOf })));
  check("frozen (signals + result)", Object.isFrozen(G.buildReuseSignals("a.ts", { asOfMs: asOf })) && Object.isFrozen(G.assessPrecedentFreshness(prec, "a.ts", { asOfMs: asOf })));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-git-change-signal (V326 §7: READ-ONLY git name-only text → changedPaths signal → EXISTING classifyReuseValidity; VALID REUSE [clean/empty drift + provenanced + recent ⇒ REUSABLE_AS_PROVEN] AND REJECTION [real drift/aged/unprovenanced ⇒ REQUIRES_REVALIDATION; suppressed ⇒ STALE; git unavailable ⇒ fail-closed]; non-string git ⇒ changedPaths OMITTED not zeroed; sources one input, no 2nd memory/gate; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
