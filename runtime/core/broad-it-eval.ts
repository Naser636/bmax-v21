#!/usr/bin/env node
/**
 * broad-it-eval — Priority A: the SCAFFOLDING for a broad-IT evaluation corpus with a STRICT development/held-out
 * separation, provenance, per-category metrics and leakage protection. It does NOT (and must not) claim a broad-IT
 * success rate: the corpus here only covers ODG's ACTUALLY-supported surface (JS/TS/Python syntax/type checks via the
 * real code-execution checker). `assessBroadIT` therefore returns broad-IT = NO_DATA with an explicit coverage caveat
 * until a representative, diverse, independently-labelled corpus (incl. unsupported stacks) exists.
 *
 * Guarantees:
 *  - DEV and HELDOUT partitions are DISJOINT by id AND by content sha256 (checkLeakage) — no data leakage.
 *  - Ground truth (`expected`) is fixed in the corpus, independent of the checker.
 *  - Per-category + per-partition exact numerator/denominator; BLOCKED/UNSUPPORTED excluded from accuracy.
 *  - The real checker runs by default; an injected runner is used only for deterministic gated tests.
 */
"use strict";

const crypto = require("crypto");
const EXEC = require("./code-execution.js");

// Diversified corpus across language × kind. partition ∈ {dev, heldout}; held-out cases are NEVER used to tune.
const CORPUS: ReadonlyArray<any> = Object.freeze([
  // --- DEV (visible, for tuning) ---
  { id: "dev-js-clean-1", partition: "dev", category: "JavaScript/syntax", language: "JavaScript", kind: "clean", expected: "PASS", content: "const a = 1;\nmodule.exports = a;\n" },
  { id: "dev-js-broken-1", partition: "dev", category: "JavaScript/syntax", language: "JavaScript", kind: "broken", expected: "FAIL", content: "const a = ;\n" },
  { id: "dev-ts-clean-1", partition: "dev", category: "TypeScript/type", language: "TypeScript", kind: "clean", expected: "PASS", content: "const n: number = 1;\nexport {};\n" },
  { id: "dev-ts-broken-1", partition: "dev", category: "TypeScript/type", language: "TypeScript", kind: "broken", expected: "FAIL", content: "const n: number = 'x';\nexport {};\n" },
  { id: "dev-py-clean-1", partition: "dev", category: "Python/syntax", language: "Python", kind: "clean", expected: "PASS", content: "def f(a, b):\n    return a + b\n" },
  { id: "dev-py-broken-1", partition: "dev", category: "Python/syntax", language: "Python", kind: "broken", expected: "FAIL", content: "def f(:\n    return 1\n" },
  // --- HELDOUT (kept apart; evaluation only) ---
  { id: "held-js-clean-1", partition: "heldout", category: "JavaScript/syntax", language: "JavaScript", kind: "clean", expected: "PASS", content: "function g(x){ return x * 2; }\nmodule.exports = { g };\n" },
  { id: "held-js-broken-1", partition: "heldout", category: "JavaScript/syntax", language: "JavaScript", kind: "broken", expected: "FAIL", content: "function g( { return 1 }\n" },
  { id: "held-ts-clean-1", partition: "heldout", category: "TypeScript/type", language: "TypeScript", kind: "clean", expected: "PASS", content: "function id<T>(v: T): T { return v; }\nexport { id };\n" },
  { id: "held-ts-broken-1", partition: "heldout", category: "TypeScript/type", language: "TypeScript", kind: "broken", expected: "FAIL", content: "const z: = 1;\nexport {};\n" },
  { id: "held-py-clean-1", partition: "heldout", category: "Python/syntax", language: "Python", kind: "clean", expected: "PASS", content: "import json\nprint(json.dumps({'a': 1}))\n" },
  { id: "held-py-broken-1", partition: "heldout", category: "Python/syntax", language: "Python", kind: "broken", expected: "FAIL", content: "x = (1\n" },
]);

const CORPUS_VERSION = "broad-it-eval-v1";
// The SUPPORTED surface this corpus can measure (NOT all of IT). Broad-IT needs far more than this.
const SUPPORTED_CATEGORIES = ["JavaScript/syntax", "TypeScript/type", "Python/syntax"];

function sha256(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }

/** checkLeakage(): DEV and HELDOUT must be disjoint by id AND by content hash. Returns { ok, idOverlap[], hashOverlap[] }. */
function checkLeakage(corpus: ReadonlyArray<any> = CORPUS): any {
  const dev = corpus.filter((c) => c.partition === "dev");
  const held = corpus.filter((c) => c.partition === "heldout");
  const devIds = new Set(dev.map((c) => c.id)); const devHashes = new Set(dev.map((c) => sha256(c.content)));
  const idOverlap = held.filter((c) => devIds.has(c.id)).map((c) => c.id);
  const hashOverlap = held.filter((c) => devHashes.has(sha256(c.content))).map((c) => c.id);
  return { ok: idOverlap.length === 0 && hashOverlap.length === 0, idOverlap, hashOverlap, devCount: dev.length, heldoutCount: held.length };
}

function provenance(): any {
  return { version: CORPUS_VERSION, sha256: sha256(JSON.stringify(CORPUS)), total: CORPUS.length, partitions: { dev: CORPUS.filter((c) => c.partition === "dev").length, heldout: CORPUS.filter((c) => c.partition === "heldout").length }, supportedCategories: SUPPORTED_CATEGORIES };
}

function blank(): any { return { evaluated: 0, correctPass: 0, correctFail: 0, falsePass: 0, falseFail: 0, blocked: 0 }; }

/** evaluate({partition, runner, toolchain}): run the REAL checker over a partition; per-category + overall metrics. */
function evaluate(opts: any = {}): any {
  const partition = opts.partition === "dev" || opts.partition === "heldout" ? opts.partition : "heldout";
  const runner = typeof opts.runner === "function" ? opts.runner : undefined;
  const toolchain = opts.toolchain && typeof opts.toolchain === "object" ? opts.toolchain : EXEC.detectToolchain(runner ? { runner } : {});
  const cases = CORPUS.filter((c) => c.partition === partition);
  const perCategory: Record<string, any> = {};
  const overall = blank();
  const results: any[] = [];
  for (const c of cases) {
    perCategory[c.category] = perCategory[c.category] || blank();
    const available = toolchain[c.language] === true;
    const res = EXEC.runSyntaxCheck({ language: c.language, content: c.content, toolchainAvailable: available, ...(runner ? { runner } : {}) });
    let outcome: string;
    if (res.status === "UNSUPPORTED" || res.status === "BLOCKED") { outcome = "blocked"; perCategory[c.category].blocked++; overall.blocked++; }
    else {
      if (res.status === c.expected) { outcome = res.status === "PASS" ? "correctPass" : "correctFail"; }
      else { outcome = c.expected === "FAIL" ? "falsePass" : "falseFail"; }
      (perCategory[c.category] as any)[outcome]++; (overall as any)[outcome]++;
      perCategory[c.category].evaluated++; overall.evaluated++;
    }
    results.push({ id: c.id, category: c.category, expected: c.expected, actual: res.status, outcome });
  }
  const acc = (m: any) => m.evaluated > 0 ? Number(((m.correctPass + m.correctFail) / m.evaluated).toFixed(4)) : null;
  for (const k of Object.keys(perCategory)) perCategory[k].accuracy = acc(perCategory[k]);
  overall.accuracy = acc(overall);
  return { provenance: provenance(), partition, overall, perCategory, results };
}

/**
 * assessBroadIT(opts?): the HONEST broad-IT verdict. Evaluates held-out, but broad-IT stays NO_DATA because the
 * corpus only covers the narrow supported surface — it is NOT representative of general IT (no Go/Rust/Java/SQL/web,
 * no application-build / integration / data tasks). Returns the supported-surface held-out accuracy separately.
 */
function assessBroadIT(opts: any = {}): any {
  const leak = checkLeakage();
  if (!leak.ok) return { broadIT: "INVALID", reason: "DEV/HELDOUT leakage detected", leak };
  const held = evaluate({ partition: "heldout", runner: opts.runner, toolchain: opts.toolchain });
  const representative = false; // by construction: only 3 check categories; not representative of broad IT
  return {
    broadIT: "NO_DATA",
    reason: "corpus covers only the narrow SUPPORTED surface (JS/TS/Python syntax/type checks); NOT representative of general IT (absent: Go/Rust/Java/SQL/web + application-build/integration/data/repair-generalisation). A broad-IT rate requires a representative, diverse, independently-labelled corpus that does not yet exist.",
    representative,
    supportedSurfaceHeldout: { accuracy: held.overall.accuracy, falsePass: held.overall.falsePass, falseFail: held.overall.falseFail, evaluated: held.overall.evaluated, perCategory: held.perCategory },
    leakageProtection: leak,
    note: "Held-out supported-surface accuracy is reported for THIS narrow corpus only. broad-IT VERIFIED_SUCCESS_RATE remains NO_DATA. No extrapolation.",
  };
}

export { CORPUS, CORPUS_VERSION, SUPPORTED_CATEGORIES, checkLeakage, provenance, evaluate, assessBroadIT };
module.exports = { CORPUS, CORPUS_VERSION, SUPPORTED_CATEGORIES, checkLeakage, provenance, evaluate, assessBroadIT };

if (require.main === module) {
  process.stdout.write(JSON.stringify(assessBroadIT(), null, 2) + "\n");
}
