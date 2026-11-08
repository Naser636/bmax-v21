#!/usr/bin/env node
"use strict";

/*
 * `odg verify --targeted` — Engineering Intelligence wave-2 CLI. Computes the change-set (git), maps changed
 * runtime/core modules to their impacted test suites via the TRANSITIVE consumer graph (change-impact-graph), and
 * runs ONLY the impacted suites through the real odg-test-report — unless §1 forces FULL (a certification point, a
 * governance/critical change, an undeterminable impact, or a closure hazard). A suite NOT executed is printed NOT_RUN
 * and is NEVER PASS; a TARGETED run NEVER certifies. The honest decision is delegated to targeted-verify/validation-
 * selector; this orchestrator only gathers the change-set + runs the selected subset through the existing gate.
 */

const { execFileSync, spawnSync } = require("child_process");
const path = require("path");
const CIG = require("../core/change-impact-graph");
const TV = require("../core/targeted-verify");

const root = process.cwd();

function run(cmd: string, args: string[]): string | null {
  try { return execFileSync(cmd, args, { cwd: root, encoding: "utf8" }); } catch { return null; }
}

/** changed files = working-tree vs HEAD ∪ staged (name-only). null ⇒ git unavailable ⇒ treat as undeterminable. */
function changedFiles(): string[] | null {
  const a = run("git", ["diff", "--name-only", "HEAD"]);
  const b = run("git", ["diff", "--name-only", "--cached"]);
  if (a === null && b === null) return null;
  return Array.from(new Set(((a || "") + "\n" + (b || "")).split("\n").map((s) => s.trim()).filter(Boolean)));
}

function allSuites(): string[] {
  const pkg = require(path.join(root, "package.json"));
  return String(pkg.scripts["test:report"]).split(" ").filter((x) => x.endsWith(".test.ts"));
}

/** transitive consumers of a module (BFS over the impact graph), including the module itself. */
function transitiveImpact(graph: any, mod: string): Set<string> {
  const seen = new Set<string>(); const stack = [mod];
  while (stack.length) { const n = stack.pop() as string; if (seen.has(n)) continue; seen.add(n); for (const c of (graph.consumers[n] || [])) if (!seen.has(c)) stack.push(c); }
  return seen;
}

function main(): number {
  const certification = process.argv.includes("--certify") || process.env.ODG_CERTIFY === "1";
  const suites = allSuites();
  const suiteSet = new Set(suites);
  const changed = changedFiles();

  let impacted = new Set<string>(); let riskLevel = "LOW"; let undeterminable = (changed === null);
  if (changed !== null) {
    const graph = CIG.buildGraph(root);
    for (const f of changed) {
      if (f.endsWith(".test.ts")) { if (suiteSet.has(f)) impacted.add(f); continue; }   // a changed test runs itself
      const m = /^runtime\/core\/([^/]+)\.ts$/.exec(f);
      if (!m) { undeterminable = true; continue; }                                        // change outside runtime/core ⇒ FULL
      const mod = m[1];
      if (!graph.modules.includes(mod)) { undeterminable = true; continue; }
      const rep = CIG.impactOf(root, mod);
      if (rep.closureHazards && (rep.closureHazards.dynamicRequire || rep.closureHazards.externalRequire || rep.closureHazards.pathHazard)) riskLevel = "HIGH";
      for (const consumer of transitiveImpact(graph, mod)) { const t = `runtime/core/${consumer}.test.ts`; if (suiteSet.has(t)) impacted.add(t); }
    }
  }

  const plan = TV.planTargetedVerify({ changedFiles: changed || [], impactedSuites: undeterminable ? undefined : Array.from(impacted), allSuites: suites, riskLevel, certification });

  process.stdout.write(`\n== odg verify --targeted ==\n${plan.summary}\n`);
  for (const r of plan.reasons) process.stdout.write(`  · ${r}\n`);
  const toRun = plan.mode === "FULL" ? suites : plan.selected;
  if (plan.mode === "TARGETED") process.stdout.write(`  NOT_RUN (${plan.unrun.length}): these are NOT PASS — run the FULL gate to certify.\n`);
  process.stdout.write(`  running ${toRun.length} suite(s) via odg-test-report…\n\n`);

  const res = spawnSync("npx", ["tsx", "runtime/bin/odg-test-report.ts", ...toRun], { cwd: root, stdio: "inherit" });
  const code = typeof res.status === "number" ? res.status : 1;
  if (plan.mode === "TARGETED" && code === 0) process.stdout.write(`\nTARGETED validation PASSED for the ${toRun.length} impacted suite(s). This does NOT certify — ${plan.unrun.length} suite(s) remain NOT_RUN; the FULL gate is required at certification.\n`);
  return code;
}

if (require.main === module) process.exit(main());
module.exports = { transitiveImpact };
export {};
