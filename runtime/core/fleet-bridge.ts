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
//
// STRICT TS PORT (V63 PROVIDER): behaviour-preserving transliteration of the historical .js. The atomic
// O_EXCL claim, exactly-once guards, envelope lifecycle, tolerant proposal extraction, retry/backoff and —
// critically — the FAIL-CLOSED live provider call (gateLiveCall + FLEET_BRIDGE_MOCK short-circuit; a real
// `claude` spawn ONLY when ODG_PROVIDER_LIVE authorizes it) are byte-identical. Reuses the unmodified
// ./fleet-envelope and ./provider-live-call-gate; porting activates NO provider.

"use strict";

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
const envelope: any = require("./fleet-envelope");
const { gateLiveCall } = require("./provider-live-call-gate") as { gateLiveCall: (live: () => any, refuse: (d: any) => any, ctx: any) => any };

const CONFIG_FILE = "runtime/connectors/fleet-bridge.json";

const DEFAULT_CONFIG = {
  command: "claude",
  // V45 — ONE GOVERNED EXECUTION MODEL. The Fleet worker is a PROPOSAL producer: the bridge consumes
  // only its {mission, summary, actions} JSON and never applies worker tree-writes (the collector
  // validates/analyses/governance-gates the textual proposal). So the worker needs NO write authority.
  // Denying Write/Edit/Bash here removes the latent second write authority (was acceptEdits) with zero
  // change to the proposal exchange — consistent with V42/V43 (provider proposes, ODG governs the apply).
  args: ["-p", "--output-format", "json", "--permission-mode", "plan", "--allowedTools", "Read,Grep,Glob"],
  timeoutMs: 120000,
  maxRetries: 2,
  backoffMs: 1500,
  pollMs: 2000,
  lockTtlMs: 300000,
  logFile: "runtime/generated/fleet/bridge.log",
  locksDir: "runtime/generated/fleet/locks"
};

function loadConfig(): any {
  const fromFile = envelope.readJsonSafe(CONFIG_FILE) || {};
  return Object.assign({}, DEFAULT_CONFIG, fromFile);
}

// --------------------------------------------------------------------------
// Logging : append-only JSONL, one line per exchange event.
// --------------------------------------------------------------------------
function log(cfg: any, event: any): string {
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
//
// V150-M — GENERATION-NUMBERED claims (race-free takeover). The former reclaim
// unlinked (later: moved aside) the stale lock and re-created it; between the
// staleness check and the unlink a concurrent reclaimer/newcomer could create a
// FRESH lock that was then destroyed ⇒ two holders. Now a claim is the file
// `<id>.lock.<gen>` created with O_EXCL, and a takeover NEVER moves or deletes a
// lock that might be live: it creates generation top+1 (exactly one winner per
// generation) after observing generation `top` dead (stale or released).
//   - a claimant that targeted a superseded generation loses (post-create check);
//   - release marks the holder's OWN generation released (mtime=epoch ⇒ instantly
//     stale); it can never touch a successor generation;
//   - GC removes only generations < current-1 (superseded twice ⇒ dead); the
//     highest generation is never deleted, so the generation floor never regresses.
// --------------------------------------------------------------------------
function lockPath(cfg: any, requestId: string): string {
  return path.join(cfg.locksDir, requestId + ".lock");
}

// generations of a claim currently on disk, ascending.
function claimGenerations(cfg: any, requestId: string): number[] {
  const prefix = requestId + ".lock.";
  let names: string[] = [];
  try { names = fs.readdirSync(cfg.locksDir); } catch { return []; }
  return names
    .filter((n) => n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length)))
    .map((n) => Number(n.slice(prefix.length)))
    .sort((x, y) => x - y);
}

const heldGeneration = new Map<string, number>(); // `${locksDir}\0${requestId}` -> generation THIS process holds
const holdKey = (cfg: any, requestId: string) => `${path.resolve(cfg.locksDir)}\0${requestId}`;

function tryClaim(cfg: any, requestId: string): boolean {
  const base = lockPath(cfg, requestId);
  fs.mkdirSync(cfg.locksDir, { recursive: true });

  for (let attempt = 0; attempt < 3; attempt++) {
    const gens = claimGenerations(cfg, requestId);
    const top = gens.length ? gens[gens.length - 1] : 0;
    if (top > 0) {
      let st: fs.Stats;
      try { st = fs.statSync(`${base}.${top}`); } catch { continue; } // superseded + collected meanwhile -> re-read
      if (!(Date.now() - st.mtimeMs > cfg.lockTtlMs)) return false;  // a live (unexpired, unreleased) holder
    }
    const gen = top + 1;
    const file = `${base}.${gen}`;
    let fd: number;
    try {
      // 'wx' == O_CREAT | O_EXCL : atomic — exactly one claimant can create generation `gen`.
      fd = fs.openSync(file, "wx");
    } catch (err: any) {
      if (err.code !== "EEXIST") throw err;
      return false; // another claimant won this generation (it is fresh)
    }
    try {
      fs.writeSync(
        fd,
        JSON.stringify({
          pid: process.pid,
          host: require("os").hostname(),
          claimedAt: new Date().toISOString(),
          gen,
          token: require("crypto").randomBytes(8).toString("hex")
        })
      );
    } finally {
      fs.closeSync(fd); // never leak the descriptor, even on write failure
    }
    // A laggard that targeted an already-collected generation must not win: any HIGHER generation ⇒ we lose.
    const after = claimGenerations(cfg, requestId);
    if (after.some((g) => g > gen)) {
      try { fs.utimesSync(file, 0, 0); } catch { /* best-effort: mark our losing generation released */ }
      return false;
    }
    heldGeneration.set(holdKey(cfg, requestId), gen);
    for (const g of after) if (g < gen - 1) { try { fs.unlinkSync(`${base}.${g}`); } catch { /* already collected */ } }
    return true;
  }
  return false;
}

function releaseClaim(cfg: any, requestId: string): void {
  const key = holdKey(cfg, requestId);
  const gen = heldGeneration.get(key);
  if (gen === undefined) return; // this process holds nothing: never release someone else's claim
  heldGeneration.delete(key);
  try {
    fs.utimesSync(`${lockPath(cfg, requestId)}.${gen}`, 0, 0); // released ⇒ instantly stale; the file stays as the generation floor
  } catch {
    /* already collected */
  }
}

// read-only view of the current claim (highest generation): { gen, holder, mtimeMs } | null.
function currentClaim(cfg: any, requestId: string): any {
  const gens = claimGenerations(cfg, requestId);
  if (!gens.length) return null;
  const gen = gens[gens.length - 1];
  const file = `${lockPath(cfg, requestId)}.${gen}`;
  try { return { gen, holder: JSON.parse(fs.readFileSync(file, "utf8")), mtimeMs: fs.statSync(file).mtimeMs }; } catch { return { gen, holder: null, mtimeMs: null }; }
}

// --------------------------------------------------------------------------
// Claude Code invocation (the "existing integration mechanism").
// MOCK mode (FLEET_BRIDGE_MOCK=1) short-circuits the CLI so the full loop is
// testable offline and deterministically.
// --------------------------------------------------------------------------
function buildPrompt(request: any): string {
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
function extractProposal(raw: any, request: any): any {
  const looksLikeProposal = (o: any) =>
    o && typeof o === "object" && "summary" in o && Array.isArray(o.actions);

  const candidates: any[] = [];
  const consider = (v: any) => {
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

// Resolve how to invoke a given agent. Per-agent overrides live under
// cfg.agents[<id>]; when absent we fall back to the top-level command/args so
// the original single-agent (Claude) behaviour is preserved unchanged.
function resolveAgentCommand(cfg: any, agentId: any): any {
  const perAgent = (cfg.agents && cfg.agents[agentId]) || null;
  return {
    command: (perAgent && perAgent.command) || cfg.command,
    args: (perAgent && perAgent.args) || cfg.args
  };
}

function invokeAgent(cfg: any, request: any): any {
  if (process.env.FLEET_BRIDGE_MOCK === "1") {
    return {
      ok: true,
      proposal: {
        mission: request.mission,
        summary:
          "[MOCK] Fleet Bridge round-trip for " + request.mission +
          " via " + request.agent,
        actions: ["acknowledge request", "return structured proposal"]
      }
    };
  }

  const { command, args } = resolveAgentCommand(cfg, request.agent);
  const prompt = buildPrompt(request);

  // WI-1 fail-closed gate: spawning a real Fleet worker is a LIVE (potentially billed) provider call.
  // Unless explicitly authorized (ODG_PROVIDER_LIVE=1) the gate REFUSES and NO process is spawned —
  // the refusal flows back as error-as-data, exactly like any other invocation failure. MOCK mode
  // (handled above) short-circuits before here, so the offline test loop is unaffected.
  return gateLiveCall(
    () => {
      const res = spawnSync(command, args, {
        input: prompt,
        encoding: "utf8",
        timeout: cfg.timeoutMs,
        maxBuffer: 64 * 1024 * 1024
      });

      if (res.error) {
        const reason =
          (res.error as any).code === "ETIMEDOUT"
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
    },
    (decision: any) => ({ ok: false, reason: decision.reason }),
    { env: process.env, provider: request.agent || "fleet-agent" }
  );
}

function invokeWithRetries(cfg: any, request: any): any {
  let last: any = { ok: false, reason: "not attempted" };
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
function processRequest(cfg: any, requestId: string): any {
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
function listPendingIds(): string[] {
  if (!fs.existsSync(envelope.REQUESTS_DIR)) return [];
  return fs
    .readdirSync(envelope.REQUESTS_DIR)
    .filter((f: string) => f.endsWith(".json"))
    .map((f: string) => f.slice(0, -5));
}

function drainOnce(cfg: any): any[] {
  const results: any[] = [];
  for (const id of listPendingIds()) {
    try {
      results.push(processRequest(cfg, id));
    } catch (err: any) {
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
function watch(cfg: any): void {
  console.log("Fleet Bridge watching", envelope.REQUESTS_DIR);
  fs.mkdirSync(envelope.REQUESTS_DIR, { recursive: true });

  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    try {
      const answered = drainOnce(cfg).filter((r) => r.outcome === "ANSWERED");
      if (answered.length) {
        console.log(
          "Answered:",
          answered.map((r) => r.requestId).join(", ")
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
  currentClaim,
  extractProposal,
  resolveAgentCommand,
  invokeAgent
};

if (require.main === module) {
  const cfg = loadConfig();
  const once = process.argv.includes("--once");

  if (once) {
    const results = drainOnce(cfg);
    const by: any = {};
    for (const r of results) by[r.outcome] = (by[r.outcome] || 0) + 1;
    console.log("======================================");
    console.log("FLEET BRIDGE (--once)");
    console.log("======================================");
    console.log("Scanned  :", results.length);
    console.log("Answered :", by.ANSWERED || 0);
    console.log("Failed   :", by.FAILED || 0);
    console.log("Skipped  :", (by.SKIPPED || 0) + (by.CLAIMED_BY_OTHER || 0));
    for (const r of results.filter((x) => x.outcome === "ANSWERED" || x.outcome === "FAILED")) {
      console.log("  -", r.requestId, r.outcome, r.reason ? "(" + r.reason + ")" : "");
    }
    console.log("======================================");
    process.exit((by.FAILED || 0) > 0 ? 1 : 0);
  } else {
    watch(cfg);
  }
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
