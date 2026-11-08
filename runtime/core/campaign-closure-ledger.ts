#!/usr/bin/env node
"use strict";

/*
 * V12.4 §83–§87 (Partie XIX) — FOUR CAMPAIGNS C1–C4 CLOSURE LEDGER. PURE, verifiable. Enumerates the four campaigns,
 * each with the KNOWN objective (honestly marked NOT_RECOVERABLE where the preserved V12.4 is an index only — the
 * verbatim objective text is NOT fabricated), the REAL mechanism/evidence that bears on it, an independent verifier,
 * an honest status, and a FAIL-CLOSED `closed` flag. It creates NO new campaign and closes none by fiat: a campaign is
 * `closed:true` ONLY when its objective is DEMONSTRATED end-to-end — a sub-lot ACCEPTED count is NOT closure (§85/§87).
 * `verifyLedger` checks completeness + that no campaign is marked closed without a demonstration. Dual export.
 */

const STATUS = Object.freeze(["CLOSED", "DEMONSTRATED_SLICE", "PARTIAL", "TO_AUDIT", "BLOCKED"]);

const CAMPAIGNS = Object.freeze([
  {
    id: "C1", section: "§83",
    objective: "NOT_RECOVERABLE_VERBATIM — the preserved V12.4 is an index; C1's verbatim objective is not reconstructed. Known framing (matrix §XIX): foundational campaign; global objective NOT yet demonstrated.",
    mechanism: ["campaign-controller", "closure-register"], verifier: "independent objective-demonstration audit (not a sub-lot count)",
    status: "TO_AUDIT", closed: false, gap: "verbatim objective index-only + global objective not demonstrated",
  },
  {
    id: "C2", section: "§84",
    objective: "NOT_RECOVERABLE_VERBATIM. Known framing (matrix §XIX): compounding/continuous-improvement campaign.",
    mechanism: ["compounding-loop", "self-improvement", "evolution-loop"], verifier: "independent evaluation of a real compounding gain (role-separated)",
    status: "DEMONSTRATED_SLICE", closed: false, gap: "compounding chain demonstrated (FR-08); global campaign closure not yet demonstrated",
  },
  {
    id: "C3", section: "§85",
    objective: "NOT_RECOVERABLE_VERBATIM. Known framing (matrix §XIX): the canonical Radar→POLICY→Lab→Evolution→Evidence→Decision chain via real entrypoints (FR-06).",
    mechanism: ["frontier-pipeline", "frontier-radar", "frontier-lab", "evolution-loop", "action-gate"], verifier: "end-to-end canonical-chain trace through real entrypoints",
    status: "DEMONSTRATED_SLICE", closed: false, gap: "canonical chain demonstrated (FR-06); global closure gate not asserted",
  },
  {
    id: "C4", section: "§86",
    objective: "NOT_RECOVERABLE_VERBATIM. Known framing (matrix §XIX / FRONTIER_V124_PREPARATION §80): depends on 15-profession proofs (now E2/E3) + FR-07/FR-08.",
    mechanism: ["profession P1-P15 E2/E3 references", "benchmark-factory", "campaign-controller"], verifier: "independent profession-proof review + campaign objective demonstration",
    status: "PARTIAL", closed: false, gap: "profession E2/E3 proofs now PRESENT; FR-07 (network) owner-gated + global objective not yet demonstrated",
  },
]);

// §87 Dépendances & portes — closure gates defer to the gates-ledger A–G (no second gate set).
const GATES_REF = Object.freeze({ section: "§87", defersTo: "gates-ledger (§97–§103 A–G)", note: "campaign closure is gated by the A–G validation gates; this ledger duplicates no gate" });

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** verifyLedger(loaded?) -> fail-closed completeness + closure-discipline check. A campaign closed:true MUST be
 * DEMONSTRATED (status CLOSED) and cite a mechanism — never closed from a PARTIAL/DEMONSTRATED_SLICE/TO_AUDIT. */
function verifyLedger(loaded?: any): any {
  const present = loaded ? new Set((Array.isArray(loaded) ? loaded : Object.keys(loaded)).filter(isStr)) : null;
  const incomplete: string[] = [];
  const unsoundClosure: string[] = [];
  const unknownMechanisms: string[] = [];
  const byStatus: any = { CLOSED: 0, DEMONSTRATED_SLICE: 0, PARTIAL: 0, TO_AUDIT: 0, BLOCKED: 0 };
  const ids = new Set();
  for (const c of CAMPAIGNS) {
    ids.add(c.id);
    if (!isStr(c.id) || !isStr(c.objective) || !Array.isArray(c.mechanism) || c.mechanism.length === 0 || !isStr(c.verifier) || !STATUS.includes(c.status) || typeof c.closed !== "boolean") incomplete.push(c.id || "?");
    // fail-closed: closed:true is sound only when status is CLOSED (demonstrated). Any other status + closed:true is an unsound closure.
    if (c.closed === true && c.status !== "CLOSED") unsoundClosure.push(c.id);
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    if (present) for (const m of c.mechanism) if (!present.has(m)) unknownMechanisms.push(c.id + ":" + m);
  }
  return Object.freeze({
    ok: CAMPAIGNS.length === 4 && ids.size === 4 && incomplete.length === 0 && unsoundClosure.length === 0,
    count: CAMPAIGNS.length, distinct: ids.size, closedCount: byStatus.CLOSED,
    byStatus: Object.freeze(byStatus), incomplete: Object.freeze(incomplete), unsoundClosure: Object.freeze(unsoundClosure),
    unknownMechanisms: present ? Object.freeze(unknownMechanisms) : null,
  });
}

const CAMPAIGN_CLOSURE_LEDGER_CONTRACT = Object.freeze({
  id: "V124-CAMPAIGNS-C1-C4-CLOSURE-LEDGER",
  source: "V12.4 §83–§87 (Partie XIX) — four campaigns C1–C4 + dependencies/gates, honest closure status",
  statuses: STATUS, count: CAMPAIGNS.length, gatesRef: GATES_REF,
  notAuthority: "a traceable closure ledger; it creates no campaign, reconstructs no verbatim objective, and closes none by fiat",
  invariants: Object.freeze([
    "exactly four campaigns C1–C4; each has an objective (verbatim marked NOT_RECOVERABLE, never fabricated), ≥1 real mechanism, an independent verifier, a valid status, a boolean closed flag",
    "a campaign is closed ONLY when its objective is DEMONSTRATED end-to-end (status CLOSED) — a sub-lot ACCEPTED count is NOT closure",
    "closure gates defer to the A–G gates-ledger (§87→§97–§103); no second gate set",
    "pure/deterministic; verifyLedger fails closed on an incomplete campaign OR an unsound closure (closed:true without status CLOSED)",
  ]),
});

module.exports = { STATUS, CAMPAIGNS, GATES_REF, CAMPAIGN_CLOSURE_LEDGER_CONTRACT, verifyLedger };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...CAMPAIGN_CLOSURE_LEDGER_CONTRACT, verify: verifyLedger() }, null, 2) + "\n"); }

export {};
