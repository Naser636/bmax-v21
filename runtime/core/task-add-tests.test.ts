#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves C-05 test-generation task family composes with repair-workflow. Pure parts
// (generateTestSource / buildAddTestsTask / fail-closed) tested directly; orchestration tested through
// runRepairWorkflow with an INJECTED runner (zero subprocess) that simulates `node --test <path>`:
//   test file ABSENT ⇒ exit 1 (baseline FAIL); PRESENT + impl correct ⇒ exit 0 (ACCEPT); PRESENT + impl wrong ⇒
//   exit 1 (ABSTAIN + rollback removes the generated test). A real `node --test` run is proven separately.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const T = require("./task-add-tests.js");
const R = require("./repair-workflow.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) generateTestSource: deterministic, requires the module, asserts each example.
const src = T.generateTestSource("add", "../src/add", [{ args: [2, 3], expected: 5 }, { args: [0, 0], expected: 0 }]);
ok("generateTestSource requires node:test + target module", /require\("node:test"\)/.test(src) && /require\("\.\.\/src\/add"\)/.test(src));
ok("generateTestSource emits one assertion per example", (src.match(/deepStrictEqual/g) || []).length === 2 && /fn\(\.\.\.\[2,3\]\),5\)/.test(src.replace(/\s/g, "")));
ok("generateTestSource is deterministic (same input ⇒ same output)", src === T.generateTestSource("add", "../src/add", [{ args: [2, 3], expected: 5 }, { args: [0, 0], expected: 0 }]));

// (2) buildAddTestsTask: shape + relative-require computation + default testPath/writeSet.
const built = T.buildAddTestsTask({ workspaceDir: "/tmp/x", modulePath: "src/add.js", exportName: "add", examples: [{ args: [2, 3], expected: 5 }] });
ok("buildAddTestsTask ok + task shape", built.ok && built.task.change.source === "edits" && built.task.acceptance.command[0] === "node" && built.task.acceptance.command[1] === "--test");
ok("buildAddTestsTask default testPath under test/ + writeSet test/", built.testPath === "test/add.generated.test.js" && built.task.writeSet[0] === "test/");
ok("buildAddTestsTask computes relative require from test/ to src/add", built.requireRel === "../src/add");

// (3) fail-closed validation.
ok("fail-closed: no examples", T.buildAddTestsTask({ workspaceDir: "/tmp/x", modulePath: "src/add.js", examples: [] }).code === "INVALID_INPUT");
ok("fail-closed: bad example shape", T.buildAddTestsTask({ workspaceDir: "/tmp/x", modulePath: "src/add.js", examples: [{ nope: 1 }] }).code === "INVALID_INPUT");
ok("fail-closed: missing modulePath", T.buildAddTestsTask({ workspaceDir: "/tmp/x", examples: [{ args: [], expected: 1 }] }).code === "INVALID_INPUT");

// Injected runner simulating `node --test <testPath>`: absent ⇒ 1; present + impl correct (a + b) ⇒ 0; else 1.
function simRunner(implBody) {
  return (bin, args, opts) => {
    const testRel = args[1] === "--test" ? args[2] : args[1];
    const testAbs = path.join(opts.cwd, testRel);
    if (!fs.existsSync(testAbs)) return { exitCode: 1, stdout: "", stderr: "no test files found" };
    const impl = fs.readFileSync(path.join(opts.cwd, "src", "add.js"), "utf8");
    return { exitCode: /a\s*\+\s*b/.test(impl) && /a\s*\+\s*b/.test(implBody) ? 0 : 1, stdout: "", stderr: "" };
  };
}
function mkRepo(implBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-addtests-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "add.js"), `module.exports = { add: (a, b) => ${implBody} };\n`);
  return dir;
}

// (4) ACCEPTED — correct impl: baseline FAIL (test absent) → generated test present+green → ACCEPT, test kept.
{
  const ws = mkRepo("a + b");
  const b = T.buildAddTestsTask({ workspaceDir: ws, modulePath: "src/add.js", exportName: "add", examples: [{ args: [2, 3], expected: 5 }] });
  const res = R.runRepairWorkflow(b.task, { runner: simRunner("a + b") });
  ok("ACCEPTED: generated test runs green against correct impl", res.status === "ACCEPTED" && res.baseline.status === "FAIL" && res.post.status === "PASS");
  ok("ACCEPTED: generated test kept on disk", fs.existsSync(path.join(ws, "test", "add.generated.test.js")));
  fs.rmSync(ws, { recursive: true, force: true });
}

// (5) ABSTAINED — wrong impl: generated test fails ⇒ rollback removes the generated test (no red test kept).
{
  const ws = mkRepo("a - b");
  const b = T.buildAddTestsTask({ workspaceDir: ws, modulePath: "src/add.js", exportName: "add", examples: [{ args: [2, 3], expected: 5 }] });
  const res = R.runRepairWorkflow(b.task, { runner: simRunner("a - b") });
  ok("ABSTAINED: test fails against wrong impl ⇒ rolled back", res.status === "ABSTAINED" && res.rolledBack === true);
  ok("ABSTAINED: generated test NOT kept (rollback removed it)", !fs.existsSync(path.join(ws, "test", "add.generated.test.js")));
  fs.rmSync(ws, { recursive: true, force: true });
}

console.log(`\nTASK-ADD-TESTS suite — ${pass} assertions passed. (deterministic test-gen from provided examples; composes with repair-workflow; ACCEPT green / ABSTAIN+rollback red; fail-closed)`);
