#!/usr/bin/env node
"use strict";

/*
 * odg test-report — regression. Verifies honest classification (PASS/FAIL/BLOCKED_BY_ISOLATION/
 * SKIPPED/NOT_RUN), that a blocked/failed suite is NEVER counted as PASS, that overall exit is 0 only
 * when nothing failed and nothing is blocked, and that the report DISCLOSES failures/blocks. Uses an
 * injected runner + temp fixture files — no network, no real suites, no child process.
 * Run: node runtime/bin/odg-test-report.test.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const R = require("./odg-test-report.js");

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); passed += 1; };

// --- classify (pure) ------------------------------------------------------------------------------
ok("PASS: exit 0, no declaration", R.classify({ exists: true, exitCode: 0, stdout: "all good" }).cls === "PASS");
ok("FAIL: non-zero, no declaration", R.classify({ exists: true, exitCode: 1, stdout: "AssertionError" }).cls === "FAIL");
ok("BLOCKED: declared, non-zero exit", R.classify({ exists: true, exitCode: 1, stdout: "x\n##CLASS: BLOCKED_BY_ISOLATION nested bwrap\n" }).cls === "BLOCKED_BY_ISOLATION");
ok("BLOCKED: declared even on exit 0 (never silently PASS)", R.classify({ exists: true, exitCode: 0, stdout: "##CLASS: BLOCKED_BY_ISOLATION no fonts" }).cls === "BLOCKED_BY_ISOLATION");
ok("SKIPPED: declared, exit 0", R.classify({ exists: true, exitCode: 0, stdout: "##CLASS: SKIPPED no creds" }).cls === "SKIPPED");
ok("SKIPPED declaration is ignored on failure ⇒ FAIL", R.classify({ exists: true, exitCode: 1, stdout: "##CLASS: SKIPPED but it threw" }).cls === "FAIL");
ok("NOT_RUN: missing file", R.classify({ exists: false, exitCode: null, stdout: "" }).cls === "NOT_RUN");
ok("BLOCKED reason captured", R.classify({ exists: true, exitCode: 1, stdout: "##CLASS: BLOCKED_BY_ISOLATION nested bwrap" }).reason === "nested bwrap");

// --- runSuites with injected runner + temp fixtures -----------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odgtr-"));
const mk = (name) => { const p = path.join(tmp, name); fs.writeFileSync(p, "x"); return p; };
const fPass = mk("a.test.js"), fFail = mk("b.test.js"), fBlocked = mk("c.test.js"), fSkip = mk("d.test.js");
const fMissing = path.join(tmp, "missing.test.js");
const outcomes = {
  [fPass]: { exitCode: 0, stdout: "ok" },
  [fFail]: { exitCode: 1, stdout: "boom" },
  [fBlocked]: { exitCode: 1, stdout: "##CLASS: BLOCKED_BY_ISOLATION nested bwrap" },
  [fSkip]: { exitCode: 0, stdout: "##CLASS: SKIPPED no creds" },
};
const injected = (file) => outcomes[file] || { exitCode: 0, stdout: "" };
const results = R.runSuites([fPass, fFail, fBlocked, fSkip, fMissing], injected);
const sum = R.summarize(results);
ok("counts: 1 PASS", sum.counts.PASS === 1);
ok("counts: 1 FAIL", sum.counts.FAIL === 1);
ok("counts: 1 BLOCKED_BY_ISOLATION", sum.counts.BLOCKED_BY_ISOLATION === 1);
ok("counts: 1 SKIPPED", sum.counts.SKIPPED === 1);
ok("counts: 1 NOT_RUN", sum.counts.NOT_RUN === 1);
ok("INVARIANT: blocked/failed never inflate PASS", sum.counts.PASS === 1);

// --- exit semantics -------------------------------------------------------------------------------
ok("overallExit non-zero when a FAIL present", R.overallExit(sum) === 1);
ok("overallExit non-zero when only BLOCKED present (blocked ≠ pass)",
  R.overallExit(R.summarize(R.runSuites([fBlocked], injected))) === 1);
ok("overallExit 0 when only PASS + SKIPPED",
  R.overallExit(R.summarize(R.runSuites([fPass, fSkip], injected))) === 0);

// --- report discloses, never hides ----------------------------------------------------------------
const rep = R.renderReport(sum, results);
ok("report lists the FAIL suite", rep.includes("FAIL:") && rep.includes("b.test.js"));
ok("report lists the BLOCKED suite with reason", rep.includes("BLOCKED_BY_ISOLATION:") && rep.includes("nested bwrap"));
ok("report verdict is NOT green when blocked/failed present", /not green/.test(rep) && !/all suites PASS/.test(rep));
const green = R.renderReport(R.summarize(R.runSuites([fPass, fSkip], injected)), R.runSuites([fPass, fSkip], injected));
ok("report green verdict only when clean", /no genuine failure/.test(green));

// --- defaultFiles includes the wired cockpit test + is non-empty ----------------------------------
const df = R.defaultFiles();
ok("defaultFiles non-empty and includes cockpit test", df.length > 50 && df.includes(path.join("runtime", "bin", "odg-cockpit.test.js")));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort cleanup of own tmp */ }
console.log(`\nALL PASS — odg test-report (${passed} assertions)`);
process.exit(0);
