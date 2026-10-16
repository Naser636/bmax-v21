#!/usr/bin/env node
/*
 * LOT payments — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, NO real money / NO network / NO secret exposure. build:runtime compiles
 * runtime/core/payments.ts → dist; its dep ./invoicing (dual-ported V47) is compiled alongside. Secrets are
 * synthetic (injected via opts.env); the only "secret" is a test HMAC key used to compute a valid signature.
 *
 * PARITY SURFACE (byte-identical return values; timestamped persisted events NOT compared): readiness
 * (NOT_CONFIGURED/TEST_MODE/READY), verifySignature (valid/wrong/missing-secret/non-string), handleWebhook
 * gating (NOT_CONFIGURED, UNAUTHENTICATED, MALFORMED, CARD_DATA_REFUSED, IGNORED_TYPE, INVOICE_NOT_FOUND,
 * idempotent replay). Each handleWebhook call uses an ISOLATED temp cwd (events under tmp, never the repo).
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/payments-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "payments.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "payments.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const temps: string[] = [];
const mkTmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "pay-")); temps.push(d); return d; };

console.log("LOT payments — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/payments.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/payments.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

for (const x of ["STATE", "CODE", "readiness", "verifySignature", "handleWebhook"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(EQ(js.STATE, ts.STATE) && EQ(js.CODE, ts.CODE), "STATE + CODE frozen enums byte-identical");

const SECRET = "test-hmac-key-not-a-real-secret";
const envReady = { PAYMENT_PROVIDER: "testprov", PAYMENT_WEBHOOK_SECRET: SECRET, PAYMENT_LIVE_ENABLED: "1" };
const envTest = { PAYMENT_PROVIDER: "testprov", PAYMENT_WEBHOOK_SECRET: SECRET };
const sign = (body: string) => crypto.createHmac("sha256", SECRET).update(body).digest("hex");

// readiness parity
check(EQ(js.readiness({ env: {} }), ts.readiness({ env: {} })) && js.readiness({ env: {} }).state === "NOT_CONFIGURED", "readiness NOT_CONFIGURED parity");
check(EQ(js.readiness({ env: envTest }), ts.readiness({ env: envTest })) && js.readiness({ env: envTest }).state === "TEST_MODE", "readiness TEST_MODE parity");
check(EQ(js.readiness({ env: envReady }), ts.readiness({ env: envReady })) && js.readiness({ env: envReady }).state === "READY", "readiness READY parity");

// verifySignature parity
const body = JSON.stringify({ eventId: "e1", type: "ping" });
check(js.verifySignature(body, sign(body), { env: envReady }) === true && ts.verifySignature(body, sign(body), { env: envReady }) === true, "verifySignature valid HMAC ⇒ true (both)");
check(js.verifySignature(body, "deadbeef", { env: envReady }) === false && ts.verifySignature(body, "deadbeef", { env: envReady }) === false, "verifySignature wrong sig ⇒ false (both)");
check(js.verifySignature(body, sign(body), { env: {} }) === false && ts.verifySignature(body, sign(body), { env: {} }) === false, "verifySignature missing secret ⇒ false (both)");
check(js.verifySignature(null, sign(body), { env: envReady }) === false && ts.verifySignature(null as any, sign(body), { env: envReady }) === false, "verifySignature non-string body ⇒ false (both)");

// handleWebhook gating parity (return values only; isolated temp cwds)
function hw(mod: any, opts: any) { return mod.handleWebhook({ ...opts, cwd: mkTmp() }); }
check(EQ(js.handleWebhook({ rawBody: body, signature: sign(body), env: {} }), ts.handleWebhook({ rawBody: body, signature: sign(body), env: {} })), "handleWebhook NOT_CONFIGURED parity");
check(EQ(hw(js, { rawBody: body, signature: "bad", env: envReady }), hw(ts, { rawBody: body, signature: "bad", env: envReady })), "handleWebhook UNAUTHENTICATED parity (bad signature)");
const notjson = "not-json";
check(EQ(hw(js, { rawBody: notjson, signature: sign(notjson), env: envReady }), hw(ts, { rawBody: notjson, signature: sign(notjson), env: envReady })), "handleWebhook MALFORMED_EVENT parity");
const card = JSON.stringify({ eventId: "e2", type: "payment_succeeded", card_number: "4111" });
check(EQ(hw(js, { rawBody: card, signature: sign(card), env: envReady }), hw(ts, { rawBody: card, signature: sign(card), env: envReady })) && hw(js, { rawBody: card, signature: sign(card), env: envReady }).code === "CARD_DATA_REFUSED", "handleWebhook CARD_DATA_REFUSED parity");
const ping = JSON.stringify({ eventId: "e3", type: "ping" });
check(EQ(hw(js, { rawBody: ping, signature: sign(ping), env: envReady }), hw(ts, { rawBody: ping, signature: sign(ping), env: envReady })) && hw(js, { rawBody: ping, signature: sign(ping), env: envReady }).code === "IGNORED_TYPE", "handleWebhook IGNORED_TYPE parity");
const nf = JSON.stringify({ eventId: "e4", type: "payment_succeeded", invoiceId: "no-such-invoice", amount: 10 });
check(EQ(hw(js, { rawBody: nf, signature: sign(nf), env: envReady }), hw(ts, { rawBody: nf, signature: sign(nf), env: envReady })) && hw(js, { rawBody: nf, signature: sign(nf), env: envReady }).code === "INVOICE_NOT_FOUND", "handleWebhook INVOICE_NOT_FOUND parity (verified → unknown invoice rejected)");
// idempotent replay: same eventId in the SAME cwd ⇒ no-op (compare the second call of each on its own cwd)
{
  const dj = mkTmp(), dt = mkTmp();
  js.handleWebhook({ rawBody: ping, signature: sign(ping), env: envReady, cwd: dj });
  ts.handleWebhook({ rawBody: ping, signature: sign(ping), env: envReady, cwd: dt });
  const rj = js.handleWebhook({ rawBody: ping, signature: sign(ping), env: envReady, cwd: dj });
  const rt = ts.handleWebhook({ rawBody: ping, signature: sign(ping), env: envReady, cwd: dt });
  check(EQ(rj, rt) && rj.idempotent === true, "handleWebhook idempotent replay parity (same eventId ⇒ no-op)");
}

for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }

console.log(failures === 0 ? "ALL PASS — LOT payments EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
