#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

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

// ---- 6b. PATH-FORM BYPASS (regression): a path-qualified dangerous command must classify + deny EXACTLY like the
// bare name — writing `/bin/rm`/`/usr/bin/shred`/`./rm` must not evade the deny-by-default DELETE classification. ----
(function pathFormDangerousClassification() {
  for (const cmd of ["/bin/rm -rf /data", "/usr/bin/shred x", "./rm -rf /data"]) {
    const a = engine.analyze(engine.parse(cmd), {});
    ok(`path-form '${cmd.split(" ")[0]}' classified KNOWN_DANGEROUS (basename-normalized, not UNKNOWN)`, a.classification === "KNOWN_DANGEROUS");
    const dry = engine.govern({ command: cmd }, {});
    ok(`path-form '${cmd.split(" ")[0]}' → gate DENY (bypass closed)`, dry.gate.decision === "DENY");
    let ran = 0;
    const live = engine.govern({ command: cmd, execute: true }, { sandboxRunner: () => { ran++; return { launched: true, exitCode: 0 }; } });
    ok(`path-form '${cmd.split(" ")[0]}' BLOCKED with ZERO executions (no sandbox run)`, live.outcome === O.BLOCKED && ran === 0);
  }
  // Path-form escalator (nested shell / sudo) must also deny by basename.
  ok("path-form '/usr/bin/sudo' → SHELL_ESCALATOR DENY", engine.govern({ command: "/usr/bin/sudo whoami" }, {}).gate.decision === "DENY");
})();

// ---- 7. SANDBOX_UNAVAILABLE → HUMAN_APPROVAL_REQUIRED (honest; never a false SANDBOXED claim). --
(function sandboxUnavailable() {
  const noBwrap = (cmd, args) => ({ status: 1, stdout: "", stderr: "" }); // `command -v bwrap` fails
  const ev = engine.govern({ command: "echo hi", execute: true }, { spawn: noBwrap });
  ok("no isolation mechanism → HUMAN_APPROVAL_REQUIRED (SANDBOX_UNAVAILABLE)", ev.outcome === O.HUMAN_APPROVAL_REQUIRED && /SANDBOX_UNAVAILABLE/.test(ev.reason));
  // Fail-closed proof (host-independent, deterministic via the injected no-bwrap spawn): with no genuine
  // isolation the command is NEVER executed — no execution record is produced and the outcome is never
  // promoted to EXECUTED/VERIFIED. This locks the security property on EVERY host (incl. a CI runner that
  // happens to have — or lack — bubblewrap), proving "bubblewrap absent ⇒ no unisolated execution".
  ok("SANDBOX_UNAVAILABLE ⇒ nothing executed (no execution record, never EXECUTED/VERIFIED)",
    !ev.execution && ev.outcome !== O.EXECUTED && ev.verification_status !== "VERIFIED");
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
  // TRACEABILITY (OWASP T8 / NIST MEASURE-4): EXECUTED evidence is provenance-stamped and tamper-evident.
  const ep = require("./evidence-provenance");
  ok("EXECUTED transition is provenance-stamped (source-bound)", (() => {
    const p = ev.state_transition.provenance;
    return !!p && p.schema === ep.SCHEMA && typeof p.contentSha256 === "string" && p.contentSha256.length === 64;
  })());
  ok("stamped EXECUTED evidence verifies clean", ep.verifyProvenance(ev.state_transition).ok === true);
  ok("tampering the EXECUTED evidence is DETECTED", (() => {
    const mutated = { ...ev.state_transition, observed_effect: { ...ev.state_transition.observed_effect, exitCode: 999 } };
    return ep.verifyProvenance(mutated).ok === false;
  })());
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
      // No usable real isolation. The BWRAP probe above is false in two distinct, both-fail-closed cases:
      //   (a) the bwrap BINARY IS ABSENT (e.g. a clean CI runner) ⇒ the governor stops with
      //       SANDBOX_UNAVAILABLE, detected BEFORE any launch — the command is never executed; or
      //   (b) bwrap is present but cannot create the namespace ⇒ SANDBOX_LAUNCH_FAILED (no --info-fd
      //       handshake) — again the command is never executed.
      // Both are governed STOPs the executor surfaces by throwing, and NEITHER is ever a false EXECUTED.
      // (Asserting only SANDBOX_LAUNCH_FAILED here was a defect: it conflated "bubblewrap absent" with a
      // real isolation-launch failure, so the suite failed on any host without bwrap.)
      ok("no real isolation ⇒ executor STOPs (SANDBOX_UNAVAILABLE | SANDBOX_LAUNCH_FAILED), never a false EXECUTED",
        !!runErr && /SANDBOX_(UNAVAILABLE|LAUNCH_FAILED)/.test(String(runErr && runErr.message)));
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

// --- TRUST-GAP-3: cross-mission + expiry DENY are NO LONGER INERT on the governor path ----------------
// govern now threads `now` (always) + `missionId` (when supplied) into the action-gate ctx, so an EXPIRED
// or CROSS-MISSION authority stamped on the request is denied (previously the checks never fired here).
(function trustGap3() {
  const grant = (over: any) => ({ command: "wget http://example.test/x", execute: false,
    authorization: { contract: { id: "c" }, policy: "p", authority: { id: "a", ...over } } });
  // A valid (non-expired, no mission) authority on a consequential network command ⇒ authority check PASSES
  // (no expiry/cross-mission violation) — baseline that the threading did not over-deny.
  const okGate = engine.govern(grant({ expiresAt: Date.now() + 3600_000 }), { now: Date.now() }).gate;
  ok("TRUST-GAP-3 baseline: valid (future-expiry) authority ⇒ no expiry/cross-mission violation",
    !/(expired|cross-mission)/.test((okGate.violations || []).join(" ")));
  // EXPIRED authority ⇒ the gate now DENIES with an 'expired' violation (was inert without `now`).
  const expired = engine.govern(grant({ expiresAt: Date.now() - 1000 }), { now: Date.now() }).gate;
  ok("TRUST-GAP-3: an EXPIRED authority is DENIED (expiry check fires via threaded now)",
    expired.decision === "DENY" && /expired/.test((expired.violations || []).join(" ")));
  // CROSS-MISSION authority (stamped for OTHER) vs current mission ⇒ DENIED (was inert without missionId).
  const cross = engine.govern(grant({ mission: "OTHER_MISSION" }), { now: Date.now(), missionId: "CURRENT_MISSION" }).gate;
  ok("TRUST-GAP-3: a CROSS-MISSION authority is DENIED (cross-mission check fires via threaded missionId)",
    cross.decision === "DENY" && /cross-mission/.test((cross.violations || []).join(" ")));
})();

// ---- FILESYSTEM CONFINEMENT: an allowlisted read command must NOT read arbitrary host files (fixes an audited
// CRITICAL — the sandbox used to `--ro-bind / /`, making every read command a host-wide read oracle). These run the
// REAL bwrap sandbox; skip only if bubblewrap is unavailable on the host (never silently pass as confined).
(function fsConfinement() {
  const sb = engine.detectSandbox({});
  if (!sb || !sb.available) { console.log("##CLASS: BLOCKED_BY_ISOLATION bubblewrap unavailable — fs-confinement asserts need the real sandbox; control NOT exercised ⇒ BLOCKED, never a silent PASS"); return; }
  // /etc/passwd is NOT in SECRET_PATTERNS, so it reaches execution — with the fix its content must be unreadable
  // inside the sandbox (/etc not bound), proven by a non-zero exit and NO passwd content in stdout.
  const passwd = engine.govern({ command: "cat /etc/passwd", execute: true }, {});
  ok("confinement: `cat /etc/passwd` does NOT leak host content (exit!=0, no root:x:0:0)",
    passwd.outcome === O.EXECUTED && (passwd.execution || {}).exitCode !== 0 && !/root:.*:0:0:/.test(String((passwd.execution || {}).stdout || "")));
  // /etc/hostname has no secret-keyword to trigger the blocklist — it, too, must be unreadable now.
  const host = engine.govern({ command: "cat /etc/hostname", execute: true }, {});
  ok("confinement: `cat /etc/hostname` does NOT leak the host name (no bound /etc)",
    (host.execution || {}).exitCode !== 0 && String((host.execution || {}).stdout || "").trim() === "");
  // A read of the mission's OWN repo (absolute path, process.cwd() bound ro) still works — not over-blocked.
  const repoFile = path.join(process.cwd(), "package.json");
  const repoRead = engine.govern({ command: "wc -l " + repoFile, execute: true }, {});
  ok("confinement: an absolute read inside the repo (process.cwd()) still succeeds (not over-blocked)",
    repoRead.outcome === O.EXECUTED && (repoRead.execution || {}).exitCode === 0);
  // System code dirs stay readable so command binaries/libs resolve (not confidential). Probe /usr/bin/env — a
  // coreutils binary guaranteed present under the bound /usr on every host (unlike /usr/bin/node, which is ABSENT on
  // runners that install node elsewhere, e.g. GitHub Actions /opt/hostedtoolcache — that made this assert a false
  // confinement failure, not a real one). env is already this suite's portable shell entrypoint.
  const sys = engine.govern({ command: "stat /usr/bin/env", execute: true }, {});
  ok("confinement: system code dirs (/usr) remain readable (commands still run)", (sys.execution || {}).exitCode === 0);
  // /proc ENV ISOLATION (fixes an audited leak): PID 1 in the sandbox namespace must NOT carry the governor process's
  // host env. `--clearenv` only scrubs the child; bwrap's own process/monitor is cleared by spawning bwrap with a
  // cleared env + --as-pid-1. A governed `cat /proc/1/environ` must expose ONLY the sandbox env (PATH/HOME/PWD),
  // never a host secret. NUL-delimited ⇒ normalize to spaces before matching. Non-vacuous: leaks on the pre-fix spawn.
  const proc1 = engine.govern({ command: "cat /proc/1/environ", execute: true }, {});
  const proc1out = String((proc1.execution || {}).stdout || "").replace(/\0/g, " ");
  ok("confinement: /proc/1/environ exposes NO host env (no API key / SSH_CLIENT / session id)",
    !/ANTHROPIC_API_KEY=sk|SSH_CLIENT=|CLAUDE_CODE_SESSION_ID=|ANTHROPIC_API_KEY=[^*\s]/.test(proc1out));
  const procSelf = engine.govern({ command: "cat /proc/self/environ", execute: true }, {});
  ok("confinement: /proc/self/environ carries only the cleared sandbox env",
    !/ANTHROPIC_API_KEY=sk|SSH_CLIENT=/.test(String((procSelf.execution || {}).stdout || "").replace(/\0/g, " ")));
})();

console.log(`\nGOVERNED BASH/LINUX COMMAND — ${passed} assertions passed.`);
