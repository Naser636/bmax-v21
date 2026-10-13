/*
 * `odg migrate-ts` orchestrator — deterministic unit test (η3-B78).
 *
 * Run directly with tsx (no repository, build, or network — every effect is an injected seam):
 *   node_modules/.bin/tsx src/runtime/migrate-ts-cli.test.ts
 *
 * Exercises the orchestration contract of runMigrateTs(): one launch, DISTINCT ordered gates, STOP on the
 * first non-PASS (remaining gates NOT RUN — never a false DONE), and the documented exit codes
 * (0 all PASS, 1 a gate FAILed, 2 BLOCKED = unauthorised lot or Truth Lock refused).
 */

import { runMigrateTs, evaluateTruthLock, GATE_SEQUENCE, type MigrateSeams, type GateStatus, type GitState } from "./migrate-ts-cli";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

/** A seam harness whose gate() returns a scripted status per gate name; records the call order. */
function harness(opts: {
  allowedLots?: string[];
  truthLockOk?: boolean;
  gateStatus?: (name: string) => GateStatus;
}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const seams: MigrateSeams = {
    allowedLots: opts.allowedLots ?? ["validation-engine"],
    truthLock: () => ({ ok: opts.truthLockOk ?? true, head: "deadbeef", branch: "main", detail: "test", violations: (opts.truthLockOk ?? true) ? [] : ["test-refusal"] }),
    gate: (name: string) => { calls.push(name); return { status: (opts.gateStatus ?? (() => "PASS"))(name), detail: `stub:${name}` }; },
    log: (m: string) => { logs.push(m); },
  };
  return { seams, calls, logs };
}

console.log("η3-B78 — odg migrate-ts orchestrator unit test");

// 1. SUCCESS — every gate PASS ⇒ exit 0, all gates ran in order, outcome ok.
{
  const h = harness({ gateStatus: () => "PASS" });
  const res = runMigrateTs("validation-engine", h.seams);
  check(res.exitCode === 0 && res.ok, "SUCCESS: all gates PASS ⇒ exit 0, ok=true");
  check(JSON.stringify(h.calls) === JSON.stringify([...GATE_SEQUENCE]), "SUCCESS: all gates ran in the declared order");
  check(res.gates.every((g) => g.status === "PASS"), "SUCCESS: every gate recorded PASS");
}

// 2. FAIL mid-sequence — the 3rd gate FAILs ⇒ exit 1, STOP, later gates NOT RUN (no false DONE).
{
  const failGate = GATE_SEQUENCE[2]; // equivalence-bench
  const h = harness({ gateStatus: (n) => (n === failGate ? "FAIL" : "PASS") });
  const res = runMigrateTs("validation-engine", h.seams);
  check(res.exitCode === 1 && !res.ok, "FAIL: a gate FAILs ⇒ exit 1, ok=false");
  check(!h.calls.includes(GATE_SEQUENCE[3]) && !h.calls.includes(GATE_SEQUENCE[4]), "FAIL: gates after the failure were NOT executed (STOP)");
  const after = res.gates.filter((g) => g.gate === GATE_SEQUENCE[3] || g.gate === GATE_SEQUENCE[4]);
  check(after.every((g) => g.status === "NOT RUN"), "FAIL: later gates are recorded NOT RUN (never a false DONE)");
  check(res.gates.find((g) => g.gate === failGate)!.status === "FAIL", "FAIL: the failing gate is recorded FAIL");
}

// 3. BLOCKED lot — a lot outside the authorised slice is refused up front ⇒ exit 2, NO gate runs.
{
  const h = harness({});
  const res = runMigrateTs("mission-ledger", h.seams);
  check(res.exitCode === 2 && !res.ok, "BLOCKED: unauthorised lot ⇒ exit 2");
  check(h.calls.length === 0, "BLOCKED: no gate executed for an unauthorised lot");
  check(h.logs.some((l) => /not authorised/.test(l)), "BLOCKED: logs the explicit authorisation refusal");
}

// 4. BLOCKED Truth Lock — an unsafe repo state refuses the run ⇒ exit 2, NO gate runs.
{
  const h = harness({ truthLockOk: false });
  const res = runMigrateTs("validation-engine", h.seams);
  check(res.exitCode === 2 && !res.ok, "BLOCKED: Truth Lock refused ⇒ exit 2");
  check(h.calls.length === 0, "BLOCKED: no gate executed when Truth Lock refuses");
}

// ============================================================================================
// η3-B80 — Truth Lock policy (evaluateTruthLock) over synthetic git states. PURE, deterministic.
// ============================================================================================
console.log("η3-B80 — Truth Lock policy (evaluateTruthLock)");
const ALIGNED: GitState = { isRepo: true, branch: "main", head: "a741285", originMain: "a741285", staged: 0 };

// Baseline — aligned, index empty, (unstaged worktree dirt allowed) ⇒ OK.
{
  const tl = evaluateTruthLock(ALIGNED);
  check(tl.ok && tl.violations.length === 0, "TL aligned (branch main, HEAD==origin/main, index empty) ⇒ ok");
}
// Non-git repo ⇒ refuse.
{
  const tl = evaluateTruthLock({ isRepo: false, branch: "?", head: "?", originMain: null, staged: 0 });
  check(!tl.ok && tl.violations.some((v) => /not a git/.test(v)), "TL non-git repository ⇒ REFUSE");
}
// Unexpected HEAD (diverges from origin/main) ⇒ refuse.
{
  const tl = evaluateTruthLock({ ...ALIGNED, head: "deadbeef", originMain: "a741285" });
  check(!tl.ok && tl.violations.some((v) => /diverges from origin\/main/.test(v)), "TL HEAD ≠ origin/main ⇒ REFUSE");
}
// Unexpected branch ⇒ refuse.
{
  const tl = evaluateTruthLock({ ...ALIGNED, branch: "feature/x" });
  check(!tl.ok && tl.violations.some((v) => /unexpected branch/.test(v)), "TL unexpected branch ⇒ REFUSE");
}
// origin/main unavailable (remote/ref missing) ⇒ refuse.
{
  const tl = evaluateTruthLock({ ...ALIGNED, originMain: null });
  check(!tl.ok && tl.violations.some((v) => /origin\/main unavailable/.test(v)), "TL origin/main unavailable ⇒ REFUSE");
}
// Index modified (staged change) ⇒ refuse.
{
  const tl = evaluateTruthLock({ ...ALIGNED, staged: 3 });
  check(!tl.ok && tl.violations.some((v) => /staged change/.test(v)), "TL staged index ⇒ REFUSE (never incorporate/commit)");
}
// Worktree modified but UNSTAGED + aligned ⇒ ALLOWED (isolated by git-archive; authorised dev not blocked).
{
  // staged=0 models "B78/B79 slice + A2/A3/B49 all unstaged"; the policy ignores unstaged dirt.
  const tl = evaluateTruthLock({ ...ALIGNED, staged: 0 });
  check(tl.ok, "TL unstaged worktree changes (B78 + preexisting) ⇒ ALLOW (candidate excludes them; non-destructive)");
}
// A refused Truth Lock, fed to the orchestrator, triggers NO migration (refusal before any write).
{
  const refused = evaluateTruthLock({ ...ALIGNED, staged: 2 });
  const calls: string[] = [];
  const seams: MigrateSeams = {
    allowedLots: ["validation-engine"],
    truthLock: () => refused,
    gate: (n: string) => { calls.push(n); return { status: "PASS", detail: "should-not-run" }; },
    log: () => {},
  };
  const res = runMigrateTs("validation-engine", seams);
  check(res.exitCode === 2 && calls.length === 0, "TL refused ⇒ orchestrator exit 2 and NO gate ran (no write before refusal)");
}

console.log(failures === 0 ? "ALL PASS — η3-B78/B80 MIGRATE-TS ORCHESTRATOR + TRUTH LOCK" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
