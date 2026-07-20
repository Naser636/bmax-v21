#!/usr/bin/env node

// Fleet Bridge : the missing autonomous link between the ODG Runtime and
// Claude Code.
//
// It watches the request mailbox produced by fleet-dispatcher.js, invokes
// Claude Code for each new PENDING request exactly once, and writes a valid
// response envelope that fleet-collector.js already knows how to consume.
//
// Design constraints (from the approved Patch Plan):
//   - Reuse fleet-envelope.js only; do NOT modify the wire protocol.
//   - Exactly-once processing, even with several Bridge instances running
//     simultaneously -> atomic O_EXCL lock claim before any invocation.
//   - Retries, timeouts, error handling and full exchange logging.
//
// Runs with cwd = repository root, like every runtime script.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const envelope = require("./fleet-envelope");

const CONFIG_FILE = "runtime/connectors/fleet-bridge.json";

const DEFAULT_CONFIG = {
  command: "claude",
  args: ["-p", "--output-format", "json", "--permission-mode", "manual"],
  timeoutMs: 120000,
  maxRetries: 2,
  backoffMs: 1500,
  pollMs: 2000,
  lockTtlMs: 300000,
  logFile: "runtime/generated/fleet/bridge.log",
  locksDir: "runtime/generated/fleet/locks"
};

function loadConfig() {
  const fromFile = envelope.readJsonSafe(CONFIG_FILE) || {};
  return Object.assign({}, DEFAULT_CONFIG, fromFile);
}

// --------------------------------------------------------------------------
// Logging : append-only JSONL, one line per exchange event.
// --------------------------------------------------------------------------
function log(cfg, event) {
  const line =
    JSON.stringify(Object.assign({ at: new Date().toISOString() }, event)) +
    "\n";
  try {
    fs.mkdirSync(path.dirname(cfg.logFile), { recursive: true });
    fs.appendFileSync(cfg.logFile, line);
  } catch {
    /* logging must never break the exchange */
  }
  return line;
}

// --------------------------------------------------------------------------
// Atomic claim : O_EXCL lock file. Only one process (across any number of
// Bridge instances) can create the lock; everyone else gets EEXIST and skips.
// A stale lock (older than lockTtlMs) is reclaimed so a crashed instance does
// not block a request forever.
// --------------------------------------------------------------------------
function lockPath(cfg, requestId) {
  return path.join(cfg.locksDir, requestId + ".lock");
}

function tryClaim(cfg, requestId) {
  const file = lockPath(cfg, requestId);
  fs.mkdirSync(cfg.locksDir, { recursive: true });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // 'wx' == O_CREAT | O_EXCL : atomic, fails if the lock already exists.
      const fd = fs.openSync(file, "wx");
      try {
        fs.writeSync(
          fd,
          JSON.stringify({
            pid: process.pid,
            host: require("os").hostname(),
            claimedAt: new Date().toISOString()
          })
        );
      } finally {
        fs.closeSync(fd); // never leak the descriptor, even on write failure
      }
      return true;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;

      // Lock exists : reclaim only if stale, then retry the atomic create once.
      let stale = false;
      try {
        const age = Date.now() - fs.statSync(file).mtimeMs;
        stale = age > cfg.lockTtlMs;
      } catch {
        stale = true; // vanished between EEXIST and stat -> race it again
      }
      if (!stale) return false;
      try {
        fs.unlinkSync(file);
      } catch {
        /* another instance reclaimed it first */
      }
      // loop: attempt the atomic create again
    }
  }
  return false;
}

function releaseClaim(cfg, requestId) {
  try {
    fs.unlinkSync(lockPath(cfg, requestId));
  } catch {
    /* already gone */
  }
}

// --------------------------------------------------------------------------
// Claude Code invocation (the "existing integration mechanism").
// MOCK mode (FLEET_BRIDGE_MOCK=1) short-circuits the CLI so the full loop is
// testable offline and deterministically.
// --------------------------------------------------------------------------
function buildPrompt(request) {
  const brief = JSON.stringify(request.brief || { mission: request.mission }, null, 2);
  return [
    "You are the Claude Code agent inside the ODG Fleet protocol.",
    "Respond with ONLY a single JSON object, no prose, matching:",
    '{"mission": string, "summary": string, "actions": string[]}',
    "",
    "MISSION: " + request.mission,
    "",
    "INSTRUCTION:",
    request.instruction || "(none)",
    "",
    "ENGINEERING BRIEF:",
    brief
  ].join("\n");
}

// Tolerant extraction of a {mission, summary, actions} proposal from whatever
// shape the CLI returns (raw object, {result: "..."} envelope, fenced text).
function extractProposal(raw, request) {
  const looksLikeProposal = o =>
    o && typeof o === "object" && "summary" in o && Array.isArray(o.actions);

  const candidates = [];
  const consider = v => {
    if (typeof v === "string") {
      const m = v.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          candidates.push(JSON.parse(m[0]));
        } catch {
          /* not json */
        }
      }
    } else if (v && typeof v === "object") {
      candidates.push(v);
    }
  };

  let root;
  try {
    root = JSON.parse(raw);
  } catch {
    consider(raw);
    root = null;
  }
  if (root) {
    consider(root);
    if ("result" in root) consider(root.result);
    if (root.proposal) consider(root.proposal);
  }

  for (const c of candidates) {
    if (looksLikeProposal(c)) {
      return {
        mission: c.mission || request.mission,
        summary: c.summary,
        actions: c.actions
      };
    }
  }
  return null;
}

function invokeAgent(cfg, request) {
  if (process.env.FLEET_BRIDGE_MOCK === "1") {
    return {
      ok: true,
      proposal: {
        mission: request.mission,
        summary:
          "[MOCK] Fleet Bridge round-trip for " + request.mission,
        actions: ["acknowledge request", "return structured proposal"]
      }
    };
  }

  const prompt = buildPrompt(request);
  const res = spawnSync(cfg.command, cfg.args, {
    input: prompt,
    encoding: "utf8",
    timeout: cfg.timeoutMs,
    maxBuffer: 64 * 1024 * 1024
  });

  if (res.error) {
    const reason =
      res.error.code === "ETIMEDOUT"
        ? "Agent timed out after " + cfg.timeoutMs + "ms"
        : "Agent spawn error: " + res.error.message;
    return { ok: false, reason };
  }
  if (res.status !== 0) {
    return {
      ok: false,
      reason:
        "Agent exited " + res.status + ": " + (res.stderr || "").slice(0, 500)
    };
  }

  const proposal = extractProposal(res.stdout || "", request);
  if (!proposal) {
    return { ok: false, reason: "Could not extract a valid proposal from agent output" };
  }
  return { ok: true, proposal };
}

function invokeWithRetries(cfg, request) {
  let last = { ok: false, reason: "not attempted" };
  for (let attempt = 1; attempt <= cfg.maxRetries + 1; attempt++) {
    last = invokeAgent(cfg, request);
    last.attempt = attempt;
    if (last.ok) return last;
    if (attempt <= cfg.maxRetries && cfg.backoffMs > 0) {
      // synchronous backoff keeps the single-file lifecycle simple
      const end = Date.now() + cfg.backoffMs;
      while (Date.now() < end) {
        /* spin-wait backoff */
      }
    }
  }
  return last;
}

// --------------------------------------------------------------------------
// Process a single request id through its full lifecycle.
// Returns one of: SKIPPED | ANSWERED | FAILED | CLAIMED_BY_OTHER
// --------------------------------------------------------------------------
function processRequest(cfg, requestId) {
  // Exactly-once guard #1 : a response already exists -> never redo work.
  if (fs.existsSync(envelope.responsePath(requestId))) {
    return { requestId, outcome: "SKIPPED", reason: "response exists" };
  }

  const pre = envelope.readJsonSafe(envelope.requestPath(requestId));
  if (!pre) return { requestId, outcome: "SKIPPED", reason: "unreadable request" };
  if (pre.status !== envelope.STATUS.PENDING) {
    return { requestId, outcome: "SKIPPED", reason: "status " + pre.status };
  }

  // Exactly-once guard #2 : atomic cross-instance claim BEFORE any work.
  if (!tryClaim(cfg, requestId)) {
    return { requestId, outcome: "CLAIMED_BY_OTHER" };
  }

  try {
    // TOCTOU re-check under the lock : another instance may have advanced it
    // between our status read and our claim.
    const request = envelope.readJsonSafe(envelope.requestPath(requestId));
    if (!request || request.status !== envelope.STATUS.PENDING) {
      return { requestId, outcome: "SKIPPED", reason: "status changed under lock" };
    }
    if (fs.existsSync(envelope.responsePath(requestId))) {
      return { requestId, outcome: "SKIPPED", reason: "response appeared under lock" };
    }

    // Claim the exchange in the protocol: PENDING -> DELIVERED.
    request.status = envelope.STATUS.DELIVERED;
    request.deliveredAt = new Date().toISOString();
    request.pid = process.pid;
    envelope.writeJson(envelope.requestPath(requestId), request);
    log(cfg, { event: "DELIVERED", requestId, mission: request.mission, pid: process.pid });

    const result = invokeWithRetries(cfg, request);

    if (!result.ok) {
      request.status = envelope.STATUS.FAILED;
      request.failedAt = new Date().toISOString();
      request.reason = result.reason;
      envelope.writeJson(envelope.requestPath(requestId), request);
      log(cfg, {
        event: "FAILED",
        requestId,
        mission: request.mission,
        attempts: result.attempt,
        reason: result.reason
      });
      return { requestId, outcome: "FAILED", reason: result.reason };
    }

    // Build the response envelope in the exact shape the collector validates.
    const response = {
      requestId,
      agent: request.agent,
      status: envelope.STATUS.ANSWERED,
      answeredAt: new Date().toISOString(),
      attempt: result.attempt,
      proposal: result.proposal
    };

    const check = envelope.validateResponse(response);
    if (!check.valid) {
      request.status = envelope.STATUS.FAILED;
      request.failedAt = new Date().toISOString();
      request.reason = "Invalid response envelope: " + check.missing.join(", ");
      envelope.writeJson(envelope.requestPath(requestId), request);
      log(cfg, { event: "FAILED", requestId, reason: request.reason });
      return { requestId, outcome: "FAILED", reason: request.reason };
    }

    envelope.writeJson(envelope.responsePath(requestId), response);

    request.status = envelope.STATUS.ANSWERED;
    request.answeredAt = response.answeredAt;
    envelope.writeJson(envelope.requestPath(requestId), request);

    log(cfg, {
      event: "ANSWERED",
      requestId,
      mission: request.mission,
      attempts: result.attempt,
      actions: result.proposal.actions.length
    });
    return { requestId, outcome: "ANSWERED", mission: request.mission };
  } finally {
    releaseClaim(cfg, requestId);
  }
}

// --------------------------------------------------------------------------
// Scan + drain the request mailbox once.
// --------------------------------------------------------------------------
function listPendingIds() {
  if (!fs.existsSync(envelope.REQUESTS_DIR)) return [];
  return fs
    .readdirSync(envelope.REQUESTS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => f.slice(0, -5));
}

function drainOnce(cfg) {
  const results = [];
  for (const id of listPendingIds()) {
    try {
      results.push(processRequest(cfg, id));
    } catch (err) {
      // Isolate a single crashing request so it never aborts the whole drain.
      log(cfg, { event: "ERROR", requestId: id, reason: String(err && err.message || err) });
      results.push({ requestId: id, outcome: "FAILED", reason: String(err && err.message || err) });
    }
  }
  return results;
}

// --------------------------------------------------------------------------
// Watch mode : fs.watch for responsiveness + poll fallback for reliability.
// --------------------------------------------------------------------------
function watch(cfg) {
  console.log("Fleet Bridge watching", envelope.REQUESTS_DIR);
  fs.mkdirSync(envelope.REQUESTS_DIR, { recursive: true });

  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    try {
      const answered = drainOnce(cfg).filter(r => r.outcome === "ANSWERED");
      if (answered.length) {
        console.log(
          "Answered:",
          answered.map(r => r.requestId).join(", ")
        );
      }
    } finally {
      running = false;
    }
  };

  try {
    fs.watch(envelope.REQUESTS_DIR, () => tick());
  } catch {
    /* fall back to polling only */
  }
  setInterval(tick, cfg.pollMs);
  tick();
}

module.exports = {
  loadConfig,
  processRequest,
  drainOnce,
  tryClaim,
  releaseClaim,
  extractProposal,
  invokeAgent
};

if (require.main === module) {
  const cfg = loadConfig();
  const once = process.argv.includes("--once");

  if (once) {
    const results = drainOnce(cfg);
    const by = {};
    for (const r of results) by[r.outcome] = (by[r.outcome] || 0) + 1;
    console.log("======================================");
    console.log("FLEET BRIDGE (--once)");
    console.log("======================================");
    console.log("Scanned  :", results.length);
    console.log("Answered :", by.ANSWERED || 0);
    console.log("Failed   :", by.FAILED || 0);
    console.log("Skipped  :", (by.SKIPPED || 0) + (by.CLAIMED_BY_OTHER || 0));
    for (const r of results.filter(x => x.outcome === "ANSWERED" || x.outcome === "FAILED")) {
      console.log("  -", r.requestId, r.outcome, r.reason ? "(" + r.reason + ")" : "");
    }
    console.log("======================================");
    process.exit((by.FAILED || 0) > 0 ? 1 : 0);
  } else {
    watch(cfg);
  }
}
