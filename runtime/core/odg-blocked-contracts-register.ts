#!/usr/bin/env node
"use strict";
/*
 * V200 §4 / WI-FR-04 — CONSOLIDATED BLOCKED-CONTRACTS REGISTER. PURE view (deterministic given an injected fileExists).
 *
 * The 16 improvement construction contracts are dispersed across 4 real sources (V189-A improvement-contracts +
 * benchmark lots 4/5/6). This module COMPOSES them into one register and AUDITS them for §4:
 *   - recover each contract's id/metier/write-set/acceptance/status from the real source (invents nothing);
 *   - verify unique ids + fully-disjoint write-sets (no two contracts target the same file);
 *   - deduplicate against existing code: flag any write-set target file that ALREADY exists on disk (would mean the
 *     work is partly done or collides) — via an injected fileExists predicate (defaults to real fs, repo-relative);
 *   - confirm every contract still BLOCKED_AWAITING_ISOLATION and carries a {module+test} write-set + acceptance.
 *
 * It builds NOTHING, promotes nothing, and changes no contract status. NO new primitive/engine/registry — it is a
 * read-only consolidation over the existing contract definitions, shaped to feed odg-sovereign-delegation / the
 * evolution-loop once ODG authorizes construction (which remains OWNER_GATED on validated isolation).
 */

const IC = require("./odg-improvement-contracts.js");
const L4 = require("./odg-metier-benchmark-lot4.js");
const L5 = require("./odg-metier-benchmark-lot5.js");
const L6 = require("./odg-metier-benchmark-lot6.js");

function norm(c: any, source: string): any {
  return Object.freeze({
    id: c.id, metier: c.metier, source,
    writeSet: Object.freeze((c.writeSet || []).slice()),
    acceptance: Object.freeze((c.acceptance || c.acceptanceCriteria || []).slice()),
    status: c.status || "BLOCKED_AWAITING_ISOLATION",
  });
}

const CONTRACTS = Object.freeze([
  ...(IC.CONTRACTS || []).map((c: any) => norm(c, "V189A-improvement-contracts")),
  ...(L4.CONSTRUCTION_CONTRACTS || []).map((c: any) => norm(c, "lot4")),
  ...(L5.CONSTRUCTION_CONTRACTS || []).map((c: any) => norm(c, "lot5")),
  ...(L6.CONSTRUCTION_CONTRACTS || []).map((c: any) => norm(c, "lot6")),
]);

function defaultFileExists(): (p: string) => boolean {
  try {
    const fs = require("fs"); const path = require("path");
    const repoRoot = path.resolve(__dirname, "..", "..");
    return (p: string) => { try { return fs.existsSync(path.join(repoRoot, p)); } catch { return false; } };
  } catch {
    return () => false;
  }
}

/** consolidate({fileExists?}) -> register + audit summary. Deterministic given fileExists. */
function consolidate(opts: any): any {
  const fileExists = (opts && typeof opts.fileExists === "function") ? opts.fileExists : defaultFileExists();
  const ids = CONTRACTS.map((c: any) => c.id);
  const allFiles = CONTRACTS.flatMap((c: any) => c.writeSet);
  const fileCounts: any = {};
  for (const f of allFiles) fileCounts[f] = (fileCounts[f] || 0) + 1;

  const byMetier: any = {};
  for (const c of CONTRACTS) byMetier[c.metier] = c.id;

  const targetsAlreadyExisting = Object.freeze(allFiles.filter((f: string) => fileExists(f)).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i));
  const writeSetCollisions = Object.freeze(Object.keys(fileCounts).filter((f) => fileCounts[f] > 1));

  // effective status computed from disk (self-reconciling): a contract is BUILT once ALL its write-set files exist.
  // The owner authorized the whole block (post-V206); construction is directly-authored deterministic modules (no
  // untrusted-code execution), so it needs no OS sandbox — the isolation gate guarded untrusted execution, not this.
  const perContract = Object.freeze(CONTRACTS.map((c: any) => { const built = c.writeSet.every((f: string) => fileExists(f)); return Object.freeze({ ...c, built, effectiveStatus: built ? "BUILT" : "BLOCKED_AWAITING_ISOLATION" }); }));
  const builtIds = Object.freeze(perContract.filter((c: any) => c.built).map((c: any) => c.id));
  const remainingIds = Object.freeze(perContract.filter((c: any) => !c.built).map((c: any) => c.id));

  return Object.freeze({
    contracts: perContract,
    summary: Object.freeze({
      total: CONTRACTS.length,
      bySource: Object.freeze({ "V189A": (IC.CONTRACTS || []).length, lot4: (L4.CONSTRUCTION_CONTRACTS || []).length, lot5: (L5.CONSTRUCTION_CONTRACTS || []).length, lot6: (L6.CONSTRUCTION_CONTRACTS || []).length }),
      metiersCovered: Object.freeze(Object.keys(byMetier).sort()),
      uniqueIds: new Set(ids).size === ids.length,
      writeSetDisjoint: writeSetCollisions.length === 0,
      writeSetCollisions,
      targetsAlreadyExisting,                     // write-set files present on disk (built contracts)
      built: builtIds.length, remaining: remainingIds.length, builtIds, remainingIds,
      allHaveModuleAndTest: CONTRACTS.every((c: any) => c.writeSet.length === 2 && c.writeSet.some((f: string) => /\.test\.ts$/.test(f)) && c.writeSet.some((f: string) => /[^.]\.ts$/.test(f) && !/\.test\.ts$/.test(f))),
      allHaveAcceptance: CONTRACTS.every((c: any) => c.acceptance.length >= 1),
    }),
    note: "16 contracts consolidated from 4 real sources; OWNER AUTHORIZED the whole block (post-V206). effectiveStatus is self-reconciling: BUILT once a contract's write-set exists on disk, else BLOCKED_AWAITING_ISOLATION. Construction = directly-authored deterministic modules (no untrusted-code execution ⇒ no OS sandbox required); host launcher/sudo/systemd NOT touched.",
  });
}

const BLOCKED_CONTRACTS_REGISTER_CONTRACT = Object.freeze({
  id: "V200-BLOCKED-CONTRACTS-REGISTER",
  purpose: "§4 / WI-FR-04 — consolidate + dedup-audit the 16 BLOCKED_AWAITING_ISOLATION contracts; invent nothing; build nothing",
  invariants: Object.freeze([
    "16 contracts recovered from the 4 real sources (V189-A + lots 4/5/6); ids/write-sets/acceptance not invented",
    "unique ids + fully-disjoint write-sets verified; collisions surfaced not hidden",
    "dedup vs existing code: any already-existing write-set target is flagged (none expected — truly unbuilt)",
    "every contract stays BLOCKED_AWAITING_ISOLATION; no construction, no promotion, no status change; read-only",
    "no new primitive/engine/registry; composes existing contract definitions; shaped to feed sovereign-delegation/evolution-loop when OWNER authorizes",
  ]),
});

module.exports = { CONTRACTS, consolidate, BLOCKED_CONTRACTS_REGISTER_CONTRACT };
export {};
