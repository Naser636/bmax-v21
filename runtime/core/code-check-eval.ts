#!/usr/bin/env node
/**
 * code-check-eval — V47 Lot B (register C-07): a SEALED, versioned evaluation corpus that measures the REAL V45
 * code-execution checker's accuracy on clean / broken / malformed JS / TS / Python fixtures.
 *
 * Honesty contract (mandate §4): this measures SYNTAX/TYPE-CHECK accuracy ONLY — it is NOT a code-generation,
 * repair, K-category, or broad-IT success rate, and must never be reported as such. Ground truth (`expected`) is
 * fixed in the frozen corpus, independent of the checker. The corpus is intentionally SMALL and is NOT a basis for
 * any broad-IT generalization — `evaluate()` surfaces that limitation explicitly. Denominators are reported exactly;
 * BLOCKED/UNSUPPORTED cases (absent toolchain) are excluded from the accuracy denominator and reported separately.
 *
 * The real checker is run by default (deterministic injected runner only for the gated unit test). Provenance =
 * corpus version + a content sha256 so a changed corpus is detectable.
 */
"use strict";

const crypto = require("crypto");
const EXEC = require("./code-execution.js");

// SEALED corpus. expected ∈ {"PASS","FAIL"} is the INDEPENDENT ground truth (a clean file should PASS a syntax/type
// check; a broken/malformed file should FAIL). Keep ground truth human-reasoned + live-verified, not checker-derived.
const CORPUS: ReadonlyArray<any> = Object.freeze([
  // ---- JavaScript (node --check) ----
  { id: "js-clean-1", language: "JavaScript", kind: "clean", expected: "PASS", content: "const x = 1;\nmodule.exports = x;\n" },
  { id: "js-clean-2", language: "JavaScript", kind: "clean", expected: "PASS", content: "function add(a, b) { return a + b; }\nmodule.exports = { add };\n" },
  { id: "js-broken-1", language: "JavaScript", kind: "broken", expected: "FAIL", content: "const x = ;\n" },
  { id: "js-broken-2", language: "JavaScript", kind: "broken", expected: "FAIL", content: "function f( { return 1 }\n" },
  { id: "js-malformed", language: "JavaScript", kind: "malformed", expected: "FAIL", content: "})(({{\n" },
  // ---- TypeScript (tsc --noEmit --skipLibCheck): catches BOTH syntax and TYPE errors ----
  { id: "ts-clean-1", language: "TypeScript", kind: "clean", expected: "PASS", content: "const x: number = 1;\nexport {};\n" },
  { id: "ts-clean-2", language: "TypeScript", kind: "clean", expected: "PASS", content: "function id<T>(v: T): T { return v; }\nexport { id };\n" },
  { id: "ts-type-err", language: "TypeScript", kind: "broken", expected: "FAIL", content: "const x: number = \"not a number\";\nexport {};\n" },
  { id: "ts-syntax-err", language: "TypeScript", kind: "broken", expected: "FAIL", content: "const x: = 1;\nexport {};\n" },
  // ---- Python (python3 -m py_compile) ----
  { id: "py-clean-1", language: "Python", kind: "clean", expected: "PASS", content: "x = 1\n\n\ndef f(a, b):\n    return a + b\n" },
  { id: "py-clean-2", language: "Python", kind: "clean", expected: "PASS", content: "import json\nprint(json.dumps({'a': 1}))\n" },
  { id: "py-broken-1", language: "Python", kind: "broken", expected: "FAIL", content: "def f(:\n    return 1\n" },
  { id: "py-indent", language: "Python", kind: "broken", expected: "FAIL", content: "def f():\nreturn 1\n" },
]);

const CORPUS_VERSION = "cce-v1";

function corpusProvenance(): any {
  const sha256 = crypto.createHash("sha256").update(JSON.stringify(CORPUS)).digest("hex");
  const byLang: Record<string, number> = {};
  for (const c of CORPUS) byLang[c.language] = (byLang[c.language] || 0) + 1;
  return { version: CORPUS_VERSION, sha256, total: CORPUS.length, byLanguage: byLang };
}

function blankMetrics(): any { return { evaluated: 0, correctPass: 0, correctFail: 0, falsePass: 0, falseFail: 0, blocked: 0 }; }

/**
 * evaluate(opts?): run the REAL checker over the sealed corpus and classify each case against ground truth.
 * opts.runner / opts.toolchain override the real tool (gated tests only). Returns provenance + per-language + overall
 * metrics with EXACT numerator/denominator and an explicit generalization caveat.
 */
function evaluate(opts: any = {}): any {
  const runner = typeof opts.runner === "function" ? opts.runner : undefined;
  const toolchain = opts.toolchain && typeof opts.toolchain === "object" ? opts.toolchain : EXEC.detectToolchain(runner ? { runner } : {});
  const perLanguage: Record<string, any> = {};
  const overall = blankMetrics();
  const results: any[] = [];

  for (const c of CORPUS) {
    perLanguage[c.language] = perLanguage[c.language] || blankMetrics();
    const available = toolchain[c.language] === true;
    const res = EXEC.runSyntaxCheck({ language: c.language, content: c.content, toolchainAvailable: available, ...(runner ? { runner } : {}) });
    let outcome: string;
    if (res.status === "UNSUPPORTED" || res.status === "BLOCKED") {
      outcome = "BLOCKED"; perLanguage[c.language].blocked++; overall.blocked++;
    } else {
      const actual = res.status; // PASS | FAIL
      if (actual === c.expected && actual === "PASS") { outcome = "correctPass"; perLanguage[c.language].correctPass++; overall.correctPass++; }
      else if (actual === c.expected && actual === "FAIL") { outcome = "correctFail"; perLanguage[c.language].correctFail++; overall.correctFail++; }
      else if (c.expected === "FAIL" && actual === "PASS") { outcome = "falsePass"; perLanguage[c.language].falsePass++; overall.falsePass++; }
      else { outcome = "falseFail"; perLanguage[c.language].falseFail++; overall.falseFail++; }
      perLanguage[c.language].evaluated++; overall.evaluated++;
    }
    results.push({ id: c.id, language: c.language, kind: c.kind, expected: c.expected, actual: res.status, outcome });
  }

  const accuracy = (m: any): number | null => m.evaluated > 0 ? Number(((m.correctPass + m.correctFail) / m.evaluated).toFixed(4)) : null;
  for (const lang of Object.keys(perLanguage)) perLanguage[lang].accuracy = accuracy(perLanguage[lang]);
  overall.accuracy = accuracy(overall);

  return {
    provenance: corpusProvenance(),
    overall, perLanguage, results,
    caveat: "SYNTAX/TYPE-CHECK accuracy ONLY on a SMALL sealed corpus. NOT code-generation, repair, K-category, or " +
      "broad-IT success. Too small for broad-IT generalization — do not report a broad-IT rate from these cases. " +
      "Accuracy denominator = evaluated cases (BLOCKED/UNSUPPORTED excluded and reported separately).",
  };
}

export { evaluate, corpusProvenance, CORPUS, CORPUS_VERSION };
module.exports = { evaluate, corpusProvenance, CORPUS, CORPUS_VERSION };

if (require.main === module) {
  process.stdout.write(JSON.stringify(evaluate(), null, 2) + "\n");
}
