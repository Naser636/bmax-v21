#!/usr/bin/env node
/**
 * repair-eval — V48 Lot D (register C-07 extension): a SEALED evaluation of the REPAIR families (distinct from the
 * code-CHECK accuracy of code-check-eval). It measures, on a frozen corpus of broken repos with INDEPENDENT ground
 * truth (does a safe deterministic fix exist?): correct-ACCEPT, correct-ABSTAIN, FALSE-SUCCESS (accepted when it
 * should not / wrong fix accepted) and FALSE-ABSTENTION (abstained when a correct fix existed). It runs the ACTUAL
 * family builders (task-fix-exports / task-fix-require) through the REAL runRepairWorkflow harness.
 *
 * Honesty contract: ground truth lives in the corpus, independent of the harness that decides ACCEPT/ABSTAIN. These
 * are REPAIR metrics only — NOT check accuracy, NOT the K-category score, NOT a broad-IT rate. The corpus is small and
 * JS-only; `evaluate()` surfaces that limit. Provenance = corpus version + a content sha256. Runner injectable for a
 * deterministic gated test; the real `node --test` run is the live measurement.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const FIXEXP = require("./task-fix-exports.js");
const FIXREQ = require("./task-fix-require.js");
const REPAIR = require("./repair-workflow.js");

// SEALED corpus. groundTruth: FIXABLE (a safe deterministic fix exists ⇒ should ACCEPT) | NO_SAFE_FIX (should NOT).
const CORPUS: ReadonlyArray<any> = Object.freeze([
  { id: "exp-fixable-1", family: "fix-exports", groundTruth: "FIXABLE",
    files: { "src/m.js": "function greet(n){ return 'hi ' + n; }\n" }, modulePath: "src/m.js", symbol: "greet",
    assertPass: 'const m=require("../src/m.js");if(typeof m.greet!=="function"||m.greet("x")!=="hi x")process.exit(1);' },
  { id: "exp-fixable-2", family: "fix-exports", groundTruth: "FIXABLE",
    files: { "src/m.js": "const VALUE = 7;\n" }, modulePath: "src/m.js", symbol: "VALUE",
    assertPass: 'const m=require("../src/m.js");if(m.VALUE!==7)process.exit(1);' },
  { id: "exp-undefined", family: "fix-exports", groundTruth: "NO_SAFE_FIX",   // symbol not defined ⇒ must not invent
    files: { "src/m.js": "function other(){}\n" }, modulePath: "src/m.js", symbol: "ghost",
    assertPass: 'process.exit(1);' },
  { id: "req-fixable", family: "fix-require", groundTruth: "FIXABLE",
    files: { "src/lib/util.js": "module.exports={go:()=>42};\n", "src/index.js": 'const u=require("./util");\nmodule.exports=()=>u.go();\n' },
    modulePath: "src/index.js", badSpecifier: "./util", candidates: ["src/lib/util.js"],
    assertPass: 'const i=require("../src/index.js");if(i()!==42)process.exit(1);' },
  { id: "req-ambiguous", family: "fix-require", groundTruth: "NO_SAFE_FIX",   // 2 candidates ⇒ must BLOCK, not guess
    files: { "a/util.js": "module.exports={go:()=>1};\n", "b/util.js": "module.exports={go:()=>2};\n", "src/index.js": 'const u=require("./util");\nmodule.exports=()=>u.go();\n' },
    modulePath: "src/index.js", badSpecifier: "./util", candidates: ["a/util.js", "b/util.js"],
    assertPass: 'process.exit(1);' },
  { id: "exp-fix-insufficient", family: "fix-exports", groundTruth: "NO_SAFE_FIX",  // export added but behaviour wrong ⇒ must ABSTAIN (no false success)
    files: { "src/m.js": "function add(a,b){ return a - b; }\n" }, modulePath: "src/m.js", symbol: "add",
    assertPass: 'const m=require("../src/m.js");if(m.add(2,3)!==5)process.exit(1);' },
]);

const CORPUS_VERSION = "repair-eval-v1";

function corpusProvenance(): any {
  return { version: CORPUS_VERSION, sha256: crypto.createHash("sha256").update(JSON.stringify(CORPUS)).digest("hex"), total: CORPUS.length };
}

function materialize(c: any): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-repaireval-"));
  for (const [rel, content] of Object.entries(c.files)) {
    const abs = path.join(dir, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content as string);
  }
  // Real acceptance test for the live run (node --test discovers test/*.test.js).
  fs.mkdirSync(path.join(dir, "test"), { recursive: true });
  fs.writeFileSync(path.join(dir, "test", "acc.test.js"), `const test=require("node:test");\ntest("acc",()=>{ ${c.assertPass} });\n`);
  return dir;
}

function buildTask(c: any, dir: string): any {
  if (c.family === "fix-exports") return FIXEXP.buildFixExportsTask({ workspaceDir: dir, modulePath: c.modulePath, symbol: c.symbol, source: c.files[c.modulePath], acceptanceCommand: ["node", "--test"] });
  if (c.family === "fix-require") return FIXREQ.buildFixRequireTask({ workspaceDir: dir, modulePath: c.modulePath, source: c.files[c.modulePath], badSpecifier: c.badSpecifier, candidates: c.candidates, acceptanceCommand: ["node", "--test"] });
  return { ok: false, code: "UNKNOWN_FAMILY" };
}

/** evaluate(opts?): run every repair case through the real family builder + harness; classify vs ground truth. */
function evaluate(opts: any = {}): any {
  const runnerOpt = typeof opts.runner === "function" ? { runner: opts.runner } : {};
  const m = { correctAccept: 0, correctAbstain: 0, falseSuccess: 0, falseAbstention: 0, evaluated: 0 };
  const results: any[] = [];
  for (const c of CORPUS) {
    const dir = materialize(c);
    let outcome: string, status: string;
    try {
      const built = buildTask(c, dir);
      if (!built.ok) {                       // builder refused (UNSUPPORTED/BLOCKED) ⇒ a pre-apply abstention
        status = "ABSTAIN(" + built.code + ")";
        outcome = c.groundTruth === "NO_SAFE_FIX" ? "correctAbstain" : "falseAbstention";
      } else {
        const res = REPAIR.runRepairWorkflow(built.task, runnerOpt);
        status = res.status;
        if (res.status === "ACCEPTED") outcome = c.groundTruth === "FIXABLE" ? "correctAccept" : "falseSuccess";
        else outcome = c.groundTruth === "NO_SAFE_FIX" ? "correctAbstain" : "falseAbstention";
      }
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
    (m as any)[outcome]++; m.evaluated++;
    results.push({ id: c.id, family: c.family, groundTruth: c.groundTruth, status, outcome });
  }
  const accept = m.correctAccept + m.falseAbstention;        // # that SHOULD accept
  const reject = m.correctAbstain + m.falseSuccess;          // # that SHOULD abstain
  return {
    provenance: corpusProvenance(),
    overall: {
      ...m,
      correctAcceptRate: accept > 0 ? Number((m.correctAccept / accept).toFixed(4)) : null,
      falseSuccessRate: reject > 0 ? Number((m.falseSuccess / reject).toFixed(4)) : null,
      falseAbstentionRate: accept > 0 ? Number((m.falseAbstention / accept).toFixed(4)) : null,
      accuracy: m.evaluated > 0 ? Number(((m.correctAccept + m.correctAbstain) / m.evaluated).toFixed(4)) : null,
    },
    results,
    caveat: "REPAIR acceptance metrics ONLY, on a SMALL JS-only sealed corpus. NOT code-check accuracy, NOT K-category, " +
      "NOT a broad-IT success rate. False-success = accepted a change that should not have been accepted; false-abstention " +
      "= failed to accept an available safe fix. Too small to generalize.",
  };
}

export { evaluate, corpusProvenance, CORPUS, CORPUS_VERSION };
module.exports = { evaluate, corpusProvenance, CORPUS, CORPUS_VERSION };

if (require.main === module) {
  process.stdout.write(JSON.stringify(evaluate(), null, 2) + "\n");
}
