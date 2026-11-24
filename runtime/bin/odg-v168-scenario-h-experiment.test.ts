#!/usr/bin/env node
"use strict";
/* V17.2 — tests of the V168 H runner's --check-at-run-head wiring (offline, local git only; writes nothing): the committed
 * record resolves to its own run head (RUN_HEAD rule: the runner exists there), the mode refuses any output path other
 * than the declared record (exit 3, before any recomputation), and the committed record is not modified. The full
 * recomputation (~3 min) is exercised by the CLI, recorded in docs/odg/evidence/V172_GH_REPRODUCIBILITY.json. */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const RHC = require("../core/odg-run-head-check.js");
const ROOT = path.resolve(__dirname, "..", "..");
const SELF = "runtime/bin/odg-v168-scenario-h-experiment.ts";
const OUT = "docs/odg/evidence/V168_H_EXPERIMENT.json";
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const bytes = fs.readFileSync(path.join(ROOT, OUT), "utf8");
const rec = JSON.parse(bytes);
const has = (sha: string) => { try { cp.execFileSync("git", ["-C", ROOT, "cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" }); return true; } catch { return false; } };

if (has(rec.run.head)) {
  const r = RHC.resolveRunCommit(ROOT, rec.run.head, SELF, OUT);
  check("H record resolves to its own run head (RUN_HEAD)", r.ok && r.rule === "RUN_HEAD" && r.commit === rec.run.head);
} else process.stdout.write("skip - H run head not in local objects (shallow clone)\n");
const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
const bad = cp.spawnSync(tsx, [SELF, "--check-at-run-head", "docs/odg/evidence/OTHER.json"], { cwd: ROOT, encoding: "utf8", timeout: 60000 });
check("--check-at-run-head with a non-declared path ⇒ REFUSED exit 3", bad.status === 3 && /REFUSED/.test(String(bad.stdout)));
check("committed record untouched", fs.readFileSync(path.join(ROOT, OUT), "utf8") === bytes);
process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
process.exitCode = failures === 0 ? 0 : 1;
export {};
