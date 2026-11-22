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

  // ---- V150-M: race-free takeover (generation-numbered claims). Deterministic interleavings via fs hooks. ----
  const { currentClaim } = require("./fleet-bridge");
  const gensOf = (cfg, id) => fs.readdirSync(cfg.locksDir).filter((f) => f.startsWith(id + ".lock."));
  const makeStale = (cfg, id) => { const c = currentClaim(cfg, id); const old = (Date.now() - 10000) / 1000; fs.utimesSync(path.join(cfg.locksDir, `${id}.lock.${c.gen}`), old, old); };
  // run `fn` with a one-shot hook that fires a nested claimant the FIRST time B touches fs.<name> on this id.
  function withHook(name, match, nested, fn, nth = 1) {
    const orig = fs[name]; let seen = 0; let fired = false;
    fs[name] = function (p, ...rest) {
      if (!fired && String(p).includes(match) && ++seen === nth) { fired = true; fs[name] = orig; nested(); }
      return orig.call(fs, p, ...rest);
    };
    try { return { result: fn(), fired }; } finally { fs[name] = orig; }
  }

  console.log("Case 5 — two reclaimers on the SAME stale lock: A reclaims between B's stat and B's create ⇒ B loses");
  const rc = { locksDir: path.join(dir, "locks5"), lockTtlMs: 50 };
  ok("seed claim (the 'crashed' holder)", tryClaim(rc, "R5") === true);
  makeStale(rc, "R5");
  let a5 = null;
  const b5 = withHook("openSync", "R5.lock", () => { a5 = tryClaim(rc, "R5"); }, () => tryClaim(rc, "R5")).result;
  ok("A reclaimed inside B's window", a5 === true);
  ok("B LOSES — never double-held", b5 === false);
  ok("A's fresh claim survives (current holder is A's generation)", currentClaim(rc, "R5").gen === 2);

  console.log("Case 6 — inspector 3-claimant interleaving (A reclaims, newcomer C arrives inside B's window) ⇒ exactly ONE holder");
  // every point of B's claim path: its 1st readdir (generation scan), stat of the stale top, its O_EXCL create, and its
  // 2nd readdir (post-create check). At each, A (reclaimer) then C (newcomer) run to completion inside B's window.
  for (const [hookName, nth] of [["readdirSync", 1], ["statSync", 1], ["openSync", 1], ["readdirSync", 2]]) {
    const c6 = { locksDir: path.join(dir, `locks6-${hookName}-${nth}`), lockTtlMs: 50 };
    tryClaim(c6, "R6"); makeStale(c6, "R6");
    let A = null, C = null;
    const h = withHook(hookName, c6.locksDir, () => { A = tryClaim(c6, "R6"); C = tryClaim(c6, "R6"); }, () => tryClaim(c6, "R6"), nth);
    const winners = [A, h.result, C].filter((x) => x === true).length;
    ok(`hook@${hookName}#${nth}: interleaving exercised and exactly one of A/B/C holds (A=${A} B=${h.result} C=${C})`, h.fired === true && winners === 1);
  }

  console.log("Case 7 — identity cannot be confused by inode reuse: a fresh claim file is never moved or deleted by a reclaimer");
  const c7 = { locksDir: path.join(dir, "locks7"), lockTtlMs: 50 };
  tryClaim(c7, "R7"); makeStale(c7, "R7");
  let a7 = null;
  const origStat = fs.statSync; const staleIno = origStat(path.join(c7.locksDir, "R7.lock.1")).ino;
  let fired7 = false;
  fs.statSync = function (p, ...rest) { const st = origStat.call(fs, p, ...rest); if (String(p).includes("R7.lock")) { if (!fired7) { fired7 = true; a7 = tryClaim(c7, "R7"); } try { Object.defineProperty(st, "ino", { value: staleIno }); } catch { /* frozen */ } } return st; };
  let b7; try { b7 = tryClaim(c7, "R7"); } finally { fs.statSync = origStat; }
  const fresh = JSON.parse(fs.readFileSync(path.join(c7.locksDir, "R7.lock.2"), "utf8"));
  ok("with every stat reporting the SAME inode, B still loses", a7 === true && b7 === false);
  ok("A's fresh claim file is intact (not moved, not deleted)", fresh.pid === process.pid && fresh.gen === 2);

  console.log("Case 8 — orphaned claims of dead holders are superseded and collected (bounded files, no stray artefacts)");
  const c8 = { locksDir: path.join(dir, "locks8"), lockTtlMs: 50 };
  for (let i = 0; i < 6; i++) { ok(`takeover #${i + 1} of a dead holder's stale claim succeeds`, tryClaim(c8, "R8") === true); makeStale(c8, "R8"); }
  ok("at most 2 generations remain on disk (older ones collected)", gensOf(c8, "R8").length <= 2);
  ok("no stray reclaim/tombstone files", fs.readdirSync(c8.locksDir).every((f) => /^R8\.lock\.\d+$/.test(f)));

  console.log("Case 9 — release only ever affects the releaser's OWN generation");
  const c9 = { locksDir: path.join(dir, "locks9"), lockTtlMs: 50 };
  tryClaim(c9, "R9"); makeStale(c9, "R9");
  // simulate a different process taking over: forge a fresh generation 2 owned by another pid
  fs.writeFileSync(path.join(c9.locksDir, "R9.lock.2"), JSON.stringify({ pid: 999999, gen: 2 }));
  releaseClaim(c9, "R9"); // the overrunning old holder releases its (gen 1) claim
  ok("the successor's fresh generation is untouched by the old holder's release", tryClaim(c9, "R9") === false);

  console.log("Case 10 — a laggard that targets an already-collected generation loses (post-create check)");
  const c10 = { locksDir: path.join(dir, "locks10"), lockTtlMs: 50 };
  fs.mkdirSync(c10.locksDir, { recursive: true });
  fs.writeFileSync(path.join(c10.locksDir, "R10.lock.4"), "{}"); { const old = (Date.now() - 10000) / 1000; fs.utimesSync(path.join(c10.locksDir, "R10.lock.4"), old, old); }
  fs.writeFileSync(path.join(c10.locksDir, "R10.lock.6"), JSON.stringify({ pid: 999999, gen: 6 })); // live holder; gen 5 was collected
  const origReaddir = fs.readdirSync; let first = true;
  fs.readdirSync = function (p, ...rest) { const r = origReaddir.call(fs, p, ...rest); if (first && String(p) === c10.locksDir) { first = false; return r.filter((f) => f !== "R10.lock.6"); } return r; };
  let lag; try { lag = tryClaim(c10, "R10"); } finally { fs.readdirSync = origReaddir; }
  ok("the laggard (stale view: top=4) recreates gen 5 but LOSES on seeing gen 6", lag === false);
  ok("the live holder's generation 6 is untouched", JSON.parse(fs.readFileSync(path.join(c10.locksDir, "R10.lock.6"), "utf8")).pid === 999999);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nFLEET BRIDGE CONCURRENCY — ${passed} assertions passed.`);
