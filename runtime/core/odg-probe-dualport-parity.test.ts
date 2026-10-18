#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/*
 * odg-probe DUAL-PORT PARITY (CTO Track B) — JS rollback (runtime/bin/odg-probe.js) vs compiled-TS
 * default (runtime/dist/bin/odg-probe.js). odg-probe is OPT-IN live (DEFAULT dry, zero network); its
 * pure/injectable functions make parity hermetic. We assert byte-identical results for validateTarget,
 * buildPlan, adaptObservation, sanitizeObservation and run() (with an INJECTED fetcher/classify/clock so
 * NO real network occurs), plus a LIVE dry-run subprocess (DEFAULT, no --live) producing identical stdout.
 */
const assert = require("assert");
const path = require("path");
const cp = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const js = require(path.join(REPO, "runtime", "bin", "odg-probe.js"));
const ts = require(path.join(REPO, "runtime", "dist", "bin", "odg-probe.js"));
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok("both ports export the same API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));

// validateTarget — allowed + a representative rejection set.
for (const url of ["https://github.com", "https://github.com/", "http://github.com", "https://evil.com", "https://github.com/x", "https://u:p@github.com", "not a url"]) {
  ok(`validateTarget parity — ${url}`, eq(js.validateTarget(url), ts.validateTarget(url)));
}
// buildPlan — dry (default), --live without env, --live WITH env, bad url.
const cases = [
  [[], {}],
  [["--live"], {}],
  [["--live"], { ODG_LIVE_PROBE: "1" }],
  [["--url", "https://evil.com"], { ODG_LIVE_PROBE: "1" }],
];
for (const [argv, env] of cases) ok(`buildPlan parity — ${JSON.stringify(argv)} ${JSON.stringify(env)}`, eq(js.buildPlan(argv, env), ts.buildPlan(argv, env)));
// adaptObservation + sanitizeObservation.
for (const raw of [{ status: 200 }, { error: "boom" }, { status: 0 }, { status: 301, bytes: 10, truncated: true, fetched_at: "t" }, null]) {
  ok(`adaptObservation parity — ${JSON.stringify(raw)}`, eq(js.adaptObservation(raw), ts.adaptObservation(raw)));
  ok(`sanitizeObservation parity — ${JSON.stringify(raw)}`, eq(js.sanitizeObservation(raw, 5), ts.sanitizeObservation(raw, 5)));
}
// run() — INJECTED fetcher (no network) + classify + fixed clock ⇒ deterministic. DRY and LIVE paths.
{
  const classify = () => ({ class: "OK" });
  const fetcher = async () => ({ status: 200, bytes: 100, truncated: false, fetched_at: "2026-10-18T00:00:00Z" });
  let t = 1000; const now = () => (t += 10);
  const optsLive = { argv: ["--live"], env: { ODG_LIVE_PROBE: "1" }, classify, fetcher, now };
  return Promise.all([js.run({ ...optsLive }), ts.run({ ...optsLive })]).then(([rj, rt]) => {
    ok("run() LIVE (injected fetcher) parity — exit + report", eq(rj, rt));
    return Promise.all([js.run({ argv: [], env: {}, classify, fetcher, now }), ts.run({ argv: [], env: {}, classify, fetcher, now })]);
  }).then(([dj, dt]) => {
    ok("run() DRY parity — exit + report (no fetch)", eq(dj, dt));
    // LIVE subprocess dry-run (DEFAULT, no --live ⇒ zero network): stdout identical.
    const run = (s) => cp.spawnSync(process.execPath, [s, "--json"], { cwd: REPO, encoding: "utf8", timeout: 30000 });
    const rj = run(path.join(REPO, "runtime", "bin", "odg-probe.js"));
    const rt = run(path.join(REPO, "runtime", "dist", "bin", "odg-probe.js"));
    ok("LIVE subprocess dry-run: same exit + identical stdout (zero network)", rj.status === rt.status && (rj.stdout || "") === (rt.stdout || ""));
    console.log(`\nodg-probe dual-port parity — ${passed} assertions passed.`);
  });
}
