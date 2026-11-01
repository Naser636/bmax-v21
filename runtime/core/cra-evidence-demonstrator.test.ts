// @ts-nocheck
// cra-evidence-demonstrator — composition + fail-closed + tamper-evidence + honesty-invariant tests.
// Verifies the P3 Wave-1 demonstrator wires the five MERGED modules into ONE honest verdict: a clean MIT
// project prepares attested evidence with ciGate 0; a GPL component fails the gate (ciGate 1, policyClean
// false); an unknown license needs review; missing manifests/confinement fail closed; the verdict is NEVER
// conformity/certification; the sealed bundle is tamper-evident (mutation flips verify to fail); determinism holds.
"use strict";
const assert = require("assert");
const D = require("./cra-evidence-demonstrator.js");

let n = 0;
const ok = (name, cond) => { n++; assert.ok(cond, name); };

const npmLock = (pkgs) => JSON.stringify({ name: "fix", lockfileVersion: 3, packages: pkgs });
const mitSources = [{ content: npmLock({ "": { name: "x" }, "node_modules/a": { version: "1.0.0", license: "MIT" }, "node_modules/b": { version: "2.0.0", license: "Apache-2.0" } }), ecosystem: "npm" }];
const goodConf = { netOff: true, envCleared: true, roBinds: ["/usr"] };
const goodHealth = { available: true, status: "ok" };
const baseInput = (over) => Object.assign({
  sources: mitSources, target: "commercial-closed",
  lockPackages: { "node_modules/a": { version: "1.0.0", license: "MIT" }, "node_modules/b": { version: "2.0.0", license: "Apache-2.0" } },
  repoName: "demo", sourceCommit: "abc123", artifactName: "demo@1", artifactBytes: "hello-world-artifact",
  buildRef: "build-001", confinement: goodConf, health: goodHealth,
}, over || {});

// (1) CLEAN MIT project ⇒ PREPARED, ciGate 0, policyClean, components>0, interop export, bundle attested.
(() => {
  const r = D.runCraEvidence(baseInput());
  ok("clean: ok + verdict PREPARED", r.ok && r.verdict === D.VERDICT.PREPARED);
  ok("clean: ciGate 0 (no HIGH finding)", r.ciGate === 0);
  ok("clean: policyClean true, needsReview false", r.summary.policyClean === true && r.summary.needsReview === false);
  ok("clean: components > 0", r.summary.componentCount > 0);
  ok("clean: interop export valid", r.summary.interopExport === true && D !== null && r.interopExport && r.interopExport.oscalNative === false);
  ok("clean: bundle attested true", r.summary.bundleAttested === true);
  ok("clean: zero gaps", r.gaps.length === 0);
})();

// (2) GPL-3.0 ⇒ FAIL-CLOSED: ciGate 1, policyClean false, gap present. (verdict stays PREPARED — gate carries signal)
(() => {
  const r = D.runCraEvidence(baseInput({
    sources: [{ content: npmLock({ "": { name: "x" }, "node_modules/gpllib": { version: "1.0.0", license: "GPL-3.0-only" } }), ecosystem: "npm" }],
    lockPackages: { "node_modules/gpllib": { version: "1.0.0", license: "GPL-3.0-only" } },
  }));
  ok("gpl: ciGate 1 (build should fail)", r.ciGate === 1);
  ok("gpl: policyClean false", r.summary.policyClean === false);
  ok("gpl: a HIGH-license gap is reported", r.gaps.some((g) => /HIGH-severity|non-adoptable|build should FAIL/i.test(g)));
})();

// (3) UNKNOWN/missing license ⇒ needsReview true (fail-closed, never assumed safe).
(() => {
  const r = D.runCraEvidence(baseInput({
    sources: [{ content: npmLock({ "": { name: "x" }, "node_modules/mystery": { version: "0.1.0" } }), ecosystem: "npm" }],
    lockPackages: { "node_modules/mystery": { version: "0.1.0" } },
  }));
  ok("unknown: needsReview true", r.summary.needsReview === true);
  ok("unknown: a manual-review gap is reported", r.gaps.some((g) => /UNKNOWN|manual review/i.test(g)));
})();

// (4) NO manifests ⇒ fail-closed: ciGate 2, audit gap, still a well-formed result (no throw).
(() => {
  const r = D.runCraEvidence(baseInput({ sources: [] }));
  ok("no-manifest: ok result, ciGate 2 (fail-closed, not a silent 0)", r.ok && r.ciGate === 2);
  ok("no-manifest: audit-not-run gap reported", r.gaps.some((g) => /audit did not run|NO_MANIFEST|no manifests/i.test(g)));
})();

// (5) MISSING confinement/health ⇒ bundle INCOMPLETE, bundleAttested false, gap.
(() => {
  const r = D.runCraEvidence(baseInput({ confinement: undefined, health: undefined }));
  ok("no-conf: bundleAttested false", r.summary.bundleAttested === false);
  ok("no-conf: a bundle-incomplete gap is reported", r.gaps.some((g) => /bundle incomplete|confinement|health/i.test(g)));
})();

// (6) present-but-not-attested confinement (netOff false) ⇒ bundle sealed but attested:false.
(() => {
  const r = D.runCraEvidence(baseInput({ confinement: { netOff: false, envCleared: true } }));
  ok("weak-conf: bundle sealed but attested false", r.steps.bundle.ok === true && r.summary.bundleAttested === false);
  ok("weak-conf: not-attested gap reported", r.gaps.some((g) => /attested:false|not-attested/i.test(g)));
})();

// (7) HONESTY INVARIANT: verdict never conformity/cert; interop emits no illegal status; note disclaims.
(() => {
  const r = D.runCraEvidence(baseInput());
  ok("honesty: verdict is EVIDENCE-prep, never CONFORMANT/CERT/PASS", !/CONFORM|CERT|\bPASS\b|SATISF/i.test(r.verdict) && r.verdict === "CRA_EVIDENCE_PREPARED");
  ok("honesty: basis EVIDENCE_PREP_NOT_CONFORMITY", r.basis === "EVIDENCE_PREP_NOT_CONFORMITY");
  ok("honesty: interop illegalStatuses empty", r.interopExport && Array.isArray(r.interopExport.illegalStatuses) && r.interopExport.illegalStatuses.length === 0);
  ok("honesty: note says NOT certification + NOT a CVE scan", /NOT certification/i.test(r.note) && /NOT a CVE scan/i.test(r.note) && r.summary.cveScan === "NOT_PERFORMED");
})();

// (8) verifyCraEvidence: re-verifies the sealed bundle + pack attestation.
(() => {
  const r = D.runCraEvidence(baseInput());
  const v = D.verifyCraEvidence(r, { artifactBytes: "hello-world-artifact" });
  ok("verify: sealed bundle re-verifies ok", v.checks.bundle.ok === true);
  ok("verify: pack attestation re-verifies ok (digest match)", v.checks.pack.ok === true);
  ok("verify: overall ok", v.ok === true);
})();

// (9) TAMPER (mutation): altering the sealed bundle must flip verify to fail.
(() => {
  const r = D.runCraEvidence(baseInput());
  r.steps.bundle.bundle.buildRef = "TAMPERED";
  const v = D.verifyCraEvidence(r, { artifactBytes: "hello-world-artifact" });
  ok("tamper: mutated bundle ⇒ bundle verify FAILS", v.checks.bundle.ok === false);
  ok("tamper: overall verify FAILS", v.ok === false);
})();

// (10) TAMPER (mutation): wrong artifactBytes ⇒ pack attestation verify fails.
(() => {
  const r = D.runCraEvidence(baseInput());
  const v = D.verifyCraEvidence(r, { artifactBytes: "DIFFERENT-bytes" });
  ok("tamper: wrong artifactBytes ⇒ pack verify FAILS", v.checks.pack.ok === false && v.ok === false);
})();

// (11) FAIL-CLOSED input: non-object ⇒ INVALID_INPUT, no throw.
(() => {
  const r = D.runCraEvidence(null);
  ok("bad-input: INVALID_INPUT, verdict INCOMPLETE, ok false", r.ok === false && r.code === "INVALID_INPUT" && r.verdict === D.VERDICT.INCOMPLETE);
  const v = D.verifyCraEvidence("not-a-result");
  ok("bad-verify: non-result ⇒ fail-closed", v.ok === false);
})();

// (12) DETERMINISM: same keyless input ⇒ byte-identical sealed bundle (re-verifiable, stable).
(() => {
  const a = D.runCraEvidence(baseInput());
  const b = D.runCraEvidence(baseInput());
  ok("determinism: identical sealed bundle across runs", JSON.stringify(a.steps.bundle.bundle) === JSON.stringify(b.steps.bundle.bundle));
})();

console.log(`cra-evidence-demonstrator: ${n} checks passed`);
