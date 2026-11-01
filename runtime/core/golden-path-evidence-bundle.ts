#!/usr/bin/env node
/**
 * golden-path-evidence-bundle — assemble a per-run, sealed GOLDEN-PATH EVIDENCE BUNDLE from the artifacts a
 * governed build reference already produced: a CycloneDX SBOM (O2 sbom-audit-service), a confinement
 * attestation (the untrusted-build step ran net-off + env-cleared), and an odg-health snapshot — bound
 * together, tamper-evident, under one provenance seal. CAPABILITY_GAP_REGISTER_V1.md G-05 (P2; cross-domain
 * D03/D06/D09).
 *
 * HONEST SCOPE (D06): ODG has NO IDP product (O8 = SPEC-ONLY). This is the EVIDENCE a golden-path *reference*
 * emits — evidence/readiness preparation, explicitly NOT CRA/ISO conformity or certification. It does NOT run
 * the build: it is a PURE composer over artifacts passed in (so it has no fs/network/clock/spawn of its own).
 *
 * FAIL-CLOSED / NO FABRICATION:
 *   - a missing or malformed required input (buildRef / SBOM-with-components / confinement object / health
 *     object) ⇒ INCOMPLETE_BUNDLE listing exactly what is missing — never an assembled-looking bundle over
 *     absent evidence.
 *   - dimensions are recorded HONESTLY: confinement attested ONLY when netOff===true AND envCleared===true;
 *     health attested ONLY when available===true. Present-but-not-attested is recorded as attested:false with
 *     a reason — NEVER silently upgraded. `attested` (overall) = SBOM-has-components AND confined AND healthy.
 *   - a missing odg-health source ⇒ healthy:false (absent ⇒ UNKNOWN, per odg-health doctrine), not a pass.
 *
 * REUSES the EVIDENCE primitive (evidence-provenance stamp/verify). NO new primitive. Dual export (ESM + CJS).
 */
"use strict";

const EP: any = require("./evidence-provenance.js");

const SCHEMA = "odg.golden-path-evidence-bundle.v1";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// Accept either a sbom-audit-service result ({ ok, sbom:{components}, audit }) or a raw CycloneDX ({ components }).
function extractSbom(input: any): any {
  if (!isObj(input)) return null;
  if (isObj(input.sbom) && Array.isArray(input.sbom.components)) return { components: input.sbom.components.length, bomFormat: input.sbom.bomFormat || "CycloneDX", audit: isObj(input.audit) ? { componentCount: input.audit.componentCount ?? input.sbom.components.length } : null };
  if (Array.isArray(input.components)) return { components: input.components.length, bomFormat: input.bomFormat || "CycloneDX", audit: null };
  return null;
}

// Assemble + seal. opts threaded to evidence-provenance (key/revision/runId/spawn).
function makeBundle(input: any): any {
  if (!isObj(input)) return { ok: false, code: "INCOMPLETE_BUNDLE", missing: ["input"], basis: "EVIDENCE_PREP_NOT_CONFORMITY" };
  const missing: string[] = [];

  const buildRef = typeof input.buildRef === "string" ? input.buildRef.trim() : "";
  if (!buildRef) missing.push("buildRef");

  const sbom = extractSbom(input.sbom);
  if (!sbom) missing.push("sbom(components[])");

  const conf = input.confinement;
  if (!isObj(conf)) missing.push("confinement");

  const health = input.health;
  if (!isObj(health)) missing.push("health");

  if (missing.length > 0) return { ok: false, code: "INCOMPLETE_BUNDLE", missing, basis: "EVIDENCE_PREP_NOT_CONFORMITY" };

  // Honest per-dimension attestation (never silently upgraded).
  const confined = conf.netOff === true && conf.envCleared === true;
  const confReasons = confined ? [] : [
    conf.netOff === true ? null : "confinement not attested: netOff !== true",
    conf.envCleared === true ? null : "confinement not attested: envCleared !== true",
  ].filter(Boolean);
  const healthy = health.available === true;
  const hasComponents = sbom.components > 0;

  const attested = hasComponents && confined && healthy;
  const dimensionReasons = ([] as string[]).concat(
    hasComponents ? [] : ["sbom has zero components"],
    confReasons as string[],
    healthy ? [] : ["health snapshot unavailable (absent ⇒ UNKNOWN, not healthy)"],
  );

  const core = {
    schema: SCHEMA,
    basis: "EVIDENCE_PREP_NOT_CONFORMITY",
    buildRef,
    attested,
    dimensions: {
      sbom: { present: true, bomFormat: sbom.bomFormat, components: sbom.components, hasComponents },
      confinement: { present: true, netOff: conf.netOff === true, envCleared: conf.envCleared === true, roBinds: Array.isArray(conf.roBinds) ? conf.roBinds.length : 0, confined },
      health: { present: true, available: healthy, status: healthy && typeof health.status === "string" ? health.status : null },
    },
    reasons: dimensionReasons,
  };
  const bundle = EP.stampProvenance(core, { key: input.key, revision: input.revision, runId: input.runId, spawn: input.spawn });
  return {
    ok: true,
    bundle,
    note: attested
      ? "Golden-path evidence bundle assembled + sealed; all dimensions attested. This is evidence/readiness preparation, NOT CRA/ISO conformity or certification."
      : "Bundle assembled + sealed, but attested:false — one or more dimensions are present-but-not-attested (see reasons). NOT a clean/conformant result.",
  };
}

// Verify a sealed bundle (tamper-evidence). opts.key required for a keyed seal.
function verifyBundle(bundle: any, opts?: any): any {
  const key = opts && typeof opts === "object" ? opts.key : undefined;
  const v = EP.verifyProvenance(bundle, { key });
  if (!v.ok) return { ok: false, reason: v.reason, basis: "EVIDENCE_PREP_NOT_CONFORMITY" };
  if (!bundle || bundle.schema !== SCHEMA || !isObj(bundle.dimensions)) return { ok: false, reason: "not a golden-path evidence bundle", basis: "EVIDENCE_PREP_NOT_CONFORMITY" };
  return { ok: true, reason: v.reason, attested: bundle.attested === true, buildRef: bundle.buildRef };
}

export { extractSbom, makeBundle, verifyBundle, SCHEMA };
module.exports = { extractSbom, makeBundle, verifyBundle, SCHEMA };

if (require.main === module) {
  const rev = { commit: "demo", treeDirty: false, available: true };
  const b = makeBundle({ buildRef: "run-1@abc", sbom: { ok: true, sbom: { components: [{ name: "x", version: "1" }] } }, confinement: { netOff: true, envCleared: true, roBinds: ["/usr"] }, health: { available: true, status: "SYSTEM_READY" }, revision: rev });
  process.stdout.write(JSON.stringify({ ok: b.ok, attested: b.bundle && b.bundle.attested, verify: verifyBundle(b.bundle).ok }, null, 2) + "\n");
}
