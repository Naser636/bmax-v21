#!/usr/bin/env node
/*
 * LOT patch-proposal-apply — EQUIVALENCE (historical runtime/core/patch-proposal-apply.js vs compiled .ts).
 *
 * Offline, deterministic, hermetic: build:runtime compiles the .ts → runtime/dist/core. The ONLY outward
 * effect (spawning patch-executor) is an INJECTED test seam (_spawn) on BOTH ports — NO real subprocess.
 * fs writes go to a throwaway temp cwd under runtime/generated (same filesystem, gitignored). Each scenario
 * calls applyProposal on BOTH modules and asserts BYTE-IDENTICAL result objects. Covers: the reject ladder
 * (missing mission throws / missing authorizedPaths throws / NO_PROPOSAL / MALFORMED ambiguous+empty-target),
 * the group-by-objective plan, and the spawn path.
 *
 * KEY correctness (the V71 __dirname→dist fix): the compiled module runs from runtime/dist/core yet MUST
 * resolve the executor to the CANONICAL <repo>/runtime/core/patch-executor.js (coreDir maps dist back to
 * source). The injected _spawn captures the executor arg and we assert JS≡TS AND == the canonical source path.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/patch-proposal-apply-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "patch-proposal-apply.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "patch-proposal-apply.js");
const CANONICAL_EXECUTOR = path.join(REPO, "runtime", "core", "patch-executor.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}
function thrownMessage(fn: () => unknown): string {
  try { fn(); return "<no throw>"; } catch (e: any) { return String(e && e.message || e); }
}

console.log("LOT patch-proposal-apply — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/patch-proposal-apply.js present (untouched sem.)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/patch-proposal-apply.js emitted by build:runtime");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.applyProposal === "function" && typeof ts.applyProposal === "function", "both export applyProposal");

// A throwaway cwd per call (fs writes land here; gitignored, same filesystem — avoids /tmp quota).
const genRoot = path.join(REPO, "runtime", "generated");
fs.mkdirSync(genRoot, { recursive: true });
function tmpCwd(): string { return fs.mkdtempSync(path.join(genRoot, "ppa-bench-")); }

// A fake spawn that records the executor arg and returns a fixed status, writing NO patch-execution.json
// (so report=null, executed=[], applied=false — deterministic + identical on both ports).
function makeSpawn(sink: { executor?: string }) {
  return (_cmd: string, argv: string[], _o: any) => { sink.executor = argv[0]; return { status: 0 }; };
}

// ── Reject ladder (no spawn, no fs) ──
check(thrownMessage(() => js.applyProposal({ authorizedPaths: ["a"], proposedEdits: [{ target: "t", content: "c" }] })) ===
      thrownMessage(() => ts.applyProposal({ authorizedPaths: ["a"], proposedEdits: [{ target: "t", content: "c" }] })),
  "missing mission ⇒ same throw message");
check(thrownMessage(() => js.applyProposal({ mission: "M", proposedEdits: [{ target: "t", content: "c" }] })) ===
      thrownMessage(() => ts.applyProposal({ mission: "M", proposedEdits: [{ target: "t", content: "c" }] })),
  "missing authorizedPaths ⇒ same throw message");

const rejectCases: Array<[string, any]> = [
  ["NO_PROPOSAL (empty)", { mission: "M", authorizedPaths: ["a"], proposedEdits: [] }],
  ["NO_PROPOSAL (non-array)", { mission: "M", authorizedPaths: ["a"], proposedEdits: null }],
  ["MALFORMED (no target)", { mission: "M", authorizedPaths: ["a"], proposedEdits: [{ content: "c" }] }],
  ["MALFORMED (both content+diff)", { mission: "M", authorizedPaths: ["a"], proposedEdits: [{ target: "t", content: "c", diff: "d" }] }],
  ["MALFORMED (neither)", { mission: "M", authorizedPaths: ["a"], proposedEdits: [{ target: "t" }] }],
];
for (const [label, opts] of rejectCases) {
  const j = js.applyProposal(opts), t = ts.applyProposal(opts);
  check(JSON.stringify(j) === JSON.stringify(t), `reject "${label}" byte-identical`);
}

// ── Spawn path (injected _spawn) ──
{
  const jSink: { executor?: string } = {}, tSink: { executor?: string } = {};
  const edits = [
    { objectiveId: "O1", target: "a.txt", content: "A" },
    { objectiveId: "O1", target: "b.txt", diff: "D" },
    { target: "c.txt", content: "C" }, // defaults to objectiveId PROPOSAL
  ];
  const j = js.applyProposal({ mission: "M", authorizedPaths: ["a.txt", "b.txt", "c.txt"], proposedEdits: edits, cwd: tmpCwd(), stateVersion: 7, _spawn: makeSpawn(jSink) });
  const t = ts.applyProposal({ mission: "M", authorizedPaths: ["a.txt", "b.txt", "c.txt"], proposedEdits: edits, cwd: tmpCwd(), stateVersion: 7, _spawn: makeSpawn(tSink) });
  check(JSON.stringify(j) === JSON.stringify(t), "spawn-path result byte-identical (report null ⇒ applied false)");
  check(jSink.executor === tSink.executor, "executor path identical JS≡TS");
  check(jSink.executor === CANONICAL_EXECUTOR, `executor resolves to CANONICAL source path (${path.relative(REPO, CANONICAL_EXECUTOR)}) even from dist/core`);
  check(j.applied === false && j.reason === "NOT_FULLY_APPLIED" && j.executorStatus === 0, "no evidence file ⇒ applied=false, status passthrough");
}

console.log(failures === 0 ? "ALL PASS — LOT patch-proposal-apply EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
