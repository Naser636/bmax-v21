#!/usr/bin/env node
/**
 * generative-repair-eval — V50 (register C-04 measurement): a SEALED corpus that measures the LOCAL generative
 * provider's repair quality THROUGH the confined harness. Each case is a tiny buggy repo + a real acceptance test +
 * an instruction; ground truth is FIXABLE (a correct edit exists). evaluate() runs runGenerativeRepair for each case
 * and classifies: correctAccept (model's edit made the real test pass), abstain (model tried but the test still
 * failed ⇒ rolled back), rejected (malformed/out-of-scope), providerDown.
 *
 * KEY HONEST PROPERTY: falseSuccess is 0 BY CONSTRUCTION — acceptance is a real `node --test`, so a wrong model edit
 * can NEVER be ACCEPTED (it is rolled back). The metric that varies with model quality is the ACCEPT RATE. This is a
 * narrow, model-dependent measurement on a handful of JS cases — NOT a broad-IT success rate (stays NO_DATA). The
 * generator is injectable: the gated test uses a scripted generator (deterministic, zero network); the live run uses
 * the real Ollama model and records the measured accept rate.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ADAPTER = require("./generative-repair-adapter.js");

// SEALED corpus. Each case: files (buggy), a test asserting the CORRECT behaviour, and the fix instruction.
const CORPUS: ReadonlyArray<any> = Object.freeze([
  { id: "sum", instruction: "The exported function must return the SUM a + b.",
    files: { "src/f.js": "module.exports = (a, b) => a - b;\n" }, modulePath: "src/f.js",
    test: 'const fn=require("../src/f.js");if(fn(2,3)!==5||fn(10,4)!==14)process.exit(1);' },
  { id: "max", instruction: "The exported function must return the LARGER of a and b.",
    files: { "src/f.js": "module.exports = (a, b) => a;\n" }, modulePath: "src/f.js",
    test: 'const fn=require("../src/f.js");if(fn(2,3)!==3||fn(9,4)!==9)process.exit(1);' },
  { id: "iseven", instruction: "The exported function must return true iff n is even.",
    files: { "src/f.js": "module.exports = (n) => n % 2 === 1;\n" }, modulePath: "src/f.js",
    test: 'const fn=require("../src/f.js");if(fn(4)!==true||fn(3)!==false)process.exit(1);' },
  { id: "greet", instruction: "The exported function must return the string \"hi \" followed by the name argument.",
    files: { "src/f.js": "module.exports = (name) => \"hello \" + name;\n" }, modulePath: "src/f.js",
    test: 'const fn=require("../src/f.js");if(fn("x")!=="hi x")process.exit(1);' },
  { id: "double", instruction: "The exported function must return n multiplied by 2.",
    files: { "src/f.js": "module.exports = (n) => n + 2;\n" }, modulePath: "src/f.js",
    test: 'const fn=require("../src/f.js");if(fn(5)!==10||fn(0)!==0)process.exit(1);' },
]);

const CORPUS_VERSION = "gen-repair-eval-v1";

function corpusProvenance(): any {
  return { version: CORPUS_VERSION, sha256: crypto.createHash("sha256").update(JSON.stringify(CORPUS)).digest("hex"), total: CORPUS.length };
}

function materialize(c: any): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-genrepair-"));
  for (const [rel, content] of Object.entries(c.files)) { const abs = path.join(dir, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content as string); }
  fs.mkdirSync(path.join(dir, "test"), { recursive: true });
  fs.writeFileSync(path.join(dir, "test", "acc.test.js"), `const test=require("node:test");\ntest("acc",()=>{ ${c.test} });\n`);
  return dir;
}

/** evaluate(opts?): run each case through runGenerativeRepair (real or injected generator) and classify. */
async function evaluate(opts: any = {}): Promise<any> {
  const m = { correctAccept: 0, abstain: 0, rejected: 0, providerDown: 0, falseSuccess: 0, evaluated: 0 };
  const results: any[] = [];
  for (const c of CORPUS) {
    const dir = materialize(c);
    let status: string, outcome: string;
    try {
      const res = await ADAPTER.runGenerativeRepair({
        workspaceDir: dir, instruction: c.instruction, allowedFiles: ["src/"], acceptanceCommand: ["node", "--test"],
        currentFiles: c.files, model: opts.model, timeoutMs: opts.timeoutMs || 180000,
      }, opts.generate ? { generate: opts.generate, runner: opts.runner } : (opts.runner ? { runner: opts.runner } : {}));
      status = res.status || (res.ok === false ? res.code || "ERROR" : "?");
      if (res.status === "ACCEPTED") { outcome = "correctAccept"; }
      else if (res.status === "ABSTAINED") { outcome = "abstain"; }
      else if (res.status === "REJECTED") { outcome = "rejected"; }
      else if (res.status === "BLOCKED") { outcome = "providerDown"; }
      else { outcome = "rejected"; }
    } catch (e: any) { status = "ERROR"; outcome = "rejected"; }
    finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
    (m as any)[outcome]++; m.evaluated++;
    results.push({ id: c.id, status, outcome });
  }
  const reachable = m.evaluated - m.providerDown;
  return {
    provenance: corpusProvenance(),
    overall: { ...m, acceptRate: reachable > 0 ? Number((m.correctAccept / reachable).toFixed(4)) : null, falseSuccessRate: 0 },
    results,
    caveat: "NARROW, model-dependent generative-repair measurement on a few JS cases. falseSuccess is 0 BY CONSTRUCTION " +
      "(acceptance is a real test ⇒ a wrong model edit is rolled back, never accepted). acceptRate reflects the local " +
      "model's quality on THESE cases only — NOT a broad-IT success rate (that stays NO_DATA).",
  };
}

export { evaluate, corpusProvenance, CORPUS, CORPUS_VERSION };
module.exports = { evaluate, corpusProvenance, CORPUS, CORPUS_VERSION };

if (require.main === module) {
  evaluate({ model: process.argv[2] || undefined }).then((r) => process.stdout.write(JSON.stringify(r, null, 2) + "\n"));
}
