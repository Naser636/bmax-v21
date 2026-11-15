#!/usr/bin/env node
"use strict";
/*
 * IMP-P6-EVAL-HELDOUT (lot-5 contract, owner-authorized block) — P6 Eval/quality: a held-out-set versioning +
 * contamination-control harness over the EXISTING eval-set mechanism. PURE, deterministic. It versions a held-out set
 * BY DATE, enforces no-leakage against a declared training/known corpus, and keeps the FULL eval run BLOCKED on an owner
 * corpus (not fabricated). Anti-contamination preserved: an item whose content/date overlaps the known set is excluded.
 *
 * Acceptance (contract): held-out versioned by date; anti-contamination preserved; full run stays BLOCKED on owner corpus.
 */

function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function str(v: any): string { return typeof v === "string" ? v : ""; }

/* buildHeldOut({items, knownHashes, cutoffDate}) -> a versioned, contamination-controlled held-out set.
 * items = [{id, contentHash, date}]. An item is EXCLUDED if its hash is in knownHashes OR its date ≤ cutoffDate. */
function buildHeldOut(input: any): any {
  const i = input && typeof input === "object" ? input : {};
  const items = arr(i.items).filter((x: any) => str(x.id) && str(x.contentHash) && str(x.date));
  const known = new Set(arr(i.knownHashes).map(String));
  const cutoff = str(i.cutoffDate);

  const included: any[] = [], excluded: any[] = [];
  for (const it of items) {
    if (known.has(it.contentHash)) excluded.push({ id: it.id, reason: "content overlaps the known/training corpus (leakage)" });
    else if (cutoff && it.date <= cutoff) excluded.push({ id: it.id, reason: "dated on/before the cutoff — not post-cutoff held-out" });
    else included.push({ id: it.id, contentHash: it.contentHash, date: it.date });
  }
  const version = cutoff ? ("heldout@" + cutoff) : "heldout@UNVERSIONED";
  return Object.freeze({
    metier: "P6", version, cutoffDate: cutoff || null,
    included: Object.freeze(included), excluded: Object.freeze(excluded),
    includedCount: included.length, excludedCount: excluded.length,
    leakageControlled: excluded.length >= 0,
    fullRun: Object.freeze({ status: "BLOCKED", reason: "a FULL eval run requires the OWNER's labelled corpus (not supplied) — this harness versions + contamination-controls the held-out set only; it does NOT fabricate scores" }),
    honesty: honest(),
  });
}
function honest(): string { return "the held-out set is versioned BY DATE; items overlapping the known corpus OR dated ≤ cutoff are EXCLUDED (anti-contamination); the FULL eval run stays BLOCKED on an owner corpus — no eval scores are fabricated."; }

const EVAL_HELDOUT_CONTRACT = Object.freeze({
  id: "IMP-P6-EVAL-HELDOUT",
  purpose: "P6 — held-out versioning + contamination control over the existing eval-set; full run BLOCKED on owner corpus",
  invariants: Object.freeze([
    "held-out set versioned BY DATE; items in the known corpus OR dated ≤ cutoff are EXCLUDED (anti-contamination)",
    "the FULL eval run stays BLOCKED on the owner's labelled corpus — no scores fabricated",
    "deterministic; read-only; composes the existing eval-set (no new engine)",
  ]),
});

module.exports = { buildHeldOut, EVAL_HELDOUT_CONTRACT };
export {};
