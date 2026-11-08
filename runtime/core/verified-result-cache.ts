#!/usr/bin/env node
"use strict";

/*
 * V5-E / ENGINEERING INTELLIGENCE — VERIFIED RESULT CACHE (E11 Evidence Trust & Freshness / Verified Evidence Cache).
 * PURE, deterministic. A cached validation result (e.g. a suite PASS) is accepted ONLY when the FULL identity matches:
 * inputs + code + dependencies + configuration + environment, plus provenance and verifiable freshness (§4: "aucun
 * résultat de cache ne doit être accepté sans identité ... avec provenance et fraîcheur vérifiables"). ANY change to
 * code/deps/config/env yields a different key ⇒ MISS ⇒ re-run — a stale or mismatched result is NEVER served as PASS.
 * REUSES evidence-provenance.contentDigest (identity hash). Fail-closed: a key missing ANY identity component is
 * UNCACHEABLE (never a hit); an entry past its freshness window ⇒ MISS; a result without provenance is never stored/
 * trusted. It looks up / stores; it runs no test and grants no authority. Dual export.
 */

const PROV = require("./evidence-provenance");         // contentDigest — full-identity hash

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

const IDENTITY_FIELDS = Object.freeze(["inputs", "code", "deps", "config", "env"]);

/** identityDigest(identity) -> sha256 of the FULL identity, or null if ANY component is missing (uncacheable, fail-closed). */
function identityDigest(identity: any): string | null {
  const id = isObj(identity) ? identity : {};
  for (const f of IDENTITY_FIELDS) if (id[f] === undefined || id[f] === null) return null;   // all five required
  return PROV.contentDigest({ inputs: id.inputs, code: id.code, deps: id.deps, config: id.config, env: id.env });
}

/**
 * lookup(cache, identity, { asOf, maxAgeMs }) -> { status, result?, key, reason }. status: HIT | MISS | UNCACHEABLE.
 * HIT only when the full-identity key matches AND the entry is fresh (asOf − storedAt ≤ maxAge, not future) AND has provenance.
 */
function lookup(cache: any, identity: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const key = identityDigest(identity);
  if (key === null) return frozen("UNCACHEABLE", null, null, "identity missing a component (inputs/code/deps/config/env) ⇒ cannot cache (fail-closed)");
  const store = isObj(cache) ? cache : {};
  const entry = store[key];
  if (!isObj(entry)) return frozen("MISS", null, key, "no entry for this full identity ⇒ MISS (must re-run)");
  if (!isStr(entry.provenance)) return frozen("MISS", null, key, "cached entry has no provenance ⇒ not trusted ⇒ MISS");
  // freshness: entry must not be stale and not future-dated relative to asOf.
  if (isNum(o.maxAgeMs) && isNum(o.asOf) && isNum(entry.storedAt)) {
    const age = o.asOf - entry.storedAt;
    if (age < 0) return frozen("MISS", null, key, "cached entry is future-dated relative to asOf ⇒ MISS (fail-closed)");
    if (age > o.maxAgeMs) return frozen("MISS", null, key, `cached entry is stale (age ${age}ms > maxAge ${o.maxAgeMs}ms) ⇒ MISS (re-run)`);
  } else if (isNum(o.maxAgeMs)) {
    return frozen("MISS", null, key, "freshness requested but asOf/storedAt missing ⇒ cannot verify freshness ⇒ MISS (fail-closed)");
  }
  return frozen("HIT", entry.result, key, "full-identity match + fresh + provenance ⇒ HIT");
}

/** store(cache, identity, result, { storedAt, provenance }) -> new cache. Requires full identity + provenance (else unchanged). */
function store(cache: any, identity: any, result: any, meta: any): any {
  const store = isObj(cache) ? { ...cache } : {};
  const m = isObj(meta) ? meta : {};
  const key = identityDigest(identity);
  if (key === null || !isStr(m.provenance)) return Object.freeze(store);   // never store without full identity + provenance
  store[key] = Object.freeze({ result, provenance: m.provenance, storedAt: isNum(m.storedAt) ? m.storedAt : null, identityFields: IDENTITY_FIELDS });
  return Object.freeze(store);
}

function frozen(status: string, result: any, key: any, reason: string): any { return Object.freeze({ status, result, key, reason }); }

const VERIFIED_RESULT_CACHE_CONTRACT = Object.freeze({
  id: "V5-E-VERIFIED-RESULT-CACHE",
  source: "ODG Engineering Intelligence — Verified Evidence Cache / E11 Evidence Trust & Freshness (§4)",
  identityFields: IDENTITY_FIELDS, statuses: Object.freeze(["HIT", "MISS", "UNCACHEABLE"]),
  reuses: Object.freeze(["evidence-provenance.contentDigest (full-identity hash)", "control-evidence-freshness discipline (age window)"]),
  notAuthority: "a lookup/store over a supplied cache; it runs no test, certifies nothing, and grants no authority",
  invariants: Object.freeze([
    "a cached result is HIT only on a FULL-identity match: inputs + code + deps + config + env (any change ⇒ different key ⇒ MISS ⇒ re-run)",
    "a key missing ANY identity component ⇒ UNCACHEABLE (never a hit, fail-closed)",
    "a stale or future-dated entry ⇒ MISS; freshness requested but unverifiable ⇒ MISS (never serve an unverifiable PASS)",
    "an entry without provenance is never stored or trusted",
    "pure/deterministic: identity + cache in → status out; no clock/random/network (asOf injected); runs nothing",
  ]),
});

module.exports = { identityDigest, lookup, store, IDENTITY_FIELDS, VERIFIED_RESULT_CACHE_CONTRACT };

if (require.main === module) {
  const identity = { inputs: "suite:a", code: "sha:abc", deps: "lock:1", config: "tsconfig:1", env: "node22" };
  let c = store({}, identity, { pass: true }, { provenance: "run:42", storedAt: 1000 });
  const hit = lookup(c, identity, { asOf: 1500, maxAgeMs: 1000 });
  const miss = lookup(c, { ...identity, code: "sha:CHANGED" }, { asOf: 1500, maxAgeMs: 1000 });
  process.stdout.write(JSON.stringify({ ...VERIFIED_RESULT_CACHE_CONTRACT, demo: { sameIdentity: hit.status, changedCode: miss.status } }, null, 2) + "\n");
}

export {};
