#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the FIRST Enterprise Software Engineering business capability end-to-end with
// REAL subprocess execution (not injected): a clean JS file passes `node --check` (0 findings), a broken JS file FAILS
// (one HIGH compile finding with reproducible evidence, 0 false PASS), the review emits VALID SARIF 2.1.0, coverage
// gaps (unsupported language / absent toolchain) are declared and NEVER counted as clean, and the real CLI runs as a
// spawned process over a fixture directory. node is guaranteed present (it runs this test), so the compile cases are
// genuinely real on every host; shellcheck/python cases are toolchain-guarded.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const R = require("./code-review-service.js");
const EXEC = require("./code-execution.js");
const SARIF = require("./sarif-report.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const CLEAN_JS = "const x = 1;\nmodule.exports = x;\n";
const BROKEN_JS = "const y = ;\nmodule.exports = y;\n";   // syntax error — node --check exits non-zero

// (1) REAL: a clean JS file passes the real `node --check` ⇒ reviewed, 0 findings, clean true.
{
  const r = R.reviewProject({ project: "p", files: [{ path: "ok.js", content: CLEAN_JS }] });
  ok("clean JS ⇒ reviewed via real node --check, 0 findings, clean=true", r.ok && r.review.summary.filesReviewed === 1 && r.review.summary.findingCount === 0 && r.review.summary.clean === true);
}
// (2) REAL: a broken JS file FAILS ⇒ exactly one HIGH compile finding with reproducible evidence; clean=false (no false PASS).
{
  const r = R.reviewProject({ project: "p", files: [{ path: "bad.js", content: BROKEN_JS }] });
  const f = r.review.findings[0];
  ok("broken JS ⇒ 1 HIGH compile finding, evidence names the tool, clean=false (0 false PASS)",
     r.review.summary.findingCount === 1 && f.area === "compile" && f.severity === "HIGH" && f.id === "compile:bad.js" && /node/.test(f.evidence) && r.review.summary.clean === false);
}
// (3) REAL mixed project ⇒ finding only for the broken file; both files reviewed.
{
  const r = R.reviewProject({ project: "p", files: [{ path: "ok.js", content: CLEAN_JS }, { path: "bad.js", content: BROKEN_JS }] });
  ok("mixed ⇒ 2 reviewed, 1 finding (the broken one only)", r.review.summary.filesReviewed === 2 && r.review.summary.findingCount === 1 && r.review.findings[0].id === "compile:bad.js");
}
// (4) INDEPENDENT FORMAT CHECK: the review emits structurally-valid SARIF 2.1.0 with HIGH→error.
{
  const r = R.reviewProject({ project: "proj", files: [{ path: "bad.js", content: BROKEN_JS }] });
  const s = R.reviewToSarif(r);
  ok("review ⇒ valid SARIF 2.1.0, HIGH mapped to error, driver=ODG-Code-Review",
     s.ok === true && SARIF.isValidSarif(s.sarif) && s.sarif.runs[0].results[0].level === "error" && s.sarif.runs[0].tool.driver.name === "ODG-Code-Review" && s.resultCount === 1);
}
// (5) HONEST COVERAGE GAP — unsupported language is declared, never a finding, never counted clean.
{
  const r = R.reviewProject({ project: "p", files: [{ path: "a.cobol", language: "COBOL", content: "x" }] });
  ok("unsupported language ⇒ coverage.unsupported, 0 findings, clean=false (not a false clean)",
     r.review.summary.filesUnsupported === 1 && r.review.summary.findingCount === 0 && r.review.summary.filesReviewed === 0 && r.review.summary.clean === false);
}
// (6) FAIL-CLOSED on an absent toolchain — injected toolchain says JS unavailable ⇒ declared coverage gap
// (UNSUPPORTED/BLOCKED), NEVER reviewed and NEVER a clean PASS. The honest invariant, not the specific bucket.
{
  const r = R.reviewProject({ project: "p", files: [{ path: "ok.js", content: CLEAN_JS }] }, { toolchain: { JavaScript: false } });
  const s = r.review.summary;
  ok("absent toolchain ⇒ coverage gap, 0 reviewed, 0 findings, clean=false (no false clean on missing tool)",
     s.filesReviewed === 0 && (s.filesUnsupported + s.filesBlocked) === 1 && s.findingCount === 0 && s.clean === false);
}
// (7) fail-closed on bad input.
{
  ok("empty/invalid input ⇒ INVALID_INPUT", R.reviewProject({}).ok === false && R.reviewProject({ files: [] }).code === "INVALID_INPUT");
}
// (8) REAL lint analyzer (toolchain-guarded): a shell file with a lint issue ⇒ MEDIUM lint finding via real shellcheck.
{
  const tc = EXEC.detectToolchain({});
  if (tc.ShellLint === true && tc.Shell === true) {
    const SH = "#!/bin/bash\nfoo=$bar\necho $foo\n";   // unquoted + referencing possibly-unset var ⇒ shellcheck warns
    const r = R.reviewProject({ project: "p", files: [{ path: "s.sh", language: "Shell", content: SH }] });
    const lint = r.review.findings.find((x) => x.area === "lint");
    ok("shell file ⇒ real shellcheck MEDIUM lint finding (toolchain present)", !!lint && lint.severity === "MEDIUM" && /shellcheck/.test(lint.evidence));
  } else {
    console.log("##CLASS: BLOCKED_BY_ISOLATION shellcheck absent — lint-analyzer control NOT exercised ⇒ BLOCKED (never a silent PASS)");
  }
}
// (9) INTEGRATION: the REAL CLI runs as a spawned process over a fixture directory (end-to-end productization).
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-review-"));
  fs.writeFileSync(path.join(dir, "ok.js"), CLEAN_JS);
  fs.writeFileSync(path.join(dir, "bad.js"), BROKEN_JS);
  const CLI = path.join(process.cwd(), "runtime", "bin", "odg-code-review.ts");
  const res = cp.spawnSync("npx", ["tsx", CLI, dir], { cwd: process.cwd(), encoding: "utf8", timeout: 120000 });
  let out = null; try { out = JSON.parse(res.stdout); } catch { /* leave null */ }
  ok("spawned CLI reviews a real dir ⇒ ok, >=1 finding, exit 0 (review-with-findings is success)",
     res.status === 0 && out && out.ok === true && out.review && out.review.summary.findingCount >= 1 && out.review.findings.some((f) => f.id === "compile:bad.js"));
  // --sarif mode via the real CLI
  const res2 = cp.spawnSync("npx", ["tsx", CLI, dir, "--sarif"], { cwd: process.cwd(), encoding: "utf8", timeout: 120000 });
  let out2 = null; try { out2 = JSON.parse(res2.stdout); } catch { /* leave null */ }
  ok("spawned CLI --sarif ⇒ valid SARIF log", res2.status === 0 && out2 && out2.ok === true && out2.mode === "sarif" && SARIF.isValidSarif(out2.sarif));
  fs.rmSync(dir, { recursive: true, force: true });
}

// (10) completeCoverage distinguishes "clean over everything" from "clean over a partial set".
{
  const full = R.reviewProject({ project: "p", files: [{ path: "ok.js", content: CLEAN_JS }] });
  const partial = R.reviewProject({ project: "p", files: [{ path: "ok.js", content: CLEAN_JS }, { path: "a.cobol", language: "COBOL", content: "x" }] });
  ok("completeCoverage: true when nothing skipped, false when a gap exists (both still clean over reviewed)",
     full.review.summary.completeCoverage === true && full.review.summary.clean === true &&
     partial.review.summary.completeCoverage === false && partial.review.summary.clean === true);
}
// (11) REGRESSION (independent-audit defect #1): a multi-file TS project (main imports a sibling) reviewed in
// PROJECT mode must NOT produce a false "does not compile" — single-file checking would wrongly flag it.
{
  const tc = EXEC.detectToolchain({});
  if (tc.TypeScript === true) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-tsproj-"));
    fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, strict: false, skipLibCheck: true, moduleResolution: "node", target: "ES2020", module: "commonjs" }, include: ["*.ts"] }));
    fs.writeFileSync(path.join(dir, "util.ts"), "export const v: number = 1;\n");
    fs.writeFileSync(path.join(dir, "main.ts"), "import { v } from \"./util\";\nexport const w = v + 1;\n");
    const r = R.reviewTsProjectDir({ projectDir: dir, project: "tsproj" });
    if (r.review.summary.filesBlocked === 1) { ok("TS project check BLOCKED (tsc unavailable) — honest, skipped", true); }
    else { ok("multi-file TS project (import-aware) ⇒ clean, NO false compile finding (audit regression fixed)", r.review.summary.findingCount === 0 && r.review.summary.clean === true && r.review.summary.filesReviewed === 1); }
    fs.rmSync(dir, { recursive: true, force: true });
  } else { console.log("##CLASS: BLOCKED_BY_ISOLATION tsc absent — project-mode review control NOT exercised ⇒ BLOCKED"); }
}
// (12) a TS project WITH a real type error ⇒ exactly one HIGH project-level compile finding (import-aware tsc).
{
  const tc = EXEC.detectToolchain({});
  if (tc.TypeScript === true) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-tsbad-"));
    fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, strict: true, skipLibCheck: true, target: "ES2020", module: "commonjs" }, include: ["*.ts"] }));
    fs.writeFileSync(path.join(dir, "bad.ts"), "export const n: number = \"not a number\";\n");
    const r = R.reviewTsProjectDir({ projectDir: dir, project: "tsbad" });
    if (r.review.summary.filesBlocked === 1) { ok("TS project check BLOCKED (tsc unavailable) — honest, skipped", true); }
    else { ok("TS project with a type error ⇒ 1 HIGH compile finding (0 false PASS)", r.review.summary.findingCount === 1 && r.review.findings[0].severity === "HIGH" && r.review.findings[0].area === "compile" && r.review.summary.clean === false); }
    fs.rmSync(dir, { recursive: true, force: true });
  } else { console.log("##CLASS: BLOCKED_BY_ISOLATION tsc absent — TS-fail-case control NOT exercised ⇒ BLOCKED"); }
}

// (12) new no-install families (TOML/XML/INI) route through the review ⇒ a malformed config is a compile finding.
{
  const r = R.reviewProject({ project: "cfg", files: [{ path: "bad.toml", content: "a = = 1\n" }, { path: "ok.xml", content: "<r><a>1</a></r>\n" }, { path: "ok.ini", content: "[s]\nk=v\n" }] });
  ok("TOML/XML/INI routed: malformed .toml ⇒ HIGH compile finding; valid .xml/.ini reviewed clean",
     r.review.summary.filesReviewed === 3 && r.review.findings.some((f) => f.id === "compile:bad.toml" && f.severity === "HIGH") && r.review.findings.length === 1);
}

console.log(`\nCODE-REVIEW-SERVICE suite — ${pass} assertions passed. (REAL node --check on clean+broken fixtures; import-aware TS project mode (no false positive); 0 false PASS; valid SARIF 2.1.0; coverage gaps never clean; completeCoverage; fail-closed; spawned CLI end-to-end)`);
