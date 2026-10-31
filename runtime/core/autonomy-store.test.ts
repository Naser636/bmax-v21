#!/usr/bin/env node
// @ts-nocheck — behavioural test (runtime/core): runs under tsx; suppresses tsc typecheck only.
/*
 * autonomy-store crash-atomic + corruption-distinguishing, and the safety integration it protects:
 * a TORN incident ledger must NOT be silently overwritten (which would discard FROZEN loop-protection state),
 * and odg-diagnose/recurrence must report UNKNOWN (not NONE) when the ledger is unreadable.
 * Hazard: uses process.chdir (autonomy-store DIR is cwd-relative) ⇒ runs serially.
 * Run: node runtime/core/autonomy-store.test.js
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); passed += 1; };

const REAL_CWD = process.cwd();
function inTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-autostore-"));
  process.chdir(dir);
  // fresh module instances resolved against the temp cwd's require cache is unnecessary — the modules read cwd at
  // call time (DIR is a cwd-relative path string), so the SAME required instance works after chdir.
  try { return fn(dir); } finally { process.chdir(REAL_CWD); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } }
}
const STORE = require("./autonomy-store.js");
const SD = require("./self-diagnostic.js");
const REC = require("./incident-recurrence.js");

console.log("autonomy-store — atomic + corruption-distinguishing");

// 1. readStrict distinguishes absent / valid / corrupt.
inTemp(() => {
  ok("readStrict ABSENT ⇒ {present:false,corrupt:false,value:null}", (() => { const r = STORE.readStrict("none"); return r.present === false && r.corrupt === false && r.value === null; })());
  STORE.write("good", { a: 1 });
  ok("readStrict VALID ⇒ {present:true,corrupt:false,value}", (() => { const r = STORE.readStrict("good"); return r.present === true && r.corrupt === false && r.value && r.value.a === 1; })());
  fs.writeFileSync(STORE.file("torn"), "{ not valid json");
  ok("readStrict CORRUPT ⇒ {present:true,corrupt:true,value:null}", (() => { const r = STORE.readStrict("torn"); return r.present === true && r.corrupt === true && r.value === null; })());
});

// 2. write is crash-atomic: no leftover temp file; content intact; back-compat read() unchanged.
inTemp(() => {
  STORE.write("x", { v: 42 });
  const files = fs.readdirSync(STORE.DIR);
  ok("write leaves NO .tmp file (atomic rename)", files.filter((f) => /\.tmp/.test(f)).length === 0 && files.includes("x.json"));
  ok("read() back-compat: valid ⇒ parsed; absent ⇒ fallback", STORE.read("x").v === 42 && STORE.read("missing", { d: 1 }).d === 1);
  fs.writeFileSync(STORE.file("c"), "{bad");
  ok("read() back-compat: corrupt ⇒ fallback (unchanged collapse behaviour)", STORE.read("c", { fb: true }).fb === true);
});

// 3. SAFETY: a torn incident ledger must NOT be overwritten by raiseIncident (FROZEN state preserved, not reset).
inTemp(() => {
  const divs = [{ category: "C", firstDifferenceAt: "s1", severity: "CRITICAL" }];
  // Seed a FROZEN incident by raising past maxAttempts.
  let inc;
  for (let i = 0; i < 4; i++) inc = SD.raiseIncident(divs, { maxAttempts: 2, now: "t" });
  const seeded = STORE.readStrict("self-diagnostic-incidents");
  ok("seed: an incident is FROZEN after exceeding maxAttempts", seeded.present && seeded.value && Object.values(seeded.value.incidents).some((x) => x.status === "FROZEN"));
  // Now TEAR the ledger (simulate a crash mid-write) and raise again.
  fs.writeFileSync(STORE.file("self-diagnostic-incidents"), "{ torn ledger");
  const res = SD.raiseIncident(divs, { maxAttempts: 2, now: "t2" });
  ok("corrupt ledger ⇒ raiseIncident REFUSES (recorded:false, LEDGER_CORRUPT)", res && res.recorded === false && res.status === "LEDGER_CORRUPT");
  const after = fs.readFileSync(STORE.file("self-diagnostic-incidents"), "utf8");
  ok("corrupt ledger is NOT clobbered to empty (torn file preserved for recovery)", after === "{ torn ledger");
  // recurrence must report UNKNOWN, not NONE, on the unreadable ledger.
  const rec = REC.loadRecurrence({});
  ok("recurrence on a corrupt ledger ⇒ verdict UNKNOWN (not NONE)", rec.verdict === "UNKNOWN" && rec.summary && rec.summary.ledgerUnreadable === true);
});

// 4. recurrence on a VALID empty ledger is still NONE (no false UNKNOWN).
inTemp(() => {
  STORE.write("self-diagnostic-incidents", { incidents: {} });
  const rec = REC.loadRecurrence({});
  ok("recurrence on a valid empty ledger ⇒ NONE (UNKNOWN only on corrupt)", rec.verdict === "NONE");
});

console.log(`\nALL PASS — autonomy-store (${passed} assertions)`);
