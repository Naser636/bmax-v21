"use strict";
/* odg-pre-open-gate — unit tests on the pure selectors + an end-to-end run on a throw-away git repo (no network, no
 * write to this checkout: every fixture lives under os.tmpdir()). */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const G = require("./odg-pre-open-gate.js");
const CIG = require("../core/change-impact-graph");

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


// --- (#989) committed-evidence inputs ⇒ the tests that read that record's real state; propagation downstream
{
  const evChecks = [
    { cli: "runtime/bin/odg-strategic-select.ts", kind: "DETERMINISTIC", outputs: ["docs/odg/evidence/V164_STRATEGIC_REGISTER.json"], inputs: ["docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json", "runtime/core/odg-authorization-evidence-paths.ts"], scansEvidence: true, undeterminedOutputs: false },
    { cli: "runtime/bin/odg-resume-point.ts", kind: "DETERMINISTIC", outputs: ["docs/odg/evidence/V175_RESUME_POINT.json"], inputs: ["docs/odg/evidence/V164_STRATEGIC_REGISTER.json"], scansEvidence: false, undeterminedOutputs: false },
  ];
  const ch = [{ status: "M", path: "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json" }];
  const sel = G.selectChecks(evChecks, ch);
  ok("propagation: a register input changed ⇒ the downstream resume point is checked too (upstream record may change)", sel.map((c: any) => c.cli).join(",") === "runtime/bin/odg-strategic-select.ts,runtime/bin/odg-resume-point.ts" && /upstream record may change/.test(sel[1].trigger));
  const tsrc: Record<string, string> = {
    "runtime/core/odg-strategic-register.test.ts": 'const SS = require("../bin/odg-strategic-select.ts");',
    "runtime/bin/odg-resume-point.test.ts": "require('./odg-resume-point.ts')",
    "runtime/core/odg-x.test.ts": "read('docs/odg/evidence/V175_RESUME_POINT.json')",
    "runtime/core/unrelated.test.ts": "odg-strategic-selection",
  };
  const g0 = { modules: [], deps: {}, consumers: {} };
  const before = G.selectTests("/nonexistent", ch, g0, tsrc).map((x: any) => x.test);
  const after = G.selectTests("/nonexistent", ch, g0, tsrc, sel).map((x: any) => x.test);
  ok("#989 shape: import graph alone misses the register test for a changed contract file", !before.includes("runtime/core/odg-strategic-register.test.ts"));
  ok("#989 fix: generator-naming + sibling + record-naming tests selected; word-bounded (odg-strategic-selection ≠ odg-strategic-select)", ["runtime/core/odg-strategic-register.test.ts", "runtime/bin/odg-resume-point.test.ts", "runtime/core/odg-x.test.ts"].every((t) => after.includes(t)) && !after.includes("runtime/core/unrelated.test.ts"));
}

// --- regeneration order: topological over DECLARED inputs (never the file-name order)
{
  const mk = (cli: string, out: string, ins: string[], kind = "DETERMINISTIC") => ({ cli: `runtime/bin/${cli}.ts`, kind, outputs: [`E/${out}.json`], inputs: ins.map((i) => `E/${i}.json`), scansEvidence: false, undeterminedOutputs: false });
  const chain = [
    mk("odg-v176-radar-build-proposals", "RADAR", ["REG", "OL", "PM"]),
    mk("odg-resume-point", "RES", ["REG"]),
    mk("odg-v176-outcome-feedback", "OFB", ["REG", "MODE"]),
    mk("odg-v175-outcome-learning", "OL", ["REG", "OFB"]),
    mk("odg-v175-production-metric", "PM", ["OL"]),
    mk("odg-strategic-select", "REG", ["MODE"]),
    mk("odg-strategy-mode-run", "MODE", []),
  ];
  const ord = G.topoOrder(chain).map((c: any) => c.cli.replace(/^runtime\/bin\/|\.ts$/g, ""));
  ok("topo: strategy-mode → register → {resume, outcome-feedback → outcome-learning → production-metric} → radar (derived; alphabetical only breaks ties)", ord.join(",") === "odg-strategy-mode-run,odg-strategic-select,odg-resume-point,odg-v176-outcome-feedback,odg-v175-outcome-learning,odg-v175-production-metric,odg-v176-radar-build-proposals"
    && ord.indexOf("odg-v176-outcome-feedback") < ord.indexOf("odg-v175-outcome-learning"));
  const cyc = G.topoOrder([mk("a", "A", ["B"]), mk("b", "B", ["A"])]);
  ok("topo: a cycle is emitted (never dropped) and flagged", cyc.length === 2 && cyc.some((c: any) => c.cycle));
  ok("topo: a non-deterministic producer (never regenerated) orders nothing", G.checkEdges([mk("a", "A", ["B"]), mk("b", "B", ["A"], "HOST_DEPENDENT")]).length === 1);
}

{ // discovery: header-declared output + inputs inherited (not outputs) from a required runtime/bin CLI
  const tmpb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-pre-open-disc2-"));
  fs.mkdirSync(path.join(tmpb, "runtime", "bin"), { recursive: true }); fs.mkdirSync(path.join(tmpb, "runtime", "core"), { recursive: true });
  fs.writeFileSync(path.join(tmpb, "runtime", "bin", "up.ts"), '/* up */\nconst OUT = "docs/odg/evidence/UP.json";\nconst IN = "docs/odg/IN.json";\nif (process.argv.includes("--check")) {}\n');
  fs.writeFileSync(path.join(tmpb, "runtime", "bin", "down.ts"), '/*\n *   npx tsx runtime/bin/down.ts     write docs/odg/evidence/DOWN.json\n */\nconst U = require("./up.ts");\nif (process.argv.includes("--check")) {}\n');
  const d = G.discoverChecks(tmpb); const down = d.find((c: any) => c.cli === "runtime/bin/down.ts");
  ok("discovery: header 'write docs/…json' is a declared output", down && down.outputs.join(",") === "docs/odg/evidence/DOWN.json");
  ok("discovery: a required bin CLI's inputs are inherited, its record is NOT (no false producer edge)", down.inputs.includes("docs/odg/IN.json") && down.inputs.includes("runtime/bin/up.ts") && !down.inputs.includes("docs/odg/evidence/UP.json"));
  fs.rmSync(tmpb, { recursive: true, force: true });
}

// --- THIS repo (read-only): derived order + the #989 test selection on the real committed evidence graph
{
  const disc2 = G.discoverChecks(process.cwd());
  const ord = G.topoOrder(disc2).map((c: any) => c.cli.replace(/^runtime\/bin\/|\.ts$/g, ""));
  const i = (n: string) => ord.indexOf(n);
  ok("real repo: derived order strategy-mode → register → {outcome-feedback, outcome-learning, resume} → radar; production-metric before radar", i("odg-strategy-mode-run") >= 0 && i("odg-strategy-mode-run") < i("odg-strategic-select") && ["odg-v176-outcome-feedback", "odg-v175-outcome-learning", "odg-resume-point", "odg-v176-radar-build-proposals"].every((n) => i("odg-strategic-select") < i(n)) && i("odg-v175-outcome-learning") < i("odg-v176-radar-build-proposals") && i("odg-v175-production-metric") < i("odg-v176-radar-build-proposals") && !G.topoOrder(disc2).some((c: any) => c.cycle));
  const ch = [{ status: "A", path: "docs/odg/evidence/V999_Z_CONTRACT_INSPECTION.json" }];
  const tsel = G.selectTests(process.cwd(), ch, CIG.buildGraph(process.cwd()), undefined, G.selectChecks(disc2, ch)).map((x: any) => x.test);
  ok("real repo: a new *_CONTRACT_INSPECTION.json selects the register / resume / outcome-feedback / dependency-graph tests", ["runtime/core/odg-strategic-register.test.ts", "runtime/bin/odg-resume-point.test.ts", "runtime/core/odg-outcome-feedback.test.ts", "runtime/core/odg-register-dependency-graph.test.ts"].every((t) => tsel.includes(t)));
}

// --- e2e --fix-regenerate on a throw-away repo: downstream sorts FIRST by name, upstream must still regenerate first;
// every check is re-run after regeneration and a record that cannot be fixed stays DRIFT (reported)
{
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "odg-pre-open-regen-"));
  const sh2 = (args: string[]) => execFileSync("git", args, { cwd: tmp2, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  sh2(["init", "-q", "-b", "main"]); sh2(["config", "user.email", "t@t"]); sh2(["config", "user.name", "t"]);
  for (const d of ["runtime/bin", "runtime/core", "docs/odg/evidence"]) fs.mkdirSync(path.join(tmp2, d), { recursive: true });
  fs.symlinkSync(path.join(process.cwd(), "node_modules"), path.join(tmp2, "node_modules"));
  fs.writeFileSync(path.join(tmp2, ".gitignore"), "node_modules\n");
  const gen = (out: string, inp: string, broken = false) => `const fs = require("fs");\nconst OUT = "${out}";\nconst IN = "${inp}";\nconst t = JSON.stringify({ v: fs.readFileSync(IN, "utf8") }) + "\\n";\nif (process.argv.includes("--check")) process.exit(${broken ? "1" : 'fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8") === t ? 0 : 1'});\nfs.writeFileSync(OUT, t);\nexport {};\n`;
  fs.writeFileSync(path.join(tmp2, "runtime/bin/a-down.ts"), gen("docs/odg/evidence/DOWN.json", "docs/odg/evidence/UP.json"));
  fs.writeFileSync(path.join(tmp2, "runtime/bin/z-up.ts"), gen("docs/odg/evidence/UP.json", "docs/odg/IN.txt"));
  fs.writeFileSync(path.join(tmp2, "runtime/bin/m-broken.ts"), gen("docs/odg/evidence/BROKEN.json", "docs/odg/IN.txt", true));
  fs.writeFileSync(path.join(tmp2, "docs/odg/IN.txt"), "1");
  const run = (f: string) => execFileSync("npx", ["tsx", f], { cwd: tmp2, stdio: "ignore" });
  run("runtime/bin/z-up.ts"); run("runtime/bin/a-down.ts"); run("runtime/bin/m-broken.ts");
  sh2(["add", "-A"]); sh2(["commit", "-qm", "base"]); sh2(["checkout", "-qb", "feat"]);
  fs.writeFileSync(path.join(tmp2, "docs/odg/IN.txt"), "2"); sh2(["commit", "-qam", "input changes, records stale"]);
  const rr = G.gate(tmp2, G.parseArgs(["--base", "main", "--no-tests", "--no-tsc", "--fix-regenerate"]));
  const st = (cli: string) => rr.checks.find((c: any) => c.cli === cli) || {};
  ok("e2e regen: order derived from inputs (z-up before a-down, despite names)", rr.checkOrder.indexOf("runtime/bin/z-up.ts") < rr.checkOrder.indexOf("runtime/bin/a-down.ts"));
  ok("e2e regen: upstream + downstream regenerated and re-checked OK (no residual DRIFT)", st("runtime/bin/z-up.ts").status === "REGENERATED" && st("runtime/bin/a-down.ts").status === "REGENERATED" && st("runtime/bin/a-down.ts").finalRecheck === "OK" && JSON.parse(fs.readFileSync(path.join(tmp2, "docs/odg/evidence/DOWN.json"), "utf8")).v.includes("2"));
  ok("e2e regen: a record still drifting after regeneration is reported as remaining DRIFT ⇒ NOT_READY", st("runtime/bin/m-broken.ts").status === "DRIFT" && /remaining DRIFT/.test(st("runtime/bin/m-broken.ts").detail) && rr.verdict === "NOT_READY" && rr.reasons.length === 1);
  fs.rmSync(tmp2, { recursive: true, force: true });
}

// --- CI-1: an ADDED test outside the CI classified gate is NOT_READY (it would never run in CI)
{
  const gs = new Set(["runtime/core/a.test.ts"]);
  const ch = [{ status: "A", path: "runtime/core/a.test.ts" }, { status: "A", path: "runtime/core/b.test.ts" }, { status: "M", path: "runtime/core/c.test.ts" }, { status: "A", path: "runtime/__bench__/d.e2e.test.ts" }, { status: "A", path: "runtime/core/e.ts" }];
  ok("CI-1: only ADDED *.test.ts outside the gate are reported (modified, bench and non-test files are not)", JSON.stringify(G.newTestsOutsideCi(ch, gs)) === JSON.stringify(["runtime/core/b.test.ts"]));
  ok("CI-1: no CI gate parsed ⇒ nothing reported (never invents a gate)", G.newTestsOutsideCi(ch, null).length === 0);
  const v = G.verdict({ checks: [], newTestsOutsideCi: ["runtime/core/b.test.ts"] });
  ok("CI-1: verdict NOT_READY with a NEW_TEST_OUTSIDE_CI reason", v.verdict === "NOT_READY" && v.reasons.some((r: string) => /^NEW_TEST_OUTSIDE_CI runtime\/core\/b\.test\.ts/.test(r)));
  ok("CI-1: verdict READY when every added test is wired", G.verdict({ checks: [], newTestsOutsideCi: [] }).verdict === "READY");
}

console.log(`\nodg-pre-open-gate: ${passed} passed`);

export {};
