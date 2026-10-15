#!/usr/bin/env node
/*
 * LOT connectivity-classifier — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE: build:runtime compiles runtime/core/connectivity-classifier.ts →
 * runtime/dist/core/connectivity-classifier.js (LEAF, self-contained). Each scenario calls
 * classifyConnectivity on BOTH modules and asserts BYTE-IDENTICAL results (JSON, zero normalisation).
 * Scenarios cover EVERY class path (OK incl. 4xx, HTTP_ERROR, TIMEOUT, TLS_FAIL,
 * BLOCKED_BY_NETWORK_POLICY, DNS_FAIL) and the fail-closed FAIL cases (malformed, no evidence,
 * contradictions, unmatched transport error) — no meaningful difference normalised.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/connectivity-classifier-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "connectivity-classifier.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "connectivity-classifier.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT connectivity-classifier — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/connectivity-classifier.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/connectivity-classifier.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.classifyConnectivity === "function" && typeof ts.classifyConnectivity === "function", "both export classifyConnectivity");

const CASES: Array<[string, any]> = [
  ["null ⇒ FAIL", null],
  ["non-object ⇒ FAIL", 42],
  ["empty object (no http/dns) ⇒ FAIL", {}],
  ["OK 200", { http: { ok: true, status: 200 } }],
  ["OK 404 (4xx still reachable)", { http: { ok: true, status: 404 } }],
  ["HTTP_ERROR 503", { http: { ok: true, status: 503 } }],
  ["ok=true no status ⇒ FAIL", { http: { ok: true } }],
  ["ok=true with error ⇒ FAIL (contradiction)", { http: { ok: true, status: 200, error: "x" } }],
  ["ok=false with 200 ⇒ FAIL (contradiction)", { http: { ok: false, status: 200 } }],
  ["TIMEOUT", { http: { ok: false, error: "ETIMEDOUT connect" } }],
  ["TLS_FAIL", { http: { ok: false, error: "CERT_HAS_EXPIRED" } }],
  ["BLOCKED_BY_NETWORK_POLICY (ENETUNREACH)", { http: { ok: false, error: "connect ENETUNREACH" } }],
  ["DNS_FAIL (ENOTFOUND)", { http: { ok: false, error: "getaddrinfo ENOTFOUND host" } }],
  ["DNS_FAIL via dns.resolved=false", { dns: { resolved: false, error: "EAI_AGAIN" } }],
  ["unmatched ECONNREFUSED ⇒ FAIL (never BLOCKED)", { http: { ok: false, error: "connect ECONNREFUSED" } }],
  ["no error, no reachable ⇒ FAIL", { http: { ok: false } }],
];
for (const [label, input] of CASES) {
  const j = js.classifyConnectivity(input);
  const t = ts.classifyConnectivity(input);
  check(JSON.stringify(j) === JSON.stringify(t), `${label}: BYTE-IDENTICAL JS≡TS (class=${j.class})`);
}
// Spot-check a couple of exact classes to guard against a silently-wrong-but-identical port.
check(js.classifyConnectivity({ http: { ok: false, error: "connect ECONNREFUSED" } }).class === "FAIL", "ECONNREFUSED is FAIL, never BLOCKED (safety contract)");
check(js.classifyConnectivity({ http: { ok: true, status: 404 } }).class === "OK", "4xx is OK (reachability proven)");

console.log(failures === 0 ? "ALL PASS — LOT connectivity-classifier EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
