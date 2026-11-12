#!/usr/bin/env node
"use strict";
/*
 * V162 (§5 P3 — p0e-audit-log-keyed-integrity, REALIZABLE portion). PURE, deterministic, fail-closed. An adversarial
 * FORGERY-RESISTANCE ANALYSIS over the EXISTING canonical audit-log (audit-log.ts) — it REUSES appendEntry/verifyChain/
 * chainTip/entryHash and builds NO parallel integrity system, NO second mechanism, and modifies audit-log.ts NOT AT ALL.
 *
 * The mission targets two forgery classes the mission's own title names: FULL-REWRITE (an attacker recomputes the whole
 * chain over forged payloads) and TAIL-TRUNCATION (an attacker drops trailing entries; a valid prefix still verifies).
 * audit-log.ts already provides the mechanisms to close them — a KEYED HMAC (entryHash key) defeats full-rewrite by an
 * attacker WITHOUT the key, and a TIP-ANCHOR (chainTip stored out-of-band, verifyChain expectedTip) defeats truncation.
 * This module PROVES, adversarially, which configuration detects which attack — the realizable EVIDENCE for the mission.
 *
 * HONEST BOUNDARY: the PRODUCTION activation (an OWNER-held HMAC key + an out-of-band anchor store + governance to make
 * keyed+anchored the default) is OWNER_GATED — not closed here. This module uses EPHEMERAL/test keys (caller-supplied),
 * embeds no real secret, and does NOT mark the register mission ACCEPTED. It builds the attack model + verification proof.
 */
const AL = require("./audit-log.js");

function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// build a sealed chain over payloads (optionally keyed). Reuses the canonical appendEntry.
function buildChain(payloads: any, key?: string): any[] {
  let chain: any[] = [];
  for (const p of arr(payloads)) chain = AL.appendEntry(chain, p, isStr(key) ? { key } : undefined);
  return chain;
}

// ATTACK — full rewrite: the attacker rebuilds the ENTIRE chain over forged payloads, sealing with whatever key it has
// (none, or a WRONG key). A legitimate verifier holding the true key must reject it.
function forgeFullRewrite(forgedPayloads: any, attackerKey?: string): any[] { return buildChain(forgedPayloads, isStr(attackerKey) ? attackerKey : undefined); }

// ATTACK — tail truncation: the attacker drops trailing entries; the remaining prefix is internally consistent.
function forgeTailTruncation(chain: any, keep: number): any[] { const c = arr(chain); const k = Number.isSafeInteger(keep) && keep >= 0 ? Math.min(keep, c.length) : c.length; return c.slice(0, k); }

// ATTACK — in-place payload tamper on one entry (hash NOT recomputed) ⇒ a plain hash-chain already catches this.
function tamperPayload(chain: any, index: number, newPayload: any): any[] { const c = arr(chain).map((e: any) => ({ ...e })); if (c[index]) c[index] = { ...c[index], payload: newPayload }; return c; }

// ATTACK — reorder two entries.
function reorder(chain: any, i: number, j: number): any[] { const c = arr(chain).map((e: any) => ({ ...e })); if (c[i] && c[j]) { const t = c[i]; c[i] = c[j]; c[j] = t; } return c; }

/* forgeryResistanceMatrix(trueKey) — the realizable proof: for three configurations (UNKEYED+UNANCHORED, KEYED,
 * KEYED+TIP-ANCHORED) report which of the four attacks each DETECTS. trueKey is an EPHEMERAL/test key (NOT a production
 * secret). Demonstrates that keyed closes full-rewrite and the tip-anchor closes tail-truncation. */
function forgeryResistanceMatrix(trueKey: any): any {
  const key = isStr(trueKey) ? trueKey : "EPHEMERAL-TEST-KEY";
  const genuine = ["e0", "e1", "e2", "e3"];                                   // the real payloads
  const forged = ["e0", "e1", "x2", "x3"];                                    // attacker's forged content

  const configs = [
    { name: "UNKEYED_UNANCHORED", key: undefined, anchored: false },
    { name: "KEYED", key, anchored: false },
    { name: "KEYED_TIP_ANCHORED", key, anchored: true },
  ];
  const results: any[] = [];
  for (const cfg of configs) {
    const trueChain = buildChain(genuine, cfg.key);
    const anchor = cfg.anchored ? AL.chainTip(trueChain) : undefined;
    const verifyOpts: any = {}; if (cfg.key) verifyOpts.key = cfg.key; if (anchor) verifyOpts.expectedTip = anchor;
    const det = (chain: any[]) => AL.verifyChain(chain, verifyOpts).ok === false;    // detected = verify REJECTS it
    // the genuine chain must always verify OK under its own config (no false positive).
    const genuineOk = AL.verifyChain(trueChain, verifyOpts).ok === true;
    // full-rewrite: attacker reseals the whole chain. WITHOUT the true key it cannot reproduce keyed HMACs ⇒ detected when keyed.
    const fullRewrite = forgeFullRewrite(forged, cfg.key ? undefined : undefined);   // attacker has NO key
    // tail-truncation: drop the last entry (prefix stays consistent) ⇒ only the tip-anchor sees it.
    const truncated = forgeTailTruncation(trueChain, trueChain.length - 1);
    results.push(Object.freeze({
      config: cfg.name, genuineVerifies: genuineOk,
      detects: Object.freeze({
        payloadTamper: det(tamperPayload(trueChain, 2, "MUTATED")),
        reorder: det(reorder(trueChain, 1, 2)),
        fullRewrite: det(fullRewrite),
        tailTruncation: det(truncated),
      }),
    }));
  }
  const keyedRow = results.find((r: any) => r.config === "KEYED");
  const anchoredRow = results.find((r: any) => r.config === "KEYED_TIP_ANCHORED");
  const unkeyedRow = results.find((r: any) => r.config === "UNKEYED_UNANCHORED");
  return Object.freeze({
    ok: true, matrix: Object.freeze(results),
    findings: Object.freeze({
      hashChainCatchesTamperAndReorder: unkeyedRow.detects.payloadTamper && unkeyedRow.detects.reorder,
      unkeyedMissesFullRewrite: unkeyedRow.detects.fullRewrite === false,
      unkeyedMissesTailTruncation: unkeyedRow.detects.tailTruncation === false,
      keyedClosesFullRewrite: keyedRow.detects.fullRewrite === true,
      tipAnchorClosesTailTruncation: anchoredRow.detects.tailTruncation === true,
    }),
    note: "proves (adversarially) that the EXISTING audit-log keyed HMAC closes FULL-REWRITE and the tip-anchor closes TAIL-TRUNCATION — the forgery classes the mission targets. Uses ephemeral keys; production activation (owner key + out-of-band anchor store + governance) is OWNER_GATED.",
  });
}

/* auditExistingMechanism() — honest characterization of audit-log.ts's current guarantees + what the mission still needs. */
function auditExistingMechanism(): any {
  return Object.freeze({
    ok: true, module: "runtime/core/audit-log.ts",
    present: Object.freeze(["sha256 hash-chain (seq·prevHash·canon(payload)) — tamper/reorder/insert/delete EVIDENT", "optional keyed HMAC (entryHash key) — defeats full-rewrite by an attacker WITHOUT the key", "chainTip + verifyChain expectedTip — out-of-band anchor defeats tail-truncation/extension"]),
    realizableHere: Object.freeze(["adversarial forgery-resistance proof (this module + its test)", "crypto verification of keyed links + tip-anchor on synthetic chains", "key-rotation behaviour check (a wrong/rotated key rejects a chain sealed with the old key)"]),
    ownerGated: Object.freeze(["an OWNER-held production HMAC key (no secret embedded here)", "an out-of-band anchor STORE for the live audit log", "governance to make keyed+anchored the DEFAULT for the canonical audit log"]),
    missionStatus: "BLOCKED (owner-gated) — this lot builds the realizable EVIDENCE; it does NOT mark the register mission ACCEPTED (a provider cannot close a real mission).",
  });
}

const AUDIT_INTEGRITY_ANALYSIS_CONTRACT = Object.freeze({
  id: "V162-AUDIT-INTEGRITY-ANALYSIS",
  purpose: "§5 P3 p0e-audit-log-keyed-integrity (realizable) — adversarially PROVE the existing audit-log closes full-rewrite & tail-truncation with keyed HMAC + tip-anchor",
  reuses: ["audit-log.ts (appendEntry/verifyChain/chainTip/entryHash) — THE canonical mechanism; no parallel system, audit-log.ts UNMODIFIED"],
  invariants: Object.freeze([
    "reuses the canonical audit-log; builds NO second integrity mechanism; modifies audit-log.ts NOT AT ALL",
    "proves adversarially: unkeyed hash-chain is tamper-EVIDENT only; keyed HMAC closes full-rewrite; tip-anchor closes tail-truncation",
    "uses EPHEMERAL/test keys only — embeds NO production secret; the owner's key + anchor store + governance activation are OWNER_GATED",
    "does NOT mark the register mission ACCEPTED (a provider cannot close a real mission); builds its realizable evidence only",
    "deterministic + fail-closed; no new primitive",
  ]),
});
module.exports = { buildChain, forgeFullRewrite, forgeTailTruncation, tamperPayload, reorder, forgeryResistanceMatrix, auditExistingMechanism, AUDIT_INTEGRITY_ANALYSIS_CONTRACT };
export {};
