#!/usr/bin/env node
/*
 * LOT launch-readiness — EQUIVALENCE (historical runtime/core/launch-readiness.js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles the .ts → runtime/dist/core. assess({env,cwd}) composes
 * email/invoicing/payments/client-intake readiness (pure, env-driven) + module-load probes + a write/read/
 * remove persistence probe (throwaway temp cwd under runtime/generated). Each scenario calls assess on BOTH
 * modules with the SAME env + a fresh temp cwd and asserts BYTE-IDENTICAL JSON.
 *
 * KEY (the V71 __dirname fix): the compiled module runs from runtime/dist/core yet its moduleLoads probes
 * resolve to the CANONICAL runtime/core (coreDir maps dist→source), so readiness is identical to the source
 * module regardless of per-module migration state. Byte-identical assess() ⇒ the fix holds.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/launch-readiness-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "launch-readiness.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "launch-readiness.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT launch-readiness — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/launch-readiness.js present");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/launch-readiness.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.assess === "function" && !!js.S, "JS exports assess+S");
check(typeof ts.assess === "function" && !!ts.S, "compiled TS exports assess+S");
check(JSON.stringify(js.S) === JSON.stringify(ts.S), "S enum byte-identical");

const genRoot = path.join(REPO, "runtime", "generated");
fs.mkdirSync(genRoot, { recursive: true });
function tmpCwd(): string { return fs.mkdtempSync(path.join(genRoot, "lr-bench-")); }

const ENVS: Array<[string, any]> = [
  ["empty", {}],
  ["imap-only", { IMAP_HOST: "h", IMAP_USER: "u", IMAP_PASS: "p" }],
  ["full-ish", { IMAP_HOST: "h", IMAP_USER: "u", IMAP_PASS: "p", SMTP_HOST: "s", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_SEND_ENABLED: "true", INVOICE_SELLER_NAME: "ACME", INVOICE_SELLER_SIREN: "123", INVOICE_VAT_RATE: "20", PAYMENTS_MODE: "TEST", STRIPE_WEBHOOK_SECRET: "whsec_x" }],
  ["intake-url", { INTAKE_ENDPOINT_URL: "https://x.example/api/intake" }],
];

for (const [label, env] of ENVS) {
  // SAME cwd for both ports (assess() surfaces a cwd-derived `base` path; the persistence probe writes+reads
  // +removes a probe file, so sequential calls on one cwd are idempotent). Separate cwds would differ only by
  // the temp-dir name — a bench artifact, not a behavioural divergence.
  const cwd = tmpCwd();
  const j = js.assess({ env, cwd });
  const t = ts.assess({ env, cwd });
  check(JSON.stringify(j) === JSON.stringify(t), `assess(${label}) byte-identical JS≡TS`);
}

// Explicit coreDir proof: the compiled module (from dist/core) reports every code capability READY — it
// resolved the probes against runtime/core (not dist/core-relative accidents). codeReady depends ONLY on
// module-load probes + persistence (both resolve under coreDir → source).
{
  const cwd = tmpCwd();
  const t = ts.assess({ env: {}, cwd });
  const j = js.assess({ env: {}, cwd });
  check(t.capabilities.intake.state === "READY" && t.capabilities.quote.state === "READY" && t.capabilities.invoicingEngine.state === "READY" && t.capabilities.delivery.state === "READY",
    "compiled-TS moduleLoads resolve to source runtime/core (code caps READY)");
  check(t.codeReady === j.codeReady, "codeReady identical JS≡TS");
}

console.log(failures === 0 ? "ALL PASS — LOT launch-readiness EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
