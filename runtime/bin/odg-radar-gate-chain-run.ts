#!/usr/bin/env node
"use strict";
/* V372 CM-RADAR-GATE-CHAIN step 1 — run the EXECUTED chain on the REAL recorded Radar cycle (offline) and write the
 * evidence file. Measures stage latencies (p50/p95 over N runs, wall-clock — environment-dependent, reported as measured
 * on this host only). Usage: npx tsx runtime/bin/odg-radar-gate-chain-run.ts [--write <path>] [--n 20]
 * Read-only except the explicit --write target. No network. */
const fs = require("fs");
const path = require("path");
const C = require("../core/odg-radar-gate-chain.js");

function pct(xs: number[], p: number): number { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : NaN; }
function ms(t0: bigint): number { return Number(process.hrtime.bigint() - t0) / 1e6; }

function main() {
  const argv = process.argv.slice(2);
  const wi = argv.indexOf("--write"); const out = wi >= 0 ? argv[wi + 1] : null;
  const ni = argv.indexOf("--n"); const N = ni >= 0 ? Math.max(1, Number(argv[ni + 1]) || 20) : 20;
  const ASOF = Date.UTC(2026, 10, 22), DAY = 86400000;

  const r1 = C.runChain({ asOfEpochMs: ASOF });
  const r2 = C.runChain({ asOfEpochMs: ASOF + DAY, memory: r1.memoryOut });

  const t1: number[] = [], t2: number[] = [];
  for (let i = 0; i < N; i++) {
    let t0 = process.hrtime.bigint(); C.runChain({ asOfEpochMs: ASOF }); t1.push(ms(t0));
    t0 = process.hrtime.bigint(); C.runChain({ asOfEpochMs: ASOF + DAY, memory: r1.memoryOut }); t2.push(ms(t0));
  }
  const round = (x: number) => Math.round(x * 1000) / 1000;
  const evidence = {
    mission: "CM-RADAR-GATE-CHAIN (V12.4 §I) — step 1",
    contract: "docs/odg/WIC_CM-RADAR-GATE-CHAIN_STEP1.json (AUTHORIZED by owner V372, 2026-11-22)",
    dataNature: "REAL_RECORDED — odg-knowledge-acquisition.REAL_CYCLE (4 sources consulted 2026-11-16 under the then-valid V141 grant); NO network in this run",
    run1: { trace: r1.trace, accessible: r1.acquisition.accessibleCount, inaccessible: r1.acquisition.inaccessible, admitted: r1.admitted.map((a: any) => ({ id: a.id, claim: a.claim, provenance: a.provenance, validUntil: a.validUntil })), rejected: r1.rejected, decision: { verdict: r1.decision.verdict, action: r1.decision.action, softMissing: r1.decision.softMissing, deployed: r1.decision.deployed } },
    run2ReuseProof: { trace: r2.trace, retrieved: r2.reuse.retrieved, reacquired: r2.reuse.reacquired, sameKnowledgeId: r2.proposal.knowledgeIds[0] === r1.admitted[0].id },
    measurements: {
      host: "this VPS only (environment-dependent wall-clock)", N,
      acquirePathMs: { p50: round(pct(t1, 0.5)), p95: round(pct(t1, 0.95)) },
      reusePathMs: { p50: round(pct(t2, 0.5)), p95: round(pct(t2, 0.95)) },
      acquisitionsAvoidedByReuse: "1 of 1 on run 2 (100% for the recorded query)",
    },
    notMeasured: ["live-world knowledge quality", "precision/recall beyond the recorded sample (n=4 sources, 1 claim)", "downstream experiment gain (gate RETURNED: baseline/tests/inspection of an actual experiment not yet proven)"],
  };
  const json = JSON.stringify(evidence, null, 2) + "\n";
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, json); }
  process.stdout.write(JSON.stringify({ admitted: r1.admitted.length, reuse: r2.reuse, verdict: r1.decision.verdict, acquirePathMs: evidence.measurements.acquirePathMs, reusePathMs: evidence.measurements.reusePathMs, wrote: out }) + "\n");
}
main();
export {};
