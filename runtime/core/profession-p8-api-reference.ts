#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P8 — API / Integration reference project. PURE, deterministic. Over CLEARLY-LABELLED SYNTHETIC API contracts
 * and call timelines it computes the real integration signals: request validation (schema + required + type, fail-closed),
 * idempotency-key dedup (a replay returns the first result, never a second effect), a bounded retry/backoff + timeout
 * policy (classify SUCCESS/RETRY/GIVE_UP; never unbounded), and API contract-compat (removed field / newly-required input /
 * type change ⇒ BREAKING). Simulated auth only; NO real external calls. Matches the profession-p*-reference architecture.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }

/* validateRequest(req, schema) -> fail-closed input validation. schema: { fields:{name:{type,required}} }, authRequired? */
function validateRequest(req: any, schema: any): any {
  const r = isObj(req) ? req : {};
  const s = isObj(schema) ? schema : {};
  const fields = isObj(s.fields) ? s.fields : {};
  const errors: string[] = [];
  if (s.authRequired === true && !(typeof r.authToken === "string" && r.authToken.length > 0)) errors.push("unauthenticated (authToken required)");
  const body = isObj(r.body) ? r.body : {};
  for (const [name, spec0] of Object.entries(fields)) {
    const spec: any = spec0 || {};
    const present = Object.prototype.hasOwnProperty.call(body, name);
    if (spec.required === true && !present) { errors.push("missing required field '" + name + "'"); continue; }
    if (present && spec.type && typeof body[name] !== spec.type) errors.push("field '" + name + "' type " + typeof body[name] + " ≠ " + spec.type);
  }
  for (const k of Object.keys(body)) if (!fields[k]) errors.push("unexpected field '" + k + "' (strict schema)");
  return Object.freeze({ valid: errors.length === 0, status: errors.length === 0 ? 200 : 400, errors: Object.freeze(errors) });
}

/* idempotencyDedup(calls) -> same idempotencyKey ⇒ the FIRST result is returned; later duplicates make NO new effect. */
function idempotencyDedup(calls: any): any {
  const seen = new Map<string, any>(); const effects: string[] = []; const results: any[] = [];
  for (const c of arr(calls)) {
    const key = c && typeof c.idempotencyKey === "string" ? c.idempotencyKey : null;
    if (key && seen.has(key)) { results.push({ id: c.id, replayedFrom: seen.get(key).id, newEffect: false }); continue; }
    if (key) seen.set(key, c);
    effects.push(c.id); results.push({ id: c.id, replayedFrom: null, newEffect: true });
  }
  return Object.freeze({ effects: Object.freeze(effects), results: Object.freeze(results), distinctEffects: effects.length });
}

/* retryPolicy(attempts, policy) -> bounded retry with backoff + timeout classification. attempts: [{outcome, latencyMs}]. */
function retryPolicy(attempts: any, policy: any): any {
  const p = isObj(policy) ? policy : {};
  const maxAttempts = num(p.maxAttempts, 3), timeoutMs = num(p.timeoutMs, Infinity), baseBackoffMs = num(p.baseBackoffMs, 50);
  let used = 0; const backoffs: number[] = [];
  for (const a of arr(attempts)) {
    used++;
    const timedOut = num(a.latencyMs, 0) > timeoutMs;
    const ok = a.outcome === "SUCCESS" && !timedOut;
    if (ok) return Object.freeze({ verdict: "SUCCESS", attemptsUsed: used, backoffsMs: Object.freeze(backoffs), timedOut: false });
    if (used >= maxAttempts) return Object.freeze({ verdict: "GIVE_UP", attemptsUsed: used, backoffsMs: Object.freeze(backoffs), timedOut });
    backoffs.push(baseBackoffMs * Math.pow(2, used - 1)); // exponential backoff, bounded by maxAttempts
  }
  return Object.freeze({ verdict: "GIVE_UP", attemptsUsed: used, backoffsMs: Object.freeze(backoffs), timedOut: false });
}

/* contractCompat(oldSchema, newSchema) -> detect BREAKING changes (removed field / newly-required / type change). */
function contractCompat(oldSchema: any, newSchema: any): any {
  const o = isObj(oldSchema) && isObj(oldSchema.fields) ? oldSchema.fields : {};
  const n = isObj(newSchema) && isObj(newSchema.fields) ? newSchema.fields : {};
  const breaking: string[] = []; const additive: string[] = [];
  for (const [name, spec0] of Object.entries(o)) {
    const os: any = spec0 || {}; const ns: any = n[name];
    if (!ns) { breaking.push("removed field '" + name + "'"); continue; }
    if (os.type && ns.type && os.type !== ns.type) breaking.push("field '" + name + "' type " + os.type + "→" + ns.type);
  }
  for (const [name, spec0] of Object.entries(n)) {
    const ns: any = spec0 || {};
    if (!o[name]) { if (ns.required === true) breaking.push("new REQUIRED field '" + name + "' (breaks existing clients)"); else additive.push("new optional field '" + name + "'"); }
    else if (ns.required === true && (o[name] as any).required !== true) breaking.push("field '" + name + "' became required");
  }
  return Object.freeze({ compatible: breaking.length === 0, verdict: breaking.length === 0 ? "COMPATIBLE" : "BREAKING", breaking: Object.freeze(breaking), additive: Object.freeze(additive) });
}

/* runReferenceProject() -> an end-to-end synthetic API-integration reference run. */
function runReferenceProject(): any {
  const schema = { authRequired: true, fields: { id: { type: "string", required: true }, qty: { type: "number", required: true } } };
  const okReq = validateRequest({ authToken: "t", body: { id: "x", qty: 2 } }, schema);
  const badReq = validateRequest({ body: { id: "x", qty: "two", extra: 1 } }, schema); // unauth + type + unexpected
  const dedup = idempotencyDedup([{ id: "c1", idempotencyKey: "k" }, { id: "c2", idempotencyKey: "k" }, { id: "c3", idempotencyKey: "j" }]);
  const retrySuccess = retryPolicy([{ outcome: "ERROR", latencyMs: 10 }, { outcome: "SUCCESS", latencyMs: 20 }], { maxAttempts: 3, timeoutMs: 100, baseBackoffMs: 50 });
  const retryGiveUp = retryPolicy([{ outcome: "ERROR", latencyMs: 10 }, { outcome: "ERROR", latencyMs: 10 }, { outcome: "ERROR", latencyMs: 10 }], { maxAttempts: 3 });
  const compat = contractCompat(schema, { fields: { id: { type: "string", required: true }, qty: { type: "string", required: true }, coupon: { type: "string", required: true } } });
  return Object.freeze({ okReq, badReq, dedup, retrySuccess, retryGiveUp, compat,
    e2eOk: okReq.valid === true && badReq.valid === false && dedup.distinctEffects === 2 && retrySuccess.verdict === "SUCCESS" && retryGiveUp.verdict === "GIVE_UP" && compat.verdict === "BREAKING" });
}

const P8_API_REFERENCE_CONTRACT = Object.freeze({
  id: "V12.4-P8-API-REFERENCE",
  purpose: "§43 P8 — API/Integration reference: fail-closed request validation, idempotency dedup, bounded retry/backoff/timeout, contract-compat breaking-change detection; simulated auth, no real external calls",
  invariants: Object.freeze([
    "fail-closed validation: missing-required / wrong-type / unexpected-field / unauthenticated ⇒ 400 (never 200 on a bad request)",
    "idempotency: a replayed key returns the FIRST result and makes NO new effect (exactly-once effect per key)",
    "retries are BOUNDED (maxAttempts) with exponential backoff; a timeout is classified, never retried unboundedly",
    "contract-compat: removed field / newly-required input / type change ⇒ BREAKING (additive-only ⇒ compatible); PURE/deterministic, no 10th primitive",
  ]),
});

module.exports = { validateRequest, idempotencyDedup, retryPolicy, contractCompat, runReferenceProject, P8_API_REFERENCE_CONTRACT };
export {};
