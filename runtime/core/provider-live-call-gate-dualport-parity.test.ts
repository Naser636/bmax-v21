#!/usr/bin/env node
// @ts-nocheck — runs under tsx; suppresses tsc typechecking (not strict typing), consistent with the other
// runtime/core *-dualport-parity.test.ts suites. The SOURCES under test are strict-typed.
"use strict";
/*
 * PROVIDER-LIVE-CALL-GATE DUAL-PORT PARITY (AB-4 migration proof) — strict TypeScript canonical
 * runtime/core/provider-live-call-gate.ts vs legacy production port provider-live-call-gate.js. Both
 * required under tsx and proven behaviourally IDENTICAL on the fail-closed decision across env states, and
 * on the gateLiveCall enforcement wrapper (perform never invoked on REFUSED; invoked once on LIVE). The .js
 * stays the AUTHORITATIVE/consumed port; the .ts is a faithful transcription proven equivalent — no JS removal.
 */
const assert = require("assert");
const path = require("path");
const js = require(path.join(__dirname, "provider-live-call-gate.js"));
const ts = require(path.join(__dirname, "provider-live-call-gate.ts"));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

ok("same exported API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));
ok("same env flag + value", js.PROVIDER_LIVE_ENV === ts.PROVIDER_LIVE_ENV && js.PROVIDER_LIVE_VALUE === ts.PROVIDER_LIVE_VALUE);

// Decision parity across env states (fail-closed by default; authorized only on exactly "1").
const states = [
  { env: {}, provider: "claude" },                      // absent ⇒ REFUSED
  { env: { ODG_PROVIDER_LIVE: "1" }, provider: "claude" }, // ⇒ LIVE
  { env: { ODG_PROVIDER_LIVE: "0" }, provider: "openai" }, // not "1" ⇒ REFUSED
  { env: { ODG_PROVIDER_LIVE: "true" } },                  // not "1" ⇒ REFUSED
  undefined,                                                // no input ⇒ reads process.env (both same proc)
];
for (let i = 0; i < states.length; i++) {
  ok(`decision parity state#${i} (js ≡ ts)`, eq(js.evaluateProviderLiveCall(states[i]), ts.evaluateProviderLiveCall(states[i])));
}
ok("default is fail-closed REFUSED", js.evaluateProviderLiveCall({ env: {} }).mode === "REFUSED" && ts.evaluateProviderLiveCall({ env: {} }).mode === "REFUSED");
ok("explicit opt-in ⇒ LIVE", js.evaluateProviderLiveCall({ env: { ODG_PROVIDER_LIVE: "1" } }).mode === "LIVE" && ts.evaluateProviderLiveCall({ env: { ODG_PROVIDER_LIVE: "1" } }).mode === "LIVE");

// gateLiveCall enforcement: perform NEVER invoked on REFUSED; invoked once on LIVE — identical both ports.
for (const [label, m] of [["js", js], ["ts", ts]]) {
  let performed = 0, refused = 0;
  const r1 = m.gateLiveCall(() => { performed++; return "DID"; }, (d) => { refused++; return "HALT"; }, { env: {} });
  ok(`${label}: REFUSED ⇒ perform never called, onRefuse used`, performed === 0 && refused === 1 && r1 === "HALT");
  const r2 = m.gateLiveCall(() => { performed++; return "DID"; }, (d) => { refused++; return "HALT"; }, { env: { ODG_PROVIDER_LIVE: "1" } });
  ok(`${label}: LIVE ⇒ perform called once`, performed === 1 && r2 === "DID");
}

console.log(`\nPROVIDER-LIVE-CALL-GATE DUAL-PORT PARITY — ${passed} assertions passed.`);
