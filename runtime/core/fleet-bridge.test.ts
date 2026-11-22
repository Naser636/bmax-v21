#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

/*
 * Fleet Bridge — CONCURRENCY regression test (P0-076).
 *
 * The atomic O_EXCL lock claim is the Runtime's only real cross-process concurrency primitive: it is
 * what stops two Bridge instances from answering the SAME fleet request twice. It had behavioural
 * reproduction (P0-076 forensic) but NO committed regression test. This file is that proof — it drives
 * the SHIPPED exported tryClaim/releaseClaim against a throwaway temp locks dir (no runtime change,
 * no shared state). Deterministic: no wall-clock in the assertions.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { tryClaim, releaseClaim } = require("./fleet-bridge");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-bridge-test-"));

try {
  console.log("Case 1 — atomic single-winner: same requestId claimed by two racers");
  const cfg = { locksDir: path.join(dir, "locks"), lockTtlMs: 300000 };
  const a = tryClaim(cfg, "REQ-1");
  const b = tryClaim(cfg, "REQ-1"); // same id while held ⇒ must lose (EEXIST)
  ok("first claim wins", a === true);
  ok("second concurrent claim of the same id is refused (no double effect)", b === false);

  console.log("Case 2 — a released claim is reclaimable");
  releaseClaim(cfg, "REQ-1");
  const c = tryClaim(cfg, "REQ-1");
  ok("claim succeeds again after release", c === true);
  releaseClaim(cfg, "REQ-1");

  console.log("Case 3 — distinct requestIds are independent (no false conflict)");
  const d1 = tryClaim(cfg, "REQ-A");
  const d2 = tryClaim(cfg, "REQ-B");
  ok("two different ids both succeed", d1 === true && d2 === true);
  releaseClaim(cfg, "REQ-A");
  releaseClaim(cfg, "REQ-B");

  console.log("Case 4 — a stale lock (crashed holder, TTL expired) is reclaimed");
  // lockTtlMs:-1 makes staleness deterministic — age (= now - mtime) is always >= 0 > -1, so the
  // prior lock is unconditionally stale regardless of wall-clock timing (no flake on same-ms mtime).
  const staleCfg = { locksDir: path.join(dir, "locks"), lockTtlMs: -1 };
  const e = tryClaim(staleCfg, "REQ-STALE");
  const f = tryClaim(staleCfg, "REQ-STALE"); // prior lock is stale (ttl 0) ⇒ reclaimed ⇒ succeeds
  ok("stale lock is reclaimed so a crashed instance never deadlocks a request", e === true && f === true);
  releaseClaim(staleCfg, "REQ-STALE");

  console.log("Case 5 — V150-M: two reclaimers racing on the SAME stale lock never BOTH hold it (TOCTOU)");
  // Deterministic interleaving: reclaimer B stats the stale lock; BEFORE B acts, reclaimer A reclaims it (fresh lock).
  // The pre-fix reclaim did a blind unlink(file) ⇒ B deleted A's FRESH lock and created its own ⇒ both returned true
  // (double-held lease = double effect after a crash takeover). Fixed: B must lose and A's lock must survive.
  const raceCfg = { locksDir: path.join(dir, "locks"), lockTtlMs: 50 };
  ok("seed claim (the 'crashed' holder)", tryClaim(raceCfg, "REQ-RACE") === true);
  const old = (Date.now() - 10000) / 1000; fs.utimesSync(path.join(raceCfg.locksDir, "REQ-RACE.lock"), old, old); // make it stale
  const origStat = fs.statSync;
  let aGot = null; let hooked = false;
  fs.statSync = function (p, ...rest) {
    const st = origStat.call(fs, p, ...rest);
    if (!hooked && String(p).endsWith("REQ-RACE.lock")) { hooked = true; fs.statSync = origStat; aGot = tryClaim(raceCfg, "REQ-RACE"); }
    return st;
  };
  let bGot;
  try { bGot = tryClaim(raceCfg, "REQ-RACE"); } finally { fs.statSync = origStat; }
  ok("the interleaving was exercised (A reclaimed between B's stat and B's action)", hooked === true && aGot === true);
  ok("the late reclaimer B LOSES — the stale lease is never double-held", bGot === false);
  const holder = JSON.parse(fs.readFileSync(path.join(raceCfg.locksDir, "REQ-RACE.lock"), "utf8"));
  ok("A's fresh lock survives (not deleted by B)", holder && holder.pid === process.pid);
  ok("no reclaim tombstone is left behind", fs.readdirSync(raceCfg.locksDir).every((f) => !f.includes(".reclaim-")));
  releaseClaim(raceCfg, "REQ-RACE");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nFLEET BRIDGE CONCURRENCY — ${passed} assertions passed.`);
