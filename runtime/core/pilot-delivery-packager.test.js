#!/usr/bin/env node
"use strict";

/*
 * PILOT DELIVERY PACKAGER — behavioural contract test. Pure, read-only, deterministic. Each case builds a
 * throwaway cwd with real baseline artifacts (mission spec / mission-report / mission-ledger /
 * patch-execution / capability evidence), then drives the REAL packageDelivery against it. No network,
 * no clock. Covers the 12 CTO-mandated cases.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const assert = require("assert");

const MODULE = path.resolve(__dirname, "pilot-delivery-packager.js");
const { packageDelivery, CODE } = require(MODULE);

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }
function hasCode(pkg, code) { return pkg.rejections.some((r) => r.code === code); }

const MISSION = "PILOT_M";
const EVID_REL = "runtime/generated/external-research-acquisition.json";

function writeJson(dir, rel, obj) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
}

// A complete VALID, proven External-Research-LIVE delivery. Returns the cwd dir. Overrides mutate parts.
function buildValid(over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-test-"));
  writeJson(dir, `runtime/missions/${MISSION}.json`, over.spec || {
    mission: MISSION, mode: "ENGINEERING", requires_engineering: true,
    authorized_paths: ["runtime/**"], objectives: [{ id: "EXTERNAL_RESEARCH_1", goal: "acquire research" }],
  });
  writeJson(dir, "runtime/generated/mission-report.json", over.report || { mission: MISSION, status: "SUCCESS", validated: true });
  writeJson(dir, "runtime/generated/mission-ledger.json", over.ledger || [{ mission: MISSION, proven: true, validated: true, state: "RELEASED", archived: false }]);
  writeJson(dir, "runtime/generated/patch-execution.json", over.exec || {
    mission: MISSION,
    executed: [{ objectiveId: "EXTERNAL_RESEARCH_1", action: "EXTERNAL_RESEARCH_1", status: "EXECUTED", capability: "External Research Acquisition", evidence: over.evidenceRel || EVID_REL }],
  });
  if (over.evidence !== null) {
    writeJson(dir, over.evidenceRel || EVID_REL, over.evidence || {
      capability: "External Research Acquisition", objective: "EXTERNAL_RESEARCH_1", mode: "LIVE", acquired: true,
      authorized: true, policyAllows: true,
      sources: [{ url: "https://src.example.org/a", http_status: 200, content_hash: "a".repeat(64) }],
      ranked: [{ title: "x", provenance_ref: "https://src.example.org/a" }],
    });
  }
  return dir;
}

// Recursively hash every file under dir (byte-level) → read-only proof.
function hashTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    }
  };
  walk(dir);
  return out;
}

// 1 — VALID, proven ⇒ accepted package with one deliverable, human auth mandatory.
{
  const dir = buildValid();
  const pkg = packageDelivery(MISSION, { cwd: dir });
  ok("1 valid proven ⇒ accepted", pkg.accepted === true);
  ok("1 one deliverable with sha256 + provenance", pkg.deliverable.length === 1 && /^[0-9a-f]{64}$/.test(pkg.deliverable[0].sha256) && pkg.deliverable[0].provenance.kind === "external-research-live");
  ok("1 verdict + ledger not upgraded", pkg.verdict.validated === true && pkg.ledger.proven === true);
  ok("1 human authorization ALWAYS required + readOnly", pkg.humanAuthorizationRequired === true && pkg.readOnly === true);
  ok("1 no rejections", pkg.rejections.length === 0);
}

// 2 — missing / empty evidence ⇒ rejected.
{
  const dir = buildValid();
  fs.rmSync(path.join(dir, EVID_REL), { force: true }); // missing
  const pkg = packageDelivery(MISSION, { cwd: dir });
  ok("2a missing evidence ⇒ MISSING_EVIDENCE + not accepted", hasCode(pkg, CODE.MISSING_EVIDENCE) && !pkg.accepted);
  const dir2 = buildValid(); fs.writeFileSync(path.join(dir2, EVID_REL), ""); // empty
  ok("2b empty evidence ⇒ MISSING_EVIDENCE", hasCode(packageDelivery(MISSION, { cwd: dir2 }), CODE.MISSING_EVIDENCE));
}

// 3 — DRY_RUN / acquired:false / missing provenance ⇒ rejected.
{
  const dry = buildValid({ evidence: { capability: "External Research Acquisition", mode: "DRY_RUN", acquired: false, sources: [], ranked: [] } });
  ok("3a DRY_RUN ⇒ DRY_RUN_NOT_ACQUISITION", hasCode(packageDelivery(MISSION, { cwd: dry }), CODE.DRY_RUN_NOT_ACQUISITION));
  const noHash = buildValid({ evidence: { capability: "External Research Acquisition", mode: "LIVE", acquired: true, sources: [{ url: "u", http_status: 200 }], ranked: [] } });
  ok("3b source without content_hash ⇒ UNVERIFIED_PROVENANCE", hasCode(packageDelivery(MISSION, { cwd: noHash }), CODE.UNVERIFIED_PROVENANCE));
  const non2xx = buildValid({ evidence: { capability: "External Research Acquisition", mode: "LIVE", acquired: true, sources: [{ url: "u", http_status: 404, content_hash: "b".repeat(64) }], ranked: [] } });
  ok("3c non-2xx source ⇒ UNVERIFIED_PROVENANCE", hasCode(packageDelivery(MISSION, { cwd: non2xx }), CODE.UNVERIFIED_PROVENANCE));
  const unknownCap = buildValid({
    exec: { mission: MISSION, executed: [{ objectiveId: "X_1", status: "EXECUTED", capability: "Unknown Capability", evidence: EVID_REL }] },
    evidence: { capability: "Unknown Capability", foo: 1 },
  });
  ok("3d capability w/o provenance contract ⇒ UNVERIFIED_PROVENANCE (default-deny)", hasCode(packageDelivery(MISSION, { cwd: unknownCap }), CODE.UNVERIFIED_PROVENANCE));
}

// 4 — failed / absent validation ⇒ rejected (never inferred).
{
  const failed = buildValid({ report: { mission: MISSION, status: "BLOCKED", validated: false } });
  ok("4a validated:false ⇒ NOT_VALIDATED", hasCode(packageDelivery(MISSION, { cwd: failed }), CODE.NOT_VALIDATED) && !packageDelivery(MISSION, { cwd: failed }).accepted);
  const dir = buildValid(); fs.rmSync(path.join(dir, "runtime/generated/mission-report.json"), { force: true });
  ok("4b absent report ⇒ BASELINE_INPUT_MISSING", hasCode(packageDelivery(MISSION, { cwd: dir }), CODE.BASELINE_INPUT_MISSING));
}

// 5 — missing / unproven ledger ⇒ rejected (never upgraded).
{
  const unproven = buildValid({ ledger: [{ mission: MISSION, proven: false, validated: false, state: "EXECUTING" }] });
  ok("5a unproven entry ⇒ NOT_PROVEN_IN_LEDGER", hasCode(packageDelivery(MISSION, { cwd: unproven }), CODE.NOT_PROVEN_IN_LEDGER));
  const noEntry = buildValid({ ledger: [{ mission: "OTHER", proven: true, validated: true }] });
  ok("5b no entry for mission ⇒ NOT_PROVEN_IN_LEDGER", hasCode(packageDelivery(MISSION, { cwd: noEntry }), CODE.NOT_PROVEN_IN_LEDGER));
}

// 6 — mission identity mismatch ⇒ rejected (no verdict borrowing).
{
  const mism = buildValid({ report: { mission: "OTHER_MISSION", status: "SUCCESS", validated: true } });
  ok("6a report identity mismatch ⇒ MISSION_IDENTITY_MISMATCH", hasCode(packageDelivery(MISSION, { cwd: mism }), CODE.MISSION_IDENTITY_MISMATCH));
  const execMism = buildValid({ exec: { mission: "OTHER", executed: [{ objectiveId: "EXTERNAL_RESEARCH_1", status: "EXECUTED", capability: "External Research Acquisition", evidence: EVID_REL }] } });
  ok("6b execution identity mismatch ⇒ MISSION_IDENTITY_MISMATCH", hasCode(packageDelivery(MISSION, { cwd: execMism }), CODE.MISSION_IDENTITY_MISMATCH));
}

// 7 — unauthorized path, traversal, scope mismatch ⇒ rejected.
{
  const trav = buildValid({ exec: { mission: MISSION, executed: [{ objectiveId: "E1", status: "EXECUTED", capability: "External Research Acquisition", evidence: "../../etc/passwd" }] } });
  ok("7a path traversal ⇒ PATH_OUTSIDE_SCOPE", hasCode(packageDelivery(MISSION, { cwd: trav }), CODE.PATH_OUTSIDE_SCOPE));
  const outScope = buildValid({
    spec: { mission: MISSION, requires_engineering: true, authorized_paths: ["runtime/generated/**"], objectives: [{ id: "E1" }] },
    exec: { mission: MISSION, executed: [{ objectiveId: "E1", status: "EXECUTED", capability: "External Research Acquisition", evidence: "secrets/leak.json" }] },
    evidenceRel: "secrets/leak.json",
  });
  ok("7b out-of-scope path ⇒ PATH_OUTSIDE_SCOPE", hasCode(packageDelivery(MISSION, { cwd: outScope }), CODE.PATH_OUTSIDE_SCOPE));
  const abs = buildValid({ exec: { mission: MISSION, executed: [{ objectiveId: "E1", status: "EXECUTED", capability: "External Research Acquisition", evidence: "/etc/hosts" }] } });
  ok("7c absolute path ⇒ PATH_OUTSIDE_SCOPE", hasCode(packageDelivery(MISSION, { cwd: abs }), CODE.PATH_OUTSIDE_SCOPE));
}

// 8 — malformed JSON ⇒ fail closed (no uncontrolled throw).
{
  const dir = buildValid(); fs.writeFileSync(path.join(dir, EVID_REL), "{ not json ]");
  let pkg; let threw = false;
  try { pkg = packageDelivery(MISSION, { cwd: dir }); } catch { threw = true; }
  ok("8a malformed evidence ⇒ MALFORMED_JSON, no throw", !threw && hasCode(pkg, CODE.MALFORMED_JSON));
  const dir2 = buildValid(); fs.writeFileSync(path.join(dir2, "runtime/generated/mission-ledger.json"), "{bad");
  ok("8b malformed baseline ⇒ MALFORMED_JSON", hasCode(packageDelivery(MISSION, { cwd: dir2 }), CODE.MALFORMED_JSON));
}

// 9 — snapshot/hash detects tampering.
{
  const dir = buildValid();
  const before = packageDelivery(MISSION, { cwd: dir });
  const sha0 = before.deliverable[0].sha256;
  // Tamper: keep valid JSON but downgrade acquisition (acquired:false) — provenance contract broken.
  const ev = JSON.parse(fs.readFileSync(path.join(dir, EVID_REL), "utf8")); ev.acquired = false; ev.mode = "DRY_RUN";
  fs.writeFileSync(path.join(dir, EVID_REL), JSON.stringify(ev));
  const after = packageDelivery(MISSION, { cwd: dir });
  ok("9a tamper breaks acceptance (re-validated each call)", before.accepted === true && after.accepted === false && hasCode(after, CODE.DRY_RUN_NOT_ACQUISITION));
  // Tamper that keeps provenance valid but changes bytes ⇒ sha256 snapshot differs (detectable).
  const dir2 = buildValid(); const p1 = packageDelivery(MISSION, { cwd: dir2 });
  const ev2 = JSON.parse(fs.readFileSync(path.join(dir2, EVID_REL), "utf8")); ev2.sources[0].content_hash = "c".repeat(64);
  fs.writeFileSync(path.join(dir2, EVID_REL), JSON.stringify(ev2));
  const p2 = packageDelivery(MISSION, { cwd: dir2 });
  ok("9b byte change ⇒ sha256 snapshot differs (tamper visible)", p1.deliverable[0].sha256 !== p2.deliverable[0].sha256);
  void sha0;
}

// 10 — read-only: fixtures byte-identical after many calls.
{
  const dir = buildValid();
  const h0 = hashTree(dir);
  for (let i = 0; i < 5; i++) packageDelivery(MISSION, { cwd: dir });
  packageDelivery(MISSION, { cwd: dir }); packageDelivery("OTHER", { cwd: dir });
  ok("10 all fixture files byte-identical after calls (read-only)", JSON.stringify(hashTree(dir)) === JSON.stringify(h0));
}

// 11 — no external-action mechanism; human authorization always required.
{
  const mod = require(MODULE);
  const names = Object.keys(mod);
  ok("11a exports only packageDelivery + CODE", names.length === 2 && typeof mod.packageDelivery === "function" && typeof mod.CODE === "object");
  // Transport/handoff/payment MECHANISMS would be exported FUNCTIONS; CODE is inert string data (reason
  // codes), so it is excluded from the mechanism check (e.g. BAD_REQUEST is a reason, not a mechanism).
  const forbidden = /send|publish|transmit|fetch|http|pay|invoice|upload|email|notify|deploy/i;
  const exportedFns = names.filter((n) => typeof mod[n] === "function");
  ok("11b only packageDelivery is a function; no transport/handoff/payment mechanism exported",
    exportedFns.length === 1 && exportedFns[0] === "packageDelivery" && !exportedFns.some((n) => forbidden.test(n))
    && Object.values(mod.CODE).every((v) => typeof v === "string"));
  const rejected = packageDelivery("NOPE", { cwd: fs.mkdtempSync(path.join(os.tmpdir(), "pkg-empty-")) });
  ok("11c human auth required even on reject", rejected.humanAuthorizationRequired === true && rejected.accepted === false);
}

// 12 — deterministic: repeated calls on unchanged inputs ⇒ equivalent package.
{
  const dir = buildValid();
  const a = JSON.stringify(packageDelivery(MISSION, { cwd: dir }));
  const b = JSON.stringify(packageDelivery(MISSION, { cwd: dir }));
  ok("12 idempotent/deterministic package", a === b && JSON.parse(a).accepted === true);
}

// 13 — D1 SYMLINK CONFINEMENT. An in-scope DECLARED evidence path that is a symlink must be confined by
//      realpath to cwd AND authorized scope; escapes are rejected and their content is never packaged.
{
  // 13a — symlink to a target OUTSIDE cwd (the original D1 escape) ⇒ PATH_OUTSIDE_SCOPE, not accepted.
  const dir = buildValid({ evidence: null }); // declared evidence path exists in exec, file written as symlink below
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "OUTSIDE-"));
  const secret = path.join(outside, "secret.json");
  fs.writeFileSync(secret, JSON.stringify({ capability: "External Research Acquisition", mode: "LIVE", acquired: true, sources: [{ url: "u", http_status: 200, content_hash: "a".repeat(64) }], ranked: [{ provenance_ref: "u" }] }));
  fs.mkdirSync(path.join(dir, "runtime/generated"), { recursive: true });
  fs.symlinkSync(secret, path.join(dir, EVID_REL));
  const pkg = packageDelivery(MISSION, { cwd: dir });
  ok("13a symlink escaping cwd ⇒ PATH_OUTSIDE_SCOPE, not accepted", hasCode(pkg, CODE.PATH_OUTSIDE_SCOPE) && pkg.accepted === false);
  ok("13a out-of-scope content NEVER included in the package", pkg.deliverable.length === 0);

  // 13b — symlink INSIDE cwd but OUTSIDE authorizedPaths ⇒ rejected (real path re-checked against scope).
  const dir2 = buildValid({ evidence: null });
  fs.mkdirSync(path.join(dir2, "secrets"), { recursive: true });
  fs.writeFileSync(path.join(dir2, "secrets/real.json"), JSON.stringify({ capability: "External Research Acquisition", mode: "LIVE", acquired: true, sources: [{ url: "u", http_status: 200, content_hash: "a".repeat(64) }], ranked: [] }));
  fs.mkdirSync(path.join(dir2, "runtime/generated"), { recursive: true });
  fs.symlinkSync(path.join(dir2, "secrets/real.json"), path.join(dir2, EVID_REL)); // declared in-scope → real out-of-scope
  const pkg2 = packageDelivery(MISSION, { cwd: dir2 });
  ok("13b symlink to in-cwd out-of-scope target ⇒ PATH_OUTSIDE_SCOPE", hasCode(pkg2, CODE.PATH_OUTSIDE_SCOPE) && pkg2.deliverable.length === 0);

  // 13c — symlink to a VALID target INSIDE the authorized scope ⇒ behaves per the existing contract (accepted).
  const dir3 = buildValid({ evidence: null });
  fs.mkdirSync(path.join(dir3, "runtime/generated"), { recursive: true });
  fs.writeFileSync(path.join(dir3, "runtime/generated/real-ext.json"), JSON.stringify({ capability: "External Research Acquisition", mode: "LIVE", acquired: true, sources: [{ url: "u", http_status: 200, content_hash: "a".repeat(64) }], ranked: [{ provenance_ref: "u" }] }));
  fs.symlinkSync(path.join(dir3, "runtime/generated/real-ext.json"), path.join(dir3, EVID_REL));
  const pkg3 = packageDelivery(MISSION, { cwd: dir3 });
  ok("13c symlink to in-scope valid target ⇒ accepted (scope contract preserved)", pkg3.accepted === true && pkg3.deliverable.length === 1);

  // 13d — dangling symlink ⇒ fail-closed MISSING_EVIDENCE (no throw).
  const dir4 = buildValid({ evidence: null });
  fs.mkdirSync(path.join(dir4, "runtime/generated"), { recursive: true });
  fs.symlinkSync(path.join(dir4, "runtime/generated/does-not-exist.json"), path.join(dir4, EVID_REL));
  let threw4 = false, pkg4;
  try { pkg4 = packageDelivery(MISSION, { cwd: dir4 }); } catch { threw4 = true; }
  ok("13d dangling symlink ⇒ MISSING_EVIDENCE, no throw", !threw4 && hasCode(pkg4, CODE.MISSING_EVIDENCE) && pkg4.accepted === false);
}

// BAD request guard (no throw).
{
  let threw = false, pkg;
  try { pkg = packageDelivery("", {}); } catch { threw = true; }
  ok("0 empty mission ⇒ BAD_REQUEST, no throw", !threw && hasCode(pkg, CODE.BAD_REQUEST));
}

console.log(`\nPILOT DELIVERY PACKAGER — ${passed} assertions passed.`);
