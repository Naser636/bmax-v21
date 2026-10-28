#!/usr/bin/env node
// @ts-nocheck — runs under tsx, ZERO subprocess (injected runner + toolchainAvailable override). Proves the bounded
// checker: argv-array specs (no shell), PASS/FAIL/UNSUPPORTED/BLOCKED classification, temp-path stripped from stderr,
// UNSUPPORTED when toolchain absent (not faked), fail-closed on bad input. (Real-subprocess run proven separately.)
"use strict";
const assert = require("assert");
const E = require("./code-execution.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const okRunner = () => ({ exitCode: 0, stdout: "", stderr: "" });
const failRunner = (ws) => () => ({ exitCode: 1, stdout: "", stderr: `SyntaxError at ${ws}/src.js:1` });

// (1) specs are argv ARRAYS (no shell string ⇒ no injection).
ok("every language spec produces an argv array (no shell)", Object.values(E.LANG_SPEC).every(s => Array.isArray(s.args("f")) && typeof s.bin === "string"));

// (2) unknown language ⇒ UNSUPPORTED (never faked).
ok("unknown language ⇒ UNSUPPORTED", E.runSyntaxCheck({ language: "COBOL", content: "x" }).status === "UNSUPPORTED");

// (3) toolchain absent ⇒ UNSUPPORTED (detection only, not faked).
ok("toolchain absent ⇒ UNSUPPORTED (not faked)", E.runSyntaxCheck({ language: "Python", content: "x=1", toolchainAvailable: false }).status === "UNSUPPORTED" && /not faked/.test(E.runSyntaxCheck({ language: "Python", content: "x=1", toolchainAvailable: false }).reason));

// (4) PASS on exit 0.
ok("exit 0 ⇒ PASS", E.runSyntaxCheck({ language: "JavaScript", content: "const x=1", toolchainAvailable: true, runner: okRunner }).status === "PASS");

// (5) FAIL on non-zero + stderr surfaced with temp path stripped.
const f = E.runSyntaxCheck({ language: "JavaScript", content: "const x=;", toolchainAvailable: true, runner: (bin, args, opts) => ({ exitCode: 1, stdout: "", stderr: `SyntaxError at ${opts.cwd}/src.js:1` }) });
ok("exit!=0 ⇒ FAIL + stderr (temp path stripped to <ws>)", f.status === "FAIL" && f.exitCode === 1 && /<ws>/.test(f.stderr) && !/odg-codeexec/.test(f.stderr));

// (6) timeout ⇒ BLOCKED; spawn error ⇒ BLOCKED (never PASS).
ok("timeout ⇒ BLOCKED", E.runSyntaxCheck({ language: "Python", content: "x", toolchainAvailable: true, runner: () => ({ timedOut: true }) }).status === "BLOCKED");
ok("spawn error ⇒ BLOCKED", E.runSyntaxCheck({ language: "Python", content: "x", toolchainAvailable: true, runner: () => ({ spawnError: "ENOENT" }) }).status === "BLOCKED");

// (7) bad input fail-closed.
ok("non-string content ⇒ BLOCKED", E.runSyntaxCheck({ language: "Python", content: 123 }).status === "BLOCKED");

// (8) detectToolchain uses the probe (mock): available vs error.
const tc = E.detectToolchain({ runner: (bin) => bin === "python3" ? { exitCode: 0, stdout: "Python" } : { spawnError: "ENOENT" } });
ok("detectToolchain: python available, others not (via mock probe)", tc.Python === true && tc.JavaScript === false);

// (9) checker expansion registered: Shell/SQL/YAML/JSON + ShellLint specs present + argv-array (no shell string).
for (const lang of ["Shell", "SQL", "YAML", "JSON", "ShellLint"]) {
  ok(`LANG_SPEC has ${lang} (no-install checker) with argv-array args`, E.LANG_SPEC[lang] && Array.isArray(E.LANG_SPEC[lang].args("f")) && typeof E.LANG_SPEC[lang].bin === "string");
}
// Go/build IS wired now (authorized Go toolchain install): a REAL `go build` compile check — argv-array, with a
// per-workspace hermetic env function (offline, cache/path scoped into the temp dir).
ok("Go in LANG_SPEC: argv-array `go build` + hermetic env fn", E.LANG_SPEC.Go && Array.isArray(E.LANG_SPEC.Go.args("f")) && E.LANG_SPEC.Go.bin === "go" && typeof E.LANG_SPEC.Go.env === "function");
ok("Go hermetic env is offline + workspace-scoped (no network, no inherited cache)", (() => { const e = E.LANG_SPEC.Go.env("/ws"); return e.GOPROXY === "off" && e.GO111MODULE === "off" && e.GOTOOLCHAIN === "local" && String(e.GOCACHE).startsWith("/ws") && String(e.GOPATH).startsWith("/ws"); })());
ok("Go toolchain absent ⇒ UNSUPPORTED (not faked)", E.runSyntaxCheck({ language: "Go", content: "package main\nfunc main(){}\n", toolchainAvailable: false }).status === "UNSUPPORTED" && /not faked/.test(E.runSyntaxCheck({ language: "Go", content: "x", toolchainAvailable: false }).reason));
// Rust/build IS wired now (authorized rustc install): a REAL `rustc --emit=metadata` type+borrow check — argv-array,
// with a per-workspace hermetic env fn (offline; metadata-only, no linker; emits into the self-cleaning workspace).
ok("Rust in LANG_SPEC: argv-array `rustc --emit=metadata` + hermetic env fn", E.LANG_SPEC.Rust && Array.isArray(E.LANG_SPEC.Rust.args("f")) && E.LANG_SPEC.Rust.bin === "rustc" && typeof E.LANG_SPEC.Rust.env === "function" && E.LANG_SPEC.Rust.args("f").includes("--emit=metadata"));
ok("Rust hermetic env is offline + workspace-scoped", (() => { const e = E.LANG_SPEC.Rust.env("/ws"); return e.CARGO_NET_OFFLINE === "true" && String(e.CARGO_HOME).startsWith("/ws") && String(e.TMPDIR).startsWith("/ws"); })());
ok("Rust toolchain absent ⇒ UNSUPPORTED (not faked)", E.runSyntaxCheck({ language: "Rust", content: "pub fn f(){}\n", toolchainAvailable: false }).status === "UNSUPPORTED");
// the REMAINING compiler stacks stay honestly ABSENT from LANG_SPEC (require their own authorized install ⇒ UNSUPPORTED, never faked).
for (const lang of ["Java", "CSharp"]) {
  ok(`${lang} NOT in LANG_SPEC ⇒ UNSUPPORTED (no decoy)`, !E.LANG_SPEC[lang] && E.runSyntaxCheck({ language: lang, content: "x" }).status === "UNSUPPORTED");
}

// (10) NEW no-install checkers — REAL subprocess, guarded on actual availability (skip honestly if absent in runtime).
const real = E.detectToolchain();
const realCases = [
  ["Shell", "echo hi\nfor i in 1 2; do echo $i; done\n", "PASS"], ["Shell", "if [ -z x ; then echo bad\n", "FAIL"],
  ["SQL", "CREATE TABLE t (id INTEGER PRIMARY KEY, n TEXT);\n", "PASS"], ["SQL", "CREATE TABLE t (id INTEGER PRIMARY,, n;\n", "FAIL"],
  ["YAML", "a: 1\nb:\n  - x\n  - y\n", "PASS"], ["YAML", "a: 1\n  b: : :\n- x\n", "FAIL"],
  ["JSON", "{\"a\":1,\"b\":[1,2]}\n", "PASS"], ["JSON", "{\"a\":1,,}\n", "FAIL"],
  ["ShellLint", "#!/usr/bin/env bash\nset -euo pipefail\nname=\"world\"\necho \"hello ${name}\"\n", "PASS"],
  ["ShellLint", "#!/usr/bin/env bash\nrm -rf $UNQUOTED/*\n", "FAIL"],
    // Go/build: real compile. The FAIL case is a TYPE error (not a syntax error) — proving this is a genuine build check,
  // not a mere parse: a formatter/parser would accept it, `go build` rejects it. stdlib-only ⇒ hermetic, no network.
  ["Go", "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"ok\")\n}\n", "PASS"],
  ["Go", "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tvar x int = \"nope\"\n\tfmt.Println(x)\n}\n", "FAIL"],
  // Rust/build: real compile. FAIL case is a TYPE error (not syntax) — proving a genuine build check; stdlib-only ⇒ hermetic.
  ["Rust", "pub fn add(a: i32, b: i32) -> i32 { a + b }\n", "PASS"],
  ["Rust", "pub fn f() -> i32 { let x: i32 = \"nope\"; x }\n", "FAIL"],
];
for (const [lang, content, exp] of realCases) {
  if (!real[lang]) { console.log(`  ~~ skip real ${lang} (toolchain absent in this runtime)`); continue; }
  ok(`real ${lang} ${exp} classified correctly`, E.runSyntaxCheck({ language: lang, content }).status === exp);
}

console.log(`\nCODE-EXECUTION suite — ${pass} assertions passed. (argv-array; PASS/FAIL/UNSUPPORTED/BLOCKED; path-stripped stderr; not faked; fail-closed)`);
