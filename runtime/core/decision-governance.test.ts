#!/usr/bin/env node
"use strict";
/* M14 (V12.4 decision integrity & governance) — battery. Proves decisions are audited against cited evidence:
 * provenance completeness, unknown evidence, FACT-from-HYPOTHESIS/SIMULATION (never pass a hypothesis/sim as a fact),
 * stale basis, cross-source contradictions, superseded basis ⇒ revision. SOUND only when clean. Fail-closed; analyses
 * provided data and stores nothing (no 2nd memory/authority). No egress. */
const D = require("./decision-governance.js");
const NOW = Date.parse("2026-11-11T00:00:00Z");
const prov = { observation: "obs-1", mission: "M0001", result: "runtime/generated/x.json" };
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const verdictOf = (r: any, id: string) => r.results.find((x: any) => x.id === id);

function main() {
  // 1. SOUND: FACT decision from FACT evidence, fresh, complete provenance
  const s1 = D.assessDecisions({
    evidence: [{ id: "e1", subject: "err-rate", claim: "2%", kind: "FACT", source: "metrics", date: "2026-11-10" }],
    decisions: [{ id: "d1", basis: ["e1"], assertedKind: "FACT", provenance: prov }], nowMs: NOW, freshnessMs: 7 * 24 * 3600e3,
  });
  check("SOUND: FACT from fresh FACT evidence + full provenance", verdictOf(s1, "d1").verdict === "SOUND" && s1.sound === 1);

  // 2. FACT_FROM_NONFACT: asserting FACT from a HYPOTHESIS ⇒ UNSOUND (never pass a hypothesis as a fact)
  const f = D.assessDecisions({
    evidence: [{ id: "h1", subject: "demand", claim: "high", kind: "HYPOTHESIS", source: "analyst", date: "2026-11-10" }],
    decisions: [{ id: "d2", basis: ["h1"], assertedKind: "FACT", provenance: prov }], nowMs: NOW, freshnessMs: 7 * 24 * 3600e3,
  });
  check("FACT asserted from HYPOTHESIS ⇒ UNSOUND FACT_FROM_NONFACT", verdictOf(f, "d2").verdict === "UNSOUND" && verdictOf(f, "d2").reasons.includes("FACT_FROM_NONFACT"));
  // 2b. SIMULATION presented as FACT ⇒ UNSOUND
  const sim = D.assessDecisions({ evidence: [{ id: "s1", subject: "load", claim: "ok", kind: "SIMULATION", source: "bench", date: "2026-11-10" }], decisions: [{ id: "d2b", basis: ["s1"], assertedKind: "FACT", provenance: prov }], nowMs: NOW, freshnessMs: 7 * 24 * 3600e3 });
  check("SIMULATION asserted as FACT ⇒ UNSOUND (no fixtures-as-fact)", verdictOf(sim, "d2b").reasons.includes("FACT_FROM_NONFACT"));

  // 3. PROVENANCE_INCOMPLETE: missing result trace
  const p = D.assessDecisions({ evidence: [{ id: "e1", subject: "x", claim: "y", kind: "FACT", source: "s", date: "2026-11-10" }], decisions: [{ id: "d3", basis: ["e1"], assertedKind: "FACT", provenance: { observation: "o", mission: "m" } }], nowMs: NOW, freshnessMs: 7 * 24 * 3600e3 });
  check("missing provenance trace ⇒ UNSOUND PROVENANCE_INCOMPLETE", verdictOf(p, "d3").reasons.includes("PROVENANCE_INCOMPLETE"));

  // 4. UNKNOWN_EVIDENCE: citing non-existent evidence
  const u = D.assessDecisions({ evidence: [], decisions: [{ id: "d4", basis: ["ghost"], assertedKind: "HYPOTHESIS", provenance: prov }] });
  check("citing unknown evidence ⇒ UNSOUND UNKNOWN_EVIDENCE", verdictOf(u, "d4").reasons.includes("UNKNOWN_EVIDENCE"));

  // 5. STALE_BASIS: evidence older than freshness TTL
  const st = D.assessDecisions({ evidence: [{ id: "old", subject: "x", claim: "y", kind: "FACT", source: "s", date: "2026-01-01" }], decisions: [{ id: "d5", basis: ["old"], assertedKind: "FACT", provenance: prov }], nowMs: NOW, freshnessMs: 7 * 24 * 3600e3 });
  check("basis older than freshness TTL ⇒ UNSOUND STALE_BASIS", verdictOf(st, "d5").reasons.includes("STALE_BASIS"));

  // 6. CONTRADICTION: two sources, same subject, different claim ⇒ detected + basis CONTRADICTED + revision
  const c = D.assessDecisions({
    evidence: [{ id: "a", subject: "price", claim: "100", kind: "FACT", source: "src1", date: "2026-11-10" }, { id: "b", subject: "price", claim: "200", kind: "FACT", source: "src2", date: "2026-11-10" }],
    decisions: [{ id: "d6", basis: ["a"], assertedKind: "FACT", provenance: prov }], nowMs: NOW, freshnessMs: 7 * 24 * 3600e3,
  });
  check("cross-source contradiction detected + decision CONTRADICTED + revision needed", c.contradictions.length === 1 && verdictOf(c, "d6").reasons.includes("CONTRADICTED_BASIS") && c.revisionsNeeded.includes("d6"));

  // 7. SUPERSEDED: newer evidence on same subject, different claim ⇒ basis superseded ⇒ REVISE
  const sp = D.assessDecisions({
    evidence: [{ id: "old2", subject: "status", claim: "green", kind: "FACT", source: "s", date: "2026-10-01" }, { id: "new2", subject: "status", claim: "red", kind: "FACT", source: "s", date: "2026-11-05" }],
    decisions: [{ id: "d7", basis: ["old2"], assertedKind: "FACT", provenance: prov }], nowMs: NOW, freshnessMs: 365 * 24 * 3600e3,
  });
  check("newer contradicting evidence ⇒ SUPERSEDED_BASIS + revision needed", verdictOf(sp, "d7").reasons.includes("SUPERSEDED_BASIS") && sp.revisionsNeeded.includes("d7"));

  // 8. no false contradiction: same source agreeing, or different subjects ⇒ none
  const nc = D.assessDecisions({ evidence: [{ id: "a", subject: "x", claim: "1", kind: "FACT", source: "s", date: "2026-11-10" }, { id: "b", subject: "y", claim: "2", kind: "FACT", source: "s2", date: "2026-11-10" }], decisions: [], nowMs: NOW, freshnessMs: 7 * 24 * 3600e3 });
  check("different subjects ⇒ no false contradiction", nc.contradictions.length === 0);

  // 9. fail-closed: junk + throwing getter ⇒ no throw, empty/UNSOUND
  let threw = false; try { D.assessDecisions("nonsense"); D.assessDecisions(); const g: any = { evidence: [] }; Object.defineProperty(g, "decisions", { get() { throw new Error("boom"); } }); D.assessDecisions(g); } catch { threw = true; }
  check("never throws on junk/throwing getter (fail-closed)", threw === false && D.assessDecisions("nonsense").total === 0);

  // 10. frozen + deterministic
  check("outputs frozen + deterministic", Object.isFrozen(c) && Object.isFrozen(c.results) && Object.isFrozen(c.contradictions) && JSON.stringify(D.assessDecisions({ evidence: c ? [] : [] })) === JSON.stringify(D.assessDecisions({ evidence: [] })));

  // ===== Regression locks for independent-validator findings =====
  // D1: kind casing/whitespace/unknown must NOT bypass the honesty gate — FACT from any non-canonical-FACT ⇒ UNSOUND
  for (const k of ["hypothesis", "HYPOTHESIS ", "simulation", "GUESS", ""]) {
    const rr = D.assessDecisions({ evidence: [{ id: "e", subject: "s", claim: "x", kind: k, source: "src", date: "2026-11-10" }], decisions: [{ id: "d", basis: ["e"], assertedKind: "FACT", provenance: prov }], nowMs: NOW, freshnessMs: 7 * 24 * 3600e3 });
    check(`D1: FACT from kind='${k}' ⇒ UNSOUND FACT_FROM_NONFACT (no casing/whitespace/unknown bypass)`, verdictOf(rr, "d").reasons.includes("FACT_FROM_NONFACT"));
  }
  // D2: NUMERIC claims — contradiction + supersession must still be detected (not only strings)
  const d2c = D.assessDecisions({ evidence: [{ id: "a", subject: "price", claim: 100, kind: "FACT", source: "s1", date: "2026-11-10" }, { id: "b", subject: "price", claim: 200, kind: "FACT", source: "s2", date: "2026-11-10" }], decisions: [{ id: "dn", basis: ["a"], assertedKind: "FACT", provenance: prov }], nowMs: NOW, freshnessMs: 7 * 24 * 3600e3 });
  check("D2: numeric cross-source contradiction detected ⇒ CONTRADICTED_BASIS", d2c.contradictions.length === 1 && verdictOf(d2c, "dn").reasons.includes("CONTRADICTED_BASIS"));
  const d2s = D.assessDecisions({ evidence: [{ id: "o", subject: "n", claim: 1, kind: "FACT", source: "s", date: "2026-10-01" }, { id: "nw", subject: "n", claim: 2, kind: "FACT", source: "s", date: "2026-11-05" }], decisions: [{ id: "ds", basis: ["o"], assertedKind: "FACT", provenance: prov }], nowMs: NOW, freshnessMs: 365 * 24 * 3600e3 });
  check("D2: numeric supersession detected ⇒ SUPERSEDED_BASIS", verdictOf(d2s, "ds").reasons.includes("SUPERSEDED_BASIS"));
  // D3: a FACT asserted with NO cited evidence ⇒ UNSOUND UNSUPPORTED_ASSERTION
  const d3 = D.assessDecisions({ evidence: [], decisions: [{ id: "df", basis: [], assertedKind: "FACT", provenance: prov }] });
  check("D3: FACT asserted with empty basis ⇒ UNSOUND UNSUPPORTED_ASSERTION", verdictOf(d3, "df").verdict === "UNSOUND" && verdictOf(d3, "df").reasons.includes("UNSUPPORTED_ASSERTION"));
  // D5 (robustness): a non-serializable claim (bigint) must ISOLATE (no comparable claim), not collapse the report
  const d5 = D.assessDecisions({ evidence: [{ id: "bg", subject: "s", claim: (BigInt ? BigInt(5) : 5) as any, kind: "FACT", source: "src", date: "2026-11-10" }, { id: "ok", subject: "t", claim: "v", kind: "FACT", source: "src2", date: "2026-11-10" }], decisions: [{ id: "d", basis: ["ok"], assertedKind: "FACT", provenance: prov }], nowMs: NOW, freshnessMs: 7 * 24 * 3600e3 });
  check("D5: non-serializable claim isolated (report not collapsed; valid decision still assessed)", d5.total === 1 && !d5.error && verdictOf(d5, "d").verdict === "SOUND");

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — decision-governance M14 (decision integrity: provenance/contradiction/freshness/fact-vs-hypothesis-vs-simulation/revision; fail-closed; stores nothing)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
