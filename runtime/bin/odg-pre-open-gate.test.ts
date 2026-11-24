"use strict";
/* odg-pre-open-gate — unit tests on the pure selectors + an end-to-end run on a throw-away git repo (no network, no
 * write to this checkout: every fixture lives under os.tmpdir()). */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const G = require("./odg-pre-open-gate.js");

let passed = 0;
const ok = (n: string, c: any) => { assert.ok(c, n); console.log("  ok -", n); passed += 1; };

// --- change-set parsing
const ns = G.parseNameStatus("M\tdocs/a.json\nR100\told.ts\tnew.ts\nA\tx.ts\n");
ok("name-status: rename = delete source + add destination", JSON.stringify(ns) === JSON.stringify([{ status: "M", path: "docs/a.json" }, { status: "D", path: "old.ts" }, { status: "A", path: "new.ts" }, { status: "A", path: "x.ts" }]));
const mg = G.mergeChanges([[{ status: "M", path: "a" }], [{ status: "A", path: "a" }, { status: "M", path: "b" }]]);
ok("merge: a stronger status (A/D) wins over M", mg.find((c: any) => c.path === "a").status === "A" && mg.length === 2);

// --- conflict markers
ok("conflict markers: <<<<<<< / ======= / >>>>>>> detected with line numbers", JSON.stringify(G.conflictMarkers("a\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> br\n")) === JSON.stringify([2, 4, 6]));
ok("conflict markers: a lone ======= (markdown rule) is NOT a conflict", G.conflictMarkers("Title\n=======\n").length === 0);

// --- node_modules
const nm = G.nodeModulesFindings(["node_modules"], [], ["node_modules"], []);
ok("node_modules committed ⇒ NOT_READY; untracked ⇒ WARN", nm.some((f: any) => f.severity === "NOT_READY" && f.where === "committed") && nm.some((f: any) => f.severity === "WARN"));

// --- CLI discovery helpers (self-declared semantics, no hard-coded list)
ok("classify: --check-at-run-head ⇒ FROZEN_AT_RUN_HEAD", G.classifyCli('/* x */\nif (a === "--check-at-run-head") {}') === "FROZEN_AT_RUN_HEAD");
ok("classify: header 'whenever HEAD moves' ⇒ HEAD_DEPENDENT", G.classifyCli("/* --check drifts whenever HEAD moves */\n") === "HEAD_DEPENDENT");
ok("classify: header 'host-dependent' ⇒ HOST_DEPENDENT", G.classifyCli("/* compare digest — host-dependent */\n") === "HOST_DEPENDENT");
ok("classify: default DETERMINISTIC", G.classifyCli('/* write X */\nif (argv.includes("--check")) {}') === "DETERMINISTIC");
ok("outputs: const OUT literal + template over a local const + outPath()", JSON.stringify(G.declaredOutputs('const EV = "docs/odg/evidence";\nconst OUT_REL = `${EV}/R.json`;\nconst OUT = "docs/odg/evidence/A.json";\nconst G = outPath("--grant-out", "docs/odg/V1_G.json", [])')) === JSON.stringify(["docs/odg/V1_G.json", "docs/odg/evidence/A.json", "docs/odg/evidence/R.json"]));

{ // a CLI that only PASSES "--check" to a child (git apply --check) is not a --check CLI (retro #978 false positive)
  const tmpb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-pre-open-disc-"));
  fs.mkdirSync(path.join(tmpb, "runtime", "bin"), { recursive: true }); fs.mkdirSync(path.join(tmpb, "runtime", "core"), { recursive: true });
  fs.writeFileSync(path.join(tmpb, "runtime", "bin", "runner.ts"), '/* runner */\nspawnSync("git", ["apply", "--check", "-"]);\n');
  fs.writeFileSync(path.join(tmpb, "runtime", "bin", "rec.ts"), '/* rec */\nconst OUT = "docs/odg/evidence/R.json";\nif (process.argv.includes("--check")) {}\n');
  const d = G.discoverChecks(tmpb).map((c: any) => c.cli);
  ok("discovery: argv-parsed --check found; child-arg '--check' ignored", d.join(",") === "runtime/bin/rec.ts");
  fs.rmSync(tmpb, { recursive: true, force: true });
}

// --- check selection
const checks = [
  { cli: "runtime/bin/reg.ts", kind: "DETERMINISTIC", outputs: ["docs/odg/evidence/REG.json"], inputs: ["runtime/bin/reg.ts", "runtime/bin/target.ts", "docs/odg/evidence/REG.json"], scansEvidence: false, undeterminedOutputs: false },
  { cli: "runtime/bin/resume.ts", kind: "DETERMINISTIC", outputs: ["docs/odg/evidence/RES.json"], inputs: ["docs/odg/evidence/REG.json", "docs/odg/evidence/RES.json"], scansEvidence: true, undeterminedOutputs: false },
  { cli: "runtime/bin/exp.ts", kind: "FROZEN_AT_RUN_HEAD", outputs: ["docs/odg/evidence/EXP.json"], inputs: ["runtime/bin/target.ts"], scansEvidence: false, undeterminedOutputs: false },
];
const s1 = G.selectChecks(checks, [{ status: "M", path: "runtime/bin/target.ts" }]);
ok("#978 shape: a cited input changed (runner source) ⇒ the register check runs", s1.some((c: any) => c.cli === "runtime/bin/reg.ts" && c.run && /inputs changed/.test(c.trigger)));
ok("frozen experiment: input change ⇒ SKIPPED with its declared reason (never a false DRIFT)", s1.some((c: any) => c.cli === "runtime/bin/exp.ts" && !c.run && /FROZEN_AT_RUN_HEAD/.test(c.skipReason)));
const s2 = G.selectChecks(checks, [{ status: "M", path: "docs/odg/evidence/REG.json" }]);
ok("dependency order: the register (an input of resume) is checked before resume", s2.map((c: any) => c.cli).join(",") === "runtime/bin/reg.ts,runtime/bin/resume.ts");
ok("unrelated change triggers nothing", G.selectChecks(checks, [{ status: "M", path: "README.md" }]).length === 0);

// --- test selection (pure over injected sources)
const graph = { modules: ["a", "b", "c"], deps: { a: [], b: ["a"], c: ["b"] }, consumers: { a: ["b"], b: ["c"], c: [] } };
const srcs: Record<string, string> = {
  "runtime/core/a.test.ts": "require('./a')",
  "runtime/core/c.test.ts": "require('./c')",
  "runtime/core/scan.test.ts": 'fs.readdirSync("runtime/core").length === 3',
  "runtime/bin/doc.test.ts": 'read("docs/odg/evidence/REG.json")',
  "runtime/bin/other.test.ts": "odg-goal",
};
const t1 = G.selectTests("/nonexistent", [{ status: "M", path: "runtime/core/a.ts" }], graph, srcs).map((x: any) => x.test);
ok("core change ⇒ sibling + TRANSITIVE consumer tests (a → b → c)", t1.includes("runtime/core/a.test.ts") && t1.includes("runtime/core/c.test.ts") && !t1.includes("runtime/core/scan.test.ts"));
const t2 = G.selectTests("/nonexistent", [{ status: "A", path: "runtime/core/d.ts" }], graph, srcs).map((x: any) => x.test);
ok("#978 V251 shape: a file ADDED to a scanned dir ⇒ its readdirSync scanner test runs", t2.includes("runtime/core/scan.test.ts"));
const t3 = G.selectTests("/nonexistent", [{ status: "M", path: "docs/odg/evidence/REG.json" }, { status: "M", path: "runtime/bin/odg-go.ts" }], graph, srcs).map((x: any) => x.test);
ok("a test naming a changed data file runs; a stem match is word-bounded (odg-go ≠ odg-goal)", t3.includes("runtime/bin/doc.test.ts") && !t3.includes("runtime/bin/other.test.ts"));

// --- verdict
const v = G.verdict({ base: "origin/main", behind: { count: 2 }, checks: [{ status: "DRIFT", cli: "x", outputs: ["docs/R.json"], regenerate: "npx tsx x" }], tests: { selected: 1, results: [{ file: "t.test.ts", cls: "FAIL", reason: "exit 1", notOk: ["AssertionError: n"] }] }, tsc: [{ project: "tsconfig.json", status: "FAIL", errors: 1, first: "a.ts(1,1): error TS2304" }], conflictMarkers: [], unmerged: [], nodeModules: [], changes: [] });
ok("verdict NOT_READY lists behind + drift (with regenerate cmd) + test NOT OK line + tsc", v.verdict === "NOT_READY" && v.reasons.length === 4 && /git merge origin\/main/.test(v.reasons[0]) && /regenerate: npx tsx x/.test(v.reasons[1]) && /AssertionError/.test(v.reasons[2]));
ok("verdict READY when nothing is found", G.verdict({ behind: { count: 0 }, checks: [], tests: { selected: 0, results: [] }, tsc: [], conflictMarkers: [], unmerged: [], nodeModules: [], changes: [] }).verdict === "READY");
ok("args: unknown flag is a usage error; --workers bounded ≥1", G.parseArgs(["--bogus"]).error && G.parseArgs(["--workers", "0"]).workers === 1);

// --- end-to-end on a throw-away repo: behind + conflict marker + staged node_modules, and NO file modified
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-pre-open-"));
const sh = (args: string[]) => execFileSync("git", args, { cwd: tmp, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
sh(["init", "-q", "-b", "main"]); sh(["config", "user.email", "t@t"]); sh(["config", "user.name", "t"]);
fs.mkdirSync(path.join(tmp, "runtime", "core"), { recursive: true });
fs.writeFileSync(path.join(tmp, "runtime", "core", "a.ts"), "export {};\n");
sh(["add", "-A"]); sh(["commit", "-qm", "base"]);
sh(["checkout", "-qb", "feat"]);
fs.writeFileSync(path.join(tmp, "notes.md"), "x\n<<<<<<< HEAD\na\n=======\nb\n>>>>>>> main\n");
fs.mkdirSync(path.join(tmp, "node_modules"));
fs.writeFileSync(path.join(tmp, "node_modules", "p.js"), "1");
sh(["add", "-f", "notes.md", "node_modules/p.js"]); sh(["commit", "-qm", "feat"]);
sh(["checkout", "-q", "main"]); fs.writeFileSync(path.join(tmp, "m.txt"), "m\n"); sh(["add", "m.txt"]); sh(["commit", "-qm", "main moves"]); sh(["checkout", "-q", "feat"]);
const before = sh(["status", "--porcelain"]);
const r = G.gate(tmp, { ...G.parseArgs(["--base", "main", "--no-tests", "--no-tsc", "--no-checks"]) });
ok("e2e: behind main by 1 is reported (never merged)", r.behind.count === 1 && sh(["rev-list", "--count", "HEAD..main"]).trim() === "1");
ok("e2e: conflict markers in a changed file ⇒ NOT_READY", r.verdict === "NOT_READY" && r.conflictMarkers.some((m: any) => m.path === "notes.md"));
ok("e2e: committed node_modules ⇒ NOT_READY", r.nodeModules.some((n: any) => n.severity === "NOT_READY"));
ok("e2e: the gate modified nothing", sh(["status", "--porcelain"]) === before);
ok("e2e: text render names the verdict", /NOT_READY/.test(G.renderText(r)));
fs.rmSync(tmp, { recursive: true, force: true });

// --- discovery on THIS repo (read-only): CLIs that declare --check are found, never hard-coded
const disc = G.discoverChecks(process.cwd());
ok("discovery: the strategic register CLI is discovered with its record + cited inputs", disc.some((c: any) => c.cli === "runtime/bin/odg-strategic-select.ts" && c.outputs.includes("docs/odg/evidence/V164_STRATEGIC_REGISTER.json") && c.inputs.length > 3));
ok("discovery: the gate never lists itself", !disc.some((c: any) => c.cli === "runtime/bin/odg-pre-open-gate.ts"));

console.log(`\nodg-pre-open-gate: ${passed} passed`);

export {};
