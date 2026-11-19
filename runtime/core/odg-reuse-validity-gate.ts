#!/usr/bin/env node
"use strict";
/*
 * FORWARD PRE-REUSE VALIDITY GATE. PURE, deterministic, fail-closed, clock-free (caller supplies asOfMs).
 *
 * THE GAP (reconciled): patch-memory.lookup / decision-precedent.recallPrecedent return a stored artifact
 * UNCONDITIONALLY. reuse-ledger is REACTIVE — it records a regression AFTER a replay failed and exposes a
 * `suppressed` signal; capability-router then de-selects a suppressed precedent. Nothing checks, BEFORE replay,
 * whether a precedent that has NEVER regressed is still valid in the CURRENT world (age since it was learned, or
 * the files it edits having changed, or a declared dependency drift). This gate is that FORWARD check.
 *
 * Core honesty invariant: REMEMBERED ≠ CURRENTLY VALIDATED. A stored proof is a HYPOTHESIS about the present until
 * re-evidenced. Age alone never UPGRADES a precedent to valid; NEVER-REGRESSED is NOT the same as STILL-VALID.
 * Therefore REUSABLE_AS_PROVEN is returned ONLY when positive freshness evidence is supplied (recent age, known
 * provenance, a drift check that came back clean, no suppression) — absence of evidence ⇒ REQUIRES_REVALIDATION
 * (fail-closed), never an optimistic "reuse it". A positive bad signal (prior regression) ⇒ STALE.
 *
 * It COMPOSES odg-writeset-contention.pathsConflict for target-path drift and CONSUMES (does not reimplement)
 * reuse-ledger's `suppressed` signal. No network/clock/randomness.
 */

const WSC = require("./odg-writeset-contention.js") as { pathsConflict: (a: string, b: string) => boolean };

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const DEFAULT_MAX_AGE_DAYS = 90;
const DAY_MS = 86400000;

// Extract the repo-relative paths a precedent would write, from several record shapes (patch-memory edits[],
// decision-precedent, or an explicit list). Non-string entries are dropped.
function targetPathsOf(p: any): string[] {
  const pick = (a: any) => (Array.isArray(a) ? a.filter((x: any) => typeof x === "string") : null);
  return (
    pick(p.targetPaths) || pick(p.files) || pick(p.paths) ||
    (Array.isArray(p.edits) ? p.edits.map((e: any) => (e && (e.file || e.path || e.filePath || e.target)) || null).filter((x: any) => typeof x === "string") : [])
  );
}

// Parse learnedAt (ISO string or epoch ms) to ms, or null if unusable (⇒ freshness cannot be verified).
function learnedAtMs(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  return null;
}

/**
 * classifyReuseValidity(precedent, signals) -> { ok, verdict, reasons[], ageDays, changedTargets, note }.
 *   precedent: a stored record, e.g. { learnedAt (ISO|ms), authoredBy, edits[]|targetPaths[]|files[]|paths[] }.
 *   signals:   { asOfMs (required for age), maxAgeDays?=90, changedPaths?: string[] (files changed since learned),
 *                suppressed?: boolean (reuse-ledger net-regressed), dependencyDrift?: boolean }.
 * verdict ∈ { STALE | REQUIRES_REVALIDATION | REUSABLE_AS_PROVEN }. Most-conservative wins.
 */
function classifyReuseValidity(precedent: any, signals: any): any {
  if (!isObj(precedent)) return freeze({ ok: false, code: "BAD_PRECEDENT", detail: "precedent must be an object record" });
  const s = isObj(signals) ? signals : {};
  const maxAgeDays = Number.isFinite(Number(s.maxAgeDays)) && Number(s.maxAgeDays) >= 0 ? Number(s.maxAgeDays) : DEFAULT_MAX_AGE_DAYS;

  const reasons: string[] = [];
  let stale = false;
  let revalidate = false;

  // (A) STALE — a positive bad signal: a prior reuse net-regressed (reuse-ledger suppressed it).
  if (s.suppressed === true) { stale = true; reasons.push("STALE: prior reuse net-regressed (reuse-ledger suppressed) — do not replay until revalidated"); }

  // (B) age
  const lms = learnedAtMs(precedent.learnedAt);
  const asOf = typeof s.asOfMs === "number" && Number.isFinite(s.asOfMs) ? s.asOfMs : null;
  let ageDays: number | null = null;
  if (lms === null) { revalidate = true; reasons.push("learnedAt missing/unparseable — cannot verify freshness (fail-closed)"); }
  else if (asOf === null) { revalidate = true; reasons.push("asOfMs not supplied — cannot compute age (fail-closed)"); }
  else { ageDays = Number(((asOf - lms) / DAY_MS).toFixed(2)); if (ageDays > maxAgeDays) { revalidate = true; reasons.push(`aged ${ageDays}d > ${maxAgeDays}d since learned — re-evidence before trusting`); } }

  // (C) target-path drift — any path the precedent writes that overlaps a path changed since it was learned.
  const targets = targetPathsOf(precedent);
  const changedTargets: string[] = [];
  if (!Array.isArray(s.changedPaths)) {
    revalidate = true; reasons.push("drift not checked (no changedPaths supplied) — cannot certify the edited files are unchanged (fail-closed)");
  } else {
    for (const t of targets) for (const c of s.changedPaths) if (typeof c === "string" && WSC.pathsConflict(t, c)) { if (!changedTargets.includes(t)) changedTargets.push(t); }
    if (changedTargets.length > 0) { revalidate = true; reasons.push(`target path(s) changed since learned: ${changedTargets.join(", ")} — stored edit may no longer apply`); }
  }

  // (D) declared dependency drift
  if (s.dependencyDrift === true) { revalidate = true; reasons.push("declared dependency drift — re-evidence before trusting"); }

  // (E) provenance — a precedent with UNKNOWN/absent authorship is remembered, not independently validated.
  const authoredBy = typeof precedent.authoredBy === "string" ? precedent.authoredBy : "";
  if (authoredBy === "" || authoredBy === "UNKNOWN") { revalidate = true; reasons.push("provenance UNKNOWN — remembered, not independently validated"); }

  const verdict = stale ? "STALE" : revalidate ? "REQUIRES_REVALIDATION" : "REUSABLE_AS_PROVEN";
  if (verdict === "REUSABLE_AS_PROVEN") reasons.push(`fresh (${ageDays}d ≤ ${maxAgeDays}d), provenanced, drift-checked clean, never regressed — reusable AS PROVEN (still a replay of a past result, not a new guarantee)`);

  return freeze({
    ok: true,
    verdict,
    reasons: freeze(reasons),
    ageDays,
    maxAgeDays,
    changedTargets: freeze(changedTargets),
    note: "REMEMBERED ≠ CURRENTLY VALIDATED. REUSABLE_AS_PROVEN requires positive freshness evidence (recent age + known provenance + a clean drift check + no suppression); absent evidence ⇒ REQUIRES_REVALIDATION (fail-closed); a prior net-regression ⇒ STALE. Age alone never upgrades to valid; never-regressed ≠ still-valid. This is a FORWARD complement to reuse-ledger's backward (post-outcome) signal.",
  });
}

const REUSE_VALIDITY_GATE_CONTRACT = Object.freeze({
  id: "REUSE-VALIDITY-GATE",
  purpose: "a FORWARD pre-reuse validity check — classify a stored precedent REUSABLE_AS_PROVEN / REQUIRES_REVALIDATION / STALE BEFORE replay, which patch-memory.lookup / decision-precedent.recallPrecedent (return unconditionally) and reuse-ledger (reactive, post-outcome) do not provide",
  reuses: Object.freeze(["odg-writeset-contention.pathsConflict (target-path drift)", "CONSUMES reuse-ledger's `suppressed` signal (not reimplemented)"]),
  invariants: Object.freeze([
    "REMEMBERED ≠ CURRENTLY VALIDATED — a stored proof is a hypothesis about the present until re-evidenced",
    "REUSABLE_AS_PROVEN requires POSITIVE freshness evidence (recent age + known provenance + a clean drift check + not suppressed); absence of evidence ⇒ REQUIRES_REVALIDATION (fail-closed), never an optimistic reuse",
    "age ALONE never upgrades a precedent to valid; NEVER-REGRESSED is NOT the same as STILL-VALID",
    "a positive bad signal (prior net-regression / reuse-ledger suppressed) ⇒ STALE; a changed target path or missing provenance/learnedAt ⇒ REQUIRES_REVALIDATION",
    "FORWARD complement to reuse-ledger's backward signal — composes pathsConflict, consumes `suppressed`; PURE/deterministic/frozen/clock-free (caller supplies asOfMs)",
  ]),
});

module.exports = { classifyReuseValidity, targetPathsOf, REUSE_VALIDITY_GATE_CONTRACT };
export {};
