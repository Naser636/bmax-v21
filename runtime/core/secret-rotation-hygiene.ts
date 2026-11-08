#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-10 (P3 security — world-research gap) — SECRET / KEY ROTATION-HYGIENE POLICY. PURE, deterministic.
 * World reference: NIST SP 800-57 Part 1 Rev.6 (initial public draft, comment through 2026-02-05) + SP 800-131A — a
 * key has a bounded CRYPTOPERIOD (limiting the compromise window); SHA-1 / RSA-1024 are deprecated and must be
 * replaced immediately; 112-bit keys (RSA-2048) acceptable through 2030, deprecated AFTER. ODG built the exposure-
 * DETECTION side (bash-command-governor redacts secret values; lethal-trifecta correlates egress legs) and
 * agent-identity has a rotateKey() MECHANISM, but it explicitly disclaims the POLICY ("Production key management:
 * TTL, rotation... EXTERNAL dependency — NOT implemented"). Nothing enforces rotation-age / algorithm-deprecation over
 * a declared key inventory (grep-verified absent: no cryptoperiod / rotation-overdue / algorithm-deprecation table).
 * This composes control-evidence-freshness.daysBetween (injected-asOf, no-clock age discipline) + bash-command-
 * governor.SECRET_PATTERNS (plaintext-literal detection). Deny-by-default. Dual export.
 */

const FRESH = require("./control-evidence-freshness");   // daysBetween — injected-asOf key-age (no Date.now)
const GOV = require("./bash-command-governor");          // SECRET_PATTERNS — inline-literal secret detection

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d: number): number { return typeof v === "number" && isFinite(v) ? v : d; }

// NIST SP 800-131A — algorithms disallowed on sight (deprecated/broken).
const DISALLOWED_ALGOS = new Set(["md5", "md4", "sha1", "sha-1", "rsa-1024", "rsa1024", "rsa-512", "des", "3des", "tripledes", "rc4", "dsa", "dsa-1024"]);
// 112-bit-strength algorithms: acceptable through 2030, deprecated AFTER the cliff (asOf-dated).
const DEPRECATED_AFTER_2030 = new Set(["rsa-2048", "rsa2048", "ecdsa-p224", "2tdea"]);
const CLIFF_2030 = "2030-12-31";
const STATUS = Object.freeze(["COMPLIANT", "ALGORITHM_DISALLOWED", "ALGORITHM_DEPRECATED", "ALGORITHM_UNKNOWN", "ROTATION_OVERDUE", "INVALID_DATE", "FUTURE_DATED", "PLAINTEXT_SECRET_IN_CONFIG", "NO_ASOF"]);

function normAlgo(a: any): string { return String(a == null ? "" : a).toLowerCase().replace(/\s+/g, ""); }
// raw key-MATERIAL shapes (what an inline literal would actually be) — complements bash-command-governor.SECRET_PATTERNS
// (which catches secret-store PATHS / keywords like token/secret/password/.env/.pem). A material field is a plaintext
// secret if it looks like a reference-shaped literal (SECRET_PATTERNS) OR like raw key material (key prefix / PEM / high-entropy).
const KEY_MATERIAL_RE = [/^AKIA[0-9A-Z]{16}$/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /^gh[pousr]_[A-Za-z0-9]{20,}$/, /^xox[baprs]-[A-Za-z0-9-]{10,}$/, /^[A-Fa-f0-9]{40,}$/, /^[A-Za-z0-9+/]{40,}={0,2}$/];
function literalIsSecret(v: any): boolean {
  if (typeof v !== "string" || v.length === 0) return false;
  if (arr(GOV.SECRET_PATTERNS).some((re: RegExp) => { try { return re.test(v); } catch { return false; } })) return true;
  return KEY_MATERIAL_RE.some((re) => re.test(v));
}

/**
 * assessKeyHygiene(inventory, opts) -> { verdict, compliant, total, keys, findings }.
 *   inventory: [{ id, algorithm, createdAt (ISO), material? }]
 *   opts: { asOf (ISO), cryptoperiodDays?, maxAgeDaysByType? }
 * Fail-closed: missing asOf, unknown algorithm, unparseable/future-dated createdAt, or a plaintext literal ⇒ NOT compliant.
 */
function assessKeyHygiene(inventory: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const asOf = typeof o.asOf === "string" ? o.asOf : null;
  const defaultPeriod = Math.max(1, num(o.cryptoperiodDays, 365));
  const byType = isObj(o.maxAgeDaysByType) ? o.maxAgeDaysByType : {};
  const keys: any[] = []; const findings: string[] = [];

  for (const raw of arr(inventory)) {
    const k = isObj(raw) ? raw : {};
    const id = typeof k.id === "string" ? k.id : null;
    const algo = normAlgo(k.algorithm);
    let status = "COMPLIANT"; let detail = "within cryptoperiod, approved algorithm, no plaintext";

    if (literalIsSecret(k.material)) { status = "PLAINTEXT_SECRET_IN_CONFIG"; detail = "inline literal matches a secret pattern — a secret must be a reference, not a literal"; }
    else if (DISALLOWED_ALGOS.has(algo)) { status = "ALGORITHM_DISALLOWED"; detail = `algorithm '${algo}' is deprecated/broken (NIST SP 800-131A) — replace immediately`; }
    else if (algo === "" || !(APPROVED(algo) || DEPRECATED_AFTER_2030.has(algo))) { status = "ALGORITHM_UNKNOWN"; detail = `algorithm '${algo || "(none)"}' is not a recognized approved algorithm — cannot certify (fail-closed)`; }
    else if (!asOf) { status = "NO_ASOF"; detail = "no injected asOf — cannot verify key age (fail-closed)"; }
    else {
      // algorithm recognized + asOf present: check 2030 cliff then rotation age.
      if (DEPRECATED_AFTER_2030.has(algo) && asOf > CLIFF_2030) { status = "ALGORITHM_DEPRECATED"; detail = `112-bit algorithm '${algo}' deprecated after ${CLIFF_2030} (asOf ${asOf})`; }
      else {
        const ageDays = FRESH.daysBetween(typeof k.createdAt === "string" ? k.createdAt : "", asOf);
        if (ageDays === null) { status = "INVALID_DATE"; detail = "missing/unparseable createdAt — cannot verify rotation age (fail-closed)"; }
        else if (ageDays < 0) { status = "FUTURE_DATED"; detail = "createdAt is in the future relative to asOf (refused)"; }
        else {
          const period = Math.max(1, num(byType[k.type], defaultPeriod));
          if (ageDays > period) { status = "ROTATION_OVERDUE"; detail = `key age ${Math.floor(ageDays)}d exceeds cryptoperiod ${period}d (overdue by ${Math.floor(ageDays - period)}d)`; }
        }
      }
    }
    keys.push(Object.freeze({ id, algorithm: algo, status, compliant: status === "COMPLIANT", detail }));
    if (status !== "COMPLIANT") findings.push(`${id || "(unnamed key)"}: ${status}`);
  }

  const compliant = keys.filter((k) => k.compliant).length;
  const verdict = keys.length === 0 ? "NO_KEYS" : (compliant === keys.length ? "ALL_COMPLIANT" : "VIOLATIONS_FOUND");
  return Object.freeze({ verdict, compliant, total: keys.length, keys: Object.freeze(keys), findings: Object.freeze(findings) });
}

// recognized approved algorithms (strong). Unknown ⇒ not certified (fail-closed).
const APPROVED_ALGOS = new Set(["sha-256", "sha256", "sha-384", "sha384", "sha-512", "sha512", "sha3-256", "sha3-512", "rsa-3072", "rsa3072", "rsa-4096", "rsa4096", "ecdsa-p256", "ecdsa-p384", "ed25519", "aes-128", "aes-256", "aes256", "aes128", "hmac-sha256", "chacha20"]);
function APPROVED(a: string): boolean { return APPROVED_ALGOS.has(a); }

const SECRET_ROTATION_HYGIENE_CONTRACT = Object.freeze({
  id: "V124-SECRET-ROTATION-HYGIENE",
  source: "SÉRIE 23/W10 P3 — key cryptoperiod + algorithm-deprecation policy (NIST SP 800-57 Rev.6 2026; SP 800-131A)",
  statuses: STATUS,
  reuses: Object.freeze(["control-evidence-freshness.daysBetween (injected-asOf key age)", "bash-command-governor.SECRET_PATTERNS (plaintext-literal detection)", "governs agent-identity/evidence-provenance long-lived key material"]),
  notAuthority: "a rotation/algorithm policy over a DECLARED key inventory; it rotates nothing and reads no live key store",
  invariants: Object.freeze([
    "a disallowed/broken algorithm (SHA-1/RSA-1024/DES/RC4/…) ⇒ ALGORITHM_DISALLOWED (replace immediately)",
    "a 112-bit algorithm after the 2030-12-31 cliff (by injected asOf) ⇒ ALGORITHM_DEPRECATED",
    "a key older than its cryptoperiod ⇒ ROTATION_OVERDUE; an inline literal secret ⇒ PLAINTEXT_SECRET_IN_CONFIG",
    "deny-by-default: unknown algorithm, missing asOf, unparseable/future-dated createdAt ⇒ NOT compliant (never certified)",
    "pure/deterministic: asOf injected (no Date.now), static algorithm tables; no network/random",
  ]),
});

module.exports = { assessKeyHygiene, SECRET_ROTATION_HYGIENE_CONTRACT };

if (require.main === module) {
  const demo = assessKeyHygiene([
    { id: "k1", algorithm: "sha-256", createdAt: "2026-10-01" },
    { id: "k2", algorithm: "sha1", createdAt: "2026-10-01" },
    { id: "k3", algorithm: "rsa-3072", createdAt: "2024-01-01" },
  ], { asOf: "2026-11-08", cryptoperiodDays: 365 });
  process.stdout.write(JSON.stringify({ ...SECRET_ROTATION_HYGIENE_CONTRACT, demo: { verdict: demo.verdict, findings: demo.findings } }, null, 2) + "\n");
}

export {};
