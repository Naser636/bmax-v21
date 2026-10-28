#!/usr/bin/env node
/**
 * task-add-tests — V46 C-05: the SECOND real coding task family, proving the repair-workflow harness GENERALIZES.
 *
 * Task family: "add a missing characterization test for an existing function, from owner-supplied example pairs."
 * This is a bounded, DETERMINISTIC code-GENERATION step (template from EXPLICIT input→expected examples — it does
 * NOT invent correct behavior; the examples are provided). It produces a `task` for runRepairWorkflow whose
 * PRE-DECLARED acceptance is "the generated test executes and PASSES". Because repair-workflow accepts only on
 * baseline-FAIL→post-PASS, this correctly:
 *   - ACCEPTs when the generated test runs green against the real implementation (behavior matches the examples);
 *   - ABSTAINs + rolls the generated test away when the implementation does NOT satisfy the examples (the test
 *     fails) — ODG never keeps a red test, and never pretends the function is correct.
 *
 * Honest scope: generates characterization tests FROM provided examples (a real, useful, bounded capability); it is
 * NOT test-inference, not spec synthesis, not arbitrary code generation. Reuses runRepairWorkflow (no new primitive).
 */
"use strict";

const path = require("path");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * generateTestSource(exportName, requireRel, examples): a deterministic node:test source asserting, for each
 * example, deepStrictEqual(fn(...args), expected). `requireRel` is the test file's relative path to the module.
 */
function generateTestSource(exportName: string, requireRel: string, examples: any[]): string {
  const header =
    'const test = require("node:test");\n' +
    'const assert = require("node:assert");\n' +
    `const target = require(${JSON.stringify(requireRel)});\n` +
    `const fn = (target && typeof target === "object" && ${JSON.stringify(exportName)} in target) ? target[${JSON.stringify(exportName)}] : target;\n\n`;
  const cases = examples.map((ex: any, i: number) => {
    const args = JSON.stringify(ex.args);
    const expected = JSON.stringify(ex.expected);
    return `test(${JSON.stringify(`${exportName} example ${i + 1}`)}, () => {\n` +
      `  assert.deepStrictEqual(fn(...${args}), ${expected});\n});\n`;
  }).join("\n");
  return header + cases;
}

/**
 * buildAddTestsTask(spec): validate + assemble a runRepairWorkflow task.
 * spec = { workspaceDir, modulePath (repo-rel), exportName, examples:[{args:any[], expected:any}],
 *          testPath (repo-rel, default "test/<export>.generated.test.js"), writeSet (default ["test/"]) }
 * Returns { ok:true, task } or { ok:false, code, reason } (fail-closed).
 */
function buildAddTestsTask(spec: any): any {
  if (!isObj(spec)) return { ok: false, code: "INVALID_INPUT", reason: "spec object required" };
  if (typeof spec.workspaceDir !== "string") return { ok: false, code: "INVALID_INPUT", reason: "workspaceDir required" };
  if (typeof spec.modulePath !== "string" || !spec.modulePath) return { ok: false, code: "INVALID_INPUT", reason: "modulePath (repo-relative) required" };
  const exportName = typeof spec.exportName === "string" && spec.exportName ? spec.exportName : "default";
  const examples = Array.isArray(spec.examples) ? spec.examples : [];
  if (examples.length === 0) return { ok: false, code: "INVALID_INPUT", reason: "at least one example {args,expected} required" };
  for (const ex of examples) {
    if (!isObj(ex) || !Array.isArray(ex.args) || !("expected" in ex)) {
      return { ok: false, code: "INVALID_INPUT", reason: "each example needs { args:any[], expected:any }" };
    }
  }
  const testPath = typeof spec.testPath === "string" && spec.testPath ? spec.testPath : path.posix.join("test", `${exportName}.generated.test.js`);
  const writeSet = Array.isArray(spec.writeSet) && spec.writeSet.length ? spec.writeSet : ["test/"];

  // Relative path FROM the test file TO the module (so require() resolves inside the workspace).
  const fromDir = path.posix.dirname(testPath);
  let requireRel = path.posix.relative(fromDir, spec.modulePath).replace(/\.js$/, "");
  if (!requireRel.startsWith(".")) requireRel = "./" + requireRel;

  const content = generateTestSource(exportName, requireRel, examples);
  const task = {
    workspaceDir: spec.workspaceDir,
    acceptance: { command: ["node", "--test", testPath], timeoutMs: Number(spec.timeoutMs) || 30000 },
    writeSet,
    change: { source: "edits", edits: [{ path: testPath, content }] },
  };
  return { ok: true, task, testPath, requireRel, note: "Generates a characterization test from PROVIDED examples; accepted only if it executes and PASSES (else rolled back). Not test-inference, not spec synthesis." };
}

export { buildAddTestsTask, generateTestSource };
module.exports = { buildAddTestsTask, generateTestSource };
