// @ts-nocheck
// golden-path-evidence-demonstrator — health→seal composition (maturity R1, evidence-emitter slice only, NO IDP).
// A clean health check + full confinement + SBOM ⇒ attested bundle; a broken file ⇒ FAIL, not attested; a
// missing dimension ⇒ attested:false; maturity always R1; honesty (not an IDP); bad-input fail-closed; determinism.
"use strict";
const assert = require("assert");
const D = require("./golden-path-evidence-demonstrator.js");

let n = 0; const ok = (name, cond) => { n++; assert.ok(cond, name); };
// injected runner + toolchain ⇒ hermetic, zero subprocess (same pattern as code-health-service's own suite).
const runner = (bin, args) => { const f = args[args.length - 1]; let c = ""; try { c = require("fs").readFileSync(f, "utf8"); } catch {} return { exitCode: /BROKEN/.test(c) ? 1 : 0, stdout: "", stderr: /BROKEN/.test(c) ? "err" : "" }; };
const toolchain = { JavaScript: true, TypeScript: true, Python: true };
const sbom = { components: [{ name: "x", version: "1.0.0" }] };
const base = (files, over) => Object.assign({ files, sbom, buildRef: "b1", confinement: { netOff: true, envCleared: true }, healthRunner: runner, healthToolchain: toolchain }, over || {});

// (1) clean file + full confinement + SBOM ⇒ healthOk + attested bundle; maturity R1.
(() => {
  const r = D.runGoldenPathEvidence(base([{ path: "a.js", language: "JavaScript", content: "const x=1;\n" }]));
  ok("clean: verdict EMITTED, maturity R1", r.ok && r.verdict === D.VERDICT.EMITTED && r.maturity === "R1");
  ok("clean: healthOk true", r.summary.healthOk === true);
  ok("clean: bundle attested true", r.summary.bundleAttested === true);
  ok("clean: zero gaps", r.summary.gapCount === 0);
})();

// (2) a BROKEN file ⇒ health FAIL, not attested.
(() => {
  const r = D.runGoldenPathEvidence(base([{ path: "b.js", language: "JavaScript", content: "BROKEN\n" }]));
  ok("broken: healthOk false (FAIL)", r.summary.healthOk === false && r.summary.healthCounts.FAIL === 1);
  ok("broken: bundle not attested", r.summary.bundleAttested === false);
})();

// (3) missing confinement ⇒ bundle attested:false (fail-closed).
(() => {
  const r = D.runGoldenPathEvidence(base([{ path: "a.js", language: "JavaScript", content: "const x=1;\n" }], { confinement: undefined }));
  ok("no-conf: bundleAttested false", r.summary.bundleAttested === false);
  ok("no-conf: a bundle-incomplete gap reported", r.gaps.some((g) => /bundle incomplete|confinement/i.test(g)));
})();

// (4) zero-component SBOM ⇒ not attested (hasComponents false).
(() => {
  const r = D.runGoldenPathEvidence(base([{ path: "a.js", language: "JavaScript", content: "const x=1;\n" }], { sbom: { components: [] } }));
  ok("zero-sbom: bundleAttested false", r.summary.bundleAttested === false);
})();

// (5) HONESTY: maturity R1, note says NO IDP / evidence-emitter slice.
(() => {
  const r = D.runGoldenPathEvidence(base([{ path: "a.js", language: "JavaScript", content: "const x=1;\n" }]));
  ok("honesty: basis EVIDENCE_EMITTER_SLICE_NOT_IDP", r.basis === "EVIDENCE_EMITTER_SLICE_NOT_IDP");
  ok("honesty: note says NO complete IDP + evidence-emission slice only", /NO complete IDP/i.test(r.note) && /evidence-emission slice only/i.test(r.note));
})();

// (6) bad-input fail-closed (no throw) + determinism.
(() => {
  ok("bad-input: non-object ⇒ INVALID_INPUT, maturity R1", D.runGoldenPathEvidence(null).code === "INVALID_INPUT" && D.runGoldenPathEvidence(null).maturity === "R1");
  const a = D.runGoldenPathEvidence(base([{ path: "a.js", language: "JavaScript", content: "const x=1;\n" }]));
  const b = D.runGoldenPathEvidence(base([{ path: "a.js", language: "JavaScript", content: "const x=1;\n" }]));
  ok("determinism: identical sealed bundle", JSON.stringify(a.steps.bundle.bundle) === JSON.stringify(b.steps.bundle.bundle));
})();

console.log(`golden-path-evidence-demonstrator: ${n} checks passed`);
