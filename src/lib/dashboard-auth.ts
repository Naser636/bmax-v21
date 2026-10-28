/*
 * dashboard-auth — the security precondition gating any future public exposure of the BMAX dashboard. A PURE,
 * fail-closed authorization decision for the dashboard's internal-state surfaces. It is deliberately framework-free
 * (no Next import) so it is unit-testable in isolation and reusable by any Route Handler.
 *
 * Policy (deny-by-default):
 *  - /api/health is ALWAYS allowed (anonymous liveness for load balancers / smoke tests — exposes no internal state).
 *  - Every other surface (the dashboard page, /api/runtime-state, …) requires a token. The token lives ONLY in secure
 *    config (env ODG_DASHBOARD_TOKEN) — never in code. If it is unset/blank ⇒ DENY (503 auth-not-configured): we never
 *    expose internal runtime state when auth is not configured. A valid `Authorization: Bearer <t>` or `x-api-key: <t>`
 *    (constant-time compare) ⇒ allow; anything else ⇒ 401. No token value is ever echoed in the reason.
 *
 * This protects the DATA (the internal-state API). Page-level HTML gating + TLS/reverse-proxy remain separate
 * exposure preconditions; this module is the auth core they build on.
 */
"use strict";

export interface AuthDecision { allow: boolean; status: number; reason: string; }

const PUBLIC_PATHS = ["/api/health"];

/** Constant-time string comparison (avoids timing side-channels on the token). */
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Extract a presented token from Authorization: Bearer <t> or x-api-key: <t>. Returns "" when absent. */
function presentedToken(headers: Record<string, string | null | undefined> | Headers | undefined): string {
  const get = (k: string): string => {
    if (!headers) return "";
    if (typeof (headers as Headers).get === "function") return ((headers as Headers).get(k) || "").toString();
    const h = headers as Record<string, string | null | undefined>;
    const v = h[k] ?? h[k.toLowerCase()] ?? h[k.toUpperCase()];
    return (v || "").toString();
  };
  const auth = get("authorization");
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  const apiKey = get("x-api-key");
  if (apiKey) return apiKey.trim();
  return "";
}

/**
 * evaluateDashboardAuth({ pathname, headers, env }): the fail-closed decision. env defaults to process.env.
 */
export function evaluateDashboardAuth(input: { pathname: string; headers?: any; env?: Record<string, string | undefined> }): AuthDecision {
  const pathname = String(input?.pathname || "");
  const env = input?.env || (typeof process !== "undefined" ? process.env : {}) || {};
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return { allow: true, status: 200, reason: "public health endpoint" };
  }
  const configured = typeof env.ODG_DASHBOARD_TOKEN === "string" ? env.ODG_DASHBOARD_TOKEN.trim() : "";
  if (!configured) {
    return { allow: false, status: 503, reason: "dashboard auth not configured (ODG_DASHBOARD_TOKEN unset) — internal state withheld (fail-closed)" };
  }
  const presented = presentedToken(input?.headers);
  if (!presented) return { allow: false, status: 401, reason: "missing credentials (Authorization: Bearer or x-api-key)" };
  if (!timingSafeEqual(presented, configured)) return { allow: false, status: 401, reason: "invalid credentials" };
  return { allow: true, status: 200, reason: "authenticated" };
}

export default { evaluateDashboardAuth };
