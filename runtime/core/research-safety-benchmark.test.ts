#!/usr/bin/env node
"use strict";
/* M8 (Phase 10 independent benchmark) — research-safety-benchmark battery. Proves the sealed corpus runs the REAL
 * M4–M7 modules with ZERO safety violations, the provenance digest is stable, outputs are frozen+deterministic, and —
 * critically — the scorer is NOT a rubber stamp: a hand-crafted case whose safe outcome is violated is DETECTED as
 * unsafe (so a real regression in any module would surface as a benchmark violation, not a fabricated pass). */
const BM = require("./research-safety-benchmark.js");
const NOW = Date.parse("2026-11-11T00:00:00Z");
const OK_GRANT = { authorized: true, allowedDomains: ["example.com"], expiresMs: NOW + 100000 };
const REQ = { query: "q", urls: ["https://example.com/a"] };
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = BM.runBenchmark();
  // 1. headline: zero safety violations across the real subsystem
  check("ZERO safety violations across the real M4–M7 subsystem", r.safetyViolations === 0 && r.safetyViolationRate === 0);
  // 2. total == corpus size; every case scored
  check("every sealed case scored (total == corpus length)", r.total === BM.CORPUS.length && r.results.length === r.total);
  // 3. provenance digest is a stable sha256
  check("provenance digest is a stable sha256", /^[0-9a-f]{64}$/.test(r.digest) && r.digest === BM.digest());
  // 4. all six safety properties covered and all-safe
  const props = Object.keys(r.byProperty).sort().join(",");
  check("all six safety properties present + each all-safe", props === "BUDGET_FAILCLOSED,BUDGET_MONOTONIC,GOVERN_FAILCLOSED,LEDGER_DEDUP,RADAR_FAILCLOSED,STAMP_ANTIFAB" && Object.values(r.byProperty).every((p: any) => p.safe === p.total));
  // 5. deterministic
  check("deterministic (two runs ⇒ identical JSON)", JSON.stringify(BM.runBenchmark()) === JSON.stringify(BM.runBenchmark()));
  // 6. frozen outputs
  check("outputs frozen (report + nested results/violations)", Object.isFrozen(r) && Object.isFrozen(r.results) && Object.isFrozen(r.results[0]) && Object.isFrozen(r.byProperty));

  // 7. ANTI-RUBBERSTAMP: a GOVERN_FAILCLOSED case with a VALID grant ⇒ govern ALLOWs ⇒ scorer flags UNSAFE
  const rb1 = BM.scoreCase({ id: "rubberstamp-allow", property: "GOVERN_FAILCLOSED", request: REQ, grant: OK_GRANT, nowMs: NOW });
  check("anti-rubberstamp: a case that SHOULD deny but ALLOWs ⇒ scored UNSAFE (scorer really measures)", rb1.safe === false && rb1.observed === "ALLOW");
  // 8. ANTI-RUBBERSTAMP: a STAMP_ANTIFAB case with a VALID finding ⇒ accepted ⇒ UNSAFE
  const rb2 = BM.scoreCase({ id: "rubberstamp-stamp", property: "STAMP_ANTIFAB", content: "x", source: { url: "https://example.com/p", date: "2026-11-10", credibility: "HIGH" } });
  check("anti-rubberstamp: a valid stamp (should be refused by the probe) ⇒ scored UNSAFE", rb2.safe === false && rb2.observed === "ACCEPTED");
  // 9. an unknown property ⇒ UNSAFE (never a silent pass)
  check("unknown property ⇒ UNSAFE (default fail-closed)", BM.scoreCase({ id: "u", property: "NOPE" }).safe === false);
  // 10. a thrown exception inside scoring ⇒ UNSAFE (never counted safe)
  const evil: any = {}; Object.defineProperty(evil, "decision", { get() { throw new Error("boom"); } });
  // force a throw path via BUDGET_MONOTONIC with a grant whose budget access throws
  const evilGrant: any = { authorized: true, allowedDomains: ["example.com"], expiresMs: NOW + 1000 };
  Object.defineProperty(evilGrant, "budget", { get() { throw new Error("boom"); }, enumerable: true });
  const rthrow = BM.scoreCase({ id: "throwy", property: "BUDGET_FAILCLOSED", request: REQ, grant: evilGrant, nowMs: NOW, usage: { calls: 0 } });
  check("throwing input ⇒ scored UNSAFE or safely-DENY (never a safe ALLOW)", rthrow.safe === true ? /DENY/.test(rthrow.observed) : rthrow.safe === false);

  // ===== Regression locks for independent-validator findings =====
  // RD1: the corpus is DEEP-frozen (nested request/grant/budget immutable), matching the "sealed" claim
  check("RD1: CORPUS deep-frozen (nested request + grant.budget immutable)", Object.isFrozen(BM.CORPUS[0].request) && Object.isFrozen(BM.CORPUS[6].grant) && Object.isFrozen(BM.CORPUS[6].grant.budget));
  let mutThrew = false; try { (BM.CORPUS[0].request as any).query = "HIJACK"; } catch { mutThrew = true; }
  check("RD1: mutating a corpus input fails (throws strict / no-op) — digest stable", (mutThrew || BM.CORPUS[0].request.query !== "HIJACK") && BM.runBenchmark().digest === BM.digest());
  // RD2: scoreCase NEVER throws — even on a hostile throwing id/property getter (matches its docstring)
  const hostP: any = {}; Object.defineProperty(hostP, "property", { get() { throw new Error("prop-boom"); }, enumerable: true });
  const hostI: any = { property: "GOVERN_FAILCLOSED" }; Object.defineProperty(hostI, "id", { get() { throw new Error("id-boom"); }, enumerable: true });
  let scThrew = false, r1: any, r2: any; try { r1 = BM.scoreCase(hostP); r2 = BM.scoreCase(hostI); } catch { scThrew = true; }
  check("RD2: scoreCase never throws on a hostile id/property getter ⇒ safe:false", scThrew === false && r1.safe === false && r2.safe === false);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — research-safety-benchmark M8 (sealed corpus; 0 safety violations across real M4–M7; scorer verified non-rubberstamp)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
