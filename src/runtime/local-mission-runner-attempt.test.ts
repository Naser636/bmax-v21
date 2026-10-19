/*
 * LOCAL route → attempt-level SLO telemetry seam. Proves the runner records EVERY run's honest outcome
 * (success AND failure) to the attempt recorder — the denominator source the proven-only ledger cannot be.
 * Side-effect-free: injects a spy recorder (4th positional seam); no real attempt-log file is written.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/local-mission-runner-attempt.test.ts
 */
import { LocalMissionRunner } from "./local-mission-runner";
import { RuntimeKernel } from "./runtime-kernel";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) { console.log(`  PASS ${label}`); } else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOCAL route → ATTEMPT-LEVEL SLO TELEMETRY (seam)");

// A — a validated run records a RECORDED attempt (validated=true) exactly once.
{
  const attempts: Array<{ m: string; v: boolean; s: string }> = [];
  const ledgerSpy = () => ({ skipped: false });
  const attemptSpy = (m: string, v: boolean, s: string) => { attempts.push({ m, v, s }); };
  const out = new LocalMissionRunner(undefined, undefined, ledgerSpy, attemptSpy).run("M0000");
  check(out.ok === true && out.validated === true, "M0000 LOCAL execution validated");
  check(attempts.length === 1, "attempt recorder called exactly once");
  check(attempts[0]?.m === "M0000" && attempts[0]?.v === true && attempts[0]?.s === "SUCCESS", "attempt recorded (M0000, validated=true, SUCCESS)");
}

// B — a FAILED run STILL records an attempt with validated=false (failures ARE representable — the whole point).
{
  const attempts: Array<{ m: string; v: boolean; s: string }> = [];
  const ledgerSpy = () => { /* proven-only gate would refuse; irrelevant to the attempt log */ };
  const attemptSpy = (m: string, v: boolean, s: string) => { attempts.push({ m, v, s }); };
  const failingKernel = { execute: () => ({ report: { status: "FAILED" } }) } as unknown as RuntimeKernel;
  const out = new LocalMissionRunner(undefined, failingKernel, ledgerSpy, attemptSpy).run("M0000");
  check(out.validated === false, "FAILED reporter status ⇒ validated=false");
  check(attempts.length === 1 && attempts[0].v === false && attempts[0].s === "FAILED", "FAILURE recorded as an attempt (validated=false, FAILED) — denominator can represent failures");
}

// C — ledger and attempt recorders are INDEPENDENT seams (attempt fires even if the ledger refuses).
{
  let ledgerCalls = 0, attemptCalls = 0;
  const ledgerSpy = () => { ledgerCalls++; return { skipped: true, reason: "UNPROVEN" }; };
  const attemptSpy = () => { attemptCalls++; };
  new LocalMissionRunner(undefined, undefined, ledgerSpy, attemptSpy).run("M0000");
  check(ledgerCalls === 1 && attemptCalls === 1, "both seams fire once; attempt not gated by the ledger's refusal");
}

// D — real timing: an injected clock yields startedAt < endedAt on the SAME run, passed to the recorder.
{
  const seen: Array<{ m: string; v: boolean; s: string; t?: { startedAt?: string; endedAt?: string; category?: string } }> = [];
  const ledgerSpy = () => ({ skipped: false });
  const attemptSpy = (m: string, v: boolean, s: string, t?: { startedAt?: string; endedAt?: string; category?: string }) => { seen.push({ m, v, s, t }); };
  // Deterministic clock: start then end (ordered, distinct).
  const stamps = ["2026-10-19T12:00:00.000Z", "2026-10-19T12:00:03.000Z"];
  let i = 0;
  const clock = () => stamps[Math.min(i++, stamps.length - 1)];
  const out = new LocalMissionRunner(undefined, undefined, ledgerSpy, attemptSpy, clock).run("M0000");
  check(out.ok === true, "M0000 run ok with injected clock");
  check(seen.length === 1 && seen[0].t?.startedAt === stamps[0] && seen[0].t?.endedAt === stamps[1], "attempt carries real ordered start/end from the injected clock");
}

// E — a THROW during execution still records exactly ONE attempt (ERROR), and the ledger is NOT called.
{
  let ledgerCalls = 0;
  const attempts: Array<{ v: boolean; s: string }> = [];
  const ledgerSpy = () => { ledgerCalls++; };
  const attemptSpy = (_m: string, v: boolean, s: string) => { attempts.push({ v, s }); };
  const throwingKernel = { execute: () => { throw new Error("boom"); } } as unknown as RuntimeKernel;
  const out = new LocalMissionRunner(undefined, throwingKernel, ledgerSpy, attemptSpy).run("M0000") as { ok?: boolean; error?: string };
  check(out.ok === false && /boom/.test(out.error ?? ""), "throwing execution ⇒ ok:false, error propagated");
  check(attempts.length === 1 && attempts[0].v === false && attempts[0].s === "ERROR", "throw recorded as exactly ONE attempt (validated=false, ERROR)");
  check(ledgerCalls === 0, "ledger NOT called on a throw (proven-only invariant preserved)");
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS — local-mission-runner attempt-telemetry seam");
if (failures) process.exit(1);
