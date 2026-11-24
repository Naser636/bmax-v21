#!/usr/bin/env node
"use strict";
/* V17.2 — tests of the V166 G runner's --check-at-run-head wiring (offline, local git only; writes nothing in the tree):
 * the committed record resolves to its own code version (RECORD_COMMIT_CHILD: runner + record committed in the child of
 * run.head), and the current-tree drift classifier treats ONLY inputs.contracts.sha256File as context (INFORMATIONAL)
 * while the contract binding holds; any other drift path is DRIFT_BEYOND_CONTEXT. The committed record is not modified. */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const RHC = require("../core/odg-run-head-check.js");
const G = require("./odg-v166-scenario-g-experiment.ts");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const bytes = fs.readFileSync(path.join(ROOT, G.OUT), "utf8");
const rec = JSON.parse(bytes);
const has = (sha: string) => { try { cp.execFileSync("git", ["-C", ROOT, "cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" }); return true; } catch { return false; } };

if (has(rec.run.head)) {
  const r = RHC.resolveRunCommit(ROOT, rec.run.head, "runtime/bin/odg-v166-scenario-g-experiment.ts", G.OUT);
  check("G record resolves via RECORD_COMMIT_CHILD (runner absent at run.head, committed with the record in its child)", r.ok && r.rule === "RECORD_COMMIT_CHILD" && r.commit !== rec.run.head);
  check("resolved commit's first parent is record.run.head", cp.execFileSync("git", ["-C", ROOT, "rev-parse", `${r.commit}^1`], { encoding: "utf8" }).trim() === rec.run.head);
} else process.stdout.write("skip - G run head not in local objects (shallow clone)\n");

check("context-only paths are exactly inputs.contracts.sha256File", JSON.stringify(G.CONTEXT_ONLY_PATHS) === JSON.stringify(["inputs.contracts.sha256File"]));
const d = G.currentTreeDrift(rec);
check("current tree: binding contractSha256 matches the record and the pin", d.contractBinding && d.contractBinding.matches === true);
check("current tree: drift is NO_DRIFT or CONTEXT_ONLY_INFORMATIONAL (never beyond context)", d.classification === "NO_DRIFT" || d.classification === "CONTEXT_ONLY_INFORMATIONAL");
const forged = JSON.parse(bytes); forged.outcome = "PASS";
const f = G.currentTreeDrift(forged);
check("a forged outcome is DRIFT_BEYOND_CONTEXT (not hidden as context)", f.classification === "DRIFT_BEYOND_CONTEXT" && f.driftPaths.includes("outcome"));
const badBinding = JSON.parse(bytes); badBinding.contractSha256 = "0".repeat(64); badBinding.inputs.contracts.sha256File = "x";
check("context path drift with a broken recorded binding is NOT informational", G.currentTreeDrift(badBinding).classification === "DRIFT_BEYOND_CONTEXT");
check("committed record untouched", fs.readFileSync(path.join(ROOT, G.OUT), "utf8") === bytes);
process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
process.exitCode = failures === 0 ? 0 : 1;
export {};
