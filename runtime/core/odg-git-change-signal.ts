#!/usr/bin/env node
"use strict";
/*
 * V326 §7 — GIT CHANGE-SIGNAL for pre-reuse freshness (the missing changedPaths source). PURE, deterministic, fail-closed.
 *
 * THE GAP (proven): odg-reuse-validity-gate.classifyReuseValidity (and patch-memory.lookupFresh / decision-precedent.
 * recallPrecedentFresh that wrap it) require signals.changedPaths — the repo-relative files changed SINCE a precedent was
 * learned — to check target-path drift. Nothing in the runtime DERIVED that set from git, so every caller left it absent
 * ⇒ the gate always fell to "drift not checked" (fail-closed REQUIRES_REVALIDATION). This module is that derivation: it
 * PARSES the output of a READ-ONLY git query (`git log --since=<learnedAt> --name-only --format=` or
 * `git diff --name-only <base>..HEAD`) into the changedPaths signal and assembles the full signals object the gate consumes.
 *
 * SEPARATION: this module is PURE — it NEVER shells out to git. The impure, read-only git call lives in the bin
 * (odg-reuse-freshness-check), which passes the raw text here. That keeps the derivation deterministic + unit-testable and
 * confines the side effect to one place (the established pattern). It builds NO second memory system and no new gate — it
 * only SOURCES the one missing input for the EXISTING gate. No network/clock/randomness (the caller supplies asOfMs).
 */

const GATE = require("./odg-reuse-validity-gate.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * parseGitNameOnly(text) -> string[] | null. Parse the stdout of a `--name-only --format=` git query into a deduped,
 * trimmed, repo-relative path list (blank lines dropped). A NON-STRING input ⇒ null — the signal is UNAVAILABLE, which
 * the gate must treat as "drift not checked" (fail-closed), NOT as "zero changes". An empty/whitespace string ⇒ [] —
 * a genuine "no files changed since learned" (the git query ran and returned nothing).
 */
function parseGitNameOnly(text: any): string[] | null {
  if (typeof text !== "string") return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/**
 * buildReuseSignals(gitText, opts) -> a signals object for classifyReuseValidity.
 *   gitText: raw `--name-only` git stdout (string) ⇒ changedPaths parsed from it; a NON-STRING ⇒ changedPaths OMITTED so
 *            the gate fails closed ("drift not checked"). An empty string ⇒ changedPaths:[] (genuinely no drift).
 *   opts: { asOfMs, maxAgeDays?, suppressed?, dependencyDrift?, fileScope? } — passed through verbatim (asOfMs required by
 *         the gate for age; omitted/invalid ⇒ the gate fails closed on age, honest).
 * The result is frozen and contains ONLY the keys the gate reads; changedPaths is present iff gitText was a string.
 */
function buildReuseSignals(gitText: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const changed = parseGitNameOnly(gitText);
  const signals: any = {};
  if (typeof o.asOfMs === "number" && Number.isFinite(o.asOfMs)) signals.asOfMs = o.asOfMs;
  if (Number.isFinite(Number(o.maxAgeDays))) signals.maxAgeDays = Number(o.maxAgeDays);
  if (o.suppressed !== undefined) signals.suppressed = o.suppressed;
  if (o.dependencyDrift !== undefined) signals.dependencyDrift = o.dependencyDrift;
  if (o.fileScope !== undefined) signals.fileScope = o.fileScope;
  if (changed !== null) signals.changedPaths = freeze(changed); // absent (not []) when git text unavailable ⇒ gate fails closed
  return freeze(signals);
}

/**
 * assessPrecedentFreshness(precedent, gitText, opts) -> the gate's verdict, sourcing changedPaths from gitText. This is
 * the end-to-end composition: real git drift signal → EXISTING classifyReuseValidity. Returns the gate result verbatim,
 * plus `driftSignalAvailable` so a caller can distinguish "checked, clean" from "could not check".
 */
function assessPrecedentFreshness(precedent: any, gitText: any, opts: any): any {
  const signals = buildReuseSignals(gitText, opts);
  const verdict = GATE.classifyReuseValidity(precedent, signals);
  return freeze({ ...verdict, driftSignalAvailable: typeof gitText === "string", changedPathsConsidered: Array.isArray(signals.changedPaths) ? signals.changedPaths.length : 0 });
}

const GIT_CHANGE_SIGNAL_CONTRACT = Object.freeze({
  id: "V326-GIT-CHANGE-SIGNAL",
  purpose: "SOURCE the missing signals.changedPaths (files changed since a precedent was learned) for the EXISTING odg-reuse-validity-gate, from a READ-ONLY git query — resolving §7's 'drift never checked' root cause without inventing a signal or a second memory",
  reuses: Object.freeze(["odg-reuse-validity-gate.classifyReuseValidity (the EXISTING forward gate — NOT reimplemented)", "git log/diff --name-only (read-only, run in the bin; this module only parses its text)"]),
  invariants: Object.freeze([
    "PURE: never shells out to git; parses the raw text the (impure, read-only) bin supplies — side effect confined to one place",
    "fail-closed: non-string git text ⇒ changedPaths OMITTED (gate treats as 'drift not checked', REQUIRES_REVALIDATION) — NEVER silently treated as zero changes",
    "an empty/whitespace git text ⇒ changedPaths:[] — a genuine 'no files changed since learned' (query ran, returned nothing)",
    "SOURCES one existing input only — builds NO second memory system and NO new gate; the verdict is the existing gate's",
    "no network/clock/randomness; the caller supplies asOfMs; frozen outputs",
  ]),
});

module.exports = { parseGitNameOnly, buildReuseSignals, assessPrecedentFreshness, GIT_CHANGE_SIGNAL_CONTRACT };
export {};
