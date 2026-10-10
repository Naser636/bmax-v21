#!/usr/bin/env node
/**
 * odg-probe — BOUNDED, OPT-IN live connectivity probe (GitHub-only).
 *
 * SAFETY CONTRACT:
 *   - DEFAULT = DRY plan, ZERO network. A live request requires BOTH `--live` AND env ODG_LIVE_PROBE=1.
 *   - Allowlist is a CODE CONSTANT: only exact `https://github.com` (HTTPS, no credentials/port/query/
 *     fragment, host === github.com). Operator-supplied alternate hosts are rejected before networking.
 *   - Exactly ONE GET, 0 retries, body cap 2048 bytes, timeout 2500 ms, NO redirect following — all
 *     enforced by the reused `httpGetBounded` (capability-executors.js). If a bound cannot be met the
 *     probe fails closed BEFORE any request.
 *   - Reuses `classifyConnectivity` (connectivity-classifier.js). Raw observation is kept SEPARATE from
 *     the classification. A process exit code alone never establishes reachability.
 *   - NEVER prints the response body, environment, headers, or credentials. NEVER writes any file
 *     (including runtime/generated/connectivity-audit.json). NOT invoked by any offline test gate.
 *
 * Usage: node runtime/bin/odg-probe.js [--live] [--url https://github.com] [--json]
 */
"use strict";

const BOUNDS = Object.freeze({ maxBytes: 2048, timeoutMs: 2500, retries: 0, followRedirects: false });
const ALLOWLIST = Object.freeze(["https://github.com", "https://github.com/"]);
const DEFAULT_URL = "https://github.com";

/** Strict allowlist + URL-shape validation. Pure. Returns {ok, host} or {ok:false, reason}. */
function validateTarget(url) {
  if (typeof url !== "string" || !ALLOWLIST.includes(url)) {
    return { ok: false, reason: `url not in allowlist (only https://github.com permitted)` };
  }
  let u;
  try { u = new URL(url); } catch { return { ok: false, reason: "unparseable url" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "scheme must be https" };
  if (u.hostname !== "github.com") return { ok: false, reason: "host must be github.com" };
  if (u.username || u.password) return { ok: false, reason: "credentials in url are rejected" };
  if (u.port && u.port !== "443") return { ok: false, reason: "non-standard port rejected" };
  if (u.search) return { ok: false, reason: "query string rejected" };
  if (u.hash) return { ok: false, reason: "fragment rejected" };
  if (u.pathname && u.pathname !== "/") return { ok: false, reason: "path rejected" };
  return { ok: true, host: u.hostname };
}

/** Build the (sanitized) plan from args+env. Pure; performs no I/O. */
function buildPlan(argv, env) {
  const args = Array.isArray(argv) ? argv : [];
  const e = env || {};
  const urlIdx = args.indexOf("--url");
  const url = urlIdx >= 0 && args[urlIdx + 1] ? args[urlIdx + 1] : DEFAULT_URL;
  const v = validateTarget(url);
  const live = args.includes("--live") && e.ODG_LIVE_PROBE === "1";
  return {
    tool: "odg-probe",
    mode: live ? "LIVE" : "DRY",
    live,
    optIn: { liveFlag: args.includes("--live"), env: e.ODG_LIVE_PROBE === "1" },
    url,
    host: v.ok ? v.host : null,
    method: "GET",
    requestedBounds: { ...BOUNDS },
    authorizedHost: "github.com (HTTPS only)",
    valid: v.ok,
    reason: v.ok ? null : v.reason,
  };
}

/** Map httpGetBounded's raw result to the classifier's documented {http:{ok,status,error}} contract.
 *  ADAPTER (tested): a numeric status>0 with no error ⇒ an observed HTTP response (ok:true). */
function adaptObservation(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  if (r.error) return { http: { ok: false, error: String(r.error) } };
  if (typeof r.status === "number" && r.status > 0) return { http: { ok: true, status: r.status } };
  return { http: { ok: false } };
}

/** Sanitize the raw fetch result for evidence — NEVER includes the body. */
function sanitizeObservation(raw, elapsedMs) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    status: typeof r.status === "number" ? r.status : null,
    error: r.error ? String(r.error) : null,
    truncated: !!r.truncated,
    bytes: typeof r.bytes === "number" ? r.bytes : null,
    fetched_at: typeof r.fetched_at === "string" ? r.fetched_at : null,
    elapsedMs,
  };
}

/**
 * Execute the probe. Pure of real I/O except the injected `fetcher`. Returns { exitCode, report }.
 *  - fetcher(url, maxBytes, timeoutMs) defaults to the reused httpGetBounded (live). Injected in tests.
 *  - now() supplies the clock for elapsed timing (injectable for determinism).
 * The fetcher is invoked AT MOST ONCE and ONLY when mode === LIVE and the target is valid.
 */
async function run(opts) {
  const o = opts || {};
  const classify = o.classify || require("../core/connectivity-classifier.js").classifyConnectivity;
  const now = typeof o.now === "function" ? o.now : () => Date.now();
  const plan = buildPlan(o.argv, o.env);

  if (!plan.valid) {
    return { exitCode: 2, report: { ...plan, classification: null, hostsContacted: [] } };
  }
  if (plan.mode !== "LIVE") {
    // DRY: no network. Explain exactly what a live run WOULD do.
    return { exitCode: 0, report: { ...plan, note: "dry-run: no network performed; pass --live AND ODG_LIVE_PROBE=1 to execute", classification: null, hostsContacted: [] } };
  }

  const fetcher = o.fetcher || require("../core/capability-executors.js").httpGetBounded;
  const t0 = now();
  const raw = await fetcher(plan.url, BOUNDS.maxBytes, BOUNDS.timeoutMs); // exactly one call, no retry
  const elapsedMs = now() - t0;
  const observed = sanitizeObservation(raw, elapsedMs);
  const classification = classify(adaptObservation(raw));
  const exitCode = classification.class === "OK" ? 0 : 1;
  return { exitCode, report: { ...plan, observed, classification, hostsContacted: [plan.host] } };
}

async function main() {
  const { exitCode, report } = await run({ argv: process.argv.slice(2), env: process.env });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  return exitCode;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((e) => {
    process.stdout.write(JSON.stringify({ tool: "odg-probe", error: String((e && e.message) || e) }) + "\n");
    process.exit(1);
  });
}

module.exports = { validateTarget, buildPlan, adaptObservation, sanitizeObservation, run, BOUNDS, ALLOWLIST };
