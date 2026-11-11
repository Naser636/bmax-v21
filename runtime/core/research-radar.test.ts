#!/usr/bin/env node
"use strict";
/* M5 (Phase 10 governed research PLANNING) — research-radar battery. Proves deterministic, FAIL-CLOSED refresh
 * planning: due classification (never/stale/low-confidence), fresh-and-confident exclusion, topic dedup, invalid
 * time/topic handling, capacity bound SURFACED (no silent cap), frozen+deterministic outputs, REUSE of M4 date
 * validation, and that every target still requires research-governor.govern()+grant (radar holds NO egress authority). */
const R = require("./research-radar.js");
const GOV = require("./research-governor.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const NOW = Date.parse("2026-11-11T00:00:00Z");
const F = (topic: string, date: string, credibility: string) => ({ topic, date, confidence: credibility });

function main() {
  // 1. fail-closed: no valid clock ⇒ schedule NOTHING (never a fabricated plan)
  const bad = R.planRadar([{ topic: "x" }], [], { nowMs: "nope" });
  check("invalid nowMs ⇒ no targets, all excluded INVALID_TIME (fail-closed)", bad.targets.length === 0 && bad.excluded.some((e: any) => e.reason === "INVALID_TIME") && bad.generatedAtMs === null);

  // 2. NEVER_RESEARCHED — a watchlist topic with no dated finding is top priority
  const p2 = R.planRadar([{ topic: "delta" }], [], { nowMs: NOW });
  check("topic with no finding ⇒ target NEVER_RESEARCHED + requiresGrant", p2.targets.length === 1 && p2.targets[0].dueReason === "NEVER_RESEARCHED" && p2.targets[0].requiresGrant === true);

  // 3. STALE — a finding older than refreshAfterMs is due
  const p3 = R.planRadar([{ topic: "alpha" }], [F("alpha", "2026-10-01", "HIGH")], { nowMs: NOW });
  check("old finding (>7d) ⇒ target STALE", p3.targets.length === 1 && p3.targets[0].dueReason === "STALE");

  // 4. FRESH + confident ⇒ excluded (not an error, just not due)
  const p4 = R.planRadar([{ topic: "beta" }], [F("beta", "2026-11-10", "HIGH")], { nowMs: NOW });
  check("fresh + HIGH confidence ⇒ excluded FRESH_AND_CONFIDENT (no target)", p4.targets.length === 0 && p4.excluded.some((e: any) => e.reason === "FRESH_AND_CONFIDENT"));

  // 5. LOW_CONFIDENCE — fresh but weak evidence is still due (worth strengthening)
  const p5 = R.planRadar([{ topic: "gamma" }], [F("gamma", "2026-11-10", "LOW")], { nowMs: NOW });
  check("fresh but LOW confidence ⇒ target LOW_CONFIDENCE", p5.targets.length === 1 && p5.targets[0].dueReason === "LOW_CONFIDENCE");

  // 6. dedup — duplicate topics (case-insensitive) collapse to one, the rest excluded DUPLICATE_TOPIC
  const p6 = R.planRadar([{ topic: "Dup" }, { topic: "dup" }], [], { nowMs: NOW });
  check("duplicate topic (case-insensitive) ⇒ one target + DUPLICATE_TOPIC excluded", p6.targets.length === 1 && p6.excluded.some((e: any) => e.reason === "DUPLICATE_TOPIC"));

  // 7. INVALID_TOPIC — empty/malformed topic excluded, never silently scheduled
  const p7 = R.planRadar([{ topic: "   " }, { topic: 42 }], [], { nowMs: NOW });
  check("empty/non-string topic ⇒ excluded INVALID_TOPIC (fail-closed)", p7.targets.length === 0 && p7.excluded.filter((e: any) => e.reason === "INVALID_TOPIC").length === 2);

  // 8. ordering — NEVER > STALE > LOW_CONFIDENCE (score desc, deterministic)
  const p8 = R.planRadar([{ topic: "gamma" }, { topic: "alpha" }, { topic: "delta" }],
    [F("alpha", "2026-10-01", "HIGH"), F("gamma", "2026-11-10", "LOW")], { nowMs: NOW });
  check("ordering NEVER > STALE > LOW_CONFIDENCE", p8.targets.map((t: any) => t.dueReason).join(",") === "NEVER_RESEARCHED,STALE,LOW_CONFIDENCE");

  // 9. capacity bound SURFACED — nothing silently truncated
  const p9 = R.planRadar([{ topic: "gamma" }, { topic: "alpha" }, { topic: "delta" }],
    [F("alpha", "2026-10-01", "HIGH"), F("gamma", "2026-11-10", "LOW")], { nowMs: NOW, maxTargets: 2 });
  check("maxTargets cap ⇒ overflow in `dropped` (CAPACITY_BOUND), not silent", p9.targets.length === 2 && p9.dropped.length === 1 && p9.dropped[0].reason === "CAPACITY_BOUND");

  // 10. every target carries the egress-boundary note (no egress authority)
  check("every target requires govern()+grant before any fetch", p8.targets.every((t: any) => t.requiresGrant === true && /govern\(\)/.test(t.note)));

  // 11. compose with M4 — a proposed request is STILL denied without a grant (radar grants no egress)
  const req = R.proposeRequest(p2.targets[0]);
  const gov = GOV.govern(req, {}, NOW);
  check("proposeRequest → govern() with no grant ⇒ DENY (radar holds no egress authority)", gov.decision === "DENY" && gov.reasons.includes("EGRESS_NOT_AUTHORIZED"));

  // 12. REUSE M4 date validation — an invalid-dated finding is ignored ⇒ topic treated NEVER_RESEARCHED
  const p12 = R.planRadar([{ topic: "zeta" }], [F("zeta", "not-a-date", "HIGH"), F("zeta", "2026-13-40", "HIGH")], { nowMs: NOW });
  check("finding with invalid ISO date ignored (reuses M4 isIsoDate) ⇒ NEVER_RESEARCHED", p12.targets.length === 1 && p12.targets[0].dueReason === "NEVER_RESEARCHED");

  // 13. stale score increases with age (older ⇒ more due)
  const p13 = R.planRadar([{ topic: "s_old" }, { topic: "s_new" }],
    [F("s_old", "2026-01-01", "HIGH"), F("s_new", "2026-10-20", "HIGH")], { nowMs: NOW });
  const sOld = p13.targets.find((t: any) => t.topicKey === "s_old"), sNew = p13.targets.find((t: any) => t.topicKey === "s_new");
  check("older stale topic scores higher than newer stale topic", sOld.score > sNew.score);

  // 14. low-confidence stale gets a ranking bonus over equally-aged high-confidence stale
  const p14 = R.planRadar([{ topic: "lc" }, { topic: "hc" }],
    [F("lc", "2026-09-01", "LOW"), F("hc", "2026-09-01", "HIGH")], { nowMs: NOW });
  const lc = p14.targets.find((t: any) => t.topicKey === "lc"), hc = p14.targets.find((t: any) => t.topicKey === "hc");
  check("low-confidence stale outranks equally-aged high-confidence stale (+bonus)", lc.score > hc.score);

  // 15. priority tiebreak raises score within the same due class
  const p15 = R.planRadar([{ topic: "pa", priority: 5 }, { topic: "pb", priority: 0 }], [], { nowMs: NOW });
  const pa = p15.targets.find((t: any) => t.topicKey === "pa"), pb = p15.targets.find((t: any) => t.topicKey === "pb");
  check("priority raises score within the same due class", pa.score > pb.score);

  // 16. deterministic + frozen outputs (no randomness, immutable)
  const a = R.planRadar([{ topic: "delta" }, { topic: "alpha" }], [F("alpha", "2026-10-01", "HIGH")], { nowMs: NOW });
  const b = R.planRadar([{ topic: "delta" }, { topic: "alpha" }], [F("alpha", "2026-10-01", "HIGH")], { nowMs: NOW });
  check("deterministic (identical inputs ⇒ identical JSON)", JSON.stringify(a) === JSON.stringify(b));
  check("outputs frozen (plan + targets + dropped)", Object.isFrozen(a) && Object.isFrozen(a.targets) && Object.isFrozen(a.targets[0]) && Object.isFrozen(p9.dropped[0]));

  // ===== Regression locks for independent-validator findings (remediated) =====
  // R1 (deep-freeze #1): target.allowedDomains must be frozen (was a mutable allowlist leak)
  const r1 = R.planRadar([{ topic: "t", allowedDomains: ["a.com", "b.com"] }], [], { nowMs: NOW });
  check("R1: target.allowedDomains is frozen (no mutable allowlist leak)", Object.isFrozen(r1.targets[0].allowedDomains));
  // R2 (deep-freeze #2): excluded[] element objects must be frozen (were plain mutable objects)
  const r2 = R.planRadar([{ topic: "beta" }], [F("beta", "2026-11-10", "HIGH")], { nowMs: NOW });
  check("R2: excluded[] elements are frozen", r2.excluded.length > 0 && r2.excluded.every((e: any) => Object.isFrozen(e)));
  // R3 (band separation): priority can never invert the due-class order, for any magnitude/sign
  const r3a = R.planRadar([{ topic: "lowc", priority: 1_000_000 }, { topic: "st", priority: 0 }],
    [F("lowc", "2026-11-10", "LOW"), F("st", "2026-11-02", "HIGH")], { nowMs: NOW });
  check("R3a: huge priority on LOW_CONFIDENCE still ranks below STALE", r3a.targets[0].dueReason === "STALE");
  const r3b = R.planRadar([{ topic: "nev", priority: -1_000_000 }, { topic: "st2", priority: 0 }],
    [F("st2", "2026-11-02", "HIGH")], { nowMs: NOW });
  check("R3b: negative priority on NEVER still ranks above STALE", r3b.targets[0].dueReason === "NEVER_RESEARCHED");
  // R4 (fail-closed cap): maxTargets:0 emits none (all due surfaced); invalid cap fails closed to 0, never to default-10
  const r4a = R.planRadar([{ topic: "a" }, { topic: "b" }], [], { nowMs: NOW, maxTargets: 0 });
  check("R4a: maxTargets:0 ⇒ 0 targets, all due surfaced in dropped", r4a.targets.length === 0 && r4a.dropped.length === 2);
  const r4b = R.planRadar([{ topic: "a" }, { topic: "b" }], [], { nowMs: NOW, maxTargets: -5 });
  const r4c = R.planRadar([{ topic: "a" }, { topic: "b" }], [], { nowMs: NOW, maxTargets: "3" as any });
  check("R4b/c: invalid maxTargets (negative / non-number) ⇒ fail-closed 0, NOT default-10", r4b.targets.length === 0 && r4c.targets.length === 0);
  // R5 (no fail-open suppression): a future-dated finding must not silence a topic — it stays due
  const r5 = R.planRadar([{ topic: "fut" }], [F("fut", "2027-01-01", "HIGH")], { nowMs: NOW });
  check("R5: future-dated finding ignored ⇒ topic still scheduled (NEVER_RESEARCHED), not suppressed", r5.targets.length === 1 && r5.targets[0].dueReason === "NEVER_RESEARCHED");

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — research-radar M5 (deterministic fail-closed refresh planner; dedup + capacity-surfaced; reuses M4; no egress authority)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
