#!/usr/bin/env node
"use strict";
/* V12.4 §43 P5 — Cloud/DevOps/Platform reference. Proves: fail-closed config lint (plaintext secret / :latest / missing
 * limits ⇒ invalid; secretRef OK); controlled rollout HALTS+rolls back on an SLO breach; resource admission respects a
 * headroom reserve (no overcommit); recovery drill checks RTO/RPO; e2e; deterministic + frozen. */
const P5 = require("./profession-p5-platform-reference.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // config lint — positive + negative + security.
  check("valid config (pinned image, secretRef, limits set) ⇒ valid", P5.validateConfig({ name: "s", image: "s:1.2.3", env: { DB_PASSWORD: "secretRef:db/pw" }, resources: { cpu: 1, memMb: 512, replicas: 2 } }).valid === true);
  check("SECURITY: plaintext secret in env ⇒ invalid", P5.validateConfig({ name: "s", image: "s:1.0.0", env: { API_KEY: "sk-plain-123" }, resources: { cpu: 1, memMb: 512, replicas: 1 } }).findings.some((x: string) => /plaintext secret/.test(x)));
  check(":latest image + no resource limits ⇒ invalid (multiple findings)", (() => { const r = P5.validateConfig({ name: "s", image: "s:latest", env: {}, resources: {} }); return r.valid === false && r.findings.some((x: string) => /:latest/.test(x)) && r.findings.some((x: string) => /CPU/.test(x)); })());

  // controlled rollout — breach ⇒ rollback; healthy ⇒ promote.
  check("rollout HALTS + ROLLED_BACK on SLO breach (never promotes through a breach)", (() => { const r = P5.rolloutGate([1, 10, 50, 100], (s: number) => s >= 50 ? { errorRate: 0.05, p99Ms: 900 } : { errorRate: 0.001, p99Ms: 100 }, { maxErrorRate: 0.01, maxP99Ms: 500 }); return r.outcome === "ROLLED_BACK" && r.haltedAt === 50 && !r.promoted.includes(50); })());
  check("rollout PROMOTES all stages when healthy", P5.rolloutGate([1, 50, 100], () => ({ errorRate: 0.001, p99Ms: 120 }), { maxErrorRate: 0.01, maxP99Ms: 500 }).outcome === "PROMOTED");

  // resource budget — no overcommit past the reserve.
  check("resource admission respects headroom reserve (no overcommit)", (() => { const r = P5.resourceBudget([{ id: "a", cpu: 2, memMb: 1024 }, { id: "b", cpu: 3, memMb: 2048 }, { id: "c", cpu: 4, memMb: 4096 }], { cpu: 8, memMb: 8192 }, 0.2); return r.reserveRespected === true && r.rejected.length >= 1 && r.usedCpu <= 8 * 0.8; })());

  check("resource admission REJECTS nonsensical negative requests (no silent under-commit)", (() => { const r = P5.resourceBudget([{ id: "neg", cpu: -100, memMb: 10 }, { id: "ok", cpu: 1, memMb: 100 }], { cpu: 8, memMb: 8192 }, 0.2); return r.rejected.includes("neg") && r.admitted.includes("ok") && r.usedCpu >= 0; })());

  // recovery drill — RTO/RPO.
  check("recovery drill: within RTO/RPO ⇒ recovered", P5.recoveryDrill({ failedAtS: 100, detectedAtS: 105, recoveredAtS: 150, lastBackupAtS: 90, rtoTargetS: 120, rpoTargetS: 30 }).recovered === true);
  check("recovery drill: RPO breach (stale backup) ⇒ not recovered", P5.recoveryDrill({ failedAtS: 100, recoveredAtS: 150, lastBackupAtS: 10, rtoTargetS: 120, rpoTargetS: 30 }).rpoMet === false);

  const e2e = P5.runReferenceProject();
  check("e2e reference project holds (valid/invalid config, rollback, reserve, recovery)", e2e.e2eOk === true);
  check("deterministic + frozen + contract (synthetic, no production deploy)", JSON.stringify(P5.runReferenceProject()) === JSON.stringify(e2e) && Object.isFrozen(e2e) && P5.P5_PLATFORM_REFERENCE_CONTRACT.invariants.some((i: string) => /NO production deployment/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — profession-p5-platform-reference (config lint incl. plaintext-secret/:latest/no-limits; controlled rollout halt+rollback on SLO breach; resource admission with headroom reserve; RTO/RPO recovery drill; synthetic, no prod deploy)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
