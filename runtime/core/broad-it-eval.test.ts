#!/usr/bin/env node
// @ts-nocheck — runs under tsx, ZERO real subprocess (injected runner + toolchain). Validates the broad-IT scaffolding:
// strict DEV/HELDOUT leakage protection (id + content hash), per-category classification (incl. falsePass/falseFail),
// and the HONEST broad-IT verdict = NO_DATA (never extrapolated from the narrow supported surface).
"use strict";
const assert = require("assert");
const fs = require("fs");
const B = require("./broad-it-eval.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const ALL = { JavaScript: true, TypeScript: true, Python: true, SQL: true, YAML: true, Shell: true, JSON: true, ShellLint: true, Go: true, Rust: true };
// Oracle: read the checker's temp file (last argv) and PASS iff content is a known-clean fixture.
const cleanSet = new Set(B.CORPUS.filter((c) => c.expected === "PASS").map((c) => c.content));
const oracle = (bin, args, opts) => { const f = args[args.length - 1]; const content = fs.readFileSync(f, "utf8"); return { exitCode: cleanSet.has(content) ? 0 : 1, stdout: "", stderr: "" }; };
const alwaysPass = () => ({ exitCode: 0, stdout: "", stderr: "" });

// (1) LEAKAGE PROTECTION: dev/heldout disjoint by id AND content hash.
const leak = B.checkLeakage();
ok("DEV/HELDOUT disjoint (no id/hash leakage)", leak.ok === true && leak.idOverlap.length === 0 && leak.hashOverlap.length === 0 && leak.devCount > 0 && leak.heldoutCount > 0);

// (2) oracle evaluate on held-out ⇒ accuracy 1, 0 false, per-category present.
const held = B.evaluate({ partition: "heldout", runner: oracle, toolchain: ALL });
ok("held-out oracle ⇒ accuracy 1.0, 0 false", held.overall.accuracy === 1 && held.overall.falsePass === 0 && held.overall.falseFail === 0 && held.partition === "heldout");
ok("per-category metrics present (9 measured categories)", Object.keys(held.perCategory).length === 9);

// (3) adversarial always-PASS runner ⇒ broken held-out cases become falsePass (detected).
const fp = B.evaluate({ partition: "heldout", runner: alwaysPass, toolchain: ALL });
const brokenHeld = B.CORPUS.filter((c) => c.partition === "heldout" && c.expected === "FAIL").length;
ok("always-PASS ⇒ falsePass == #broken held-out (detection works)", fp.overall.falsePass === brokenHeld);

// (4) dev partition is separately evaluable (visible tuning set).
const dev = B.evaluate({ partition: "dev", runner: oracle, toolchain: ALL });
ok("dev partition evaluable + disjoint result set", dev.partition === "dev" && dev.results.every((r) => r.id.startsWith("dev-")) && held.results.every((r) => r.id.startsWith("held-")));

// (5) HONEST broad-IT verdict = NO_DATA, representative=false, not extrapolated.
const a = B.assessBroadIT({ runner: oracle, toolchain: ALL });
ok("assessBroadIT ⇒ NO_DATA (not representative)", a.broadIT === "NO_DATA" && a.representative === false && /mono-modal|< required/.test(a.reason));
ok("supported-surface held-out accuracy reported SEPARATELY (no extrapolation)", a.supportedSurfaceHeldout.accuracy === 1 && /remains NO_DATA/.test(a.note));
ok("leakage protection carried in the verdict", a.leakageProtection.ok === true);

// (6) provenance: stable sha256 + version + partition sizes + supported categories.
const p1 = B.provenance(), p2 = B.provenance();
ok("provenance stable sha256 + partitions + supported categories", p1.sha256 === p2.sha256 && /^[0-9a-f]{64}$/.test(p1.sha256) && p1.partitions.dev > 0 && p1.partitions.heldout > 0 && p1.supportedCategories.length === 9);

// (7) eval-metrics WIRED: PASS-detector confusion present; oracle ⇒ FP=0/FN=0/precision=recall=1; always-PASS ⇒ FP>0.
ok("confusion present via eval-metrics (oracle ⇒ FP0/FN0/precision1/recall1)", held.confusion && held.confusion.FP === 0 && held.confusion.FN === 0 && held.confusion.precision === 1 && held.confusion.recall === 1);
ok("adversarial always-PASS ⇒ confusion FP > 0 (false passes caught by the metric)", fp.confusion.FP > 0);
ok("assessBroadIT carries the held-out confusion", a.supportedSurfaceHeldout.confusion && typeof a.supportedSurfaceHeldout.confusion.precision !== "undefined");

// (8) GROWN corpus (v3): ≥4 real-evaluable cases per supported category per partition (2 clean + 2 broken).
const supCats = ["JavaScript/syntax", "TypeScript/type", "Python/syntax", "SQL/schema", "Config-YAML/validate", "Shell/lint", "Go/build", "Rust/build"];
for (const cat of supCats) {
  for (const part of ["dev", "heldout"]) {
    const cs = B.CORPUS.filter((c) => c.category === cat && c.partition === part);
    ok(`corpus grown: ${cat}/${part} has ≥4 cases with both kinds`, cs.length >= 4 && cs.some((c) => c.kind === "clean") && cs.some((c) => c.kind === "broken"));
  }
}
ok("grown corpus still leakage-free (68 cases, disjoint)", B.CORPUS.length === 68 && B.checkLeakage().ok === true);

// (9) COVERAGE MODEL: representativeness MEASURED against the pre-registered taxonomy; v3 adds 2 REAL no-install
// categories (SQL/schema, Config-YAML/validate), raising coverage honestly — still below the gate ⇒ NO_DATA.
const cov = B.coverageReport();
ok("coverage: 8/12 categories covered (+Go/build +Rust/build); missing are all unsupported", cov.coveredCount === 8 && cov.coveredCategories.includes("Go/build") && cov.coveredCategories.includes("Rust/build") && cov.missing.every((m) => m.supported === false));
ok("breadth gate MET (ratio>=0.6) but corpus mono-modal ⇒ NOT representative (NO false MEASURED)", cov.ratio >= cov.threshold.minCoverageRatio && cov.modeDiverse === false && cov.taskModes.length === 1 && cov.meetsThreshold === false && a.representative === false && a.broadIT === "NO_DATA");
ok("unsupported taxonomy categories (compiler stacks + shell-lint + html) can NEVER count as covered", B.TARGET_TAXONOMY.filter((t) => t.supported === false).every((t) => !cov.coveredCategories.includes(t.category)));
ok("Shell/lint now covered via authorized shellcheck install (real linter)", B.TARGET_TAXONOMY.find((t) => t.category === "Shell/lint").supported === true && cov.coveredCategories.includes("Shell/lint"));
ok("assessBroadIT embeds the coverage measurement + pre-registered threshold", a.coverage && a.coverage.ratio === cov.ratio && a.coverage.threshold.minCoverageRatio === B.REPRESENTATIVE_THRESHOLD.minCoverageRatio);

// (10) TOOLCHAIN-AWARE coverage: a category counts only if its checker is runnable NOW. Simulating a toolchain
// regression (Go + ShellLint absent) DROPS coverage — it is no longer overstated from the supported-flag alone.
{
  const full = B.coverageReport(B.CORPUS, { JavaScript: true, TypeScript: true, Python: true, SQL: true, YAML: true, ShellLint: true, Go: true, Rust: true });
  const degraded = B.coverageReport(B.CORPUS, { JavaScript: true, TypeScript: true, Python: true, SQL: true, YAML: true, Rust: true });
  ok("toolchain-aware: full coverage 8/12", full.coveredCount === 8 && full.toolchainAware === true);
  ok("toolchain regression (Go+ShellLint absent) ⇒ coverage drops (not overstated)", degraded.coveredCount === 6 && !degraded.coveredCategories.includes("Go/build") && !degraded.coveredCategories.includes("Shell/lint"));
  ok("no-toolchain-arg stays backward-compatible (availability not asserted)", B.coverageReport(B.CORPUS).toolchainAware === false);
}

console.log(`\nBROAD-IT-EVAL suite — ${pass} assertions passed. (dev/heldout leakage-protected; per-category + eval-metrics confusion; falsePass detected; broad-IT NO_DATA honest, not extrapolated)`);
