// @ts-nocheck
/*
 * η3-B101 — DIST BUILD-CLOSURE REGRESSION BENCH.
 *
 * Guards the P1 root fix: `npm run build:runtime` (tsc + scripts/build-dist-closure.js) must emit a
 * COMPLETE, self-contained runtime/dist/core so a real mission runs on the compiled entry. Unlike
 * dist-closure-relocation (which manually assembles a closure in its sandbox), this bench qualifies the
 * ACTUAL generated output: it rebuilds, statically proves zero unresolved relative requires in the built
 * dist, asserts a formerly-missing dependency is present, and runs the real benign QUAL_CLEAN_GATEB
 * mission on `runtime/dist/bin/odg-run.js` with ODG_STAGE_BASE=runtime/dist/core.
 */
"use strict";
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO = process.cwd();
const DIST = path.join(REPO, "runtime", "dist");
const builtins = new Set(require("module").builtinModules);
let failures = 0;
function check(c, label) { if (c) console.log("  PASS " + label); else { failures++; console.log("  FAIL " + label); } }

console.log("η3-B101 — DIST BUILD-CLOSURE (qualifies the ACTUAL build output)");

// 1. Rebuild from scratch via the real pipeline.
fs.rmSync(DIST, { recursive: true, force: true });
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });

// 2. Manifest present and internally consistent.
const manPath = path.join(DIST, "dist-closure-manifest.json");
check(fs.existsSync(manPath), "build emits dist-closure-manifest.json");
const man = JSON.parse(fs.readFileSync(manPath, "utf8"));
check(man.totalClosure === man.emittedCount + man.copiedCount && man.copiedCount > 0, `manifest consistent (emitted=${man.emittedCount} copied=${man.copiedCount})`);

// 3. A formerly-missing JS-only dependency is now present in the built dist/core.
check(fs.existsSync(path.join(DIST, "core", "budget-contract.js")), "formerly-missing dep budget-contract.js present in built dist/core");

// 4. Static closure proof against the ACTUAL build: every relative require in a built file resolves INSIDE dist.
function resolveInDir(dir, t) {
  for (const c of [t, t + ".js", t + ".json", path.join(t, "index.js")]) {
    const p = path.resolve(dir, c);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const files = [...fs.readdirSync(path.join(DIST, "core")).filter((f) => f.endsWith(".js")).map((f) => path.join(DIST, "core", f)), path.join(DIST, "bin", "odg-run.js")];
let unresolved = 0;
for (const f of files) {
  const src = strip(fs.readFileSync(f, "utf8"));
  const re = /require\(\s*("([^"]*)"|'([^']*)')\s*\)/g; let m;
  while ((m = re.exec(src))) {
    const t = m[2] !== undefined ? m[2] : m[3];
    if (t.startsWith("./") || t.startsWith("../")) { if (!resolveInDir(path.dirname(f), t)) { unresolved++; console.log("   UNRESOLVED:", path.relative(DIST, f), "->", t); } }
    else if (!builtins.has(t.replace(/^node:/, ""))) { unresolved++; console.log("   UNEXPECTED EXTERNAL:", path.relative(DIST, f), "->", t); }
  }
}
check(unresolved === 0, "built dist is closure-complete (0 unresolved relative requires, 0 unexpected external)");

// 4b. η3-B125 PROPAGATION: the B124 provider-sandbox hardening reaches the BUILT dist and no stale
// artifact survives. A clean build (step 1) must carry the sandboxed local-model-manager + its new
// provider-sandbox dependency, and the staleness guard must leave zero orphan core artifacts.
check(fs.existsSync(path.join(DIST, "core", "provider-sandbox.js")), "provider-sandbox.js propagated into built dist/core");
const lmmBuilt = fs.readFileSync(path.join(DIST, "core", "local-model-manager.js"), "utf8");
check(!/shell:\s*true/.test(lmmBuilt), "built local-model-manager.js has NO shell:true execution");
check(/require\(\s*["']\.\/provider-sandbox["']\s*\)/.test(lmmBuilt), "built local-model-manager.js requires ./provider-sandbox");
check(man.copied.some((c) => c.rel.replace(/\\/g, "/") === "core/provider-sandbox.js"), "manifest records provider-sandbox.js as a copied closure member");
// Load the BUILT module and prove it refuses unsandboxed execution (fail-closed), not just that the
// source does. Force the sandbox-detection probe to report bubblewrap absent.
{
  const builtMM = require(path.join(DIST, "core", "local-model-manager.js"));
  const savedCmd = process.env.ODG_LOCAL_MODEL_CMD;
  process.env.ODG_LOCAL_MODEL_CMD = "cat";
  const refusal = builtMM.complete("x", { spawn: () => ({ status: 1, stdout: "" }) });
  if (savedCmd === undefined) delete process.env.ODG_LOCAL_MODEL_CMD; else process.env.ODG_LOCAL_MODEL_CMD = savedCmd;
  check(refusal.ok === false && refusal.refused === true, "BUILT local model refuses unsandboxed execution (no fallback)");
}
// No-orphan guarantee: every dist/core/*.js is emitted-from-a-.ts or a copied-closure member.
{
  const copiedRels = new Set(man.copied.map((c: any) => c.rel.replace(/\\/g, "/")));
  const orphans = fs.readdirSync(path.join(DIST, "core")).filter((f: string) => f.endsWith(".js")).filter((f: string) => {
    const hasTs = fs.existsSync(path.join(REPO, "runtime", "core", f.replace(/\.js$/, ".ts")));
    return !hasTs && !copiedRels.has("core/" + f);
  });
  check(orphans.length === 0, `built dist/core has zero stale/orphan artifacts (${orphans.length === 0 ? "none" : orphans.join(",")})`);
}

// 5. Real compiled mission executes on the built dist.
const env = { ...process.env, ODG_STAGE_BASE: "runtime/dist/core" };
delete env.ODG_RUNTIME_ENTRY;
const r = spawnSync("node", ["runtime/dist/bin/odg-run.js", "QUAL_CLEAN_GATEB"], { cwd: REPO, encoding: "utf8", env });
check(r.status === 0 && /PIPELINE SUCCESS/.test((r.stdout || "") + (r.stderr || "")), "real QUAL_CLEAN_GATEB runs on compiled entry (13/13)");
const report = JSON.parse(fs.readFileSync(path.join(REPO, "runtime", "generated", "mission-report.json"), "utf8"));
check(report.status === "SUCCESS" && report.validated === true, "compiled mission report: status=SUCCESS validated=true");

console.log(failures === 0 ? "ALL PASS — DIST BUILD-CLOSURE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
