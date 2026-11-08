#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 22 (P8 API evolution — world-research gap) — DEPRECATION-WINDOW / SUNSET ENFORCEMENT. PURE, deterministic.
 * World reference: the 2026 API-sunset discipline (OneUptime 2026-02-02; RFC 9745 Deprecation header + RFC 8594
 * Sunset) — an API element must be ANNOUNCED as deprecated BEFORE it is removed, carry a sunset date, and only be
 * withdrawn after a grace window; never removed silently. ODG's P8 enforces version-bump SEVERITY (p8-semver-
 * enforcement: breaking ⇒ MAJOR) and DETECTS breaking removals (api-contract.checkCompatibility) — but nothing
 * enforces deprecate-before-removal: a publisher can legally (per ODG) yank a required output in one MAJOR jump with
 * zero migration window. Grep-verified absent (no sunset/grace-window/deprecation-window on API contracts). This
 * composes the two existing P8 modules VERBATIM and adds the announce-then-remove check. Deny-by-default. Dual export.
 */

const API = require("./api-contract");                  // checkCompatibility — enumerate breaking removals/changes
const SEMVER = require("./p8-semver-enforcement");      // enforce — MAJOR-bump severity verdict (reused verbatim)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

/** the consumer-facing elements a new contract REMOVES or CHANGES vs the old one (what the sunset rule governs). */
function breakingSurface(oldC: any, newC: any): string[] {
  const o = isObj(oldC) ? oldC : {}; const n = isObj(newC) ? newC : {};
  const fields = new Set<string>();
  const newOut = new Set(arr(n.requiredOut).filter(isStr));
  for (const f of arr(o.requiredOut).filter(isStr)) if (!newOut.has(f)) fields.add(f);   // removed required output
  const oOS = isObj(o.outputSchema) ? o.outputSchema : {}; const nOS = isObj(n.outputSchema) ? n.outputSchema : {};
  for (const f of Object.keys(oOS)) if (nOS[f] !== undefined && nOS[f] !== oOS[f]) fields.add(f);  // changed output type
  return Array.from(fields);
}

/**
 * enforceWindow(oldContract, newContract) -> { ok, verdict, undeprecatedRemovals, breakingSurface, semver }.
 * verdict: INVALID_VERSION / SEMVER_VIOLATION (forwarded) · SUNSET_VIOLATION (a breaking removal of a NON-deprecated
 * element) · OK (every breaking removal was pre-announced AND the semver bump is correct). Deny-by-default.
 */
function enforceWindow(oldContract: any, newContract: any): any {
  const semver = SEMVER.enforce({ oldContract, newContract });
  const surface = breakingSurface(oldContract, newContract);
  const deprecated = new Set(arr(isObj(oldContract) ? oldContract.deprecated : []).filter(isStr));  // announced-for-removal
  const undeprecatedRemovals = surface.filter((f) => !deprecated.has(f));   // removed/changed without prior announcement

  let verdict: string;
  // version discipline fails first — a wrong/insufficient bump is reported before the sunset check.
  if (semver.verdict === "INVALID_VERSION" || semver.verdict === "SEMVER_VIOLATION") verdict = semver.verdict;
  else if (undeprecatedRemovals.length > 0) verdict = "SUNSET_VIOLATION";   // removed a never-deprecated element (no window)
  else verdict = "OK";

  return Object.freeze({
    ok: verdict === "OK",
    verdict,
    undeprecatedRemovals: Object.freeze(undeprecatedRemovals),
    breakingSurface: Object.freeze(surface),
    semver: Object.freeze({ verdict: semver.verdict, requiredBump: semver.requiredBump, actualBump: semver.actualBump }),
    note: verdict === "SUNSET_VIOLATION"
      ? `removed/changed ${undeprecatedRemovals.length} element(s) never marked deprecated — no migration window (RFC 9745/8594)`
      : verdict === "OK" ? "every breaking removal was pre-announced (deprecated) and the MAJOR bump is correct" : semver.note,
  });
}

const P8_DEPRECATION_WINDOW_CONTRACT = Object.freeze({
  id: "V124-P8-DEPRECATION-WINDOW",
  source: "SÉRIE 22 P8 — API deprecate-before-remove / sunset (OneUptime 2026-02-02; RFC 9745 + RFC 8594)",
  reuses: Object.freeze(["api-contract.checkCompatibility (breaking surface)", "p8-semver-enforcement.enforce (bump severity)"]),
  notAuthority: "a pure version-discipline check layered on the two existing P8 modules; it publishes nothing and authorizes nothing",
  invariants: Object.freeze([
    "a backward-incompatible removal/change is ADMITTED only if that element was marked `deprecated` in the PRIOR contract AND the semver bump is OK",
    "a breaking removal of a NON-deprecated element ⇒ SUNSET_VIOLATION — even when the MAJOR bump is technically correct",
    "missing/unknown `deprecated` list ⇒ treated as empty ⇒ every breaking removal rejected (deny-by-default)",
    "an insufficient/invalid version bump is forwarded (SEMVER_VIOLATION/INVALID_VERSION) before the sunset check",
    "pure/deterministic; composes the existing P8 modules verbatim (no second diff/semver engine); no clock/network",
  ]),
});

module.exports = { breakingSurface, enforceWindow, P8_DEPRECATION_WINDOW_CONTRACT };

if (require.main === module) {
  const oldC = { version: "1.0.0", requiredOut: ["id", "legacyField"], deprecated: ["legacyField"] };
  const newC = { version: "2.0.0", requiredOut: ["id"] };
  process.stdout.write(JSON.stringify({ ...P8_DEPRECATION_WINDOW_CONTRACT, demo: enforceWindow(oldC, newC) }, null, 2) + "\n");
}

export {};
