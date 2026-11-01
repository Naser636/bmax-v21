#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves evidence-pack-export (G-08): emit a compliance-evidence-pack in a
// machine-readable OSCAL-INTEROP shape — honest: oscalNative:false, NO satisfied/compliant status ever
// emitted (statuses ⊆ {OBSERVED,GAP,NOT_ASSESSED,INFO,REMEDIATION}), gaps→GAP findings, NOT_ASSESSED results
// → NOT_ASSESSED findings (never upgraded), disclaimer carried verbatim, fail-closed INVALID_PACK on non-pack
// input. Additive (does not modify compliance-evidence-pack); pure.
"use strict";
const assert = require("assert");
const X = require("./evidence-pack-export.js");
const C = require("./compliance-evidence-pack.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// a real pack WITHOUT aiAct/robustness ⇒ it will contain NOT_ASSESSED results + gaps.
const pack = C.buildEvidencePack({ repoName: "demo", sourceCommit: "abc123", lockPackages: { "left-pad": "2.0.0" }, artifactName: "a", artifactBytes: "x" });

// (1) a real pack exports to a valid interop shape; oscalNative:false; disclaimer carried.
{
  const res = X.exportPack(pack);
  ok("ok export, oscalNative:false, format OSCAL-INTEROP-SHAPE", res.ok && res.export.oscalNative === false && res.export.format === "OSCAL-INTEROP-SHAPE");
  ok("structurally valid per isInteropExport", X.isInteropExport(res.export) === true);
  ok("disclaimer carried verbatim from the pack", res.export.disclaimer === pack.disclaimer && /NOT certification/.test(res.export.disclaimer));
}

// (2) HONESTY: NO satisfied/compliant/pass/cert status is EVER emitted; illegalStatuses empty.
{
  const res = X.exportPack(pack);
  const all = [...res.export.observations, ...res.export.findings].map((e) => e.status);
  ok("every emitted status ∈ {OBSERVED,GAP,NOT_ASSESSED,INFO,REMEDIATION}", all.every((s) => X.STATUSES.includes(s)));
  ok("no SATISFIED/COMPLIANT/PASS/CERT status anywhere; illegalStatuses empty", all.every((s) => !/SATISF|COMPLIAN|PASS|CERT/i.test(s)) && res.export.illegalStatuses.length === 0);
}

// (3) mapping: gaps → GAP findings; NOT_ASSESSED results → NOT_ASSESSED findings (never upgraded to a pass).
{
  const res = X.exportPack(pack);
  ok("gaps mapped to GAP findings (pack has >=1 gap)", res.export.counts.gaps >= 1 && res.export.findings.some((f) => f.status === "GAP"));
  ok("NOT_ASSESSED results (no aiAct/robustness supplied) mapped to NOT_ASSESSED findings",
     res.export.counts.notAssessed >= 1 && res.export.findings.some((f) => f.status === "NOT_ASSESSED" && /NOT_ASSESSED/.test(f.detail)));
  ok("facts→INFO notes, recommendations→REMEDIATION notes", res.export.notes.some((n) => n.kind === "INFO") && res.export.notes.some((n) => n.kind === "REMEDIATION"));
}

// (4) subject carries repo/commit/sbom-count/provenance-signed honestly.
{
  const res = X.exportPack(pack);
  ok("subject: repoName/sourceCommit/sbomComponents/provenanceSigned", res.export.subject.repoName === "demo" && res.export.subject.sourceCommit === "abc123" && typeof res.export.subject.sbomComponents === "number" && res.export.subject.provenanceSigned === false);
}

// (5) a SIGNED pack ⇒ provenanceSigned true (honest reflection of the source).
{
  const crypto = require("crypto");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const signer = { privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }), publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) };
  const signed = C.buildEvidencePack({ repoName: "s", lockPackages: { "left-pad": "2.0.0" }, artifactName: "a", artifactBytes: "x", signer });
  const res = X.exportPack(signed);
  ok("signed pack ⇒ subject.provenanceSigned true", res.ok && res.export.subject.provenanceSigned === true);
}

// (6) FAIL-CLOSED: non-pack inputs ⇒ INVALID_PACK (never a hollow export).
{
  ok("wrong _type ⇒ INVALID_PACK", X.exportPack({ _type: "something-else", results: [], gaps: [] }).code === "INVALID_PACK");
  ok("missing results/gaps arrays ⇒ INVALID_PACK", X.exportPack({ _type: X.PACK_TYPE }).code === "INVALID_PACK");
  ok("null ⇒ INVALID_PACK", X.exportPack(null).code === "INVALID_PACK");
  ok("isInteropExport is deny-by-default on a non-export", X.isInteropExport({}) === false && X.isInteropExport(null) === false);
}

console.log(`\nevidence-pack-export: ${pass} assertions passed`);
