#!/usr/bin/env node
// @ts-nocheck — L5 bin test migration: runs under tsx unchanged; suppresses tsc typechecking (NOT strict typing) — migration debt.
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
// B-2 REGRESSION (V2 Pole B): a listed suite that NEVER RAN (file missing — renamed/moved/deleted/mistyped, or
// the whole curated list missing because cwd≠repo-root) must FAIL-CLOSE the gate, not silently green it.
ok("overallExit non-zero when a NOT_RUN present (no FAIL) — a listed suite that never ran ≠ pass",
  R.overallExit(R.summarize(R.runSuites([fPass, fSkip, fMissing], injected))) === 1);
ok("overallExit non-zero when EVERY suite is NOT_RUN (e.g. invoked from wrong cwd ⇒ all paths missing)",
  R.overallExit(R.summarize(R.runSuites([path.join(tmp, "x.test.js"), path.join(tmp, "y.test.js")], injected))) === 1);
const notRunRep = R.renderReport(R.summarize(R.runSuites([fPass, fMissing], injected)), R.runSuites([fPass, fMissing], injected));
ok("report with a NOT_RUN is NOT green and does not claim 'all suites PASS'",
  /not green/.test(notRunRep) && !/all suites PASS/.test(notRunRep));

// --- report discloses, never hides ----------------------------------------------------------------
const rep = R.renderReport(sum, results);
ok("report lists the FAIL suite", rep.includes("FAIL:") && rep.includes("b.test.js"));
ok("report lists the BLOCKED suite with reason", rep.includes("BLOCKED_BY_ISOLATION:") && rep.includes("nested bwrap"));
ok("report verdict is NOT green when blocked/failed present", /not green/.test(rep) && !/all suites PASS/.test(rep));
const green = R.renderReport(R.summarize(R.runSuites([fPass, fSkip], injected)), R.runSuites([fPass, fSkip], injected));
ok("report green verdict only when clean", /no genuine failure/.test(green));

// --- defaultFiles includes the wired cockpit test + is non-empty ----------------------------------
const df = R.defaultFiles();
ok("defaultFiles non-empty and includes cockpit test", df.length > 50 && df.includes(path.join("runtime", "bin", "odg-cockpit.test.ts")));

// --- SHOW mode (read-only artifact view) ----------------------------------------------------------
// loadReport: absent / invalid-json / invalid-shape all fail closed (never valid proof)
ok("loadReport ABSENT when file missing", R.loadReport(path.join(tmp, "nope.json")).code === "ABSENT");
const badJson = mk("bad.json"); fs.writeFileSync(badJson, "{not json");
ok("loadReport INVALID_JSON on unparseable", R.loadReport(badJson).code === "INVALID_JSON");
const badShape = mk("shape.json"); fs.writeFileSync(badShape, JSON.stringify({ generatedAt: "x" }));
ok("loadReport INVALID_SHAPE when summary/results absent", R.loadReport(badShape).code === "INVALID_SHAPE");
const validRep = { generatedAt: "2026-10-10T00:00:00.000Z", summary: { total: 2, counts: { PASS: 2, FAIL: 0, BLOCKED_BY_ISOLATION: 0, SKIPPED: 0, NOT_RUN: 0 } }, results: [] };
const vp = mk("valid.json"); fs.writeFileSync(vp, JSON.stringify(validRep));
ok("loadReport ok on a valid report", R.loadReport(vp).ok === true);
// renderShow: absent → exit 2; valid+green+not-stale → exit 0; non-green → exit 1
ok("renderShow exit 2 when absent (never valid proof)", R.renderShow(R.loadReport(path.join(tmp, "nope.json"))).exit === 2);
ok("renderShow exit 0 when valid+green+fresh", R.renderShow({ ok: true, report: validRep, path: vp }, Date.parse(validRep.generatedAt) + 1000).exit === 0);
const notGreen = { ...validRep, summary: { total: 2, counts: { PASS: 1, FAIL: 1, BLOCKED_BY_ISOLATION: 0, SKIPPED: 0, NOT_RUN: 0 } } };
ok("renderShow exit 1 when recorded NOT green", R.renderShow({ ok: true, report: notGreen, path: vp }).exit === 1);
// stalenessOf: a tested source newer than generatedAt ⇒ stale
const staleRep = { generatedAt: "2000-01-01T00:00:00.000Z", summary: validRep.summary, results: [{ file: fPass, cls: "PASS" }] };
ok("stalenessOf flags a source newer than the report", R.stalenessOf(staleRep).stale === true);
ok("renderShow exit 1 when stale (never valid proof)", R.renderShow({ ok: true, report: staleRep, path: vp }).exit === 1);

// --- OPT-IN PARALLEL PATH (ODG_TEST_WORKERS) — partition + equivalence to the sequential gate ----
// Real tsx fixtures (not injected): prove runSuitesParallel classifies + ORDERS identically to runSuites.
const ptmp = fs.mkdtempSync(path.join(os.tmpdir(), "odgtr-par-"));
const mkTs = (name, body) => { const p = path.join(ptmp, name); fs.writeFileSync(p, body); return p; };
const fPassR = mkTs("p.test.ts", 'console.log("ok");\n');
const fFailR = mkTs("f.test.ts", 'throw new Error("boom");\n');
const fSkipR = mkTs("s.test.ts", 'console.log("##CLASS: SKIPPED no creds");\n');
// hazard fixture: contains process.chdir(...) so suiteIsHazard must flag it; still passes.
const fHazR = mkTs("h.test.ts", 'const p = process.cwd(); process.chdir(p); console.log("ok");\n');

ok("suiteIsHazard: process.chdir ⇒ hazard (serial)", R.suiteIsHazard(fHazR) === true);
ok("suiteIsHazard: pure fixture ⇒ hermetic (parallel)", R.suiteIsHazard(fPassR) === false);
// ALLOWLIST: a suite whose repo-relative write path is COMPUTED (path.join, not a literal "runtime/...") evades
// HAZARD_RE, so it is hand-declared hazardous by basename. Prove the allowlist forces serial even when the regex
// would not match (fixture writes via a computed path ⇒ regex miss ⇒ must still be hazardous via the allowlist).
const fComputed = mkTs("consequential-executor-gate.test.ts", 'const path=require("path");const f=path.join(process.cwd(),"runtime","x.json");console.log("ok");\n');
ok("suiteIsHazard: allowlisted basename ⇒ hazard even when HAZARD_RE misses the computed path", R.suiteIsHazard(fComputed) === true);
// REGRESSION: the external-research trio all write the SAME computed runtime/generated/external-research-acquisition.json
// and MUST be serial (allowlisted) or they race in the parallel pool. Fixtures carry a computed path HAZARD_RE can't see;
// only the allowlist (by basename) can force hazard=true. A non-allowlisted computed-path fixture must stay hermetic.
for (const base of ["runtime-executor.external-research.test.ts", "runtime-executor.safe-probe-authorization.test.ts", "external-research-live.test.ts"]) {
  const fx = mkTs(base, 'const path=require("path");const f=path.join("runtime","generated","external-research-acquisition.json");console.log("ok");\n');
  ok(`suiteIsHazard: '${base}' allowlisted ⇒ serial (prevents the shared-artifact race)`, R.suiteIsHazard(fx) === true);
}
// REGRESSION (second recon): three more suites write REAL shared runtime/generated artifacts (runtime-verify.json /
// mission-report.json / the mission ledger / lifecycle / pipeline-checkpoint) via computed paths HAZARD_RE can't see,
// and MUST serialize. Same allowlist-by-basename mechanism.
for (const base of ["objective-evidence.test.ts", "local-mission-runner-ledger.test.ts", "controlled-mission-live.test.ts"]) {
  const fx = mkTs(base, 'const path=require("path");const f=path.join("runtime","generated","runtime-verify.json");console.log("ok");\n');
  ok(`suiteIsHazard: '${base}' allowlisted ⇒ serial (prevents the shared-artifact race)`, R.suiteIsHazard(fx) === true);
}
const fNotListed = mkTs("some-unlisted-computed.test.ts", 'const path=require("path");const f=path.join("runtime","generated","x.json");console.log("ok");\n');
ok("suiteIsHazard: a NON-allowlisted computed-path fixture stays hermetic (allowlist is specific, not blanket)", R.suiteIsHazard(fNotListed) === false);
ok("parseWorkers: unset/1 ⇒ 1 (sequential default)", R.parseWorkers(undefined) === 1 && R.parseWorkers("1") === 1 && R.parseWorkers("0") === 1);
ok("parseWorkers: clamps to CPU count (never oversubscribe)", R.parseWorkers("9999") <= os.cpus().length && R.parseWorkers("9999") >= 1);

// Injected deterministic runners (sync for runSuites, async for runSuitesParallel) over the SAME outcomes,
// so the ONLY difference under test is the SCHEDULING. fHazR→phase1(serial), others→phase2(parallel).
const parOutcomes = {
  [fPassR]: { exitCode: 0, stdout: "ok" },
  [fFailR]: { exitCode: 1, stdout: "boom" },
  [fSkipR]: { exitCode: 0, stdout: "##CLASS: SKIPPED no creds" },
  [fHazR]:  { exitCode: 0, stdout: "ok" },
};
const syncRunner = (f) => parOutcomes[f] || { exitCode: 0, stdout: "" };
const asyncRunner = (f) => Promise.resolve(syncRunner(f));

R.runSuitesParallel([fPassR, fFailR, fSkipR, fHazR], 4, asyncRunner).then((par) => {
  const order = [fPassR, fFailR, fSkipR, fHazR];
  const seq = R.runSuites(order, syncRunner);
  const key = (rs) => JSON.stringify(rs.map((x) => [x.file, x.cls]));
  ok("parallel ≡ sequential: identical classification AND original order", key(par) === key(seq));
  ok("parallel: fixtures classify correctly (PASS/FAIL/SKIPPED/PASS)",
     par[0].cls === "PASS" && par[1].cls === "FAIL" && par[2].cls === "SKIPPED" && par[3].cls === "PASS");
  const missing = path.join(ptmp, "nope.test.ts");
  return R.runSuitesParallel([fPassR, missing], 4, asyncRunner);
}).then((parM) => {
  ok("parallel: missing suite ⇒ NOT_RUN (fail-closed, same as sequential)", parM[1].cls === "NOT_RUN");
  // computeWorkers (pure memory+core-aware cap) — the fix for OOM-class parallel flakiness.
  ok("computeWorkers: request<=1 ⇒ serial 1", R.computeWorkers(1, 8, 32000, 900).workers === 1 && R.computeWorkers(0, 8, 32000, 900).workers === 1);
  ok("computeWorkers: ample memory+cores ⇒ honor request", R.computeWorkers(4, 8, 32000, 900).workers === 4 && R.computeWorkers(4, 8, 32000, 900).capped === false);
  ok("computeWorkers: low memory ⇒ capped below request (no oversubscribe)", (() => { const r = R.computeWorkers(8, 8, 1800, 900); return r.workers === 2 && r.capped === true && /memory-pressure/.test(r.reason); })());
  ok("computeWorkers: few cores ⇒ CPU cap applies", R.computeWorkers(8, 2, 32000, 900).workers === 2);
  ok("computeWorkers: never below 1 even under tiny memory", R.computeWorkers(8, 8, 100, 900).workers === 1);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
  try { fs.rmSync(ptmp, { recursive: true, force: true }); } catch { /* best-effort */ }
  console.log(`\nALL PASS — odg test-report (${passed} assertions)`);
}).catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
