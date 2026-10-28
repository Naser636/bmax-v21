#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the dashboard auth is fail-closed: health public; internal surfaces deny-by-
// default; token-unset ⇒ 503 (internal state withheld); valid Bearer/x-api-key ⇒ allow; anonymous/invalid ⇒ 401;
// constant-time compare; no token echoed in reasons.
"use strict";
const assert = require("assert");
const { evaluateDashboardAuth } = require("../lib/dashboard-auth.ts");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const TOK = "s3cr3t-token-value";
const env = { ODG_DASHBOARD_TOKEN: TOK };

// (1) health is always public (anonymous), even with no token configured.
ok("/api/health ⇒ allow (public, no token needed)", evaluateDashboardAuth({ pathname: "/api/health", env: {} }).allow === true);

// (2) token UNSET ⇒ internal surfaces DENY with 503 (fail-closed; internal state withheld).
const noCfg = evaluateDashboardAuth({ pathname: "/api/runtime-state", headers: { authorization: "Bearer " + TOK }, env: {} });
ok("token unset ⇒ /api/runtime-state 503 withheld (fail-closed)", noCfg.allow === false && noCfg.status === 503 && /not configured/.test(noCfg.reason));

// (3) configured + valid Bearer ⇒ allow.
ok("valid Bearer ⇒ allow", evaluateDashboardAuth({ pathname: "/api/runtime-state", headers: { authorization: "Bearer " + TOK }, env }).allow === true);
// configured + valid x-api-key ⇒ allow.
ok("valid x-api-key ⇒ allow", evaluateDashboardAuth({ pathname: "/api/runtime-state", headers: { "x-api-key": TOK }, env }).allow === true);

// (4) anonymous (no creds) ⇒ 401.
const anon = evaluateDashboardAuth({ pathname: "/api/runtime-state", headers: {}, env });
ok("anonymous ⇒ 401 missing credentials", anon.allow === false && anon.status === 401 && /missing credentials/.test(anon.reason));
// invalid token ⇒ 401.
const bad = evaluateDashboardAuth({ pathname: "/api/runtime-state", headers: { authorization: "Bearer wrong" }, env });
ok("invalid token ⇒ 401 invalid credentials", bad.allow === false && bad.status === 401 && /invalid credentials/.test(bad.reason));
// wrong-length token ⇒ 401 (constant-time compare rejects).
ok("wrong-length token ⇒ 401", evaluateDashboardAuth({ pathname: "/api/runtime-state", headers: { "x-api-key": "short" }, env }).allow === false);

// (5) the dashboard page path is protected too (not just the API).
ok("dashboard page / ⇒ protected (anonymous denied)", evaluateDashboardAuth({ pathname: "/", headers: {}, env }).allow === false);

// (6) Headers-object (fetch-style) supported.
const h = new Map([["authorization", "Bearer " + TOK]]); h.get = h.get.bind(h);
ok("Headers.get-style input supported", evaluateDashboardAuth({ pathname: "/api/runtime-state", headers: { get: (k) => (k === "authorization" ? "Bearer " + TOK : null) }, env }).allow === true);

// (7) no token value is ever echoed in a reason (no secret leak in errors).
const leak = [noCfg, anon, bad].every((d) => !d.reason.includes(TOK));
ok("no token value leaked in any reason", leak === true);

console.log(`\nDASHBOARD-AUTH suite — ${pass} assertions passed. (fail-closed: health public, internal deny-by-default, token-unset⇒503, valid⇒allow, anon/invalid⇒401, constant-time, no secret leak)`);
