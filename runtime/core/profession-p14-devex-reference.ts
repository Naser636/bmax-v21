#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P14 — IDP / Developer-Experience (golden-path) reference project (E2 + E3). PURE, deterministic. The P14
 * signal is "a golden path that EMITS verifiable evidence, honestly" — NOT a certification. It REUSES
 * golden-path-evidence-bundle (makeBundle + verifyBundle, basis EVIDENCE_PREP_NOT_CONFORMITY) with NO second
 * bundler, and DEMONSTRATES: a complete scaffold (buildRef + sbom components + confinement netOff/envCleared +
 * health available) => attested; an incomplete scaffold (missing health / zero components / unconfined) => NOT
 * attested with the gap reasons surfaced (fail-closed, never silently upgraded). Synthetic; a real scaffolded
 * project graduating to CI (E5) is owner-gated NOT_RUN. Dual export.
 */

const GP = require("./golden-path-evidence-bundle");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

function completeInput(): any {
  return {
    buildRef: "p14-golden-path@deadbeef",
    sbom: { bomFormat: "CycloneDX", components: [{ name: "a" }, { name: "b" }] },
    confinement: { netOff: true, envCleared: true, roBinds: ["/usr"] },
    health: { available: true, status: "ok" },
  };
}

/** scaffoldEvidence(input) -> { attested, missing, reasons }. attested only when every dimension is honestly present. */
function scaffoldEvidence(input: any): any {
  const made = GP.makeBundle(isObj(input) ? input : {});
  if (made.ok === false) return Object.freeze({ attested: false, missing: Object.freeze(Array.isArray(made.missing) ? made.missing : []), reasons: Object.freeze([]) });
  const bundle = isObj(made.bundle) ? made.bundle : {};
  const v = GP.verifyBundle(bundle);                 // integrity: the sealed bundle must verify
  return Object.freeze({ attested: bundle.attested === true && v.ok !== false, missing: Object.freeze([]), reasons: Object.freeze(Array.isArray(bundle.reasons) ? bundle.reasons : []) });
}

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const input = isObj(o.input) ? o.input : completeInput();
  const result = scaffoldEvidence(input);
  const degraded = !result.attested;
  return Object.freeze({
    synthetic: true, profession: "P14", scaffold: result,
    level: "E2", degraded, note: "SYNTHETIC golden-path scaffold (not a real graduated project, not E5); evidence bundle attested only when every dimension is honestly present (basis EVIDENCE_PREP_NOT_CONFORMITY); a real scaffold graduating to CI (E5) owner-gated NOT_RUN",
  });
}

const P14_DEVEX_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P14-DEVEX-REFERENCE",
  source: "V12.4 §43 P14 (IDP/DevEx golden-path) — E2 reference + E3 (incomplete scaffold / unconfined)",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  reuses: Object.freeze(["golden-path-evidence-bundle.makeBundle + verifyBundle (EVIDENCE_PREP_NOT_CONFORMITY)"]),
  notAuthority: "a runnable golden-path evidence reference; evidence-prep is NOT conformity/certification; no E5 claim",
  invariants: Object.freeze([
    "attestation requires EVERY dimension present (sbom components + confinement + health); a gap is surfaced, never upgraded",
    "basis is EVIDENCE_PREP_NOT_CONFORMITY — the bundle is preparation, not a conformity verdict",
    "SYNTHETIC scaffold only; a real project graduating to CI (E5) owner-gated NOT_RUN (no inflated level)",
    "reuses golden-path-evidence-bundle; no second evidence bundler",
  ]),
});

module.exports = { scaffoldEvidence, runReferenceProject, P14_DEVEX_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P14_DEVEX_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
