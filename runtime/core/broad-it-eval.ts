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
  // --- Shell/lint (v4): real `shellcheck` static analysis (stronger than bash -n). ---
  { id: "dev-shlint-clean-1", partition: "dev", category: "Shell/lint", language: "ShellLint", kind: "clean", expected: "PASS", content: "#!/usr/bin/env bash\nset -euo pipefail\nname=\"world\"\necho \"hello ${name}\"\n" },
  { id: "dev-shlint-clean-2", partition: "dev", category: "Shell/lint", language: "ShellLint", kind: "clean", expected: "PASS", content: "#!/usr/bin/env bash\nset -euo pipefail\nfor f in a b c; do\n  echo \"$f\"\ndone\n" },
  { id: "dev-shlint-broken-1", partition: "dev", category: "Shell/lint", language: "ShellLint", kind: "broken", expected: "FAIL", content: "#!/usr/bin/env bash\nrm -rf $UNQUOTED/*\n" },
  { id: "dev-shlint-broken-2", partition: "dev", category: "Shell/lint", language: "ShellLint", kind: "broken", expected: "FAIL", content: "#!/usr/bin/env bash\necho \"files: `ls | wc -l`\"\n" },
  { id: "held-shlint-clean-1", partition: "heldout", category: "Shell/lint", language: "ShellLint", kind: "clean", expected: "PASS", content: "#!/usr/bin/env bash\nset -euo pipefail\nif [ -f /etc/hostname ]; then\n  cat /etc/hostname\nfi\n" },
  { id: "held-shlint-clean-2", partition: "heldout", category: "Shell/lint", language: "ShellLint", kind: "clean", expected: "PASS", content: "#!/usr/bin/env bash\nset -euo pipefail\ngreet() {\n  printf \"%s\\n\" \"$1\"\n}\ngreet \"hi\"\n" },
  { id: "held-shlint-broken-1", partition: "heldout", category: "Shell/lint", language: "ShellLint", kind: "broken", expected: "FAIL", content: "#!/usr/bin/env bash\necho $1\n" },
  { id: "held-shlint-broken-2", partition: "heldout", category: "Shell/lint", language: "ShellLint", kind: "broken", expected: "FAIL", content: "#!/usr/bin/env bash\nif [ $x == \"y\" ]; then echo ok; fi\n" },
  // --- Go/build (v5): real hermetic `go build` (type-level, offline). Counts toward coverage ONLY when Go is present. ---
  { id: "dev-go-clean-1", partition: "dev", category: "Go/build", language: "Go", kind: "clean", expected: "PASS", content: "package main\nimport \"fmt\"\nfunc main(){ fmt.Println(\"hi\") }\n" },
  { id: "dev-go-clean-2", partition: "dev", category: "Go/build", language: "Go", kind: "clean", expected: "PASS", content: "package main\nfunc add(a, b int) int { return a + b }\nfunc main(){ _ = add(1, 2) }\n" },
  { id: "dev-go-broken-1", partition: "dev", category: "Go/build", language: "Go", kind: "broken", expected: "FAIL", content: "package main\nfunc main(){ var x int = \"str\"; _ = x }\n" },
  { id: "dev-go-broken-2", partition: "dev", category: "Go/build", language: "Go", kind: "broken", expected: "FAIL", content: "package main\nfunc main(){ undefinedFn() }\n" },
  { id: "held-go-clean-1", partition: "heldout", category: "Go/build", language: "Go", kind: "clean", expected: "PASS", content: "package main\nimport \"strings\"\nfunc main(){ _ = strings.ToUpper(\"x\") }\n" },
  { id: "held-go-clean-2", partition: "heldout", category: "Go/build", language: "Go", kind: "clean", expected: "PASS", content: "package main\ntype P struct{ N int }\nfunc main(){ p := P{N: 1}; _ = p.N }\n" },
  { id: "held-go-broken-1", partition: "heldout", category: "Go/build", language: "Go", kind: "broken", expected: "FAIL", content: "package main\nimport \"fmt\"\nfunc main(){ fmt.Println(undeclared) }\n" },
  { id: "held-go-broken-2", partition: "heldout", category: "Go/build", language: "Go", kind: "broken", expected: "FAIL", content: "package main\nfunc main(){ return 5 }\n" },
  // --- Rust/build (v6): real hermetic `rustc --emit=metadata` (type + borrow check, offline). Counts only when rustc present. ---
  { id: "dev-rust-clean-1", partition: "dev", category: "Rust/build", language: "Rust", kind: "clean", expected: "PASS", content: "pub fn add(a: i32, b: i32) -> i32 { a + b }\n" },
  { id: "dev-rust-clean-2", partition: "dev", category: "Rust/build", language: "Rust", kind: "clean", expected: "PASS", content: "pub struct P { pub n: i32 }\npub fn mk() -> P { P { n: 1 } }\n" },
  { id: "dev-rust-broken-1", partition: "dev", category: "Rust/build", language: "Rust", kind: "broken", expected: "FAIL", content: "pub fn f() -> i32 { let x: i32 = \"str\"; x }\n" },
  { id: "dev-rust-broken-2", partition: "dev", category: "Rust/build", language: "Rust", kind: "broken", expected: "FAIL", content: "pub fn f() -> i32 { undefined_fn() }\n" },
  { id: "held-rust-clean-1", partition: "heldout", category: "Rust/build", language: "Rust", kind: "clean", expected: "PASS", content: "pub fn g(x: &str) -> String { x.to_uppercase() }\n" },
  { id: "held-rust-clean-2", partition: "heldout", category: "Rust/build", language: "Rust", kind: "clean", expected: "PASS", content: "pub enum E { A, B }\npub fn pick(b: bool) -> E { if b { E::A } else { E::B } }\n" },
  { id: "held-rust-broken-1", partition: "heldout", category: "Rust/build", language: "Rust", kind: "broken", expected: "FAIL", content: "pub fn f() { let s = String::from(\"x\"); let _a = s; let _b = s; }\n" },
  { id: "held-rust-broken-2", partition: "heldout", category: "Rust/build", language: "Rust", kind: "broken", expected: "FAIL", content: "use external_crate::thing;\npub fn f() { thing(); }\n" },
]);

const CORPUS_VERSION = "broad-it-eval-v6";
// The SUPPORTED surface this corpus can measure (NOT all of IT). Broad-IT needs far more than this. v3 added the
// NO-INSTALL checkers (SQL/YAML/Shell-syntax); v4 adds Shell/lint via an AUTHORIZED, reproducible shellcheck install.
// Compiler stacks (Go/Rust/Java/C#) still require their own authorized install and stay UNSUPPORTED.
const SUPPORTED_CATEGORIES = ["JavaScript/syntax", "TypeScript/type", "Python/syntax", "SQL/schema", "Config-YAML/validate", "Shell/syntax", "Shell/lint", "Go/build", "Rust/build"];

// PRE-REGISTERED target taxonomy of broad-IT categories a REPRESENTATIVE corpus must cover. This is the fixed
// DENOMINATOR for the coverage ratio: it is declared up-front (not fitted to what ODG happens to support) so the
// representativeness verdict is a measurement, not an assertion. `supported` marks the categories ODG's real checker
// can actually evaluate today; the rest are coverage GAPS (no executable checker ⇒ cases would be UNSUPPORTED).
const TARGET_TAXONOMY: ReadonlyArray<any> = Object.freeze([
  { category: "JavaScript/syntax", supported: true, language: "JavaScript" },
  { category: "TypeScript/type", supported: true, language: "TypeScript" },
  { category: "Python/syntax", supported: true, language: "Python" },
  { category: "Go/build", supported: true, language: "Go" },   // v5: real hermetic `go build` (authorized Go toolchain, PR#170)
  { category: "Rust/build", supported: true, language: "Rust" },     // v6: real hermetic `rustc --emit=metadata` (authorized Rust toolchain)
  { category: "Java/compile", supported: false, language: "Java" },
  { category: "CSharp/compile", supported: false, language: "CSharp" },
  { category: "SQL/schema", supported: true, language: "SQL" },               // v3: real checker (stdlib sqlite3, no install)
  { category: "Shell/lint", supported: true, language: "ShellLint" },         // v4: real shellcheck static analysis
  { category: "HTML-CSS/validate", supported: false, language: "HtmlCss" },
  { category: "Config-YAML/validate", supported: true, language: "YAML" },    // v3: real checker (PyYAML, no install)
  { category: "Dockerfile/lint", supported: false, language: "Dockerfile" },
]);
// PRE-REGISTERED representativeness gate (fixed before measuring): a corpus counts as representative only when at
// least minCoverageRatio of the target taxonomy is covered AND each covered category carries ≥ minCasesPerCovered
// REAL-evaluable cases (both clean and broken). Until then broad-IT stays NO_DATA.
// minTaskModes: representativeness ALSO requires diversity of task MODE — not just category breadth. Every current
// case is a `static-single-file` check (compile/syntax/type on one file). A corpus that is mono-modal is NOT
// representative of broad IT (which includes integration, data, application-build and runtime-behaviour tasks), no
// matter how many language categories it spans. This closes the "cross 0.6 with many trivial static categories" loophole.
const REPRESENTATIVE_THRESHOLD = Object.freeze({ minCoverageRatio: 0.6, minCasesPerCovered: 6, requireBothKinds: true, minTaskModes: 2 });
const BROAD_TASK_MODES = Object.freeze(["static-single-file", "integration", "data", "application-build", "runtime-behaviour"]);

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
function coverageReport(corpus: ReadonlyArray<any> = CORPUS, toolchain?: Record<string, boolean>): any {
  const th = REPRESENTATIVE_THRESHOLD;
  // toolchain-aware: when a live toolchain map is supplied, a category counts as covered ONLY if its checker is
  // actually runnable now (toolchain[language] === true). This prevents OVERSTATING coverage if a checker regressed
  // or was uninstalled. When no map is supplied, availability is not asserted (backward-compatible: assume present).
  const tcAware = toolchain && typeof toolchain === "object";
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
    const toolchainPresent = tcAware ? toolchain![t.language] === true : true;
    const covered = t.supported === true && toolchainPresent && counts.total >= th.minCasesPerCovered && (!th.requireBothKinds || hasBothKinds);
    return { category: t.category, supported: t.supported === true, language: t.language, toolchainPresent, cases: counts.total, clean: counts.clean, broken: counts.broken, covered };
  });
  const covered = perCategory.filter((c) => c.covered);
  const ratio = Number((covered.length / TARGET_TAXONOMY.length).toFixed(4));
  // task-mode diversity: distinct `mode` across the corpus (default static-single-file). Mono-modal ⇒ not representative.
  const taskModes = Array.from(new Set(corpus.map((c: any) => c.mode || "static-single-file"))).sort();
  const modeDiverse = taskModes.length >= th.minTaskModes;
  return {
    total: TARGET_TAXONOMY.length,
    coveredCount: covered.length,
    ratio,
    threshold: th,
    toolchainAware: !!tcAware,
    taskModes,
    modeDiverse,
    meetsThreshold: ratio >= th.minCoverageRatio && covered.length > 0 && modeDiverse,
    coveredCategories: covered.map((c) => c.category),
    missing: perCategory.filter((c) => !c.covered).map((c) => ({ category: c.category, supported: c.supported, cases: c.cases, reason: !c.supported ? "no executable checker in ODG (toolchain absent) — would be UNSUPPORTED" : (!c.toolchainPresent ? "checker declared but its toolchain is NOT present at eval time — not currently measurable" : "insufficient real-evaluable cases (need both kinds ≥ threshold)") })),
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
  // toolchain-aware coverage: a category counts only if its checker is actually runnable now (live detect, or injected).
  const toolchain = opts.toolchain && typeof opts.toolchain === "object" ? opts.toolchain : EXEC.detectToolchain(opts.runner ? { runner: opts.runner } : {});
  const coverage = coverageReport(CORPUS, toolchain);
  // representativeness is now MEASURED against the pre-registered taxonomy + threshold, not asserted. It can only
  // become true when real coverage crosses the gate AND there is no leakage — never by adding unsupported stubs.
  const representative = coverage.meetsThreshold && leak.ok;
  const broadIT = representative ? "MEASURED" : "NO_DATA";
  return {
    broadIT,
    reason: representative
      ? `corpus meets the pre-registered representativeness gate (coverage ${coverage.ratio} ≥ ${coverage.threshold.minCoverageRatio})`
      : (coverage.ratio >= coverage.threshold.minCoverageRatio && !coverage.modeDiverse
          ? `category coverage ${coverage.coveredCount}/${coverage.total} (ratio ${coverage.ratio}) meets the breadth gate, BUT the corpus is mono-modal (task modes: [${coverage.taskModes.join(", ")}]) — only static-single-file checks, no integration/data/application-build/runtime-behaviour tasks. Breadth of language categories is NOT representativeness of broad IT; a broad-IT rate requires ≥${coverage.threshold.minTaskModes} task modes. Verdict stays NO_DATA (no false MEASURED on trivial static breadth).`
          : `corpus covers ${coverage.coveredCount}/${coverage.total} target categories (ratio ${coverage.ratio} < required ${coverage.threshold.minCoverageRatio}); ${coverage.missing.length} categories uncovered (${coverage.missing.map((m: any) => m.category).join(", ")}). Toolchain-aware: a category counts only if real cases exist AND its checker is runnable now. A broad-IT rate requires crossing this gate with a representative, independently-labelled, multi-mode corpus.`),
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
