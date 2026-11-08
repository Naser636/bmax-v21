#!/usr/bin/env node
"use strict";

/*
 * WI-LOOP-09 — cognitive-loop. Locks: startCycle shape, ordered advance + CAS, out-of-order rejection,
 * append-only context (no loss on resume), IMPROVE→PERCEIVE iteration wrap, snapshot counts, isResumable,
 * determinism. Pure (no I/O). Run: node_modules/.bin/tsx runtime/core/cognitive-loop.test.ts
 */
const assert = require("assert");
const L = require("./cognitive-loop");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-LOOP-09 — COGNITIVE LOOP");

check(L.STAGES.length === 12 && L.STAGES[0] === "PERCEIVE" && L.STAGES[11] === "IMPROVE", "12 §16 stages PERCEIVE..IMPROVE");

const c0 = L.startCycle("improve X", { cycleId: "cyc1", context: { k: 1 } });
check(c0.stage === "PERCEIVE" && c0.version === 1 && c0.iteration === 1 && c0.objective === "improve X", "startCycle ⇒ PERCEIVE v1 it1");

// ordered advance + CAS + append
const a1 = L.advance(c0, { toStage: "UNDERSTAND", expectedVersion: 1, append: { observations: ["o1"] } });
check(a1.ok && a1.cycle.stage === "UNDERSTAND" && a1.cycle.version === 2 && a1.cycle.observations.length === 1, "advance PERCEIVE→UNDERSTAND ⇒ v2, observation appended");

// out-of-order rejected (fail-closed)
check(L.advance(c0, { toStage: "EXECUTE", expectedVersion: 1 }).decision === "REJECTED", "out-of-order advance (PERCEIVE→EXECUTE) ⇒ REJECTED");
// stale CAS ⇒ CONFLICT, zero change
check(L.advance(a1.cycle, { toStage: "RETRIEVE", expectedVersion: 1 }).decision === "CONFLICT", "stale expectedVersion ⇒ CONFLICT");

// append-only: prior entries never dropped across stages
const a2 = L.advance(a1.cycle, { toStage: "RETRIEVE", expectedVersion: 2, append: { knowledge: ["k1"] } });
check(a2.cycle.observations.length === 1 && a2.cycle.knowledge.length === 1, "append-only: prior observations preserved while knowledge added");

// walk to IMPROVE then wrap → PERCEIVE increments iteration, preserves context
let cur = a2.cycle; // at RETRIEVE v3
const seq = ["DISCOVER", "REASON", "PLAN", "ALLOCATE", "EXECUTE", "VERIFY", "DECIDE", "LEARN", "IMPROVE"];
let v = 3;
for (const s of seq) { const r = L.advance(cur, { toStage: s, expectedVersion: v, append: { decisions: [`d@${s}`] } }); check(r.ok, `advance → ${s}`); cur = r.cycle; v++; }
check(cur.stage === "IMPROVE" && cur.decisions.length === 9, "reached IMPROVE with 9 appended decisions (none lost)");
const wrap = L.advance(cur, { toStage: "PERCEIVE", expectedVersion: v, append: { learnings: ["L1"] } });
check(wrap.ok && wrap.cycle.stage === "PERCEIVE" && wrap.cycle.iteration === 2, "IMPROVE→PERCEIVE wraps to a new iteration (it2)");
check(wrap.cycle.decisions.length === 9 && wrap.cycle.learnings.length === 1, "resume across iteration keeps all validated decisions (§16)");

// snapshot + isResumable + determinism
const snap = L.snapshot(wrap.cycle);
check(snap.stage === "PERCEIVE" && snap.iteration === 2 && snap.counts.decisions === 9, "snapshot: stage/iteration + per-field counts");
check(L.isResumable(wrap.cycle) === true && L.isResumable({}) === false, "isResumable: well-formed cycle yes, junk no");
check(JSON.stringify(L.advance(c0, { toStage: "UNDERSTAND", expectedVersion: 1 })) === JSON.stringify(L.advance(c0, { toStage: "UNDERSTAND", expectedVersion: 1 })), "deterministic advance");

// startCycle guards
check((() => { try { L.startCycle(""); return false; } catch { return true; } })(), "startCycle('') ⇒ throws (objective required)");

console.log(failures === 0 ? "ALL PASS — WI-LOOP-09 COGNITIVE LOOP" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
