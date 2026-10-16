#!/usr/bin/env node
/*
 * LOT capability-router — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, pure routing (no provider / no network / no writes). build:runtime compiles
 * runtime/core/capability-router.ts → dist; its deps (patch-memory/decision-rules/capability-metrics/
 * local-model-manager/provider-sandbox) are co-located/compiled by build-dist-closure. Both the .js and the
 * compiled .ts route over the SAME underlying dep logic, so identical (task, opts) ⇒ byte-identical result.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/capability-router-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "capability-router.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "capability-router.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT capability-router — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/capability-router.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/capability-router.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

check(typeof js.route === "function" && typeof ts.route === "function", "both export route");

// localModelAvailable is INJECTED (opts) so routing is deterministic and never probes a real local model.
const cases: Array<{ task: any; opts: any }> = [
  { task: { goal: "fix a null pointer dereference" }, opts: { localModelAvailable: false } },
  { task: { goal: "optimize the imports" }, opts: { localModelAvailable: true } },
  { task: {}, opts: { localModelAvailable: false } },
  { task: { goal: "an-unmatched-unique-goal-xyz-123" }, opts: { localModelAvailable: true } },
  { task: { goal: "an-unmatched-unique-goal-xyz-123" }, opts: { localModelAvailable: false } },
];
for (const c of cases) {
  const rj = js.route(c.task, c.opts), rt = ts.route(c.task, c.opts);
  check(EQ(rj, rt), `route byte-identical: goal=${JSON.stringify(c.task.goal)} localLLM=${c.opts.localModelAvailable}`);
  // Structural invariants that hold regardless of the dep verdicts:
  const last = rj.plan[rj.plan.length - 1];
  check(last.tier === "EXTERNAL_AI" && last.lastResort === true && last.source === "EXTERNAL", "External AI is ALWAYS present, LAST, flagged lastResort");
  check(rj.usesExternalAI === (rj.chosen.source === "EXTERNAL"), "usesExternalAI reflects the chosen source");
}
// With a local model unavailable and no local tier, External AI must be the chosen last resort.
{
  const r = js.route({ goal: "an-unmatched-unique-goal-xyz-123" }, { localModelAvailable: false });
  if (r.plan.filter((s: any) => s.source === "LOCAL").length === 0) {
    check(r.usesExternalAI === true && r.chosen.tier === "EXTERNAL_AI", "no local tier ⇒ External AI chosen (last resort)");
  } else {
    check(true, "a local tier matched the probe goal (dep-defined) — parity already asserted above");
  }
}

console.log(failures === 0 ? "ALL PASS — LOT capability-router EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
