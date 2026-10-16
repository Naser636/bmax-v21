#!/usr/bin/env node
/*
 * CHANTIER 1 (V56) — GOLDEN PARITY for runMigrateTs across the unification.
 *
 * runMigrateTs is a LIVE, load-bearing gate path. This hermetic bench pins its EXACT MigrateResult
 * (gates[], ok, exitCode, truthLock) across every scenario using MOCK seams — NO real gate runs, NO repo
 * write. It is authored BEFORE the refactor (extract truth-lock.ts + re-express the loop on runGates) and
 * must stay BYTE-IDENTICAL after it: same goldens pass against the old and the new implementation ⇒ the
 * refactor changed nothing observable. Migrate gates only ever return PASS/FAIL/BLOCKED (never SKIPPED),
 * which is why the stop-on-non-PASS discipline coincides with runGates' stop-on-FAIL/BLOCKED here.
 *
 * Run:  node_modules/.bin/tsx src/runtime/migrate-ts-unification.test.ts
 */
import { runMigrateTs, GATE_SEQUENCE } from "./migrate-ts-cli";
import type { MigrateSeams, GateStatus, TruthLock } from "./migrate-ts-cli";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const SEQ = [...GATE_SEQUENCE];
const okTL: TruthLock = { ok: true, head: "abc1234", branch: "main", detail: "ok", violations: [] };
const badTL: TruthLock = { ok: false, head: "deadbeef", branch: "feature/x", detail: "REFUSED — unexpected branch", violations: ["unexpected branch"] };
const NOT_RUN = (gate: string) => ({ gate, status: "NOT RUN" as GateStatus, detail: "skipped after an earlier non-PASS gate (no false DONE)" });

/** Build mock seams: authorised lot, chosen Truth Lock, and per-gate programmed verdicts (by index). */
function seams(opts: { allowed: boolean; tl: TruthLock; verdicts?: Record<string, { status: GateStatus; detail: string }> }): MigrateSeams {
  return {
    allowedLots: opts.allowed ? ["L"] : [],
    truthLock: () => opts.tl,
    gate: (name: string) => (opts.verdicts && opts.verdicts[name]) || { status: "PASS", detail: "ok-" + name },
    log: () => {},
  };
}

console.log("CHANTIER 1 — runMigrateTs golden parity");

// S1 — unauthorised lot ⇒ BLOCKED, exit 2, truthLock null, gates [].
{
  const r = runMigrateTs("L", seams({ allowed: false, tl: okTL }));
  check(EQ(r, { lot: "L", truthLock: null, gates: [], ok: false, exitCode: 2 }), "S1 unauthorised lot ⇒ {truthLock:null, gates:[], ok:false, exit:2}");
}

// S2 — Truth Lock refused ⇒ BLOCKED, exit 2, truthLock carried, gates [].
{
  const r = runMigrateTs("L", seams({ allowed: true, tl: badTL }));
  check(EQ(r, { lot: "L", truthLock: badTL, gates: [], ok: false, exitCode: 2 }), "S2 Truth Lock refused ⇒ {truthLock:badTL, gates:[], ok:false, exit:2}");
}

// S3 — all gates PASS ⇒ ok, exit 0, 5 PASS gates with verbatim details.
{
  const r = runMigrateTs("L", seams({ allowed: true, tl: okTL }));
  const expectGates = SEQ.map((g) => ({ gate: g, status: "PASS" as GateStatus, detail: "ok-" + g }));
  check(EQ(r, { lot: "L", truthLock: okTL, gates: expectGates, ok: true, exitCode: 0 }), "S3 all PASS ⇒ 5 PASS gates, ok:true, exit:0");
}

// S4 — FAIL at index 2 (equivalence-bench) ⇒ stop, remaining NOT RUN, ok:false, exit 1.
{
  const r = runMigrateTs("L", seams({ allowed: true, tl: okTL, verdicts: { "equivalence-bench": { status: "FAIL", detail: "bench rc=1" } } }));
  const expectGates = [
    { gate: "build:runtime", status: "PASS" as GateStatus, detail: "ok-build:runtime" },
    { gate: "strict-gate", status: "PASS" as GateStatus, detail: "ok-strict-gate" },
    { gate: "equivalence-bench", status: "FAIL" as GateStatus, detail: "bench rc=1" },
    NOT_RUN("historical-suites"),
    NOT_RUN("regressions"),
  ];
  check(EQ(r, { lot: "L", truthLock: okTL, gates: expectGates, ok: false, exitCode: 1 }), "S4 FAIL@2 ⇒ [PASS,PASS,FAIL,NOT RUN,NOT RUN], ok:false, exit:1");
}

// S5 — BLOCKED at index 1 (strict-gate) ⇒ stop, remaining NOT RUN, ok:false, exit 1 (NOT 2 — gate-level block).
{
  const r = runMigrateTs("L", seams({ allowed: true, tl: okTL, verdicts: { "strict-gate": { status: "BLOCKED", detail: "blocked x" } } }));
  const expectGates = [
    { gate: "build:runtime", status: "PASS" as GateStatus, detail: "ok-build:runtime" },
    { gate: "strict-gate", status: "BLOCKED" as GateStatus, detail: "blocked x" },
    NOT_RUN("equivalence-bench"),
    NOT_RUN("historical-suites"),
    NOT_RUN("regressions"),
  ];
  check(EQ(r, { lot: "L", truthLock: okTL, gates: expectGates, ok: false, exitCode: 1 }), "S5 BLOCKED@1 ⇒ remaining NOT RUN, ok:false, exit:1 (gate-level block ≠ exit 2)");
}

// S6 — FAIL at the FIRST gate ⇒ all remaining NOT RUN.
{
  const r = runMigrateTs("L", seams({ allowed: true, tl: okTL, verdicts: { "build:runtime": { status: "FAIL", detail: "build rc=2" } } }));
  const expectGates = [
    { gate: "build:runtime", status: "FAIL" as GateStatus, detail: "build rc=2" },
    NOT_RUN("strict-gate"), NOT_RUN("equivalence-bench"), NOT_RUN("historical-suites"), NOT_RUN("regressions"),
  ];
  check(EQ(r, { lot: "L", truthLock: okTL, gates: expectGates, ok: false, exitCode: 1 }), "S6 FAIL@0 ⇒ [FAIL,NOT RUN×4], ok:false, exit:1");
}

console.log(failures === 0 ? "ALL PASS — runMigrateTs golden parity" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
