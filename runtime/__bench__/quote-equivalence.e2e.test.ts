#!/usr/bin/env node
/*
 * LOT quote — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, NO real money/network/secret. build:runtime compiles runtime/core/quote.ts → dist;
 * deps ./invoicing (dual-ported) + ./client-intake co-located by build-dist-closure. A DRAFT quote record is
 * SEEDED directly into isolated temp cwds to exercise quote's OWN governed state machine without coupling to
 * intake/invoicing creation. Operation RETURN values are compared (persisted timestamps are not).
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/quote-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "quote.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "quote.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const temps: string[] = [];
function seededCwd(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "quote-")); temps.push(d);
  const qd = path.join(d, "runtime", "generated", "clients", "quotes");
  fs.mkdirSync(qd, { recursive: true });
  fs.writeFileSync(path.join(qd, "QUOTE-001.json"), JSON.stringify({ id: "QUOTE-001", version: 1, status: "DRAFT", requestId: "REQ-1", currency: "EUR", lines: [], subtotal: 0, discount: 0, taxRate: 0, tax: 0, total: 0, terms: null, validityDays: 30, createdAt: "2026-01-01T00:00:00.000Z", expiresAt: null, supersedes: null, history: [{ to: "DRAFT", by: "odg" }] }, null, 2));
  return d;
}

console.log("LOT quote — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/quote.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/quote.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

for (const x of ["STATUS", "CODE", "createQuote", "get", "list", "approve", "markSent", "accept"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(EQ(js.STATUS, ts.STATUS) && EQ(js.CODE, ts.CODE), "STATUS + CODE frozen enums byte-identical");

// createQuote input-validation branches (no intake needed)
check(EQ(js.createQuote({}, { cwd: seededCwd() }), ts.createQuote({}, { cwd: seededCwd() })), "createQuote INVALID_INPUT parity");
check(EQ(js.createQuote({ requestId: "REQ-x", lines: [{ description: "a", qty: 1, unit: 1 }] }, { cwd: seededCwd() }), ts.createQuote({ requestId: "REQ-x", lines: [{ description: "a", qty: 1, unit: 1 }] }, { cwd: seededCwd() })), "createQuote REQUEST_NOT_FOUND parity (no intake request)");

// state machine: human-authorization deny-by-default + transitions (seeded DRAFT per module cwd)
const H = { by: "human", owner: "ops" };
{
  const dj = seededCwd(), dt = seededCwd();
  check(EQ(js.approve("QUOTE-001", { cwd: dj }), ts.approve("QUOTE-001", { cwd: dt })), "approve WITHOUT human ⇒ HUMAN_AUTHORIZATION_REQUIRED parity");
  check(js.approve("QUOTE-001", { cwd: dj }).code === "HUMAN_AUTHORIZATION_REQUIRED", "approve deny-by-default (no human ⇒ refused)");
}
{
  const dj = seededCwd(), dt = seededCwd();
  const aj = js.approve("QUOTE-001", { cwd: dj, ...H }), at = ts.approve("QUOTE-001", { cwd: dt, ...H });
  check(EQ(aj, at) && aj.status === "APPROVED", "approve WITH human ⇒ APPROVED parity");
  check(EQ(js.markSent("QUOTE-001", { cwd: dj, ...H }), ts.markSent("QUOTE-001", { cwd: dt, ...H })), "markSent (APPROVED→SENT, human) parity");
  check(EQ(js.accept("QUOTE-001", { cwd: dj, ...H }), ts.accept("QUOTE-001", { cwd: dt, ...H })), "accept (SENT→ACCEPTED, human, not expired) parity");
  check(js.get("QUOTE-001", { cwd: dj }).status === "ACCEPTED" && ts.get("QUOTE-001", { cwd: dt }).status === "ACCEPTED", "final status ACCEPTED (both)");
}
{
  // invalid transition: accept directly from DRAFT
  const dj = seededCwd(), dt = seededCwd();
  check(EQ(js.accept("QUOTE-001", { cwd: dj, ...H }), ts.accept("QUOTE-001", { cwd: dt, ...H })) && js.accept("QUOTE-001", { cwd: seededCwd(), ...H }).code === "INVALID_TRANSITION", "accept from DRAFT ⇒ INVALID_TRANSITION parity");
}
// NOT_FOUND
check(EQ(js.approve("QUOTE-999", { cwd: seededCwd(), ...H }), ts.approve("QUOTE-999", { cwd: seededCwd(), ...H })), "approve unknown id ⇒ NOT_FOUND parity");

for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }

console.log(failures === 0 ? "ALL PASS — LOT quote EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
