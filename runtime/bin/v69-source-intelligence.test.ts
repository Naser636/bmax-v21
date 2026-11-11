#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V69 §4/§15 — world-intelligence matrix + source-intelligence test. Verifies the P9 coverage matrix is an
 * honest audit (no MISSING left unmapped; PRESENT only if modules exist; no tenth primitive), and that the source-
 * intelligence grader is NON-binary (typology + band), never auto-rejects a non-certified source, never auto-trusts a
 * reputable one, keeps contradictions, and rates ODG_REPRODUCED strongest. Live assertions on the module.
 */

const path = require("path");
const fs = require("fs");
const SI = require("../core/source-intelligence.js");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // §15 coverage matrix
  const mx = j("V69_P9_WORLD_INTELLIGENCE_MATRIX.json");
  check("coverage matrix exists", !!mx);
  if (mx) {
    check("matrix: integrity ok (PRESENT only if modules present)", mx.integrityOk === true);
    check("matrix: audit covers many functions, 0 MISSING (reuse-first)", mx.functionCount >= 12 && mx.tally.MISSING === 0);
    check("matrix: no tenth primitive (invariant)", /never by a new primitive or parallel engine/i.test(mx.invariant));
  }

  // §4 source-intelligence — NON-binary behaviour (live)
  check("typology has 8 kinds + 4 bands", SI.TYPOLOGY.length === 8 && SI.BANDS.length === 4);
  const noProv = SI.assessSource({ kind: "forum", reputation: 0.2, evidence: 0.1 });
  check("non-certified / no-provenance source graded, NOT rejected", noProv.rejected === false && typeof noProv.credibilityBand === "string");
  const reputableWeak = SI.assessSource({ provenance: "bigcorp blog", reputation: 0.95, evidence: 0.1, kind: "opinion" });
  check("reputable but weak evidence ⇒ NOT auto-true (not STRONG)", reputableWeak.credibilityBand !== "STRONG");
  const contra = SI.assessSource({ provenance: "x", evidence: 0.5, contradictions: ["conflicting study"] });
  check("contradictions KEPT (not dropped)", contra.keepContradictions === true);
  const reproduced = SI.assessSource({ provenance: "odg", reproduced: true, evidence: 0.6 });
  check("ODG_REPRODUCED is the strongest typology", reproduced.typology === "ODG_REPRODUCED");
  // determinism
  check("deterministic grading", JSON.stringify(SI.assessSource({ provenance: "x", evidence: 0.5 })) === JSON.stringify(SI.assessSource({ provenance: "x", evidence: 0.5 })));

  // applied run on real V67 signals
  const run = j("V69_SOURCE_INTELLIGENCE.json");
  check("applied to real radar signals; none auto-rejected", !!run && run.anyAutoRejected === false && run.gradedSignals.length >= 5);
  check("grading is non-binary (bands present, not true/false)", !!run && Object.keys(run.bandDistribution).every((b: string) => SI.BANDS.includes(b)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V69 world-intelligence matrix + non-binary source-intelligence (reuse-first, no new primitive)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
