#!/usr/bin/env node
/*
 * VALIDATION_ORCHESTRATOR v1 — deterministic unit test (§U Phase-1 #3).
 *
 * Proves: distinct PASS/FAIL/BLOCKED/SKIPPED/NOT-EXECUTED; stop on first FAIL/BLOCKED (rest NOT-EXECUTED);
 * a SKIPPED never satisfies a REQUIRED gate; declared-vs-executed distinction; provenance + exit codes
 * preserved; Truth-Lock pre-gate fail-closed; NO false DONE on a declaration/skip/non-PASS. Pure, offline.
 * The orchestrator only reports what the (mocked) gate seams return — it claims no effect coverage.
 *
 * Run:  node_modules/.bin/tsx src/runtime/validation-orchestrator.test.ts
 */
const vo = require("./validation-orchestrator");
export {}; // module-scope marker (ensure-ts-module-marker §T-R1): this test uses require(), not import ⇒ force MODULE scope to avoid TS2451 global-script collisions

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("VALIDATION_ORCHESTRATOR v1 — deterministic unit test");

// A mock gate seam: canned verdicts per gate name; records which gates were actually invoked (executed).
function mockSeams(verdicts: Record<string, { status: string; detail: string }>, opts: any = {}) {
  const invoked: string[] = [];
  return {
    invoked,
    gate(name: string) { invoked.push(name); return verdicts[name] || { status: "FAIL", detail: "no verdict" }; },
    truthLock: opts.truthLock,
    log() {},
  };
}
const spec = (names: Array<string | [string, boolean]>) => ({
  gates: names.map((n) => (Array.isArray(n) ? { name: n[0], required: n[1] } : { name: n })),
});

// 1. ALL PASS ⇒ ok, exit 0, every gate executed.
{
  const s = mockSeams({ a: { status: "PASS", detail: "ok a" }, b: { status: "PASS", detail: "ok b" } });
  const r = vo.runGates(spec(["a", "b"]), s);
  check(r.ok === true && r.exitCode === 0, "all-PASS ⇒ ok, exit 0");
  check(r.gates.every((g: any) => g.executed && g.declared), "all-PASS: every gate declared + executed");
  check(s.invoked.length === 2, "all-PASS: both gate seams invoked");
}

// 2. FAIL stops the sequence; remaining gates NOT-EXECUTED; exit 1.
{
  const s = mockSeams({ a: { status: "PASS", detail: "ok" }, b: { status: "FAIL", detail: "bad b" }, c: { status: "PASS", detail: "ok" } });
  const r = vo.runGates(spec(["a", "b", "c"]), s);
  check(r.ok === false && r.exitCode === 1, "FAIL ⇒ not ok, exit 1");
  check(r.gates[1].status === "FAIL" && r.gates[2].status === "NOT-EXECUTED" && r.gates[2].executed === false, "FAIL stops: gate c NOT-EXECUTED (not executed)");
  check(!s.invoked.includes("c"), "FAIL stops: gate c seam NEVER invoked (no false execution claimed)");
  check(r.gates[1].detail === "bad b", "provenance: the authority's detail is preserved verbatim");
}

// 3. BLOCKED stops + exit 2; remaining NOT-EXECUTED.
{
  const s = mockSeams({ a: { status: "BLOCKED", detail: "precondition missing" }, b: { status: "PASS", detail: "ok" } });
  const r = vo.runGates(spec(["a", "b"]), s);
  check(r.ok === false && r.exitCode === 2, "BLOCKED ⇒ not ok, exit 2");
  check(r.gates[1].status === "NOT-EXECUTED", "BLOCKED stops: gate b NOT-EXECUTED");
}

// 4. A REQUIRED SKIPPED never satisfies the gate (not ok), but does NOT stop the sequence.
{
  const s = mockSeams({ a: { status: "SKIPPED", detail: "not applicable" }, b: { status: "PASS", detail: "ok" } });
  const r = vo.runGates(spec(["a", "b"]), s);
  check(r.ok === false && r.exitCode === 1, "required SKIPPED ⇒ not ok (never satisfies), exit 1");
  check(r.gates[0].status === "SKIPPED" && r.gates[1].executed === true, "SKIPPED does NOT stop: gate b still executed");
}

// 5. An OPTIONAL SKIPPED is acceptable (does not block ok).
{
  const s = mockSeams({ a: { status: "PASS", detail: "ok" }, b: { status: "SKIPPED", detail: "optional, n/a" } });
  const r = vo.runGates(spec(["a", ["b", false]]), s);
  check(r.ok === true && r.exitCode === 0, "optional SKIPPED ⇒ still ok (does not block)");
}

// 6. NO FALSE DONE: a run with a NOT-EXECUTED remainder (via FAIL) is never ok even though gate 'a' PASSed.
{
  const s = mockSeams({ a: { status: "PASS", detail: "ok" }, b: { status: "FAIL", detail: "x" } });
  const r = vo.runGates(spec(["a", "b"]), s);
  check(r.ok === false, "no false DONE: a PASS + a later FAIL ⇒ not ok");
}

// 7. Truth-Lock pre-gate refusal ⇒ fail-closed: zero gates executed, all NOT-EXECUTED, exit 2.
{
  const refuse = () => ({ ok: false, head: "deadbeef", branch: "main", detail: "REFUSED — staged changes", violations: ["staged"] });
  const s = mockSeams({ a: { status: "PASS", detail: "ok" } }, { truthLock: refuse });
  const r = vo.runGates(spec(["a"]), s);
  check(r.ok === false && r.exitCode === 2 && r.truthLock && r.truthLock.ok === false, "Truth-Lock refusal ⇒ fail-closed exit 2");
  check(r.gates[0].status === "NOT-EXECUTED" && s.invoked.length === 0, "Truth-Lock refusal: NO gate seam invoked (fail-closed)");
}

// 8. Truth-Lock pass ⇒ gates proceed normally.
{
  const pass = () => ({ ok: true, head: "abc", branch: "main", detail: "clean", violations: [] });
  const s = mockSeams({ a: { status: "PASS", detail: "ok" } }, { truthLock: pass });
  const r = vo.runGates(spec(["a"]), s);
  check(r.ok === true && r.exitCode === 0 && r.truthLock.ok === true, "Truth-Lock pass ⇒ gates run, ok exit 0");
}

// 9. truthLockFromState reuses the shared pure policy (evaluateTruthLock) — divergent HEAD ⇒ refuse.
{
  const tl = vo.truthLockFromState({ isRepo: true, branch: "main", head: "aaa", originMain: "bbb", staged: 0 });
  check(tl.ok === false && /diverges/.test(tl.detail), "truthLockFromState: reuses evaluateTruthLock (HEAD divergence ⇒ refuse)");
}

// 10. declared-vs-executed: an empty spec ⇒ ok=false is NOT asserted; an all-executed spec ⇒ no NOT-EXECUTED.
{
  const s = mockSeams({ a: { status: "PASS", detail: "ok" } });
  const r = vo.runGates(spec(["a"]), s);
  check(r.gates.every((g: any) => g.declared) && r.gates.every((g: any) => g.executed), "declared-vs-executed: a fully-run spec has all declared + all executed");
}

console.log(failures === 0 ? "ALL PASS — VALIDATION_ORCHESTRATOR v1" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
