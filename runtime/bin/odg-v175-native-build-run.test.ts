#!/usr/bin/env node
"use strict";
/* V17.5 — tests of the native-build runner + the native-repair work item (offline: NO live model; writes nothing).
 * Runs the runner's --selftest (fake-Ollama transport behind the real loopback guard, real bwrap sandbox when available),
 * the CLI refusal paths (non-declared output ⇒ 3; PROPOSED contract ⇒ 2 NOT_AUTHORIZED, record never created), the
 * detector on synthetic definitions, and checks the committed contract equals what ODG's rules derive from this tree. */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const R = require("./odg-v175-native-build-run.js");
const NRI = require("../core/odg-native-repair-item.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
const run = (args: string[], timeout = 180000) => cp.spawnSync(tsx, [R.SELF, ...args], { cwd: ROOT, encoding: "utf8", timeout });

// detector on synthetic definitions (the real-repo detection is exercised by --selftest)
const defs = NRI.extractDefinitions([
  "function canon(o: any): string { return JSON.stringify(o, Object.keys(o).sort()); }",
  "function canon(o: any): string { return JSON.stringify(o); }",
  "function canon(v: any): string {",
  "  if (Array.isArray(v)) return \"[\" + v.map(canon).join(\",\") + \"]\";",
  "  if (v && typeof v === \"object\") return \"{\" + Object.keys(v).sort().map((k) => JSON.stringify(k) + \":\" + canon(v[k])).join(\",\") + \"}\";",
  "  return JSON.stringify(v);",
  "}",
].join("\n"));
const ts = require("typescript"); const vm = require("vm");
const load = (s: string) => vm.runInNewContext(ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText + "\n;canon", Object.create(null));
check("extractDefinitions finds 3 balanced definitions", defs.length === 3 && defs.every((d: any) => d.balanced));
check("classify: replacer-array canon ⇒ NESTED_KEY_DROP", NRI.classify(load(defs[0].source)) === "NESTED_KEY_DROP");
check("classify: plain JSON.stringify ⇒ ORDER_SENSITIVE", NRI.classify(load(defs[1].source)) === "ORDER_SENSITIVE");
check("classify: recursive sorted ⇒ CANONICAL", NRI.classify(load(defs[2].source)) === "CANONICAL");

// the committed contract = ODG rules over this tree (PROPOSED; dispatch target = this runner, writeSet = the record)
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, R.CONTRACT), "utf8"));
const derived = R.contractFor(ROOT);
check("committed contract is PROPOSED with no authorizedBy", committed.state === "PROPOSED" && committed.authorizedBy === null);
check("committed contract origin + WORK_ITEM_CONTRACT equal the rules' derivation from this tree", JSON.stringify(committed.origin) === JSON.stringify(derived.origin) && JSON.stringify(committed.WORK_ITEM_CONTRACT) === JSON.stringify(derived.WORK_ITEM_CONTRACT));
check("write_set ≤ 2 files; dispatch target declared", committed.WORK_ITEM_CONTRACT.write_set.length <= 2 && committed.authorization.dispatchTargets.RUN_NATIVE_BUILD.command === R.SELF && committed.authorization.dispatchTargets.RUN_NATIVE_BUILD.writeSet[0] === R.OUT);
check("diff helper emits a git new-file diff", /^diff --git a\/x b\/x\nnew file mode 100644\n--- \/dev\/null\n\+\+\+ b\/x\n@@ -0,0 \+1,2 @@\n\+a\n\+b\n$/.test(R.newFileDiff("x", "a\nb\n")));

// CLI refusals (no model call)
const outExisted = fs.existsSync(path.join(ROOT, R.OUT));
const bad = run(["docs/odg/evidence/OTHER.json"]);
check("non-declared output path ⇒ REFUSED exit 3", bad.status === 3 && /REFUSED/.test(String(bad.stdout)));
if (committed.state !== "AUTHORIZED") {
  const na = run([R.OUT]);
  check("PROPOSED contract ⇒ NOT_AUTHORIZED exit 2, record not created", na.status === 2 && /NOT_AUTHORIZED/.test(String(na.stdout)) && fs.existsSync(path.join(ROOT, R.OUT)) === outExisted);
}
const pr = run(["--probe", "--out", path.join(ROOT, "x.json")]);
check("--probe refuses an output inside the repo", pr.status === 3);

// selftest (fake Ollama; real sandbox when available)
const st = run(["--selftest"]);
process.stdout.write(String(st.stdout));
check("--selftest passes", st.status === 0);

if (failures) { process.stdout.write(`${failures} failure(s)\n`); process.exit(1); }
export {};
