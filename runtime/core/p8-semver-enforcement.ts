#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 14 (P8 excellence) — SEMANTIC-VERSIONING ENFORCEMENT. PURE, deterministic. World reference: SemVer 2.0.0 — a
 * BREAKING change MUST bump MAJOR, a backward-compatible addition bumps MINOR, otherwise PATCH. Shipping a breaking
 * API change without a MAJOR bump silently breaks consumers (a top cause of integration incidents). ODG's P8 reference
 * (api-contract) DETECTS breaking changes but did not ENFORCE that the declared version bump matches the change
 * severity. This adds the enforcement, fail-closed, REUSING api-contract.checkCompatibility (no second diff engine):
 * breaking change + non-major bump ⇒ SEMVER_VIOLATION. Dual export.
 */

const API = require("./api-contract");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function parseVer(v: any): any { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || "")); return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : null; }

function keysOf(o: any): string[] { return isObj(o) ? Object.keys(o) : []; }
/** addedFields(oldC, newC) -> true if newC adds any input/output field absent in oldC (a backward-compatible addition). */
function hasAddition(oldC: any, newC: any): boolean {
  const oIn = new Set(keysOf(oldC && oldC.inputSchema)); const oOut = new Set(keysOf(oldC && oldC.outputSchema));
  const addedIn = keysOf(newC && newC.inputSchema).some((f) => !oIn.has(f));
  const addedOut = keysOf(newC && newC.outputSchema).some((f) => !oOut.has(f));
  return addedIn || addedOut;
}

/** requiredBump(oldC, newC) -> "major" | "minor" | "patch". Breaking ⇒ major; additions ⇒ minor; else patch. */
function requiredBump(oldC: any, newC: any): string {
  const compat = API.checkCompatibility(oldC, newC);
  if (compat.compatible === false) return "major";               // a breaking change (reuses api-contract)
  if ((Array.isArray(compat.nonBreaking) && compat.nonBreaking.length > 0) || hasAddition(oldC, newC)) return "minor"; // a backward-compatible addition
  return "patch";
}

/** actualBump(oldVer, newVer) -> "major"|"minor"|"patch"|"none"|"invalid"|"downgrade". */
function actualBump(oldVer: any, newVer: any): string {
  const a = parseVer(oldVer); const b = parseVer(newVer);
  if (!a || !b) return "invalid";
  if (b.major > a.major) return "major";
  if (b.major < a.major) return "downgrade";
  if (b.minor > a.minor) return "minor";
  if (b.minor < a.minor) return "downgrade";
  if (b.patch > a.patch) return "patch";
  if (b.patch < a.patch) return "downgrade";
  return "none";
}

const RANK: any = { patch: 1, minor: 2, major: 3 };

/** enforce({oldContract, newContract}) -> { ok, verdict, requiredBump, actualBump, breaking }.
 * Fail-closed: the actual bump must be >= the required bump; a breaking change needs a major bump. */
function enforce(input: any): any {
  const o = isObj(input) ? input : {};
  const oldC = o.oldContract; const newC = o.newContract;
  const req = requiredBump(oldC, newC);
  const act = actualBump(oldC && oldC.version, newC && newC.version);
  const compat = API.checkCompatibility(oldC, newC);
  let verdict: string;
  if (act === "invalid") verdict = "INVALID_VERSION";
  else if (act === "downgrade" || act === "none") verdict = "SEMVER_VIOLATION";   // no/negative bump for a real change
  else if (RANK[act] >= RANK[req]) verdict = "OK";
  else verdict = "SEMVER_VIOLATION";                                              // e.g. breaking change with only a minor bump
  const ok = verdict === "OK";
  return Object.freeze({
    ok, verdict, requiredBump: req, actualBump: act,
    breaking: Object.freeze(Array.isArray(compat.breaking) ? compat.breaking : []),
    note: verdict === "SEMVER_VIOLATION" ? `declared ${act} bump is insufficient for a required ${req} change (SemVer)` : "version bump matches change severity",
  });
}

const P8_SEMVER_CONTRACT = Object.freeze({
  id: "V124-P8-SEMVER-ENFORCEMENT",
  source: "SÉRIE 14 P8 — SemVer 2.0.0 enforcement over api-contract breaking-change detection",
  reuses: Object.freeze(["api-contract.checkCompatibility (no second diff engine)"]),
  notAuthority: "a pure version-discipline check; it publishes nothing",
  invariants: Object.freeze([
    "a BREAKING change requires a MAJOR bump; an addition requires ≥ MINOR; the actual bump must be ≥ the required bump",
    "no bump or a downgrade for a real change ⇒ SEMVER_VIOLATION (fail-closed)",
    "reuses api-contract.checkCompatibility to classify the change; no second diff engine",
    "pure/deterministic",
  ]),
});

module.exports = { requiredBump, actualBump, enforce, P8_SEMVER_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P8_SEMVER_CONTRACT, demo: enforce({ oldContract: { version: "1.0.0", requiredIn: ["id"], inputSchema: { id: "number" } }, newContract: { version: "2.0.0", requiredIn: ["id", "tok"], inputSchema: { id: "number", tok: "string" } } }) }, null, 2) + "\n"); }

export {};
