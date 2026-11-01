#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves golden-path-evidence-bundle (G-05): assemble a sealed per-run bundle
// from SBOM + confinement attestation + health snapshot — fail-closed and honest: INCOMPLETE_BUNDLE listing
// missing inputs, per-dimension attestation never silently upgraded (confined only if netOff&&envCleared;
// healthy only if available), overall attested = components&&confined&&healthy, tamper-evident, and the basis
// is EVIDENCE_PREP_NOT_CONFORMITY (never certification). Pure (hermetic revision injected).
"use strict";
const assert = require("assert");
const B = require("./golden-path-evidence-bundle.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const REV = { commit: "test0000", treeDirty: false, available: true };
const full = { buildRef: "run-1@abc", sbom: { ok: true, sbom: { components: [{ name: "x", version: "1" }, { name: "y", version: "2" }] } }, confinement: { netOff: true, envCleared: true, roBinds: ["/usr"] }, health: { available: true, status: "SYSTEM_READY" }, revision: REV };

// (1) FAIL-CLOSED: each missing required input is listed; never an assembled bundle over absent evidence.
{
  ok("missing everything ⇒ INCOMPLETE_BUNDLE listing all four", (() => { const r = B.makeBundle({ revision: REV }); return r.ok === false && r.code === "INCOMPLETE_BUNDLE" && ["buildRef", "sbom(components[])", "confinement", "health"].every((m) => r.missing.includes(m)); })());
  ok("missing only health ⇒ INCOMPLETE_BUNDLE missing:[health]", (() => { const r = B.makeBundle({ ...full, health: undefined }); return r.code === "INCOMPLETE_BUNDLE" && r.missing.length === 1 && r.missing[0] === "health"; })());
  ok("sbom without components ⇒ listed missing", B.makeBundle({ ...full, sbom: { ok: true, sbom: { components: "nope" } } }).missing.includes("sbom(components[])"));
  ok("non-object input ⇒ INCOMPLETE_BUNDLE", B.makeBundle(null).code === "INCOMPLETE_BUNDLE");
}

// (2) full, attested bundle: sealed, attested:true, basis NOT conformity.
{
  const r = B.makeBundle(full);
  ok("all dimensions present + attested ⇒ ok, attested:true, sealed", r.ok && r.bundle.attested === true && r.bundle.provenance && typeof r.bundle.provenance.contentSha256 === "string");
  ok("basis is EVIDENCE_PREP_NOT_CONFORMITY (never certification); note says not conformity", r.bundle.basis === "EVIDENCE_PREP_NOT_CONFORMITY" && /NOT CRA\/ISO conformity/.test(r.note));
  ok("records sbom component count + confinement roBinds + health status", r.bundle.dimensions.sbom.components === 2 && r.bundle.dimensions.confinement.roBinds === 1 && r.bundle.dimensions.health.status === "SYSTEM_READY");
}

// (3) HONESTY: confinement present but NOT attested (netOff false) ⇒ attested:false + reason (never upgraded).
{
  const r = B.makeBundle({ ...full, confinement: { netOff: false, envCleared: true } });
  ok("netOff false ⇒ confined:false, overall attested:false, reason recorded",
     r.ok && r.bundle.dimensions.confinement.confined === false && r.bundle.attested === false &&
     r.bundle.reasons.some((x) => /netOff !== true/.test(x)) && /attested:false/.test(r.note));
}

// (4) HONESTY: health unavailable ⇒ healthy:false (absent ⇒ UNKNOWN, not a pass) ⇒ attested:false.
{
  const r = B.makeBundle({ ...full, health: { available: false } });
  ok("health unavailable ⇒ healthy:false, attested:false, reason mentions UNKNOWN",
     r.ok && r.bundle.dimensions.health.available === false && r.bundle.attested === false && r.bundle.reasons.some((x) => /UNKNOWN/.test(x)));
}

// (5) raw CycloneDX ({components}) input also accepted (not only the sbom-audit-service wrapper).
{
  const r = B.makeBundle({ ...full, sbom: { components: [{ name: "z", version: "9" }] } });
  ok("raw CycloneDX {components} accepted ⇒ components counted", r.ok && r.bundle.dimensions.sbom.components === 1);
}

// (6) TAMPER-EVIDENCE: altering a sealed bundle ⇒ verifyBundle fails; intact + keyed verify honored.
{
  const r = B.makeBundle(full);
  ok("intact bundle verifies", B.verifyBundle(r.bundle).ok === true);
  const t = JSON.parse(JSON.stringify(r.bundle)); t.attested = false; // flip the sealed attestation
  ok("altered sealed bundle ⇒ verifyBundle fails (tamper detected)", B.verifyBundle(t).ok === false);
  const keyed = B.makeBundle({ ...full, key: "K" });
  ok("keyed bundle verifies WITH key, fails WITHOUT (fail-closed)", B.verifyBundle(keyed.bundle, { key: "K" }).ok === true && B.verifyBundle(keyed.bundle).ok === false);
}

// (7) DETERMINISM: identical inputs+revision ⇒ identical seal digest.
{
  const a = B.makeBundle(full); const b = B.makeBundle(full);
  ok("deterministic seal", a.bundle.provenance.contentSha256 === b.bundle.provenance.contentSha256);
}

console.log(`\ngolden-path-evidence-bundle: ${pass} assertions passed`);
