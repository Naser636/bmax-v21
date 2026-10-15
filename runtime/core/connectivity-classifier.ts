#!/usr/bin/env node
/**
 * connectivity-classifier (TypeScript port; parity with runtime/core/connectivity-classifier.js).
 *
 * PURE, side-effect-free classification of a single connectivity target's observed result. NO network,
 * NO files, NO logging, NO clock. Strict TS port: the public export (classifyConnectivity), its return
 * shape {class, reason, status?}, field ORDER, every branch/class, the exact classification REGEXES and
 * the safety contract (BLOCKED never inferred from a generic error; missing/contradictory ⇒ honest FAIL)
 * are preserved EXACTLY. The historical .js remains the behavioural reference.
 */
"use strict";

const TIMEOUT_RE = /\b(timeout|etimedout)\b/i;
const TLS_RE = /(cert|_tls_|\btls\b|self[_-]?signed|unable_to_verify|depth_zero|cert_has_expired|altname)/i;
// Egress denial — EXACTLY the explicitly authorized codes; nothing generic.
const EGRESS_RE = /\b(enetunreach|eacces|eperm)\b/i;
const DNS_RE = /\b(enotfound|eai_again|eai_noname|eai_fail|eai_nodata)\b/i;

export interface ConnectivityClass {
  class: string;
  reason: string;
  status?: number;
}

function cls(klass: string, reason: string, extra?: Record<string, unknown>): ConnectivityClass {
  return Object.assign({ class: klass, reason: reason }, extra || {}) as ConnectivityClass;
}

export function classifyConnectivity(result: any): ConnectivityClass {
  if (!result || typeof result !== "object") {
    return cls("FAIL", "missing or malformed evidence (not an object)");
  }
  const http = result.http && typeof result.http === "object" ? result.http : null;
  const dns = result.dns && typeof result.dns === "object" ? result.dns : null;
  if (!http && !dns) return cls("FAIL", "no http and no dns evidence present");

  // --- observed HTTP response path ---------------------------------------------------------------
  if (http && http.ok === true) {
    // Contradiction: a reachable response that also carries a transport error ⇒ fail closed.
    if (http.error) return cls("FAIL", "contradictory evidence: http.ok=true with an error present");
    if (typeof http.status !== "number") {
      return cls("FAIL", "contradictory/malformed: http.ok=true without a numeric status");
    }
    if (http.status >= 500) return cls("HTTP_ERROR", `observed HTTP ${http.status}`, { status: http.status });
    // Any response, including 4xx, proves reachability.
    return cls("OK", `reachable: observed HTTP ${http.status}`, { status: http.status });
  }
  // Defensive contradiction: ok=false but a success-range status claimed.
  if (http && http.ok === false && typeof http.status === "number" && http.status < 500 && http.status >= 200) {
    return cls("FAIL", `contradictory evidence: http.ok=false with status ${http.status}`);
  }

  // --- transport failure path (classify by explicit error evidence) ------------------------------
  const err = String((http && http.error) || (dns && dns.error) || "");
  if (!err && !(dns && dns.resolved === false)) {
    return cls("FAIL", "insufficient evidence: no reachable response and no explicit error");
  }
  if (TIMEOUT_RE.test(err)) return cls("TIMEOUT", `observed timeout (${err})`);
  if (TLS_RE.test(err)) return cls("TLS_FAIL", `explicit TLS/certificate error (${err})`);
  if (EGRESS_RE.test(err)) return cls("BLOCKED_BY_NETWORK_POLICY", `explicit egress denial (${err})`);
  if (DNS_RE.test(err) || (dns && dns.resolved === false && DNS_RE.test(String(dns.error || "")))) {
    return cls("DNS_FAIL", `explicit DNS resolution failure (${err || (dns && dns.error)})`);
  }
  // Anything else (ECONNREFUSED, ECONNRESET, unknown, generic nonzero) is an honest FAIL — NEVER BLOCKED.
  return cls("FAIL", err ? `unmatched transport error (${err})` : "insufficient evidence");
}
