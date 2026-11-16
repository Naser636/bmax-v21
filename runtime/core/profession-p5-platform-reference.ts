#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P5 — Cloud / DevOps / Platform reference project. PURE, deterministic. Over CLEARLY-LABELLED SYNTHETIC
 * infrastructure/config/deploy inputs it computes the real platform-engineering signals: config validation (no plaintext
 * secrets, resource limits present), a CONTROLLED progressive-rollout gate (canary → promote, HALT+rollback on breach),
 * resource-budget admission (requests ≤ capacity with a headroom reserve), and a recovery drill (RTO/RPO). Synthetic
 * only; NO production deployment (owner-gated, NOT_RUN). Matches the profession-p*-reference architecture. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }

const SECRET_KEY = /(password|secret|token|api[_-]?key|private[_-]?key)/i;
const PLACEHOLDER = /^(\$\{[^}]+\}|<[^>]+>|env:|vault:|secretRef:)/i; // a reference, not an inlined secret

/* validateConfig(cfg) -> fail-closed config lint. cfg: { name, image, env:{}, resources:{cpu,memMb,replicas} }. */
function validateConfig(cfg: any): any {
  const c = isObj(cfg) ? cfg : {};
  const findings: string[] = [];
  if (typeof c.name !== "string" || !c.name) findings.push("missing name");
  if (typeof c.image !== "string" || !c.image) findings.push("missing image");
  if (typeof c.image === "string" && /:latest$/.test(c.image)) findings.push("image pinned to :latest (non-reproducible)");
  const env = isObj(c.env) ? c.env : {};
  for (const [k, v] of Object.entries(env)) {
    if (SECRET_KEY.test(k) && typeof v === "string" && v && !PLACEHOLDER.test(v)) findings.push("plaintext secret in env." + k);
  }
  const r = isObj(c.resources) ? c.resources : {};
  if (!(num(r.cpu) > 0)) findings.push("no CPU limit");
  if (!(num(r.memMb) > 0)) findings.push("no memory limit");
  if (!(num(r.replicas) >= 1)) findings.push("no replica count");
  return Object.freeze({ valid: findings.length === 0, findings: Object.freeze(findings) });
}

/* rolloutGate(stages, metricOf, slo) -> controlled progressive rollout: promote stage-by-stage, HALT+rollback on an SLO
 * breach (error rate / latency). stages e.g. [1,10,50,100] (% traffic). metricOf(stage)->{errorRate, p99Ms}. */
function rolloutGate(stages: any, metricOf: (s: number) => any, slo: any): any {
  const s = isObj(slo) ? slo : {};
  const maxErr = num(s.maxErrorRate, 0.01), maxP99 = num(s.maxP99Ms, Infinity);
  const promoted: number[] = [];
  for (const stage of arr(stages)) {
    const m = metricOf(stage) || {};
    if (num(m.errorRate, 1) > maxErr || num(m.p99Ms, Infinity) > maxP99) {
      return Object.freeze({ outcome: "ROLLED_BACK", haltedAt: stage, promoted: Object.freeze(promoted), reason: "SLO breach at " + stage + "% (errorRate " + num(m.errorRate) + " / p99 " + num(m.p99Ms) + "ms)" });
    }
    promoted.push(stage);
  }
  return Object.freeze({ outcome: "PROMOTED", haltedAt: null, promoted: Object.freeze(promoted), reason: "all stages within SLO" });
}

/* resourceBudget(requests, capacity, reserveFrac) -> admission under a headroom reserve (no overcommit). */
function resourceBudget(requests: any, capacity: any, reserveFrac = 0.2): any {
  const cap = isObj(capacity) ? capacity : {};
  const usable = { cpu: num(cap.cpu) * (1 - reserveFrac), memMb: num(cap.memMb) * (1 - reserveFrac) };
  let cpu = 0, mem = 0; const admitted: string[] = [], rejected: string[] = [];
  for (const req of arr(requests)) {
    const rc = num(req.cpu), rm = num(req.memMb);
    if (rc < 0 || rm < 0) { rejected.push(req.id); continue; } // reject nonsensical negative requests (no silent under-commit)
    if (cpu + rc <= usable.cpu && mem + rm <= usable.memMb) { cpu += rc; mem += rm; admitted.push(req.id); }
    else rejected.push(req.id);
  }
  return Object.freeze({ admitted: Object.freeze(admitted), rejected: Object.freeze(rejected), usedCpu: cpu, usedMemMb: mem, reserveRespected: cpu <= usable.cpu && mem <= usable.memMb });
}

/* recoveryDrill(incident) -> RTO/RPO vs objectives from a synthetic timeline. */
function recoveryDrill(incident: any): any {
  const i = isObj(incident) ? incident : {};
  const rto = num(i.detectedAtS) >= 0 && num(i.recoveredAtS) >= 0 ? num(i.recoveredAtS) - num(i.failedAtS) : null;
  const rpo = num(i.lastBackupAtS) >= 0 ? num(i.failedAtS) - num(i.lastBackupAtS) : null;
  const rtoOk = rto !== null && rto <= num(i.rtoTargetS, Infinity);
  const rpoOk = rpo !== null && rpo <= num(i.rpoTargetS, Infinity);
  return Object.freeze({ rtoS: rto, rpoS: rpo, rtoMet: rtoOk, rpoMet: rpoOk, recovered: rtoOk && rpoOk });
}

/* runReferenceProject() -> an end-to-end synthetic platform reference run. */
function runReferenceProject(): any {
  const config = validateConfig({ name: "svc", image: "svc:1.4.2", env: { LOG_LEVEL: "info", DB_PASSWORD: "secretRef:db/pw" }, resources: { cpu: 2, memMb: 1024, replicas: 3 } });
  const badConfig = validateConfig({ name: "svc", image: "svc:latest", env: { API_KEY: "sk-plaintext-123" }, resources: {} });
  const rollout = rolloutGate([1, 10, 50, 100], (s) => s >= 50 ? { errorRate: 0.05, p99Ms: 900 } : { errorRate: 0.002, p99Ms: 180 }, { maxErrorRate: 0.01, maxP99Ms: 500 });
  const budget = resourceBudget([{ id: "a", cpu: 2, memMb: 1024 }, { id: "b", cpu: 3, memMb: 2048 }, { id: "c", cpu: 4, memMb: 4096 }], { cpu: 8, memMb: 8192 }, 0.2);
  const recovery = recoveryDrill({ failedAtS: 100, detectedAtS: 110, recoveredAtS: 160, lastBackupAtS: 90, rtoTargetS: 120, rpoTargetS: 30 });
  return Object.freeze({ config, badConfig, rollout, budget, recovery,
    e2eOk: config.valid === true && badConfig.valid === false && rollout.outcome === "ROLLED_BACK" && budget.reserveRespected === true && recovery.recovered === true });
}

const P5_PLATFORM_REFERENCE_CONTRACT = Object.freeze({
  id: "V12.4-P5-PLATFORM-REFERENCE",
  purpose: "§43 P5 — Cloud/DevOps/Platform reference: config lint, controlled progressive rollout (halt+rollback on SLO breach), resource-budget admission, recovery drill; synthetic only, no production deploy",
  invariants: Object.freeze([
    "fail-closed config lint: plaintext secrets / missing resource limits / :latest image ⇒ invalid (a secretRef/env placeholder is OK)",
    "rollout is CONTROLLED: an SLO breach at any stage ⇒ HALT + ROLLED_BACK (never auto-promote through a breach)",
    "resource admission respects a headroom reserve — no overcommit; recovery drill checks RTO/RPO vs objectives",
    "PURE/deterministic over SYNTHETIC inputs; NO production deployment (owner-gated, NOT_RUN); no 10th primitive",
  ]),
});

module.exports = { validateConfig, rolloutGate, resourceBudget, recoveryDrill, runReferenceProject, P5_PLATFORM_REFERENCE_CONTRACT };
export {};
