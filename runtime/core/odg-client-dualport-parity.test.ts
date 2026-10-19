#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/*
 * odg-client DUAL-PORT PARITY (CTO Track B) — JS rollback (runtime/bin/odg-client.js) vs compiled-TS
 * default (runtime/dist/bin/odg-client.js), driven END-TO-END through the real `odg` wrapper (bash → node
 * <port>). odg-client has NO exports (pure top-level CLI), so parity is proven by running the SAME command
 * sequence against each port in an ISOLATED temp --cwd store (no network; email stays NOT_CONFIGURED) and
 * comparing exit code + stdout, normalizing ISO timestamps. Request ids are deterministic (CLIENT-001…),
 * so a fresh store per port yields identical output. imapflow is only required in the live `fetch` path
 * (not exercised) — but its resolvability from dist is covered by `mailbox` (email readiness, no creds).
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
// Normalize non-port-related variation so JS vs TS output is comparable: ISO timestamps AND the per-run
// isolated temp --cwd store path (each sequence() uses its own mkdtemp dir, which some outputs echo, e.g.
// launch-readiness persistence.base). These differences are test-harness artifacts, not port behaviour.
// The store is mkdtemp(os.tmpdir() + "odgclient-par-"); os.tmpdir() may be /tmp OR a redirected TMPDIR
// (e.g. a scratchpad like /home/.../.cache/odg-tmp), so match the "odgclient-par-<rand>" segment under ANY
// parent dir — not just /tmp — else the per-port-distinct store path leaks and breaks parity spuriously.
const normTs = (s) => String(s || "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<TS>").replace(/[^"\s]*odgclient-par-[A-Za-z0-9]+/g, "<STORE>");

// Run `odg client <args>` forcing a given runtime (ts default | js rollback). cwd=REPO so the wrapper
// resolves; --cwd=<store> isolates storage. Fresh process each call.
function clientWith(runtime, args, store) {
  const env = { ...process.env };
  if (runtime === "js") env.ODG_RUNTIME = "js"; else delete env.ODG_RUNTIME;
  const r = cp.spawnSync("bash", ["runtime/bin/odg", "client", ...args, "--cwd", store], { cwd: REPO, encoding: "utf8", env, timeout: 30000 });
  return { code: r.status, stdout: r.stdout || "" };
}

// A deterministic command sequence exercising readiness, intake (valid/incomplete/malformed), get, list,
// unknown-subcommand, mailbox (email readiness — exercises the email-gateway dist path), and launch.
function sequence(runtime) {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), "odgclient-par-"));
  const reqOk = path.join(store, "ok.json");
  fs.writeFileSync(reqOk, JSON.stringify({ client: "Acme (jane@acme.example)", problem: "convert CSV to JSON", scope: "one script runtime/**", acceptance: "tests green", humanOwner: "sales@odg.example", consent: true, source: "referral" }));
  const reqBad = path.join(store, "bad.json");
  fs.writeFileSync(reqBad, JSON.stringify({ client: "x", problem: "y", consent: true }));
  const reqMal = path.join(store, "mal.json"); fs.writeFileSync(reqMal, "{ not json ]");
  const steps = [
    ["readiness"], ["intake", reqOk], ["get", "CLIENT-001"], ["list"],
    ["intake", reqBad], ["intake", reqMal], ["bogus-subcmd"], ["mailbox"], ["launch"],
  ];
  const results = steps.map((a) => clientWith(runtime, a, store));
  fs.rmSync(store, { recursive: true, force: true });
  return { steps: steps.map((s) => s.join(" ")), results };
}

const jsRun = sequence("js");
const tsRun = sequence("ts");

ok("same number of steps executed", jsRun.results.length === tsRun.results.length);
for (let i = 0; i < jsRun.results.length; i++) {
  const label = jsRun.steps[i];
  ok(`exit code parity — ${label}`, jsRun.results[i].code === tsRun.results[i].code);
  ok(`stdout parity (ts-normalized) — ${label}`, normTs(jsRun.results[i].stdout) === normTs(tsRun.results[i].stdout));
}
// Sanity: the valid intake actually produced CLIENT-001 on BOTH ports (not two empty identical outputs).
ok("intake produced CLIENT-001 on both ports (non-vacuous parity)",
  /CLIENT-001/.test(jsRun.results[1].stdout) && /CLIENT-001/.test(tsRun.results[1].stdout));

console.log(`\nodg-client dual-port parity — ${passed} assertions passed.`);
