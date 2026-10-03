#!/usr/bin/env node

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
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nFLEET BRIDGE CONCURRENCY — ${passed} assertions passed.`);
