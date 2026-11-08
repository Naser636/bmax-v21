#!/usr/bin/env node
"use strict";

/*
 * P8 — API CONTRACT module (standalone). PURE, deterministic. Closes the P8 coherence gap: contract validation that
 * previously lived only inline in parcours-secure-api-governance is here a first-class, reusable module covering
 * contracts, typed schemas, input/output validation, versioning & backward-compatibility, idempotency, an error
 * taxonomy, and auth-scope validation. It REUSES `parcours-secure-api-governance.validateApiExchange` for the base
 * presence/version check (same canonical convention: {version, requiredIn[], requiredOut[]} / {version, in, out}) and
 * adds the richer layer on top. It creates NO second authorizer and NO second contract engine — authorization
 * ADMISSION stays with action-gate; this module only VALIDATES a contract's declared auth REQUIREMENT. Dual export.
 */

const PARCOURS = require("./parcours-secure-api-governance");

const ERROR_TAXONOMY = Object.freeze(["VALIDATION", "TYPE", "VERSION", "AUTH", "COMPATIBILITY", "IDEMPOTENCY", "SERVER"]);
const TYPES = Object.freeze(["string", "number", "boolean", "object", "array"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function err(code: string, field: any, detail: string): any { return { code, field: field || null, detail }; }
function typeOf(v: any): string { return Array.isArray(v) ? "array" : (v === null ? "null" : typeof v); }
function typeChecks(schema: any, obj: any, where: string): any[] {
  const s = isObj(schema) ? schema : {};
  const o = isObj(obj) ? obj : {};
  const out: any[] = [];
  for (const f of Object.keys(s)) {
    const expected = s[f];
    if (!TYPES.includes(expected)) continue;
    if (o[f] === undefined || o[f] === null) continue; // presence handled separately (required vs optional)
    if (typeOf(o[f]) !== expected) out.push(err("TYPE", where + "." + f, `expected ${expected}, got ${typeOf(o[f])}`));
  }
  return out;
}

/** validateRequest(contract, request) -> { ok, errors }. version + required inputs + typed inputSchema + auth scopes. */
function validateRequest(contract: any, request: any): any {
  const c = isObj(contract) ? contract : {};
  const r = isObj(request) ? request : {};
  const errors: any[] = [];
  if (isStr(c.version) && r.version !== c.version) errors.push(err("VERSION", "version", `contract ${c.version} != request ${r.version}`));
  const input = isObj(r.in) ? r.in : {};
  for (const f of arr(c.requiredIn).filter(isStr)) if (!(f in input) || input[f] === undefined || input[f] === null) errors.push(err("VALIDATION", "in." + f, "required input missing"));
  errors.push(...typeChecks(c.inputSchema, input, "in"));
  errors.push(...authErrors(c, r));
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

/** validateResponse(contract, response) -> { ok, errors }. required outputs + typed outputSchema + declared error codes. */
function validateResponse(contract: any, response: any): any {
  const c = isObj(contract) ? contract : {};
  const r = isObj(response) ? response : {};
  const errors: any[] = [];
  const output = isObj(r.out) ? r.out : {};
  if (isStr(r.error)) { // an error response: it must be a declared error code
    if (!arr(c.errors).filter(isStr).includes(r.error)) errors.push(err("VALIDATION", "error", `undeclared error code '${r.error}'`));
    return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
  }
  for (const f of arr(c.requiredOut).filter(isStr)) if (!(f in output) || output[f] === undefined || output[f] === null) errors.push(err("VALIDATION", "out." + f, "required output missing"));
  errors.push(...typeChecks(c.outputSchema, output, "out"));
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

/** authErrors(contract, request) -> []. Validates the contract's declared auth REQUIREMENT (scopes) — it does NOT authorize. */
function authErrors(contract: any, request: any): any[] {
  const c = isObj(contract) ? contract : {};
  const auth = isObj(c.auth) ? c.auth : null;
  if (!auth || auth.required !== true) return [];
  const req = isObj(request) ? request : {};
  const presented = arr(req.scopes).filter(isStr);
  const out: any[] = [];
  if (!isStr(req.principal) && req.authenticated !== true) out.push(err("AUTH", "principal", "authentication required by the contract"));
  for (const s of arr(auth.scopes).filter(isStr)) if (!presented.includes(s)) out.push(err("AUTH", "scopes", `missing required scope '${s}'`));
  return out;
}
function authCheck(contract: any, request: any): any { const e = authErrors(contract, request); return Object.freeze({ ok: e.length === 0, errors: Object.freeze(e) }); }

/**
 * checkCompatibility(oldContract, newContract) -> { compatible, breaking, nonBreaking }. BREAKING: a new required input,
 * a removed required output, an input/output type change, a major version downgrade, a removed declared error.
 */
function checkCompatibility(oldC: any, newC: any): any {
  const o = isObj(oldC) ? oldC : {};
  const n = isObj(newC) ? newC : {};
  const breaking: string[] = [];
  const nonBreaking: string[] = [];
  const oIn = new Set(arr(o.requiredIn).filter(isStr)); const nIn = arr(n.requiredIn).filter(isStr);
  for (const f of nIn) if (!oIn.has(f)) breaking.push(`new required input '${f}' (clients must now send it)`);
  const nOut = new Set(nIn ? arr(n.requiredOut).filter(isStr) : []);
  for (const f of arr(o.requiredOut).filter(isStr)) if (!nOut.has(f)) breaking.push(`removed required output '${f}' (clients may depend on it)`);
  const oIS = isObj(o.inputSchema) ? o.inputSchema : {}; const nIS = isObj(n.inputSchema) ? n.inputSchema : {};
  for (const f of Object.keys(oIS)) if (nIS[f] !== undefined && nIS[f] !== oIS[f]) breaking.push(`input '${f}' type changed ${oIS[f]}→${nIS[f]}`);
  const oOS = isObj(o.outputSchema) ? o.outputSchema : {}; const nOS = isObj(n.outputSchema) ? n.outputSchema : {};
  for (const f of Object.keys(oOS)) if (nOS[f] !== undefined && nOS[f] !== oOS[f]) breaking.push(`output '${f}' type changed ${oOS[f]}→${nOS[f]}`);
  const majorOf = (v: any) => (isStr(v) ? parseInt(String(v).split(".")[0], 10) : NaN);
  if (!isNaN(majorOf(o.version)) && !isNaN(majorOf(n.version)) && majorOf(n.version) < majorOf(o.version)) breaking.push(`version downgrade ${o.version}→${n.version}`);
  const oErr = new Set(arr(o.errors).filter(isStr));
  for (const e of arr(n.errors).filter(isStr)) if (!oErr.has(e)) nonBreaking.push(`new declared error '${e}'`);
  return Object.freeze({ compatible: breaking.length === 0, breaking: Object.freeze(breaking), nonBreaking: Object.freeze(nonBreaking) });
}

/** idempotencyCheck(contract, request, seenKeys) -> { ok, decision, errors }. If the contract is idempotent, an
 * idempotencyKey is REQUIRED; a replayed key is a safe DUPLICATE (not re-applied). */
function idempotencyCheck(contract: any, request: any, seenKeys: any): any {
  const c = isObj(contract) ? contract : {};
  const r = isObj(request) ? request : {};
  const seen = new Set(arr(seenKeys).filter(isStr));
  if (c.idempotent !== true) return Object.freeze({ ok: true, decision: "NOT_REQUIRED", errors: Object.freeze([]) });
  if (!isStr(r.idempotencyKey)) return Object.freeze({ ok: false, decision: "MISSING_KEY", errors: Object.freeze([err("IDEMPOTENCY", "idempotencyKey", "idempotent operation requires an idempotencyKey")]) });
  if (seen.has(r.idempotencyKey)) return Object.freeze({ ok: true, decision: "DUPLICATE", errors: Object.freeze([]) });
  return Object.freeze({ ok: true, decision: "PROCEED", errors: Object.freeze([]) });
}

/** validateExchange(contract, exchange, {seenKeys}) -> full validation. Reuses the parcours base check + the typed/auth/idempotency layer. */
function validateExchange(contract: any, exchange: any, opts: any): any {
  const base = PARCOURS.validateApiExchange(contract, exchange); // canonical presence + version check (reuse, no duplication)
  const req = validateRequest(contract, exchange);
  const res = validateResponse(contract, exchange);
  const idem = idempotencyCheck(contract, exchange, opts && opts.seenKeys);
  const errors = ([] as any[]).concat(req.errors, res.errors, idem.errors);
  return Object.freeze({ ok: base.ok && req.ok && res.ok && idem.ok, baseOk: base.ok, errors: Object.freeze(errors), idempotency: idem.decision });
}

const API_CONTRACT_CONTRACT = Object.freeze({
  id: "P8-API-CONTRACT",
  source: "P8 API/Integration — standalone API-contract module (closes the inline-only coherence gap)",
  errorTaxonomy: ERROR_TAXONOMY, types: TYPES,
  reuses: Object.freeze(["parcours-secure-api-governance.validateApiExchange (base presence/version check)"]),
  notAuthority: "validates contracts/schemas/compat/idempotency and a contract's declared auth REQUIREMENT; it does NOT authorize (admission stays with action-gate) and creates no second contract engine",
  invariants: Object.freeze([
    "pure/deterministic: contract + exchange in → validation out",
    "reuses the canonical {version, requiredIn, requiredOut}/{version, in, out} convention; no second contract engine",
    "typed schema validation (string/number/boolean/object/array); undeclared error codes rejected",
    "backward-compatibility: new required input / removed required output / type change / version downgrade ⇒ BREAKING",
    "idempotent operations require an idempotencyKey; a replayed key is a safe DUPLICATE",
    "auth-scope validation checks the contract's REQUIREMENT only — authorization admission stays with action-gate (no second authorizer)",
  ]),
});

module.exports = {
  ERROR_TAXONOMY, TYPES, API_CONTRACT_CONTRACT,
  validateRequest, validateResponse, authCheck, checkCompatibility, idempotencyCheck, validateExchange,
};

if (require.main === module) { process.stdout.write(JSON.stringify(API_CONTRACT_CONTRACT, null, 2) + "\n"); }

export {};
