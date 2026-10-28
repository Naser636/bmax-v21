#!/usr/bin/env node
/**
 * dashboard-exposure-readiness — the FAIL-CLOSED gate that must return READY before the dashboard may EVER be exposed
 * publicly. It is a PURE decision helper (no 10th primitive; it never exposes, binds, starts, or mutates anything). It
 * encodes the security precondition for `dashboard-tls-exposure`: public exposure is admissible ONLY when every control
 * below is positively observed. Deny-by-default: any missing/unknown/false control ⇒ NOT_READY (never READY by omission).
 *
 * This is the realizable-NOW decomposition of the owner-gated exposure objective: we can build and verify the gate +
 * the TLS/reverse-proxy templates + the rollback runbook without exposing anything. The truly-gated remainder is the
 * owner's explicit exposure decision and the act of activation — which this module deliberately does NOT perform.
 */
"use strict";

const fs = require("fs");
const path = require("path");

// The required controls. Each must be positively TRUE for exposure to be admissible. Order = report order.
const REQUIRED_CONTROLS = [
  "authTokenConfigured",     // ODG_DASHBOARD_TOKEN set (non-empty) — the fail-closed app auth (dashboard-auth.ts)
  "tlsTermination",          // TLS terminated (cert+key present OR reverse-proxy terminates TLS) — no plaintext exposure
  "reverseProxyConfigured",  // a reverse-proxy config is present (not binding the app process directly to the public iface)
  "accessControlConfigured", // network access control present (allowlist / firewall / proxy-level auth) — not open 0.0.0.0
  "rollbackProcedure",       // a documented, tested rollback/teardown runbook exists
  "ownerExposureConfirmed",  // EXPLICIT owner decision to expose (never inferred; defaults false)
];

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * assessExposureReadiness(facts): pure fail-closed verdict. facts is a map of control→boolean (missing ⇒ false).
 * Returns { verdict: "READY"|"NOT_READY", missing: string[], controls: {name:boolean}, note }.
 */
function assessExposureReadiness(facts: any = {}): any {
  const f = isObj(facts) ? facts : {};
  const controls: Record<string, boolean> = {};
  const missing: string[] = [];
  for (const c of REQUIRED_CONTROLS) {
    const ok = f[c] === true;            // strict: only an explicit true counts; undefined/null/"true"/1 ⇒ false
    controls[c] = ok;
    if (!ok) missing.push(c);
  }
  const verdict = missing.length === 0 ? "READY" : "NOT_READY";
  return {
    verdict,
    missing,
    controls,
    note: verdict === "READY"
      ? "all exposure controls positively observed — exposure is ADMISSIBLE (still requires the owner to execute the gated activation; this module does not expose)"
      : `exposure DENIED (fail-closed): ${missing.length} control(s) not positively confirmed: [${missing.join(", ")}]`,
  };
}

/**
 * probeExposureReadiness({ env, repoRoot, fsImpl }): gather REAL facts (env + presence of the TLS/proxy/runbook
 * artifacts on disk) and assess. Injectable for deterministic tests. Honest: it reports what is actually observable;
 * `ownerExposureConfirmed` is ONLY true if env ODG_DASHBOARD_EXPOSURE_CONFIRMED === "1" (an explicit owner signal).
 */
function probeExposureReadiness(opts: any = {}): any {
  const env = isObj(opts.env) ? opts.env : process.env;
  const root = typeof opts.repoRoot === "string" ? opts.repoRoot : process.cwd();
  const F = opts.fsImpl || fs;
  const exists = (rel: string) => { try { return F.existsSync(path.join(root, rel)); } catch { return false; } };
  const facts = {
    authTokenConfigured: typeof env.ODG_DASHBOARD_TOKEN === "string" && env.ODG_DASHBOARD_TOKEN.trim().length > 0,
    tlsTermination: exists("docs/odg/deploy/reverse-proxy.Caddyfile") || exists("docs/odg/deploy/reverse-proxy.nginx.conf"),
    reverseProxyConfigured: exists("docs/odg/deploy/reverse-proxy.Caddyfile") || exists("docs/odg/deploy/reverse-proxy.nginx.conf"),
    accessControlConfigured: exists("docs/odg/deploy/access-control.md"),
    rollbackProcedure: exists("docs/odg/deploy/EXPOSURE_RUNBOOK.md"),
    ownerExposureConfirmed: env.ODG_DASHBOARD_EXPOSURE_CONFIRMED === "1",
  };
  const r = assessExposureReadiness(facts);
  return { ...r, facts, source: { repoRoot: root, confirmedEnvPresent: facts.ownerExposureConfirmed } };
}

export { REQUIRED_CONTROLS, assessExposureReadiness, probeExposureReadiness };
module.exports = { REQUIRED_CONTROLS, assessExposureReadiness, probeExposureReadiness };

if (require.main === module) {
  process.stdout.write(JSON.stringify(probeExposureReadiness(), null, 2) + "\n");
}
