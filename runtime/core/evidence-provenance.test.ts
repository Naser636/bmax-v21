#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";

/*
 * EVIDENCE PROVENANCE (audit C5-A2) — hermetic unit proof. The source-revision read is INJECTED (opts.spawn),
 * so this test performs NO real git / subprocess / network / disk write. Proves the additive, fail-closed
 * provenance stamp: content digest (excludes the stamp itself ⇒ self-consistent + idempotent), source
 * binding (commit + tree-dirty), fail-closed resolution (no repo ⇒ sourceAvailable:false, never throws),
 * and tamper detection (verifyProvenance catches any post-stamp mutation).
 *
 * Run: node runtime/core/evidence-provenance.test.js   (or via tsx under `npm test`)
 */

const path = require("path");
const REPO = process.cwd();
const { SCHEMA, contentDigest, resolveSourceRevision, stampProvenance, verifyProvenance } =
  require(path.join(REPO, "runtime", "core", "evidence-provenance.js"));

let failures = 0;
const check = (c, l) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };

// Injected fake `git`: HEAD resolvable, clean tree.
const spawnClean = (cmd, args) => {
  if (cmd === "git" && args[0] === "rev-parse") return { status: 0, stdout: "abc123def456\n" };
  if (cmd === "git" && args[0] === "status") return { status: 0, stdout: "" };
  return { status: 1, stdout: "" };
};
// Injected fake `git`: HEAD resolvable, DIRTY tree.
const spawnDirty = (cmd, args) => {
  if (cmd === "git" && args[0] === "rev-parse") return { status: 0, stdout: "abc123def456\n" };
  if (cmd === "git" && args[0] === "status") return { status: 0, stdout: " M file.ts\n" };
  return { status: 1, stdout: "" };
};
// Injected fake `git`: NOT a repo (non-zero) and a throwing variant.
const spawnNoRepo = () => ({ status: 128, stdout: "", stderr: "not a git repository" });
const spawnThrows = () => { throw new Error("git ENOENT"); };

console.log("EVIDENCE PROVENANCE — hermetic unit proof");

// (1) contentDigest: deterministic, and EXCLUDES an existing provenance field (self-consistent).
const payload = { a: 1, b: ["x", "y"], verdict: "VERIFIED" };
const d1 = contentDigest(payload);
check(/^[a-f0-9]{64}$/.test(d1), "contentDigest is a sha256 hex");
check(contentDigest({ ...payload }) === d1, "contentDigest deterministic for equal payloads");
check(contentDigest({ ...payload, provenance: { anything: true } }) === d1, "contentDigest EXCLUDES the provenance field (stamp never hashes itself)");
check(contentDigest({ ...payload, a: 2 }) !== d1, "contentDigest changes when real content changes");

// (2) resolveSourceRevision: injected success (clean + dirty) and fail-closed (no repo / throw).
const relClean = resolveSourceRevision({ spawn: spawnClean });
check(relClean.available === true && relClean.commit === "abc123def456" && relClean.treeDirty === false, "resolveSourceRevision (clean) ⇒ commit + treeDirty:false + available");
check(resolveSourceRevision({ spawn: spawnDirty }).treeDirty === true, "resolveSourceRevision (dirty) ⇒ treeDirty:true");
const relNone = resolveSourceRevision({ spawn: spawnNoRepo });
check(relNone.available === false && relNone.commit === null && relNone.treeDirty === null, "resolveSourceRevision (no repo) ⇒ fail-closed available:false, no throw");
let threw = false; try { resolveSourceRevision({ spawn: spawnThrows }); } catch { threw = true; }
check(!threw, "resolveSourceRevision (git throws) ⇒ caught, never propagates");

// (3) stampProvenance: additive (original keys preserved), never mutates, carries the full stamp.
const stamped = stampProvenance(payload, { spawn: spawnDirty, runId: "RUN-1" });
check(stamped.a === 1 && stamped.verdict === "VERIFIED" && !("provenance" in payload), "stampProvenance is ADDITIVE and does not mutate the input");
check(stamped.provenance.schema === SCHEMA && stamped.provenance.contentSha256 === d1, "stamp carries schema + content digest of the payload");
check(stamped.provenance.sourceCommit === "abc123def456" && stamped.provenance.treeDirty === true && stamped.provenance.sourceAvailable === true && stamped.provenance.capturedAtRun === "RUN-1", "stamp carries source commit + dirty + run id");
// fail-closed stamp when unattributed
const stampedNoRepo = stampProvenance(payload, { spawn: spawnNoRepo });
check(stampedNoRepo.provenance.sourceAvailable === false && stampedNoRepo.provenance.sourceCommit === null && stampedNoRepo.provenance.capturedAtRun === null, "unattributed stamp ⇒ sourceAvailable:false (honest, never fabricated)");
// non-object payload wrapped
const stampedPrim = stampProvenance("hello", { revision: { commit: "c", treeDirty: false, available: true } });
check(stampedPrim.value === "hello" && stampedPrim.provenance.sourceCommit === "c", "non-object payload wrapped as { value, provenance }");

// (4) verifyProvenance: verifies an intact stamp, and DETECTS tampering.
check(verifyProvenance(stamped).ok === true, "verifyProvenance ⇒ ok for an intact stamp");
const tampered = JSON.parse(JSON.stringify(stamped)); tampered.a = 999; // mutate content, keep old digest
check(verifyProvenance(tampered).ok === false, "verifyProvenance ⇒ DETECTS content mutation (digest mismatch)");
check(verifyProvenance({ a: 1 }).ok === false && verifyProvenance(null).ok === false, "verifyProvenance ⇒ fail-closed on missing stamp / non-object");

// (5) KEYED-HMAC (P0-E SEC#3 follow-on; owner provisions the key, mechanism proven). Mirrors audit-log.
const crypto = require("crypto");
const KEY = "test-ephemeral-provenance-key-DO-NOT-USE-IN-PROD";
// keyed digest differs from keyless for the same payload
check(contentDigest(payload, KEY) !== contentDigest(payload), "keyed contentDigest != keyless (HMAC applied)");
// keyed stamp verifies with the key; stamp carries keyed:true
const kStamp = stampProvenance(payload, { revision: { commit: "c", treeDirty: false, available: true }, key: KEY });
check(kStamp.provenance.keyed === true, "keyed stamp records keyed:true");
check(verifyProvenance(kStamp, { key: KEY }).ok === true && verifyProvenance(kStamp, { key: KEY }).keyed === true, "keyed stamp verifies with the key");
// a keyed stamp verified WITHOUT the key is rejected (fail-closed, not a false pass)
check(verifyProvenance(kStamp).ok === false && /requires the verification key/.test(verifyProvenance(kStamp).reason), "keyed stamp verified WITHOUT the key ⇒ rejected (fail-closed)");
// WRONG key ⇒ rejected
check(verifyProvenance(kStamp, { key: "wrong-key" }).ok === false, "keyed stamp with the WRONG key ⇒ rejected");
// FULL-REWRITE forgery: attacker mutates content and re-stamps KEYLESS (recomputing a self-consistent keyless digest).
// Keyless verify PASSES it (the weakness); KEYED verify REJECTS it (the fix).
const forged = stampProvenance({ ...payload, verdict: "FORGED-VERIFIED" }, { revision: { commit: "c", treeDirty: false, available: true } });
check(verifyProvenance(forged).ok === true, "keyless verify PASSES a re-stamped forgery (demonstrates the weakness)");
check(verifyProvenance(forged, { key: KEY }).ok === false, "KEYED verify REJECTS the keyless forgery (attacker lacks the key)");
// BACKWARD-COMPAT: keyless stamp is byte-identical (no `keyed` field) and digest matches an INDEPENDENT sha256.
check(!("keyed" in stamped.provenance), "keyless stamp has NO keyed field (byte-identical historical shape)");
check(contentDigest({ a: 1 }) === crypto.createHash("sha256").update(JSON.stringify({ a: 1 })).digest("hex"), "keyless contentDigest == independent sha256(JSON) (format pinned, non-self-referential)");

console.log(failures === 0 ? "ALL PASS — evidence-provenance" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
