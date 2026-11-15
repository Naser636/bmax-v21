#!/usr/bin/env node
"use strict";
/*
 * IMP-P8-API-POSTURE (lot-4 contract, owner-authorized block) — P8 API security (OWASP API Top 10): a POSITIVE-security
 * validator that admits ONLY requests matching an OpenAPI-declared path + method + required-parameter schema, and flags
 * the rate-limit header posture. PURE, deterministic, deny-by-default. An undeclared path/method/field is REJECTED
 * (never admitted by omission). No request is executed — this validates the posture of a request against a spec.
 *
 * Acceptance (contract): admits only OpenAPI-declared paths/methods/schemas; rate-limit headers spec present.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// the rate-limit headers a conformant API SHOULD emit (IETF draft / common practice) — spec, not enforcement.
const RATE_LIMIT_HEADERS = Object.freeze(["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"]);

/* validate(spec, request) -> admission. spec = { paths: { "<path>": { "<METHOD>": { required:[field], params:{field:"string|number|boolean"} } } } }.
 * request = { path, method, body:{} }. Deny-by-default: anything undeclared ⇒ REJECT. */
function validate(spec: any, request: any): any {
  const s = isObj(spec) ? spec : {};
  const r = isObj(request) ? request : {};
  const paths = isObj(s.paths) ? s.paths : {};
  const violations: string[] = [];

  const pathSpec = isObj(paths[r.path]) ? paths[r.path] : null;
  if (!pathSpec) return reject(["undeclared path '" + r.path + "' — not in the OpenAPI spec (deny-by-default)"]);
  const method = String(r.method || "").toUpperCase();
  const opSpec = isObj(pathSpec[method]) ? pathSpec[method] : null;
  if (!opSpec) return reject(["method '" + method + "' not declared for path '" + r.path + "'"]);

  const body = isObj(r.body) ? r.body : {};
  const params = isObj(opSpec.params) ? opSpec.params : {};
  // required fields present
  for (const f of arr(opSpec.required)) if (!(f in body)) violations.push("missing required field '" + f + "'");
  // no undeclared fields (mass-assignment / OWASP API3 excessive data) — deny-by-default
  for (const k of Object.keys(body)) if (!(k in params)) violations.push("undeclared field '" + k + "' (not in schema — rejected)");
  // declared fields type-check
  for (const [k, t] of Object.entries(params)) if (k in body && typeof body[k] !== t) violations.push("field '" + k + "' type " + typeof body[k] + " ≠ declared " + t);

  if (violations.length) return reject(violations);
  return Object.freeze({ admitted: true, path: r.path, method, violations: Object.freeze([]), rateLimitHeadersExpected: RATE_LIMIT_HEADERS, honesty: honest() });
}
function reject(violations: string[]): any { return Object.freeze({ admitted: false, violations: Object.freeze(violations), rateLimitHeadersExpected: RATE_LIMIT_HEADERS, honesty: honest() }); }
function honest(): string { return "positive-security validation against a supplied OpenAPI spec; deny-by-default (undeclared path/method/field ⇒ REJECTED); rate-limit headers are an EXPECTED posture, not enforced here; NO request is executed."; }

const API_SECURITY_POSTURE_CONTRACT = Object.freeze({
  id: "IMP-P8-API-POSTURE",
  purpose: "P8 — positive-security request validator against an OpenAPI spec; deny-by-default; rate-limit header posture",
  invariants: Object.freeze([
    "admits ONLY OpenAPI-declared path + method + schema-conformant body; undeclared ⇒ REJECTED (never admitted by omission)",
    "undeclared body fields are rejected (mass-assignment / excessive-data guard); required fields enforced; types checked",
    "rate-limit headers are specified as EXPECTED posture (not enforced); NO request is executed",
    "deterministic; read-only; no new engine",
  ]),
});

module.exports = { RATE_LIMIT_HEADERS, validate, API_SECURITY_POSTURE_CONTRACT };
export {};
