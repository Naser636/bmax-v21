#!/usr/bin/env node

/* Governed Bash/Linux Command — behavioural test.
 *
 * Exercises the full governed contract: parse (bounded; dynamic constructs → UNKNOWN_EFFECT), identity
 * resolution for an unknown executable, action-gate authority/policy/risk (deny-by-default), GENUINE
 * isolation via bubblewrap (real execution: network off, env cleared, secrets denied, timeout,
 * ephemeral work dir), PREDICTED-vs-OBSERVED effect divergence, secret-boundary rejection, non-
 * idempotent no-retry, the C03 record, and the full path through the real capability registry + probe.
 * Execution cases run REAL bwrap; pure cases need no sandbox. State changes stay inside the sandbox. */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const engine = require(path.resolve(__dirname, "bash-command-governor.js"));
const O = engine.OUTCOME;

// Is real bubblewrap usable here? (All execution assertions are guarded on this; pure/injected ones run
// unconditionally so the suite is meaningful even without bwrap.)
const BWRAP = (() => {
  const r = spawnSync("sh", ["-c", "command -v bwrap"], { encoding: "utf8" });
  if (r.status !== 0 || !String(r.stdout).trim()) return false;
  const t = spawnSync("bwrap", ["--unshare-all", "--die-with-parent", "--ro-bind", "/", "/", "--tmpfs", "/tmp", "--chdir", "/tmp", "--", "/bin/true"], { encoding: "utf8" });
  return t.status === 0;
})();
console.log(BWRAP ? "  (real bubblewrap available — execution cases run live)" : "  (bubblewrap unavailable — execution cases skipped)");

// ---- 1. PARSE: dynamic/unbounded constructs are UNKNOWN_EFFECT (never a runnable argv). ---------
(function parseConstructs() {
  ok("simple command parses to argv", (() => { const p = engine.parse("ls -la /etc"); return p.ok && p.command === "ls" && p.args.length === 2; })());
  ok("quoted literal arg parses", (() => { const p = engine.parse('echo "hello world"'); return p.ok && p.args[0] === "hello world"; })());
  const dyn = [
    ["pipe", "ls | wc -l"], ["redirection", "echo hi > f"], ["command-substitution", "echo $(whoami)"],
    ["backtick-substitution", "echo `id`"], ["variable-expansion", "echo $HOME"],
    ["control-operator-or-background", "a && b"], ["subshell-or-group", "(ls)"], ["glob", "rm *.txt"],
  ];
  for (const [name, cmd] of dyn) {
    const p = engine.parse(cmd);
    ok(`parse flags ${name} as UNKNOWN_EFFECT`, !p.ok && p.dynamicConstructs.includes(name));
  }
})();

// ---- 2. ANALYSE + IDENTITY: unknown executable is resolved (identity), never trusted. ----------
(function analyseIdentity() {
  const safe = engine.analyze(engine.parse("echo hi"), {});
  ok("echo classified KNOWN_SAFE_READONLY + runnable", safe.classification === "KNOWN_SAFE_READONLY" && safe.runnableInSandbox === true);
  const danger = engine.analyze(engine.parse("rm -rf /data"), {});
  ok("rm classified KNOWN_DANGEROUS DELETE R4 HIGH", danger.classification === "KNOWN_DANGEROUS" && danger.actionClass === "DELETE" && danger.reversibility === "R4");
  // An unknown-but-present executable: resolve identity (path/sha256), NOT in a trust catalog.
  const id = engine.resolveIdentity("md5sum", {});
  ok("identity resolves path + sha256 for an unknown executable", !!id.resolvedPath && /^[0-9a-f]{64}$/.test(id.sha256 || ""));
  const unk = engine.analyze(engine.parse("md5sum /etc/hostname"), {});
  ok("unknown executable classified UNKNOWN, not runnable (no auto-trust)", unk.classification === "UNKNOWN" && unk.runnableInSandbox === false && !!unk.identity.sha256);
})();

// ---- 3. AUTHORITY/POLICY/RISK via the real action-gate (deny-by-default). ----------------------
(function gateDecisions() {
  // Dangerous consequential command with NO authority → DENY (dry-run reports the decision).
  const rm = engine.govern({ command: "rm -rf /data" }, {});
  ok("dangerous command → gate DENY in dry-run", rm.gate.decision === "DENY" && rm.outcome === O.ANALYZED);
  // Network command → COMMUNICATE consequential, no authority → DENY; predicted network=true.
  const curl = engine.govern({ command: "curl http://example.com" }, {});
  ok("network command → DENY + predicted network effect", curl.gate.decision === "DENY" && curl.analysis.predictedEffects.network === true);
  // Nested shell / escalator → consequential + deny-by-default (no authority, no valid C03 state) → DENY.
  const evalNoAuth = engine.govern({ command: "eval ls" }, {});
  ok("eval (shell escalator) → gate DENY (deny-by-default)", evalNoAuth.gate.decision === "DENY");
  // The ESCALATE dimension the governor relies on is the reused action-gate: a fully-admissible but
  // HIGH-risk / R3 action escalates to human authority. Proven directly against the shared gate.
  const { evaluateAction } = require("./action-gate");
  const esc = evaluateAction(
    { principal: "p", verb: "do", target: "t", actionClass: "WRITE", risk: "HIGH", reversibility: "R3",
      contract: { id: "c" }, policy: "p", authority: { id: "a" },
      expectedTransition: { state_before: { x: 0 }, action: "a", observed_effect: "e", state_after: { x: 1 },
        state_version_before: 0, state_version_after: 1, difference: { x: { before: 0, after: 1 } },
        evidence_refs: ["r"], verification_status: "RECORDED" } },
    {},
  );
  ok("reused action-gate ESCALATES an admissible HIGH-risk/R3 action to human", esc.decision === "ESCALATE");
  // Safe read-only observational → ALLOW without any authority.
  const echo = engine.govern({ command: "echo hi" }, {});
  ok("safe read-only → gate ALLOW (observational, no authority needed)", echo.gate.decision === "ALLOW");
})();

// ---- 4. SECRET BOUNDARY: credential-store access is rejected (even dry-run). --------------------
(function secretBoundary() {
  const shadow = engine.govern({ command: "cat /etc/shadow" }, {});
  ok("cat /etc/shadow → HUMAN_APPROVAL_REQUIRED (SECRET_BOUNDARY)", shadow.outcome === O.HUMAN_APPROVAL_REQUIRED && /SECRET_BOUNDARY/.test(shadow.reason));
  const ssh = engine.govern({ command: "cat /home/u/.ssh/id_rsa" }, {});
  ok("reading an ssh private key → SECRET_BOUNDARY", ssh.outcome === O.HUMAN_APPROVAL_REQUIRED && ssh.analysis.touchesSecret === true);
})();

// ---- 5. DRY-RUN DEFAULT: analyse, no execution. ------------------------------------------------
(function dryRunDefault() {
  let ran = 0;
  const ev = engine.govern({ command: "echo hi" }, { sandboxRunner: () => { ran++; return {}; } });
  ok("dry-run default does NOT execute", ev.outcome === O.ANALYZED && ran === 0);
})();

// ---- 6. NON-IDEMPOTENT NO-RETRY: a dangerous command is never executed, let alone retried. ------
(function noRetryNonIdempotent() {
  let ran = 0;
  const ev = engine.govern({ command: "rm -rf /data", execute: true }, { sandboxRunner: () => { ran++; return {}; } });
  ok("non-idempotent dangerous command BLOCKED with ZERO executions (no retry)", ev.outcome === O.BLOCKED && ran === 0);
})();

// ---- 7. SANDBOX_UNAVAILABLE → HUMAN_APPROVAL_REQUIRED (honest; never a false SANDBOXED claim). --
(function sandboxUnavailable() {
  const noBwrap = (cmd, args) => ({ status: 1, stdout: "", stderr: "" }); // `command -v bwrap` fails
  const ev = engine.govern({ command: "echo hi", execute: true }, { spawn: noBwrap });
  ok("no isolation mechanism → HUMAN_APPROVAL_REQUIRED (SANDBOX_UNAVAILABLE)", ev.outcome === O.HUMAN_APPROVAL_REQUIRED && /SANDBOX_UNAVAILABLE/.test(ev.reason));
})();

// ---- 8. EFFECT DIVERGENCE: a declared read-only command that writes is REJECTED. ---------------
(function effectDivergence() {
  const lyingRunner = () => ({
    ran: true, launched: true, mechanism: "bubblewrap", exitCode: 0, signal: null, timedOut: false, stdout: "", stderr: "",
    observedEffects: { filesCreated: ["sneaky.txt"], filesModified: [], filesDeleted: [], network: false },
    isolation: { network: false, envCleared: true, timeoutMs: 5000, launched: true },
  });
  const ev = engine.govern({ command: "echo hi", execute: true }, { sandboxRunner: lyingRunner });
  ok("undeclared filesystem write → EFFECT_DIVERGENCE + REJECTED", ev.outcome === O.EFFECT_DIVERGENCE && ev.verification_status === "REJECTED");
  ok("divergence records expected vs observed", ev.expected.filesWritten.length === 0 && ev.observed.filesCreated.includes("sneaky.txt"));
})();

// ---- 9. GENUINE ISOLATION (real bwrap): env cleared, secrets denied, network off, env allowlist. -
(function realIsolation() {
  if (!BWRAP) return;
  process.env.ODG_TEST_SECRET_TOKEN = "supersecretvalue123";
  process.env.ODG_TEST_ALLOWED = "allowed-value";
  // printenv is NOT cataloged as runnable; call sandboxRun directly to inspect the environment boundary.
  const withAllow = engine.sandboxRun(["printenv"], { envAllowlist: ["ODG_TEST_ALLOWED"] });
  ok("sandbox env is cleared (no host env leaks)", !/supersecretvalue123/.test(withAllow.stdout));
  ok("sandbox passes ONLY the explicit allowlist", /allowed-value/.test(withAllow.stdout) && !/ODG_TEST_SECRET_TOKEN/.test(withAllow.stdout));
  ok("sandbox reports network disabled", withAllow.observedEffects.network === false && withAllow.isolation.network === false);
  const netTry = engine.sandboxRun(["getent", "hosts", "github.com"], {});
  ok("network is genuinely unavailable in the sandbox (getent non-zero)", netTry.exitCode !== 0);
  delete process.env.ODG_TEST_SECRET_TOKEN; delete process.env.ODG_TEST_ALLOWED;
})();

// ---- 10. REAL EXECUTION of a known-safe command → EXECUTED + VERIFIED C03. ----------------------
(function realExecute() {
  if (!BWRAP) return;
  const ev = engine.govern({ command: "echo governed-hello", execute: true }, {});
  ok("known-safe command EXECUTED in real isolation", ev.outcome === O.EXECUTED && ev.execution.exitCode === 0);
  ok("stdout captured", /governed-hello/.test(ev.execution.stdout));
  ok("no filesystem divergence (read-only honoured)", ev.observed.filesCreated.length === 0);
  ok("EXECUTED carries a VALID VERIFIED C03 transition", (() => {
    const st = require("./state-transition").validateStateTransition(ev.state_transition);
    return st.ok && ev.state_transition.verification_status === "VERIFIED";
  })());
  ok("evidence asserts no raw shell execution", ev.shellExecution === false);
})();

// ---- 11. TIMEOUT / RESOURCE BOUNDARY (real bwrap): a long command is terminated and BLOCKED. -----
(function timeoutBoundary() {
  if (!BWRAP) return;
  const ev = engine.govern({ command: "sleep 5", execute: true, timeoutMs: 700 }, {});
  ok("command exceeding the timeout → BLOCKED (resource boundary)", ev.outcome === O.BLOCKED && /resource boundary/.test(ev.reason));
})();

// ---- 12. UNKNOWN command sandbox-observed (real bwrap): profiled, trust WITHHELD. ---------------
(function unknownProfiled() {
  if (!BWRAP) return;
  const ev = engine.govern({ command: "md5sum /etc/hostname", execute: true }, {});
  ok("unknown command → SANDBOX_OBSERVED (profiled, not executed-as-trusted)", ev.outcome === O.SANDBOX_OBSERVED);
  ok("unknown profiling withholds trust (human approval required)", ev.humanApprovalRequired === true);
  ok("unknown profiling ran in network-off isolation", ev.execution.isolation.network === false);
})();

// ---- 13. Full path through the REAL capability registry + probe. -------------------------------
(function throughRegistryAndProbe() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "bash-reg-"));
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    delete require.cache[require.resolve("./capability-executors")];
    delete require.cache[require.resolve("./capability-probes")];
    const capExec = require("./capability-executors");
    const capProbes = require("./capability-probes");

    ok("registry does not hijack a foreign objective", capExec.resolve({ objectiveId: "NOT_BASH" }) === null);
    const executor = capExec.resolve({ objectiveId: "BASH_COMMAND_1", bash_command: { command: "echo via-registry", execute: true } });
    ok("registry routes BASH_COMMAND_* to the capability", executor && executor.capability === "Governed Bash/Linux Command");

    // run() returns on a governed execution, but STOPs (throws) on a governed stop — incl. the
    // fail-closed SANDBOX_LAUNCH_FAILED when real isolation is unavailable. Capture both honestly.
    let result = null, runErr = null;
    try { result = executor.run(); } catch (e) { runErr = e; }
    const verdict = capProbes.runProbe("bash-command-governed", {});
    if (BWRAP) {
      ok("executor writes evidence artifact", result && typeof result.evidence === "string" && fs.existsSync(result.evidence));
      ok("probe PASSES on a real governed execution", verdict.ok === true);
    } else {
      // No real isolation: the sandbox cannot launch, so the governor fail-closes and the executor
      // STOPs with SANDBOX_LAUNCH_FAILED — it NEVER fabricates a governed-execution success.
      ok("no real isolation ⇒ executor STOPs (SANDBOX_LAUNCH_FAILED), never a false EXECUTED",
        !!runErr && /SANDBOX_LAUNCH_FAILED/.test(String(runErr && runErr.message)));
      ok("probe honestly fails without real isolation (no false pass)", verdict.ok === false);
    }

    // A governed refusal does NOT satisfy the proof (dangerous command blocked → probe fails).
    try { capExec.resolve({ objectiveId: "BASH_COMMAND_2", bash_command: { command: "rm -rf /x", execute: true } }).run(); } catch { /* throws by design */ }
    const refusal = capProbes.runProbe("bash-command-governed", {});
    ok("probe FAILS on a governed refusal (BLOCKED is not a governed execution)", refusal.ok === false);
  } finally {
    process.chdir(prev);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
})();

// ---- 5. ISOLATION FAIL-CLOSED: a failed sandbox LAUNCH must never be recorded as EXECUTED/VERIFIED.
// Regression for the governed-bash false-pass: `sandboxRun` reports `launched` from the real bwrap
// --info-fd handshake; `govern` promotes to EXECUTED ONLY when the sandbox actually launched. These
// cases drive the known-safe execute path through the existing `sandboxRunner` injection seam (no real
// bwrap needed), so they are deterministic regardless of whether nested bubblewrap is available here.
(function isolationFailClosed() {
  const baseEffects = { filesCreated: [], filesModified: [], filesDeleted: [], network: false };
  const mkRun = (o) => Object.assign({
    ran: true, mechanism: "bubblewrap", signal: null, timedOut: false, stdout: "", stderr: "",
    observedEffects: baseEffects,
    isolation: { network: false, envCleared: true, writableRoot: false, nonPrivileged: true, workDir: "/tmp/work", timeoutMs: 5000 },
  }, o);
  const govern = (run) => engine.govern({ command: "echo ok", execute: true }, { sandboxRunner: () => run });

  // Case A — sandbox LAUNCH FAILURE (nested userns denied): no --info-fd handshake, command never ran.
  const a = govern(mkRun({ launched: false, exitCode: 1, stderr: "bwrap: No permissions to create a new namespace, likely because the kernel does not allow non-privileged user namespaces." }));
  ok("A: launch failure is NOT EXECUTED", a.outcome !== O.EXECUTED);
  ok("A: launch failure is NOT VERIFIED", a.verification_status !== "VERIFIED");
  ok("A: reason identifies sandbox launch failure", /SANDBOX_LAUNCH_FAILED/.test(String(a.reason)));
  ok("A: no C03 VERIFIED success evidence emitted", !a.state_transition || a.state_transition.verification_status !== "VERIFIED");

  // Case B — genuine successful launch still produces a valid EXECUTED result.
  const b = govern(mkRun({ launched: true, exitCode: 0, stdout: "ok\n" }));
  ok("B: successful launch ⇒ EXECUTED", b.outcome === O.EXECUTED);
  ok("B: successful launch ⇒ VERIFIED", b.verification_status === "VERIFIED");

  // Case C — command that ACTUALLY RAN (launched) but returned non-zero is NOT a launch failure.
  const c = govern(mkRun({ launched: true, exitCode: 7, stderr: "boom" }));
  ok("C: ran-nonzero is NOT reclassified as launch failure", !/SANDBOX_LAUNCH_FAILED/.test(String(c.reason || "")));
  ok("C: ran-nonzero preserved its real exit code in evidence", c.execution && c.execution.exitCode === 7);
})();

console.log(`\nGOVERNED BASH/LINUX COMMAND — ${passed} assertions passed.`);
