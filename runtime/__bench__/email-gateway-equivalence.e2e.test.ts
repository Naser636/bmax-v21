#!/usr/bin/env node
/*
 * LOT email-gateway — EQUIVALENCE (historical runtime/core/email-gateway.js vs compiled .ts).
 *
 * Offline, deterministic, hermetic: build:runtime compiles the .ts → runtime/dist/core. The ONLY outward
 * effect (IMAP) is an INJECTED mock factory on BOTH ports — NO real network, NO imapflow. fs writes go to a
 * throwaway temp cwd under runtime/generated. Each scenario calls the SAME public API on BOTH modules and
 * asserts BYTE-IDENTICAL results. Covers: inbound/outbound readiness, fetchInbound with an injected factory
 * (records created), the V71 NO-FACTORY fail-closed path (NO_TRANSPORT, no network), a client-construction
 * error (NO_TRANSPORT), prepareResponseDraft, sendResponse.
 *
 * KEY (the V71 closure fix): email-gateway no longer requires the external "imapflow" — the factory is
 * injected by the edge caller. This bench proves byte-identical behaviour INCLUDING the no-factory fail-close.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/email-gateway-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "email-gateway.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "email-gateway.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT email-gateway — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/email-gateway.js present");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/email-gateway.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
const API = ["STATE", "CODE", "inboundReadiness", "outboundReadiness", "fetchInbound", "prepareResponseDraft", "sendResponse"];
check(API.every((k) => js[k] !== undefined) && typeof js.fetchInbound === "function", "JS exports full API");
check(API.every((k) => ts[k] !== undefined) && typeof ts.fetchInbound === "function", "compiled TS exports full API");
check(typeof js.defaultImapFactory === "undefined" && typeof ts.defaultImapFactory === "undefined", "defaultImapFactory NO LONGER exported (moved to the edge bin)");

const genRoot = path.join(REPO, "runtime", "generated");
fs.mkdirSync(genRoot, { recursive: true });
function tmpCwd(): string { return fs.mkdtempSync(path.join(genRoot, "eg-bench-")); }

const ENV = { IMAP_HOST: "imap.example.test", IMAP_PORT: "993", IMAP_USER: "ops@example.test", IMAP_PASS: "secret", SMTP_HOST: "smtp.example.test", SMTP_USER: "ops@example.test", SMTP_PASS: "s" };
const INQUIRY = { messageId: "<abc-1@example.test>", from: "jane@acme.example", subject: "Need a CSV→JSON script", date: "2026-10-09T10:00:00Z", text: "Hi, could you build a small converter?" };
function mockImap(messages: any[], { failConnect = false } = {}) {
  return () => ({
    async connect() { if (failConnect) throw new Error("TLS handshake failed"); },
    async fetchAllUnseen() { return messages; },
    async logout() {},
  });
}
const NOW = () => "2026-10-16T00:00:00.000Z";

(async () => {
  // Readiness (pure).
  for (const [label, env] of [["configured", ENV], ["empty", {}], ["partial", { IMAP_HOST: "h" }]] as Array<[string, any]>) {
    check(JSON.stringify(js.inboundReadiness({ env })) === JSON.stringify(ts.inboundReadiness({ env })), `inboundReadiness(${label}) byte-identical`);
    check(JSON.stringify(js.outboundReadiness({ env })) === JSON.stringify(ts.outboundReadiness({ env })), `outboundReadiness(${label}) byte-identical`);
  }

  // fetchInbound with injected mock factory ⇒ one HELD record (separate temp cwds, fixed now).
  {
    const j = await js.fetchInbound({ env: ENV, cwd: tmpCwd(), imapFactory: mockImap([INQUIRY]), now: NOW });
    const t = await ts.fetchInbound({ env: ENV, cwd: tmpCwd(), imapFactory: mockImap([INQUIRY]), now: NOW });
    check(JSON.stringify(j) === JSON.stringify(t), "fetchInbound(mock factory) byte-identical");
    check(j.ok === true && j.created.length === 1, "fetchInbound created one record");
  }
  // V71 NO-FACTORY ⇒ NO_TRANSPORT (fail closed, no network) on both.
  {
    const j = await js.fetchInbound({ env: ENV, cwd: tmpCwd() });
    const t = await ts.fetchInbound({ env: ENV, cwd: tmpCwd() });
    check(JSON.stringify(j) === JSON.stringify(t) && j.code === "NO_TRANSPORT" && j.ok === false, "fetchInbound(NO factory) ⇒ NO_TRANSPORT identical (fail closed)");
  }
  // Client CONSTRUCTION/connect error ⇒ fails closed identically.
  {
    const j = await js.fetchInbound({ env: ENV, cwd: tmpCwd(), imapFactory: mockImap([INQUIRY], { failConnect: true }), now: NOW });
    const t = await ts.fetchInbound({ env: ENV, cwd: tmpCwd(), imapFactory: mockImap([INQUIRY], { failConnect: true }), now: NOW });
    check(JSON.stringify(j) === JSON.stringify(t) && j.ok === false, "fetchInbound(connect error) fails closed identical");
  }
  // not-configured env ⇒ NOT_CONFIGURED (no factory even attempted).
  {
    const j = await js.fetchInbound({ env: {}, cwd: tmpCwd(), imapFactory: mockImap([INQUIRY]) });
    const t = await ts.fetchInbound({ env: {}, cwd: tmpCwd(), imapFactory: mockImap([INQUIRY]) });
    check(JSON.stringify(j) === JSON.stringify(t) && j.code === "NOT_CONFIGURED", "fetchInbound(unconfigured) ⇒ NOT_CONFIGURED identical");
  }

  // prepareResponseDraft + sendResponse (outbound gates).
  for (const [label, id, opts] of [
    ["draft default", "CLIENT-001", {}],
    ["draft custom", "CLIENT-001", { body: "Bonjour", subject: "Re" }],
  ] as Array<[string, string, any]>) {
    check(JSON.stringify(js.prepareResponseDraft(id, opts)) === JSON.stringify(ts.prepareResponseDraft(id, opts)), `prepareResponseDraft(${label}) byte-identical`);
  }
  for (const [label, env] of [["send disabled", ENV], ["send enabled", { ...ENV, EMAIL_SEND_ENABLED: "true" }]] as Array<[string, any]>) {
    const draft = { to: "x@y.z", subject: "s", body: "b" };
    check(JSON.stringify(js.sendResponse(draft, { env })) === JSON.stringify(ts.sendResponse(draft, { env })), `sendResponse(${label}) byte-identical`);
  }

  console.log(failures === 0 ? "ALL PASS — LOT email-gateway EQUIVALENCE" : `FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
