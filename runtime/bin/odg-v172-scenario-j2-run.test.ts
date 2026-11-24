#!/usr/bin/env node
"use strict";
/* V17.2 — tests of the J2 runner (offline: NO live model, NO network; writes nothing). Runs the runner's own --selftest
 * (fake-Ollama transport behind the real loopback guard, real bwrap sandbox when available) and the CLI refusal paths:
 * any non-declared output path ⇒ exit 3 before anything else; --check on an absent record ⇒ exit 1; no inspection
 * record ⇒ exit 2 NOT_AUTHORIZED (only exercised while the inspection record is absent from this tree, so the test can
 * never start a real run). The declared record is never created by these tests. */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const SELF = "runtime/bin/odg-v172-scenario-j2-run.ts";
const OUT = "docs/odg/evidence/V172_J2_EXPERIMENT.json";
const INSPECTION = "docs/odg/evidence/V172_J2_CONTRACT_INSPECTION.json";
const R = require("./odg-v172-scenario-j2-run.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
const run = (args: string[], timeout = 120000) => cp.spawnSync(tsx, [SELF, ...args], { cwd: ROOT, encoding: "utf8", timeout });
const outExisted = fs.existsSync(path.join(ROOT, OUT));

check("module: declared target + output constants", R.SELF === SELF && R.OUT === OUT && R.outputPathOk(OUT) && !R.outputPathOk("docs/odg/evidence/X.json"));
const bad = run(["docs/odg/evidence/OTHER.json"]);
check("run with a non-declared output path ⇒ REFUSED exit 3", bad.status === 3 && /REFUSED/.test(String(bad.stdout)));
const none = run([]);
check("run with no output path ⇒ REFUSED exit 3", none.status === 3);
const two = run([OUT, "docs/odg/evidence/OTHER.json"]);
check("run with two output paths ⇒ REFUSED exit 3", two.status === 3);
const rh = run(["--check-at-run-head", "docs/odg/evidence/OTHER.json"]);
check("--check-at-run-head with a non-declared path ⇒ REFUSED exit 3", rh.status === 3 && /REFUSED/.test(String(rh.stdout)));
if (!outExisted) {
  const ch = run(["--check", OUT]);
  check("--check with the record absent ⇒ CHECK FAILED exit 1", ch.status === 1 && /CHECK FAILED/.test(String(ch.stdout)));
} else process.stdout.write("skip - record present: --check covered by CI on the committed record\n");
if (!fs.existsSync(path.join(ROOT, INSPECTION))) {
  const na = run([OUT]);
  check("no inspection record ⇒ NOT_AUTHORIZED exit 2, nothing written", na.status === 2 && /NOT_AUTHORIZED/.test(String(na.stdout)) && fs.existsSync(path.join(ROOT, OUT)) === outExisted);
} else process.stdout.write("skip - inspection record present: the exit-2 path is covered by --selftest's gate checks (never start a real run from a test)\n");
const st = run(["--selftest"], 600000);
check("--selftest ALL PASS (fake Ollama, no live model)", st.status === 0 && /ALL PASS/.test(String(st.stdout)));
if (st.status !== 0) process.stdout.write(String(st.stdout).split("\n").filter((l: string) => /NOT OK/.test(l)).join("\n") + "\n");
check("declared record not created by the tests", fs.existsSync(path.join(ROOT, OUT)) === outExisted);
process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
process.exitCode = failures === 0 ? 0 : 1;
export {};
