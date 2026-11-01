#!/usr/bin/env node
/**
 * golden-path-evidence-demonstrator — ONE composed golden-path EVIDENCE-EMITTER run for profession P5 (Cloud,
 * DevOps & Platform Engineering). CTO Master Campaign V3, Wave-3 integrated demonstrator.
 *
 * ORCHESTRATES already-MERGED modules (NO new capability, NO new primitive):
 *   1. run a code-health check over the supplied files → code-health-service.runHealthCheck
 *   2. seal SBOM + confinement + health into a tamper-evident bundle → golden-path-evidence-bundle.makeBundle
 *   3. compose one verdict: GOLDEN_PATH_EVIDENCE_EMITTED (+ healthStatus, bundleAttested, gaps)
 *
 * HONEST SCOPE — MATURITY R1 (explicit): ODG has NO complete Internal Developer Platform (O8 is spec-only). This
 * demonstrator proves ONLY the EVIDENCE-EMISSION slice of "platform-as-product" — a golden path that emits a sealed
 * SBOM+confinement+health bundle — it is NOT an IDP, NOT self-service scaffolding, NOT a deploy. FAIL-CLOSED:
 * missing confinement/health/components ⇒ attested:false. PURE compute (files/sbom/confinement passed in; no
 * network/clock). NOTE: the bundle seal reads git HEAD for provenance unless a `revision` is injected
 * (fail-closed + cached, never network). ADDITIVE. Dual export.
 */
"use strict";

const CHS = require("./code-health-service.js");
const GP = require("./golden-path-evidence-bundle.js");

const SCHEMA = "odg.golden-path-evidence-demonstrator.v1";
const BASIS = "EVIDENCE_EMITTER_SLICE_NOT_IDP";
const MATURITY = "R1"; // ODG has NO complete IDP — this is the evidence-emission slice only.
const VERDICT = Object.freeze({ EMITTED: "GOLDEN_PATH_EVIDENCE_EMITTED", INCOMPLETE: "GOLDEN_PATH_EVIDENCE_INCOMPLETE" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runGoldenPathEvidence(input) — health → seal bundle. input:
 *   { files:[{path,language,content}], sbom, buildRef, confinement:{netOff,envCleared,roBinds?}, healthRunner?, key?, revision?, runId? }
 * NEVER throws on bad input (fail-closed).
 */
function runGoldenPathEvidence(input: any): any {
  if (!isObj(input)) return { ok: false, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, maturity: MATURITY, code: "INVALID_INPUT", reason: "input object required", basis: BASIS };
  const gaps: string[] = [];
  const steps: any = {};

  // STEP 1 — code-health check over the supplied files (fail-closed: a toolchain-probe error ⇒ gap, never a throw).
  let hc: any;
  const hcOpts: any = {};
  if (input.healthRunner) hcOpts.runner = input.healthRunner;
  if (isObj(input.healthToolchain)) hcOpts.toolchain = input.healthToolchain;
  try { hc = CHS.runHealthCheck(Array.isArray(input.files) ? { files: input.files } : { files: [] }, hcOpts); }
  catch (e: any) { hc = { ok: false, code: "HEALTH_THREW", reason: e && e.message ? e.message : "health check threw (toolchain probe?) — supply a runner for a hermetic run" }; }
  steps.health = hc;
  const counts = hc && hc.report && typeof hc.report.counts === "object" ? hc.report.counts : null;
  const healthOk = !!(hc && hc.ok === true && counts && counts.FAIL === 0 && counts.BLOCKED === 0 && counts.UNSUPPORTED === 0);
  if (!(hc && hc.ok)) gaps.push(`health check did not run: ${hc && hc.reason ? hc.reason : hc && hc.code ? hc.code : "unknown"}.`);
  else if (!healthOk) gaps.push(`health not clean: FAIL=${counts ? counts.FAIL : "?"} BLOCKED=${counts ? counts.BLOCKED : "?"} UNSUPPORTED=${counts ? counts.UNSUPPORTED : "?"} — bundle health will be absent⇒UNKNOWN.`);

  // STEP 2 — seal SBOM + confinement + health into the golden-path bundle (honest per-dimension attestation).
  const bundle = GP.makeBundle({
    sbom: input.sbom,
    buildRef: input.buildRef,
    confinement: input.confinement,
    health: { available: healthOk, status: healthOk ? "ok" : "not-clean" },
    key: input.key, revision: input.revision, runId: input.runId, spawn: input.spawn,
  });
  steps.bundle = bundle;
  const bundleAttested = !!(bundle && bundle.ok && bundle.bundle && bundle.bundle.attested === true);
  if (!(bundle && bundle.ok)) gaps.push(`bundle incomplete: missing ${bundle && Array.isArray(bundle.missing) ? bundle.missing.join(", ") : "unknown"}.`);
  else if (!bundleAttested) gaps.push("bundle sealed but attested:false — a present-but-not-attested dimension (see bundle.bundle.reasons).");

  return {
    ok: true,
    schema: SCHEMA,
    verdict: VERDICT.EMITTED,
    maturity: MATURITY,
    basis: BASIS,
    summary: {
      healthOk,
      healthCounts: counts,
      bundleAttested,
      gapCount: gaps.length,
    },
    gaps,
    steps,
    note: "Composed golden-path EVIDENCE-EMITTER (maturity R1): code-health check → sealed SBOM+confinement+health bundle. ODG has NO complete IDP — this is the evidence-emission slice only, NOT a platform, NOT self-service scaffolding, NOT a deploy. attested:true means all three dimensions attested on this run; nothing more.",
  };
}

export { runGoldenPathEvidence, SCHEMA, VERDICT, BASIS, MATURITY };
module.exports = { runGoldenPathEvidence, SCHEMA, VERDICT, BASIS, MATURITY };
