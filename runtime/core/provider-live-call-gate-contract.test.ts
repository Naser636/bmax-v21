#!/usr/bin/env node
// @ts-nocheck — runs under tsx; suppresses tsc typechecking (the SOURCE under test is strict-typed).
"use strict";
/*
 * PROVIDER-LIVE-CALL-GATE CONTRACT (ZERO-JS L-iii) — strict TypeScript canonical provider-live-call-gate.ts
 * is now the SOLE port. Replaces the dual-port parity suite: proves the fail-closed decision across env
 * states and the gateLiveCall enforcement wrapper (perform never invoked on REFUSED; invoked once on LIVE).
 */
const assert = require("assert");
const path = require("path");
const m = require(path.join(__dirname, "provider-live-call-gate.ts"));
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

ok("exports evaluateProviderLiveCall + gateLiveCall", typeof m.evaluateProviderLiveCall === "function" && typeof m.gateLiveCall === "function");
ok("env flag + authorized value present", typeof m.PROVIDER_LIVE_ENV === "string" && typeof m.PROVIDER_LIVE_VALUE === "string");

// Fail-closed decision: authorized only on exactly the opt-in value; everything else REFUSED.
ok("absent flag ⇒ REFUSED", m.evaluateProviderLiveCall({ env: {} }).mode === "REFUSED");
ok("explicit opt-in '1' ⇒ LIVE", m.evaluateProviderLiveCall({ env: { ODG_PROVIDER_LIVE: "1" } }).mode === "LIVE");
ok("'0' ⇒ REFUSED", m.evaluateProviderLiveCall({ env: { ODG_PROVIDER_LIVE: "0" } }).mode === "REFUSED");
ok("'true' (not the exact value) ⇒ REFUSED", m.evaluateProviderLiveCall({ env: { ODG_PROVIDER_LIVE: "true" } }).mode === "REFUSED");

// gateLiveCall enforcement wrapper.
let performed = 0, refused = 0;
const r1 = m.gateLiveCall(() => { performed++; return "DID"; }, () => { refused++; return "HALT"; }, { env: {} });
ok("REFUSED ⇒ perform never called, onRefuse used", performed === 0 && refused === 1 && r1 === "HALT");
const r2 = m.gateLiveCall(() => { performed++; return "DID"; }, () => { refused++; return "HALT"; }, { env: { ODG_PROVIDER_LIVE: "1" } });
ok("LIVE ⇒ perform called exactly once", performed === 1 && r2 === "DID");

console.log(`\nPROVIDER-LIVE-CALL-GATE CONTRACT — ${passed} assertions passed.`);
