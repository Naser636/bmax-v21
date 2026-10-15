/*
 * B141 — regression for the dist-closure require tracer's comment stripper (scripts/lib/js-require-scan.js).
 * Root cause: the former regex stripComments read a "/*" inside a STRING literal (e.g. the scope string
 * "runtime/**") as a block-comment opener, swallowing a following require() so the module was omitted from
 * runtime/dist. These cases pin the context-aware fix AND the edge cases (strings, templates, escapes,
 * multi-line and end-of-line comments, division) without re-breaking genuine comment removal.
 */
export {}; // mark as a module so top-level consts stay file-scoped (no cross-test redeclare)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseRequiresFromSource } = require("../../scripts/lib/js-require-scan.js");

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ok - " + label); } else { fail++; console.log("  FAIL - " + label); }
}
const reqs = (src: string): string[] => parseRequiresFromSource(src).literal;
const has = (src: string, t: string): boolean => reqs(src).includes(t);

// 1. THE DEFECT: a "runtime/**" scope string (false "/*") + a LATER real "*/" must NOT mask the require.
ok(
  'require after a "runtime/**" string is traced (B141 defect fixed)',
  has('const scope = ["runtime/**"];\nconst dep = require("./must-be-traced");\ntry { x(); } catch { /* ignore */ }', "./must-be-traced"),
);

// 2. A genuine block comment that WRAPS a require must still be stripped (no over-match regression).
ok("require inside a real block comment is NOT traced", !has('/* const x = require("./commented-out"); */\nconst y = 1;', "./commented-out"));

// 3. A line comment hiding a require is NOT traced.
ok("require inside a line comment is NOT traced", !has('// const x = require("./line-commented");\nconst y = 1;', "./line-commented"));

// 4. An end-of-line comment after real code keeps the code's require.
ok("require with a trailing // comment is traced", has('const z = require("./with-eol-comment"); // note', "./with-eol-comment"));

// 5. A multi-line block comment: the require inside is dropped, the one after is kept.
ok(
  "multi-line block comment: inner require dropped, following require kept",
  (() => { const r = reqs('/*\n  require("./inner");\n*/\nrequire("./after");'); return r.includes("./after") && !r.includes("./inner"); })(),
);

// 6. Escaped quote inside a string does not desync string parsing.
ok('escaped quote in a string does not hide a following require', has('const s = "a\\"/*b";\nrequire("./after-escape");', "./after-escape"));

// 7. A template literal containing "/*" must not open a comment.
ok("template literal containing /* does not mask a following require", has("const t = `x/*y`;\nrequire(\"./after-template\");", "./after-template"));

// 8. Division operator (lone '/') is code, not a comment.
ok("division operator is not treated as a comment", has('const r = a / b;\nrequire("./after-division");', "./after-division"));

// 9. A string containing "*/" must not corrupt parsing.
ok('a string containing */ does not corrupt require parsing', has('const s = "a*/b";\nrequire("./after-star-slash");', "./after-star-slash"));

// 10. Dynamic require is still detected.
ok("dynamic require(variable) is flagged dyn", parseRequiresFromSource("const m = require(name);").dyn === true);
ok("a purely static file is NOT flagged dyn", parseRequiresFromSource('require("./a"); require("./b");').dyn === false);

// 11. Parity: ordinary top-level requires are all found.
ok("ordinary top-level requires are all found", (() => {
  const r = reqs('const a = require("./scope-observer");\nconst b = require("./economic-extractor");\nconst { f } = require("./autonomy-rate");');
  return r.includes("./scope-observer") && r.includes("./economic-extractor") && r.includes("./autonomy-rate");
})());

// 12. The REAL capability-executors.js source: its require("./autonomy-rate") is traced (the live case).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs");
const realSrc = fs.readFileSync("runtime/core/capability-executors.js", "utf8");
ok("real capability-executors.js: ./autonomy-rate require is traced", reqs(realSrc).includes("./autonomy-rate"));

console.log(`\nBUILD-DIST-CLOSURE REQUIRE SCAN — ${pass} assertions passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
