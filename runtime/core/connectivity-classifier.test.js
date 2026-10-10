#!/usr/bin/env node
"use strict";

/*
 * connectivity-classifier regression — fully OFFLINE, deterministic fixtures (no DNS/HTTP/network).
 * Verifies each class is assigned only on explicit evidence, that BLOCKED is never inferred from a
 * generic error and never masks a genuine failure, and that missing/contradictory evidence fails closed.
 * Run: node runtime/core/connectivity-classifier.test.js
 */
const assert = require("assert");
const { classifyConnectivity } = require("./connectivity-classifier.js");

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); passed += 1; };
const C = (r) => classifyConnectivity(r);

// Reachability (observed HTTP response) — incl. 4xx; status preserved.
ok("HTTP 200 → OK", (() => { const r = C({ http: { ok: true, status: 200 } }); return r.class === "OK" && r.status === 200; })());
ok("HTTP 404 → OK (reachable) with status preserved", (() => { const r = C({ http: { ok: true, status: 404 } }); return r.class === "OK" && r.status === 404; })());
ok("HTTP 503 → HTTP_ERROR with status", (() => { const r = C({ http: { ok: true, status: 503 } }); return r.class === "HTTP_ERROR" && r.status === 503; })());

// Transport failures by explicit error.
ok("ENOTFOUND → DNS_FAIL", C({ http: { ok: false, error: "ENOTFOUND" } }).class === "DNS_FAIL");
ok("dns.resolved=false EAI_AGAIN → DNS_FAIL", C({ dns: { resolved: false, error: "EAI_AGAIN" } }).class === "DNS_FAIL");
ok("CERT_HAS_EXPIRED → TLS_FAIL", C({ http: { ok: false, error: "CERT_HAS_EXPIRED" } }).class === "TLS_FAIL");
ok("ERR_TLS_CERT_ALTNAME_INVALID → TLS_FAIL", C({ http: { ok: false, error: "ERR_TLS_CERT_ALTNAME_INVALID" } }).class === "TLS_FAIL");
ok("timeout → TIMEOUT", C({ http: { ok: false, error: "timeout" } }).class === "TIMEOUT");
ok("ETIMEDOUT → TIMEOUT", C({ http: { ok: false, error: "ETIMEDOUT" } }).class === "TIMEOUT");
ok("ENETUNREACH → BLOCKED_BY_NETWORK_POLICY", C({ http: { ok: false, error: "ENETUNREACH" } }).class === "BLOCKED_BY_NETWORK_POLICY");
ok("EACCES → BLOCKED_BY_NETWORK_POLICY", C({ http: { ok: false, error: "EACCES" } }).class === "BLOCKED_BY_NETWORK_POLICY");
ok("EPERM → BLOCKED_BY_NETWORK_POLICY", C({ http: { ok: false, error: "EPERM" } }).class === "BLOCKED_BY_NETWORK_POLICY");

// NEVER infer BLOCKED from generic/unknown/connection errors.
ok("ECONNREFUSED → FAIL (not BLOCKED)", (() => { const r = C({ http: { ok: false, error: "ECONNREFUSED" } }); return r.class === "FAIL"; })());
ok("ECONNRESET → FAIL (not BLOCKED)", C({ http: { ok: false, error: "ECONNRESET" } }).class === "FAIL");
ok("generic 'Error: boom' → FAIL (not BLOCKED)", C({ http: { ok: false, error: "Error: boom" } }).class === "FAIL");
ok("empty error, http.ok=false → FAIL", C({ http: { ok: false } }).class === "FAIL");

// Missing / malformed / contradictory → honest, never OK.
ok("null → FAIL", C(null).class === "FAIL");
ok("empty object → FAIL", C({}).class === "FAIL");
ok("http.ok=true without status → FAIL (contradictory)", C({ http: { ok: true } }).class === "FAIL");
ok("http.ok=true WITH error → FAIL (contradictory)", C({ http: { ok: true, status: 200, error: "ENETUNREACH" } }).class === "FAIL");
ok("http.ok=false with 200 status → FAIL (contradictory)", C({ http: { ok: false, status: 200 } }).class === "FAIL");

// Safety invariants.
ok("BLOCKED is never OK", (() => { const r = C({ http: { ok: false, error: "ENETUNREACH" } }); return r.class !== "OK"; })());
ok("a 5xx is HTTP_ERROR, never silently OK/BLOCKED", (() => { const r = C({ http: { ok: true, status: 500 } }); return r.class === "HTTP_ERROR" && r.class !== "OK" && r.class !== "BLOCKED_BY_NETWORK_POLICY"; })());
ok("a real DNS failure is never relabelled BLOCKED", C({ http: { ok: false, error: "ENOTFOUND" } }).class !== "BLOCKED_BY_NETWORK_POLICY");

console.log(`\nALL PASS — connectivity-classifier (${passed} assertions)`);
process.exit(0);
