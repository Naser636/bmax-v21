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
const METRICS = require("./eval-metrics.js");   // ODG5 eval-metrics — wired here as a real consumer (was orphan)

// Diversified corpus across language × kind. partition ∈ {dev, heldout}; held-out cases are NEVER used to tune.
// Grown (v2) within the ACTUALLY-supported surface (JS/TS/Python): 4 cases per category per partition (2 clean,
// 2 broken). Every case is REAL-checker-evaluable (never BLOCKED), and DEV/HELDOUT stay disjoint by id AND content.
const CORPUS: ReadonlyArray<any> = Object.freeze([
  // --- DEV (visible, for tuning) ---
  { id: "dev-js-clean-1", partition: "dev", category: "JavaScript/syntax", language: "JavaScript", kind: "clean", expected: "PASS", content: "const a = 1;\nmodule.exports = a;\n" },
  { id: "dev-js-clean-2", partition: "dev", category: "JavaScript/syntax", language: "JavaScript", kind: "clean", expected: "PASS", content: "let total = 0;\nfor (let i = 0; i < 3; i++) { total += i; }\nmodule.exports = total;\n" },
  { id: "dev-js-broken-1", partition: "dev", category: "JavaScript/syntax", language: "JavaScript", kind: "broken", expected: "FAIL", content: "const a = ;\n" },
  { id: "dev-js-broken-2", partition: "dev", category: "JavaScript/syntax", language: "JavaScript", kind: "broken", expected: "FAIL", content: "const obj = { a: 1,, };\n" },
  { id: "dev-ts-clean-1", partition: "dev", category: "TypeScript/type", language: "TypeScript", kind: "clean", expected: "PASS", content: "const n: number = 1;\nexport {};\n" },
  { id: "dev-ts-clean-2", partition: "dev", category: "TypeScript/type", language: "TypeScript", kind: "clean", expected: "PASS", content: "interface P { n: number }\nconst p: P = { n: 1 };\nexport { p };\n" },
  { id: "dev-ts-broken-1", partition: "dev", category: "TypeScript/type", language: "TypeScript", kind: "broken", expected: "FAIL", content: "const n: number = 'x';\nexport {};\n" },
  { id: "dev-ts-broken-2", partition: "dev", category: "TypeScript/type", language: "TypeScript", kind: "broken", expected: "FAIL", content: "function f(x: number): string { return x; }\nexport {};\n" },
  { id: "dev-py-clean-1", partition: "dev", category: "Python/syntax", language: "Python", kind: "clean", expected: "PASS", content: "def f(a, b):\n    return a + b\n" },
  { id: "dev-py-clean-2", partition: "dev", category: "Python/syntax", language: "Python", kind: "clean", expected: "PASS", content: "nums = [1, 2, 3]\nprint(sum(nums))\n" },
  { id: "dev-py-broken-1", partition: "dev", category: "Python/syntax", language: "Python", kind: "broken", expected: "FAIL", content: "def f(:\n    return 1\n" },
  { id: "dev-py-broken-2", partition: "dev", category: "Python/syntax", language: "Python", kind: "broken", expected: "FAIL", content: "if True\n    pass\n" },
  // --- HELDOUT (kept apart; evaluation only) ---
  { id: "held-js-clean-1", partition: "heldout", category: "JavaScript/syntax", language: "JavaScript", kind: "clean", expected: "PASS", content: "function g(x){ return x * 2; }\nmodule.exports = { g };\n" },
  { id: "held-js-clean-2", partition: "heldout", category: "JavaScript/syntax", language: "JavaScript", kind: "clean", expected: "PASS", content: "const arr = [1, 2, 3].map((x) => x + 1);\nmodule.exports = { arr };\n" },
  { id: "held-js-broken-1", partition: "heldout", category: "JavaScript/syntax", language: "JavaScript", kind: "broken", expected: "FAIL", content: "function g( { return 1 }\n" },
  { id: "held-js-broken-2", partition: "heldout", category: "JavaScript/syntax", language: "JavaScript", kind: "broken", expected: "FAIL", content: "const x = {;\n" },
  { id: "held-ts-clean-1", partition: "heldout", category: "TypeScript/type", language: "TypeScript", kind: "clean", expected: "PASS", content: "function id<T>(v: T): T { return v; }\nexport { id };\n" },
  { id: "held-ts-clean-2", partition: "heldout", category: "TypeScript/type", language: "TypeScript", kind: "clean", expected: "PASS", content: "type Pair = [number, string];\nconst p: Pair = [1, 'a'];\nexport { p };\n" },
  { id: "held-ts-broken-1", partition: "heldout", category: "TypeScript/type", language: "TypeScript", kind: "broken", expected: "FAIL", content: "const z: = 1;\nexport {};\n" },
  { id: "held-ts-broken-2", partition: "heldout", category: "TypeScript/type", language: "TypeScript", kind: "broken", expected: "FAIL", content: "let s: string = 42;\nexport {};\n" },
  { id: "held-py-clean-1", partition: "heldout", category: "Python/syntax", language: "Python", kind: "clean", expected: "PASS", content: "import json\nprint(json.dumps({'a': 1}))\n" },
  { id: "held-py-clean-2", partition: "heldout", category: "Python/syntax", language: "Python", kind: "clean", expected: "PASS", content: "d = {'k': 1}\nfor k, v in d.items():\n    print(k, v)\n" },
  { id: "held-py-broken-1", partition: "heldout", category: "Python/syntax", language: "Python", kind: "broken", expected: "FAIL", content: "x = (1\n" },
  { id: "held-py-broken-2", partition: "heldout", category: "Python/syntax", language: "Python", kind: "broken", expected: "FAIL", content: "def f()\n    return 1\n" },
  // --- SQL/schema (v3): NO-INSTALL checker via stdlib sqlite3 (in-memory). DEV + HELDOUT, 2 clean + 2 broken each. ---
  { id: "dev-sql-clean-1", partition: "dev", category: "SQL/schema", language: "SQL", kind: "clean", expected: "PASS", content: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\n" },
  { id: "dev-sql-clean-2", partition: "dev", category: "SQL/schema", language: "SQL", kind: "clean", expected: "PASS", content: "CREATE TABLE t (a INTEGER);\nCREATE INDEX idx_a ON t(a);\n" },
  { id: "dev-sql-broken-1", partition: "dev", category: "SQL/schema", language: "SQL", kind: "broken", expected: "FAIL", content: "CREATE TABLE t (id INTEGER PRIMARY,, name;\n" },
  { id: "dev-sql-broken-2", partition: "dev", category: "SQL/schema", language: "SQL", kind: "broken", expected: "FAIL", content: "CREATE TABL t (id INTEGER);\n" },
  { id: "held-sql-clean-1", partition: "heldout", category: "SQL/schema", language: "SQL", kind: "clean", expected: "PASS", content: "CREATE TABLE orders (id INTEGER PRIMARY KEY, total REAL);\n" },
  { id: "held-sql-clean-2", partition: "heldout", category: "SQL/schema", language: "SQL", kind: "clean", expected: "PASS", content: "CREATE TABLE a (x TEXT);\nINSERT INTO a (x) VALUES ('v');\n" },
  { id: "held-sql-broken-1", partition: "heldout", category: "SQL/schema", language: "SQL", kind: "broken", expected: "FAIL", content: "CREATE TABLE a (x TEXT;\n" },
  { id: "held-sql-broken-2", partition: "heldout", category: "SQL/schema", language: "SQL", kind: "broken", expected: "FAIL", content: "SELECT FROM WHERE;\n" },
  // --- Config-YAML/validate (v3): NO-INSTALL checker via PyYAML safe_load_all. ---
  { id: "dev-yaml-clean-1", partition: "dev", category: "Config-YAML/validate", language: "YAML", kind: "clean", expected: "PASS", content: "name: svc\nversion: 1\nports:\n  - 80\n  - 443\n" },
  { id: "dev-yaml-clean-2", partition: "dev", category: "Config-YAML/validate", language: "YAML", kind: "clean", expected: "PASS", content: "a:\n  b: c\nlist: [1, 2, 3]\n" },
  { id: "dev-yaml-broken-1", partition: "dev", category: "Config-YAML/validate", language: "YAML", kind: "broken", expected: "FAIL", content: "a: 1\n  b: : :\n- x\n" },
  { id: "dev-yaml-broken-2", partition: "dev", category: "Config-YAML/validate", language: "YAML", kind: "broken", expected: "FAIL", content: "key: [unclosed\n" },
  { id: "held-yaml-clean-1", partition: "heldout", category: "Config-YAML/validate", language: "YAML", kind: "clean", expected: "PASS", content: "env: prod\nreplicas: 3\nlabels:\n  app: web\n" },
  { id: "held-yaml-clean-2", partition: "heldout", category: "Config-YAML/validate", language: "YAML", kind: "clean", expected: "PASS", content: "items:\n  - id: 1\n    ok: true\n  - id: 2\n    ok: false\n" },
  { id: "held-yaml-broken-1", partition: "heldout", category: "Config-YAML/validate", language: "YAML", kind: "broken", expected: "FAIL", content: "a: 1\nb: [c, d\n" },
  { id: "held-yaml-broken-2", partition: "heldout", category: "Config-YAML/validate", language: "YAML", kind: "broken", expected: "FAIL", content: "foo: \"unterminated\n" },
  // --- Shell/syntax (v3): real `bash -n` syntax check (NOT lint — shellcheck absent). Capability eval; NOT a taxonomy slot. ---
  { id: "dev-sh-clean-1", partition: "dev", category: "Shell/syntax", language: "Shell", kind: "clean", expected: "PASS", content: "#!/usr/bin/env bash\nset -e\necho hello\n" },
  { id: "dev-sh-broken-1", partition: "dev", category: "Shell/syntax", language: "Shell", kind: "broken", expected: "FAIL", content: "for i in 1 2 3; do echo $i\n" },
  { id: "held-sh-clean-1", partition: "heldout", category: "Shell/syntax", language: "Shell", kind: "clean", expected: "PASS", content: "x=1\nif [ \"$x\" -eq 1 ]; then echo one; fi\n" },
  { id: "held-sh-broken-1", partition: "heldout", category: "Shell/syntax", language: "Shell", kind: "broken", expected: "FAIL", content: "case $x in\n  a) echo a\n" },
]);

const CORPUS_VERSION = "broad-it-eval-v3";
// The SUPPORTED surface this corpus can measure (NOT all of IT). Broad-IT needs far more than this. v3 adds the
// NO-INSTALL checkers (SQL via stdlib sqlite3, YAML via PyYAML, Shell via `bash -n`) — a real expansion using tooling
// already present; compiler stacks (Go/Rust/Java/C#) still require an authorized install and stay UNSUPPORTED.
const SUPPORTED_CATEGORIES = ["JavaScript/syntax", "TypeScript/type", "Python/syntax", "SQL/schema", "Config-YAML/validate", "Shell/syntax"];

// PRE-REGISTERED target taxonomy of broad-IT categories a REPRESENTATIVE corpus must cover. This is the fixed
// DENOMINATOR for the coverage ratio: it is declared up-front (not fitted to what ODG happens to support) so the
// representativeness verdict is a measurement, not an assertion. `supported` marks the categories ODG's real checker
// can actually evaluate today; the rest are coverage GAPS (no executable checker ⇒ cases would be UNSUPPORTED).
const TARGET_TAXONOMY: ReadonlyArray<any> = Object.freeze([
  { category: "JavaScript/syntax", supported: true },
  { category: "TypeScript/type", supported: true },
  { category: "Python/syntax", supported: true },
  { category: "Go/build", supported: false },
  { category: "Rust/build", supported: false },
  { category: "Java/compile", supported: false },
  { category: "CSharp/compile", supported: false },
  { category: "SQL/schema", supported: true },               // v3: now a REAL checker (stdlib sqlite3, no install)
  { category: "Shell/lint", supported: false },               // `bash -n` gives SYNTAX only; a linter (shellcheck) is still absent
  { category: "HTML-CSS/validate", supported: false },
  { category: "Config-YAML/validate", supported: true },      // v3: now a REAL checker (PyYAML, no install)
  { category: "Dockerfile/lint", supported: false },
]);
// PRE-REGISTERED representativeness gate (fixed before measuring): a corpus counts as representative only when at
// least minCoverageRatio of the target taxonomy is covered AND each covered category carries ≥ minCasesPerCovered
// REAL-evaluable cases (both clean and broken). Until then broad-IT stays NO_DATA.
const REPRESENTATIVE_THRESHOLD = Object.freeze({ minCoverageRatio: 0.6, minCasesPerCovered: 6, requireBothKinds: true });

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

/**
 * coverageReport(corpus): measure corpus coverage against the PRE-REGISTERED target taxonomy. A target category is
 * "covered" only if it is supported by a real checker AND carries ≥ minCasesPerCovered cases with both a clean and a
 * broken example (so an UNSUPPORTED/toolchain-absent category can never count as covered — that would be fake breadth).
 * Returns the ratio (covered / |taxonomy|), per-category counts, and the explicit missing list. No extrapolation.
 */
function coverageReport(corpus: ReadonlyArray<any> = CORPUS): any {
  const th = REPRESENTATIVE_THRESHOLD;
  const byCat: Record<string, { total: number; clean: number; broken: number }> = {};
  for (const c of corpus) {
    byCat[c.category] = byCat[c.category] || { total: 0, clean: 0, broken: 0 };
    byCat[c.category].total++;
    if (c.kind === "clean") byCat[c.category].clean++;
    else if (c.kind === "broken") byCat[c.category].broken++;
  }
  const perCategory = TARGET_TAXONOMY.map((t) => {
    const counts = byCat[t.category] || { total: 0, clean: 0, broken: 0 };
    const hasBothKinds = counts.clean > 0 && counts.broken > 0;
    const covered = t.supported === true && counts.total >= th.minCasesPerCovered && (!th.requireBothKinds || hasBothKinds);
    return { category: t.category, supported: t.supported === true, cases: counts.total, clean: counts.clean, broken: counts.broken, covered };
  });
  const covered = perCategory.filter((c) => c.covered);
  const ratio = Number((covered.length / TARGET_TAXONOMY.length).toFixed(4));
  return {
    total: TARGET_TAXONOMY.length,
    coveredCount: covered.length,
    ratio,
    threshold: th,
    meetsThreshold: ratio >= th.minCoverageRatio && covered.length > 0,
    coveredCategories: covered.map((c) => c.category),
    missing: perCategory.filter((c) => !c.covered).map((c) => ({ category: c.category, supported: c.supported, cases: c.cases, reason: c.supported ? "insufficient real-evaluable cases (need both kinds ≥ threshold)" : "no executable checker in ODG (toolchain absent) — would be UNSUPPORTED" })),
    perCategory,
  };
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
  // PASS-detector confusion via the ODG5 eval-metrics module (keyed by case id): FP = checker said PASS but should
  // FAIL (the dangerous miss), FN = said not-PASS but should PASS. precision/recall are null (not fake) when undefined.
  const evaluatedCases = results.filter((r) => r.actual === "PASS" || r.actual === "FAIL");
  const predictedPass = evaluatedCases.filter((r) => r.actual === "PASS").map((r) => r.id);
  const expectedPass = evaluatedCases.filter((r) => r.expected === "PASS").map((r) => r.id);
  const confusion = METRICS.confusionMatrix(predictedPass, expectedPass);
  return { provenance: provenance(), partition, overall, perCategory, confusion, results };
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
  const coverage = coverageReport();
  // representativeness is now MEASURED against the pre-registered taxonomy + threshold, not asserted. It can only
  // become true when real coverage crosses the gate AND there is no leakage — never by adding unsupported stubs.
  const representative = coverage.meetsThreshold && leak.ok;
  const broadIT = representative ? "MEASURED" : "NO_DATA";
  return {
    broadIT,
    reason: representative
      ? `corpus meets the pre-registered representativeness gate (coverage ${coverage.ratio} ≥ ${coverage.threshold.minCoverageRatio})`
      : `corpus covers only ${coverage.coveredCount}/${coverage.total} target categories (ratio ${coverage.ratio} < required ${coverage.threshold.minCoverageRatio}); the real checker supports JS/TS/Python only, so ${coverage.missing.length} taxonomy categories (Go/Rust/Java/C#/SQL/Shell/HTML-CSS/YAML/Dockerfile) have NO executable checker. A broad-IT rate requires crossing this gate with a representative, independently-labelled corpus that does not yet exist.`,
    representative,
    coverage,
    supportedSurfaceHeldout: { accuracy: held.overall.accuracy, falsePass: held.overall.falsePass, falseFail: held.overall.falseFail, evaluated: held.overall.evaluated, perCategory: held.perCategory, confusion: held.confusion },
    leakageProtection: leak,
    note: "Held-out supported-surface accuracy is reported for THIS narrow corpus only. broad-IT VERIFIED_SUCCESS_RATE remains NO_DATA until the coverage gate is crossed. No extrapolation.",
  };
}

export { CORPUS, CORPUS_VERSION, SUPPORTED_CATEGORIES, TARGET_TAXONOMY, REPRESENTATIVE_THRESHOLD, checkLeakage, provenance, coverageReport, evaluate, assessBroadIT };
module.exports = { CORPUS, CORPUS_VERSION, SUPPORTED_CATEGORIES, TARGET_TAXONOMY, REPRESENTATIVE_THRESHOLD, checkLeakage, provenance, coverageReport, evaluate, assessBroadIT };

if (require.main === module) {
  process.stdout.write(JSON.stringify(assessBroadIT(), null, 2) + "\n");
}
