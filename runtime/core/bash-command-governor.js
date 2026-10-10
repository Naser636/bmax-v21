#!/usr/bin/env node

"use strict";

/*
 * Governed Bash / Linux Command capability — the minimum safe contract for encountering an unfamiliar
 * Linux/Bash command WITHOUT turning ODG into unrestricted shell execution.
 *
 * This is NOT a second command engine, capability registry, policy, authority, evidence or recovery
 * system. It is a focused capability IMPLEMENTATION that:
 *   - parses raw shell text into a DISTINCT bounded representation (no full bash parser; dynamic /
 *     unbounded constructs are classified UNKNOWN_EFFECT, never executed);
 *   - resolves identity for an unknown executable (path/realpath/sha256/shebang) — identity, never trust;
 *   - analyses the command into an action class + risk + reversibility + a PREDICTED effect set;
 *   - routes authority/policy/risk through the EXISTING action-gate.js (ALLOW/DENY/ESCALATE, deny-by-
 *     default) — the runtime decides, never the LLM, never the command name, never PATH presence;
 *   - executes ONLY a curated known-safe read-only command, and ONLY inside genuine isolation
 *     (bubblewrap: cleared env / no network / tmpfs work dir / non-privileged user ns / timeout /
 *     argv exec with NO shell), observing the real effect set;
 *   - compares PREDICTED vs OBSERVED effects (EFFECT_DIVERGENCE fails closed);
 *   - records a C03 state_transition (state-transition.js) as machine-traceable evidence.
 *
 * The raw text, the parsed structure, the planned action, the gate decision and the observed effects
 * are kept as DISTINCT fields. Successful execution alone NEVER creates trust: an unknown command can
 * only reach EFFECT_PROFILED (sandbox-observed) and then HUMAN_APPROVAL_REQUIRED.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { evaluateAction, DECISION } = require("./action-gate");
const { computeDifference, validateStateTransition, VERIFICATION_STATUS } = require("./state-transition");

// -- Frozen outcome vocabulary. -----------------------------------------------------------------
const OUTCOME = Object.freeze({
  EXECUTED: "EXECUTED",                         // known-safe read-only, ALLOWed, ran in sandbox, verified
  SANDBOX_OBSERVED: "SANDBOX_OBSERVED",         // unknown command profiled in sandbox (NOT trusted)
  ANALYZED: "ANALYZED",                         // dry-run: parsed + analysed + gate decision, no execution
  BLOCKED: "BLOCKED",                           // unparseable / DENY / dangerous without authority
  HUMAN_APPROVAL_REQUIRED: "HUMAN_APPROVAL_REQUIRED", // ESCALATE / SANDBOX_UNAVAILABLE / secret / profiled
  EFFECT_DIVERGENCE: "EFFECT_DIVERGENCE",       // observed effect set exceeds the declared one
});

// Shell metacharacters / constructs that make a command's effect UNBOUNDED or DYNAMIC. Their presence
// means we refuse to treat the string as a simple argv: it is UNKNOWN_EFFECT (never executed).
const DYNAMIC_CONSTRUCTS = Object.freeze([
  { re: /\$\(|\)/, name: "command-substitution" },
  { re: /`/, name: "backtick-substitution" },
  { re: /\$\{?[A-Za-z_]/, name: "variable-expansion" },
  { re: /[|]/, name: "pipe" },
  { re: /[<>]/, name: "redirection" },
  { re: /(^|\s)(&&|\|\||;|&)(\s|$)/, name: "control-operator-or-background" },
  { re: /[(){}]/, name: "subshell-or-group" },
  { re: /<<|<<-/, name: "heredoc" },
  { re: /[*?]|\[[^\]]*\]/, name: "glob" },
  { re: /~(?=\/|$)/, name: "tilde-expansion" },
  { re: /\\\n/, name: "line-continuation" },
]);

// Commands that must NEVER be auto-trusted even if syntactically simple: they nest shells, change
// identity, or reach the network/host. They are recognised so the analyser can classify them, not run.
const SHELL_ESCALATORS = Object.freeze(["eval", "exec", "source", ".", "bash", "sh", "zsh", "dash", "env", "sudo", "su", "ssh", "scp", "doas", "nohup", "setsid", "xargs", "nice", "timeout", "watch"]);

// Curated catalog. Each entry: actionClass / risk / reversibility / effects. KNOWN-SAFE are read-only,
// no-network, no-secret commands eligible to actually EXECUTE inside the sandbox. DANGEROUS are
// recognised with their real (consequential) class so the gate can DENY/ESCALATE them.
const SAFE_READONLY = Object.freeze({
  ls: 1, cat: 1, echo: 1, printf: 1, pwd: 1, true: 1, false: 1, head: 1, tail: 1, wc: 1,
  date: 1, whoami: 1, id: 1, uname: 1, hostname: 1, basename: 1, dirname: 1, seq: 1,
  sort: 1, uniq: 1, stat: 1, file: 1, realpath: 1, readlink: 1, cut: 1, tr: 1,
  nl: 1, "test": 1, yes: 1, sleep: 1,
});
const DANGEROUS = Object.freeze({
  rm: { actionClass: "DELETE", risk: "HIGH", reversibility: "R4" },
  rmdir: { actionClass: "DELETE", risk: "HIGH", reversibility: "R4" },
  shred: { actionClass: "DELETE", risk: "CRITICAL", reversibility: "R4" },
  dd: { actionClass: "WRITE", risk: "CRITICAL", reversibility: "R4" },
  mkfs: { actionClass: "WRITE", risk: "CRITICAL", reversibility: "R4" },
  mv: { actionClass: "WRITE", risk: "HIGH", reversibility: "R3" },
  cp: { actionClass: "WRITE", risk: "MEDIUM", reversibility: "R2" },
  chmod: { actionClass: "WRITE", risk: "HIGH", reversibility: "R2" },
  chown: { actionClass: "WRITE", risk: "HIGH", reversibility: "R2" },
  ln: { actionClass: "WRITE", risk: "MEDIUM", reversibility: "R2" },
  touch: { actionClass: "WRITE", risk: "LOW", reversibility: "R1" },
  mkdir: { actionClass: "WRITE", risk: "LOW", reversibility: "R1" },
  kill: { actionClass: "WRITE", risk: "HIGH", reversibility: "R3" },
  mount: { actionClass: "WRITE", risk: "CRITICAL", reversibility: "R3" },
  reboot: { actionClass: "IRREVERSIBLE", risk: "CRITICAL", reversibility: "R4" },
  shutdown: { actionClass: "IRREVERSIBLE", risk: "CRITICAL", reversibility: "R4" },
  systemctl: { actionClass: "WRITE", risk: "HIGH", reversibility: "R3" },
  curl: { actionClass: "COMMUNICATE", risk: "HIGH", reversibility: "R2" },
  wget: { actionClass: "COMMUNICATE", risk: "HIGH", reversibility: "R2" },
  nc: { actionClass: "COMMUNICATE", risk: "HIGH", reversibility: "R2" },
  ssh: { actionClass: "COMMUNICATE", risk: "HIGH", reversibility: "R2" },
  apt: { actionClass: "WRITE", risk: "HIGH", reversibility: "R3" },
  "apt-get": { actionClass: "WRITE", risk: "HIGH", reversibility: "R3" },
  pip: { actionClass: "WRITE", risk: "HIGH", reversibility: "R3" },
  npm: { actionClass: "WRITE", risk: "HIGH", reversibility: "R3" },
  git: { actionClass: "WRITE", risk: "MEDIUM", reversibility: "R2" },
});

// Argument tokens that imply access to a secret / credential store.
const SECRET_PATTERNS = Object.freeze([
  /(^|\/)\.ssh(\/|$)/, /id_rsa|id_ed25519|id_ecdsa/, /(^|\/)\.aws(\/|$)/, /credentials?$/i,
  /(^|\/)\.env$/, /\/etc\/shadow/, /\.pem$|\.key$/, /(^|\/)\.netrc$/, /token|secret|password/i,
]);

// ---- 1. PARSE: raw shell text -> bounded parsed representation. --------------------------------
function parse(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: false, raw: text, reason: "empty command", dynamicConstructs: [] };

  const dynamic = DYNAMIC_CONSTRUCTS.filter((c) => c.re.test(text)).map((c) => c.name);
  if (dynamic.length > 0) {
    // A dynamic / unbounded construct: UNKNOWN_EFFECT. Never tokenise into a runnable argv.
    return { ok: false, raw: text, reason: `UNKNOWN_EFFECT: dynamic shell construct(s): ${dynamic.join(", ")}`, dynamicConstructs: dynamic };
  }
  // Simple, bounded tokeniser: whitespace-separated, allowing single/double-quoted LITERAL tokens
  // (no expansion — any `$` / backtick would already have been caught as a dynamic construct).
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  }
  if (tokens.length === 0) return { ok: false, raw: text, reason: "no tokens", dynamicConstructs: [] };
  return { ok: true, raw: text, command: tokens[0], args: tokens.slice(1), tokens, dynamicConstructs: [] };
}

// ---- Identity resolution for an UNKNOWN executable (identity, NOT trust). -----------------------
function resolveIdentity(command, opts) {
  const spawn = (opts && opts.spawn) || spawnSync;
  const out = { command, resolvedPath: null, realpath: null, sha256: null, shebang: null, interpreter: null };
  // `command -v` via argv — NEVER via a shell string.
  const which = spawn("/usr/bin/env", ["sh", "-c", "command -v \"$1\"", "_", command], { encoding: "utf8" });
  // NOTE: the above still uses sh to resolve PATH builtins; acceptable because it runs a FIXED script
  // with the command passed as a positional ARG ($1), never interpolated into the script text.
  const resolved = which && which.status === 0 ? String(which.stdout || "").trim() : null;
  if (!resolved || !resolved.startsWith("/")) return out;
  out.resolvedPath = resolved;
  try { out.realpath = fs.realpathSync(resolved); } catch { out.realpath = resolved; }
  try {
    const buf = fs.readFileSync(out.realpath);
    out.sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    if (buf.length >= 2 && buf[0] === 0x23 && buf[1] === 0x21) {
      const nl = buf.indexOf(0x0a);
      out.shebang = buf.slice(0, nl === -1 ? Math.min(buf.length, 128) : nl).toString("utf8");
      const mi = out.shebang.replace(/^#!\s*/, "").split(/\s+/)[0];
      out.interpreter = mi || null;
    }
  } catch { /* identity partial */ }
  return out;
}

// ---- 2. ANALYSE: parsed -> classification + action class + risk + PREDICTED effect set. --------
function analyze(parsed, opts) {
  const command = parsed.command;
  const secretArgs = (parsed.args || []).filter((a) => SECRET_PATTERNS.some((p) => p.test(a)));
  const touchesSecret = secretArgs.length > 0;

  let classification, actionClass, risk, reversibility;
  if (Object.prototype.hasOwnProperty.call(DANGEROUS, command)) {
    const d = DANGEROUS[command];
    classification = "KNOWN_DANGEROUS";
    actionClass = d.actionClass; risk = d.risk; reversibility = d.reversibility;
  } else if (SHELL_ESCALATORS.includes(command)) {
    // Nested shells / identity changes / network-reachers: recognised, never auto-trusted.
    classification = "SHELL_ESCALATOR";
    actionClass = "COMMUNICATE"; risk = "HIGH"; reversibility = "R3";
  } else if (Object.prototype.hasOwnProperty.call(SAFE_READONLY, command)) {
    classification = "KNOWN_SAFE_READONLY";
    actionClass = touchesSecret ? "READ" : "READ"; risk = touchesSecret ? "HIGH" : "LOW"; reversibility = "R0";
  } else {
    classification = "UNKNOWN";
    actionClass = "ANALYZE"; risk = "MEDIUM"; reversibility = "R1";
  }
  if (touchesSecret && risk !== "CRITICAL") risk = "HIGH"; // secret access always ≥ HIGH ⇒ escalates.

  const identity = classification === "UNKNOWN" ? resolveIdentity(command, opts) : null;

  // PREDICTED effect set (conservative). KNOWN_SAFE_READONLY declares NO filesystem writes and NO
  // network; the sandbox later confirms this and any undeclared write is an EFFECT_DIVERGENCE.
  const predictedEffects = {
    filesWritten: [],
    filesDeleted: [],
    network: classification === "KNOWN_DANGEROUS" && DANGEROUS[command].actionClass === "COMMUNICATE" ? true : classification === "SHELL_ESCALATOR" ? true : false,
    processes: 1,
    secrets: touchesSecret,
    reads: parsed.args ? parsed.args.filter((a) => a.startsWith("/") || a.startsWith("./")) : [],
  };

  return {
    classification, command, args: parsed.args || [], actionClass, risk, reversibility,
    touchesSecret, secretArgs, identity, predictedEffects,
    runnableInSandbox: classification === "KNOWN_SAFE_READONLY" && !touchesSecret,
  };
}

// ---- 3. AUTHORITY / POLICY / RISK: reuse the existing action-gate (deny-by-default). -----------
function buildAction(analysis, request) {
  const auth = request && request.authorization && typeof request.authorization === "object" ? request.authorization : null;
  return {
    principal: (auth && auth.principal) || "odg-runtime",
    verb: analysis.command,
    target: analysis.args.join(" ") || "(no args)",
    actionClass: analysis.actionClass,
    risk: analysis.risk,
    reversibility: analysis.reversibility,
    criticality: analysis.risk,
    // Consequential actions need a contract/policy/authority to be ALLOWed; observational READ/ANALYZE
    // do not. These are supplied ONLY if the request transported them (the runtime never fabricates
    // authority). A HIGH/CRITICAL risk or secret access escalates regardless.
    contract: auth && auth.contract,
    policy: auth && auth.policy,
    authority: auth && auth.authority,
  };
}

// ---- 4. SANDBOX: genuine isolation via bubblewrap. ---------------------------------------------
function detectSandbox(opts) {
  if (opts && typeof opts.sandboxRunner === "function") return { available: true, mechanism: "injected" };
  const spawn = (opts && opts.spawn) || spawnSync;
  const r = spawn("/usr/bin/env", ["sh", "-c", "command -v bwrap"], { encoding: "utf8" });
  const p = r && r.status === 0 ? String(r.stdout || "").trim() : "";
  return p ? { available: true, mechanism: "bubblewrap", path: p } : { available: false, mechanism: null };
}

function snapshotDir(dir) {
  const out = {};
  const walk = (d, rel) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { out[r + "/"] = "dir"; walk(abs, r); }
      else { try { out[r] = fs.statSync(abs).size; } catch { out[r] = -1; } }
    }
  };
  walk(dir, "");
  return out;
}

function diffSnapshots(before, after) {
  const created = Object.keys(after).filter((k) => !(k in before));
  const deleted = Object.keys(before).filter((k) => !(k in after));
  const modified = Object.keys(after).filter((k) => k in before && before[k] !== after[k]);
  return { created, deleted, modified };
}

// Run argv inside bubblewrap: cleared env + allowlist, no network, tmpfs root with a writable work
// dir, non-privileged user ns, timeout, output captured. NEVER a shell string — argv only.
function sandboxRun(argv, opts) {
  const options = opts || {};
  if (typeof options.sandboxRunner === "function") return options.sandboxRunner(argv, options);
  const spawn = options.spawn || spawnSync;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "odg-sbx-"));
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5000;
  const envAllow = Array.isArray(options.envAllowlist) ? options.envAllowlist : [];
  const setenv = [];
  for (const k of envAllow) {
    if (typeof process.env[k] === "string") { setenv.push("--setenv", k, process.env[k]); }
  }
  const bwrapArgs = [
    // --info-fd is an OBSERVED launch handshake: bubblewrap writes JSON (incl. "child-pid") to fd 3
    // ONLY after it has successfully created the namespaces/mounts and is about to exec the child. If
    // the sandbox fails to launch (e.g. nested userns denied), fd 3 stays empty — regardless of the
    // process exit code — which is how we prove isolation was actually achieved (not merely intended).
    "--info-fd", "3",
    "--unshare-all", "--die-with-parent", "--new-session", "--clearenv",
    "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", "/tmp/work",
    "--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp",
    "--bind", work, "/tmp/work", "--chdir", "/tmp/work",
    ...setenv, "--", ...argv,
  ];
  const before = snapshotDir(work);
  // stdio: fd0 ignored, fd1/fd2 captured as stdout/stderr, fd3 captured as the --info-fd handshake.
  const res = spawn("bwrap", bwrapArgs, {
    encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe", "pipe"],
  });
  // OBSERVED launch proof: a non-empty --info-fd payload carrying a child-pid means bubblewrap built
  // the sandbox and exec'd the command. No payload ⇒ the sandbox never launched ⇒ nothing executed.
  const infoRaw = res && Array.isArray(res.output) && typeof res.output[3] === "string" ? res.output[3] : "";
  let launched = false;
  try { launched = !!(infoRaw && JSON.parse(infoRaw)["child-pid"]); } catch { launched = false; }
  const after = snapshotDir(work);
  const fsDiff = diffSnapshots(before, after);
  let cleanupError = null;
  try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { cleanupError = String(e.message || e); }
  const timedOut = !!(res.error && res.error.code === "ETIMEDOUT") || res.signal === "SIGTERM";
  return {
    ran: true,
    launched,
    mechanism: "bubblewrap",
    exitCode: typeof res.status === "number" ? res.status : null,
    signal: res.signal || null,
    timedOut,
    stdout: String(res.stdout || ""),
    stderr: String(res.stderr || ""),
    observedEffects: { filesCreated: fsDiff.created, filesModified: fsDiff.modified, filesDeleted: fsDiff.deleted, network: false },
    // isolation reflects the OBSERVED launch: the network/env guarantees only hold when the sandbox
    // actually launched (launched===true). `launched` is carried so consumers can require observed,
    // not merely declared, isolation.
    isolation: { network: false, envCleared: true, writableRoot: false, nonPrivileged: true, workDir: "/tmp/work", timeoutMs, launched },
    cleanupError,
  };
}

// ---- Secret redaction: scrub any host-secret VALUE from strings written to evidence/logs. --------
function buildRedactor() {
  const values = [];
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string" && v.length >= 6 && /KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|AUTH|PRIVATE/i.test(k)) {
      values.push(v);
    }
  }
  return (s) => {
    let out = typeof s === "string" ? s : "";
    for (const v of values) { if (v) out = out.split(v).join("***REDACTED***"); }
    return out;
  };
}

// ---- 5. GOVERN: the orchestrator. --------------------------------------------------------------
function govern(request, opts) {
  const req = request && typeof request === "object" ? request : {};
  const options = opts || {};
  const redact = buildRedactor();
  const base = {
    capability: "Governed Bash/Linux Command",
    objective: req.objectiveId || null,
    raw: redact(typeof req.command === "string" ? req.command : ""),
    shellExecution: false,          // we NEVER hand the string to a shell; argv only.
    pushed: false, network: false,  // the capability itself contacts no remote; sandbox net is off.
  };

  // 1) PARSE.
  const parsed = parse(req.command);
  base.parsed = parsed.ok
    ? { command: parsed.command, args: parsed.args, dynamicConstructs: [] }
    : { dynamicConstructs: parsed.dynamicConstructs, reason: parsed.reason };
  if (!parsed.ok) {
    // Unparseable / dynamic construct ⇒ UNKNOWN_EFFECT. A dynamic construct is routed to human
    // approval (it may be legitimate but cannot be bounded); a genuinely empty/no-token command is BLOCKED.
    const dyn = parsed.dynamicConstructs && parsed.dynamicConstructs.length > 0;
    return finish(base, {
      outcome: dyn ? OUTCOME.HUMAN_APPROVAL_REQUIRED : OUTCOME.BLOCKED,
      reason: parsed.reason,
      decision: "DENY",
      verification_status: VERIFICATION_STATUS.RECORDED,
    });
  }

  // 2) ANALYSE.
  const analysis = analyze(parsed, options);
  base.analysis = {
    classification: analysis.classification, actionClass: analysis.actionClass, risk: analysis.risk,
    reversibility: analysis.reversibility, touchesSecret: analysis.touchesSecret,
    secretArgs: analysis.secretArgs, predictedEffects: analysis.predictedEffects,
    runnableInSandbox: analysis.runnableInSandbox,
    identity: analysis.identity ? {
      resolvedPath: analysis.identity.resolvedPath, realpath: analysis.identity.realpath,
      sha256: analysis.identity.sha256, shebang: analysis.identity.shebang, interpreter: analysis.identity.interpreter,
    } : null,
  };

  // Secret boundary: declared access to a secret/credential store never auto-runs.
  if (analysis.touchesSecret) {
    return finish(base, {
      outcome: OUTCOME.HUMAN_APPROVAL_REQUIRED,
      reason: `SECRET_BOUNDARY: command accesses a secret/credential path (${analysis.secretArgs.join(", ")})`,
      decision: "ESCALATE", verification_status: VERIFICATION_STATUS.RECORDED,
    });
  }

  // 3) AUTHORITY / POLICY / RISK via the existing action-gate.
  const action = buildAction(analysis, req);
  const gate = evaluateAction(action, { allowedPolicies: req.allowedPolicies, revokedAuthorities: req.revokedAuthorities });
  base.gate = {
    decision: gate.decision, actionClass: gate.actionClass, consequential: gate.consequential,
    violations: gate.violations, escalation: gate.escalation,
  };

  // Dry-run default: parse + analyse + gate decision, NO execution.
  if (req.execute !== true) {
    return finish(base, {
      outcome: OUTCOME.ANALYZED, reason: "dry-run default: analysed, not executed",
      decision: gate.decision, verification_status: VERIFICATION_STATUS.RECORDED,
    });
  }

  // DENY ⇒ BLOCKED. ESCALATE ⇒ HUMAN_APPROVAL_REQUIRED. Only ALLOW proceeds.
  if (gate.decision === DECISION.DENY) {
    return finish(base, { outcome: OUTCOME.BLOCKED, reason: `action-gate DENY: ${gate.violations.join("; ")}`, decision: "DENY", verification_status: VERIFICATION_STATUS.RECORDED });
  }
  if (gate.decision === DECISION.ESCALATE) {
    return finish(base, { outcome: OUTCOME.HUMAN_APPROVAL_REQUIRED, reason: `action-gate ESCALATE: ${gate.escalation.reasons.join("; ")}`, decision: "ESCALATE", verification_status: VERIFICATION_STATUS.RECORDED });
  }

  // Execution is permitted ONLY for a curated known-safe read-only command. Anything else that the gate
  // ALLOWed (e.g. an UNKNOWN observational command) is sandbox-OBSERVED/profiled, never trusted.
  const sandbox = detectSandbox(options);
  if (!sandbox.available) {
    return finish(base, { outcome: OUTCOME.HUMAN_APPROVAL_REQUIRED, reason: "SANDBOX_UNAVAILABLE: no genuine isolation mechanism (bubblewrap) present", decision: gate.decision, verification_status: VERIFICATION_STATUS.RECORDED });
  }

  const argv = [analysis.command, ...analysis.args];
  const run = sandboxRun(argv, {
    spawn: options.spawn, sandboxRunner: options.sandboxRunner,
    timeoutMs: req.timeoutMs, envAllowlist: Array.isArray(req.envAllowlist) ? req.envAllowlist : [],
  });
  base.execution = {
    mechanism: run.mechanism, exitCode: run.exitCode, signal: run.signal, timedOut: run.timedOut,
    stdout: redact(run.stdout).slice(0, 4000), stderr: redact(run.stderr).slice(0, 4000),
    observedEffects: run.observedEffects, isolation: run.isolation,
  };

  // SECURITY (fail-closed): isolation must be OBSERVED, not merely declared. If the sandbox never
  // launched (no bubblewrap --info-fd handshake), the command did NOT execute and no isolation was
  // achieved — it can NEVER be promoted to EXECUTED/VERIFIED. This is distinct from a command that
  // actually ran and returned a non-zero exit code (launched===true), which proceeds below, and from a
  // timeout (launched===true, killed). A generic non-zero exit alone is NOT treated as a launch failure.
  if (run.launched !== true) {
    return finish(base, {
      outcome: OUTCOME.HUMAN_APPROVAL_REQUIRED,
      reason: "SANDBOX_LAUNCH_FAILED: bubblewrap did not create the isolation namespace (no --info-fd handshake); the command was NOT executed and isolation was NOT achieved",
      decision: gate.decision, verification_status: VERIFICATION_STATUS.RECORDED,
    });
  }

  // Resource boundary: a command killed by the timeout exceeded its bound — not a clean execution and
  // never promoted to VERIFIED. It is a governed stop (fail-closed), not a divergence.
  if (run.timedOut) {
    return finish(base, {
      outcome: OUTCOME.BLOCKED,
      reason: `resource boundary exceeded: command exceeded the ${run.isolation ? run.isolation.timeoutMs : "?"}ms timeout and was terminated`,
      decision: gate.decision, verification_status: VERIFICATION_STATUS.RECORDED,
    });
  }

  // UNKNOWN command: profiled only. Successful run NEVER creates trust (stays at EFFECT_PROFILED).
  if (!analysis.runnableInSandbox) {
    return finish(base, {
      outcome: OUTCOME.SANDBOX_OBSERVED,
      trust: "EFFECT_PROFILED",
      reason: "unknown command profiled in sandbox; trust requires human policy review (not granted by execution)",
      decision: gate.decision, verification_status: VERIFICATION_STATUS.RECORDED,
      humanApprovalRequired: true,
    });
  }

  // KNOWN-SAFE path: compare PREDICTED vs OBSERVED effects. A declared read-only command must have
  // created / modified / deleted NOTHING in the sandbox work dir.
  const obs = run.observedEffects;
  const undeclaredWrites = obs.filesCreated.length + obs.filesModified.length + obs.filesDeleted.length;
  if (undeclaredWrites > 0) {
    return finish(base, {
      outcome: OUTCOME.EFFECT_DIVERGENCE,
      reason: `EFFECT_DIVERGENCE: declared read-only but observed ${undeclaredWrites} filesystem change(s): +${obs.filesCreated.join(",")} ~${obs.filesModified.join(",")} -${obs.filesDeleted.join(",")}`,
      decision: gate.decision, verification_status: VERIFICATION_STATUS.REJECTED,
      expected: base.analysis.predictedEffects, observed: obs,
    });
  }

  // VERIFIED governed execution: build a C03 transition as the evidence.
  const stateBefore = { command: analysis.command, executed: false };
  const stateAfter = { command: analysis.command, executed: true, exitCode: run.exitCode };
  const transition = {
    state_before: stateBefore,
    action: { kind: "governed_bash_command", shell: false, mechanism: run.mechanism, argv, isolation: run.isolation },
    observed_effect: { exitCode: run.exitCode, filesystemChanges: undeclaredWrites, network: false, stdoutBytes: Buffer.byteLength(run.stdout) },
    state_after: stateAfter,
    state_version_before: 0, state_version_after: 1,
    difference: computeDifference(stateBefore, stateAfter),
    evidence_refs: ["bash-command-governor"],
    verification_status: VERIFICATION_STATUS.VERIFIED,
  };
  const v = validateStateTransition(transition);
  if (!v.ok) {
    return finish(base, { outcome: OUTCOME.BLOCKED, reason: `C03 self-validation failed: ${v.errors.join("; ")}`, decision: gate.decision, verification_status: VERIFICATION_STATUS.RECORDED });
  }
  return finish(base, {
    outcome: OUTCOME.EXECUTED, reason: "known-safe read-only command executed in genuine isolation; effects matched the declared read-only set",
    decision: gate.decision, verification_status: VERIFICATION_STATUS.VERIFIED,
    state_transition: transition, expected: base.analysis.predictedEffects, observed: obs,
  });
}

function finish(base, extra) {
  return Object.assign(base, { state_transition: null, humanApprovalRequired: extra.outcome === OUTCOME.HUMAN_APPROVAL_REQUIRED }, extra);
}

module.exports = {
  govern, parse, analyze, resolveIdentity, buildAction, detectSandbox, sandboxRun,
  OUTCOME, SAFE_READONLY, DANGEROUS, DYNAMIC_CONSTRUCTS,
};

// Read-only CLI: print the capability contract descriptor; mutates nothing, contacts no network.
if (require.main === module) {
  process.stdout.write(JSON.stringify({
    capability: "Governed Bash/Linux Command",
    contract: "RAW -> PARSED -> ACTION -> CAPABILITY -> EFFECT/RISK -> AUTHORITY/POLICY -> SANDBOX/GOVERNED -> OBSERVED -> VERIFY -> EVIDENCE",
    guarantees: ["no-raw-shell-exec (argv only)", "deny-by-default (action-gate)", "genuine-isolation (bubblewrap: no-net/cleared-env/tmpfs/non-priv)", "predicted-vs-observed effects", "secrets-denied", "identity-not-trust", "dry-run-default", "C03-validated"],
    outcomes: Object.values(OUTCOME),
  }, null, 2) + "\n");
}
