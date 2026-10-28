#!/usr/bin/env node
/**
 * dashboard-token-provision — the PREPARED prerequisite for activating the dashboard fail-closed auth in production
 * (closure-register item `dashboard-auth-redeploy`). It is a PURE, testable mechanism that mints a strong
 * ODG_DASHBOARD_TOKEN and renders a 0600 EnvironmentFile — WITHOUT ever logging the secret. It does NOT touch the live
 * service, systemd, or /etc by itself: a thin owner-run wrapper (scripts/provision-dashboard-token.sh) applies it, and
 * the existing scripts/odg-release.sh pipeline performs the redeploy. No new primitive.
 *
 * Secret hygiene (mandate "no secrets in output/logs"): mintToken/renderEnvFile return the secret for the caller to
 * WRITE (0600) but `plan()` and the CLI print ONLY a sha256 fingerprint — the token value never appears in stdout.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");

const ENV_KEY = "ODG_DASHBOARD_TOKEN";
const FILE_MODE = 0o600;                      // owner read/write only — never group/world readable
const DEFAULT_PATH = "/etc/odg/odg-preprod.env";

/** mintToken(): a crypto-strong URL-safe token (32 bytes). Never log the return value. */
function mintToken(): string {
  return crypto.randomBytes(32).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** fingerprint(token): sha256 hex prefix — SAFE to display (one-way; cannot reconstruct the token). */
function fingerprint(token: string): string {
  return crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 12);
}

/** renderEnvFile(token): the exact file content to write (0600). Fail-closed on an empty token. */
function renderEnvFile(token: string): string {
  if (typeof token !== "string" || token.trim().length < 16) throw new Error("refusing to render env file: token missing or too weak (<16 chars)");
  return `${ENV_KEY}=${token}\n`;
}

/** provisionDecision({exists, rotate}): idempotent — CREATE if absent, KEEP if present (no clobber), ROTATE only on request. */
function provisionDecision(opts: any = {}): any {
  if (opts.exists !== true) return { action: "CREATE", reason: "no token file present" };
  if (opts.rotate === true) return { action: "ROTATE", reason: "rotation explicitly requested" };
  return { action: "KEEP", reason: "token file already present (idempotent; use --rotate to replace)" };
}

/** writeEnvFile(path, token, fsImpl?): write the env file with mode 0600. Fail-closed on weak token. Returns {path, mode, fingerprint}. */
function writeEnvFile(path: string, token: string, fsImpl: any = fs): any {
  const content = renderEnvFile(token);                 // throws on weak token BEFORE any write
  fsImpl.writeFileSync(path, content, { mode: FILE_MODE });
  try { fsImpl.chmodSync(path, FILE_MODE); } catch { /* best-effort tighten */ }
  return { path, mode: "0600", key: ENV_KEY, fingerprint: fingerprint(token) };
}

/**
 * plan(opts): decide + describe WITHOUT emitting the secret. Returns { action, path, mode, key, fingerprint?, note }.
 * The token value is NEVER included. Safe to print and to log as evidence.
 */
function plan(opts: any = {}): any {
  const path = typeof opts.path === "string" && opts.path ? opts.path : DEFAULT_PATH;
  const exists = opts.existsImpl ? !!opts.existsImpl(path) : (() => { try { return fs.existsSync(path); } catch { return false; } })();
  const decision = provisionDecision({ exists, rotate: opts.rotate === true });
  const willMint = decision.action === "CREATE" || decision.action === "ROTATE";
  const fp = willMint ? fingerprint(mintToken()) : null;   // a fresh fingerprint for display ONLY (not the token stored)
  return {
    action: decision.action,
    reason: decision.reason,
    path, mode: "0600", key: ENV_KEY,
    sampleFingerprint: fp,       // illustrative only; the real write mints+fingerprints its own token
    note: "token value is NEVER printed; the owner-run wrapper writes it 0600, then the service reads it via a systemd EnvironmentFile. Applying to the live host (write + systemd drop-in + restart) is owner-gated.",
  };
}

export { ENV_KEY, DEFAULT_PATH, mintToken, fingerprint, renderEnvFile, provisionDecision, writeEnvFile, plan };
module.exports = { ENV_KEY, DEFAULT_PATH, mintToken, fingerprint, renderEnvFile, provisionDecision, writeEnvFile, plan };

if (require.main === module) {
  const rotate = process.argv.includes("--rotate");
  const pathArg = (process.argv.find((a) => a.startsWith("--path=")) || "").split("=")[1];
  process.stdout.write(JSON.stringify(plan({ rotate, path: pathArg }), null, 2) + "\n");
}
