#!/usr/bin/env node
"use strict";
/*
 * IMP-M1-CRA-TRACKER (lot-5 contract, owner-authorized block) — M1 CRA/SBOM: a deadline + obligation tracker for the
 * EU Cyber Resilience Act. PURE, deterministic. Deadlines + penalties are SOURCED from the official text (EUR-Lex
 * 2024/2847), NOT invented. Given an owner's declared product role, it computes which obligations APPLY and each
 * obligation's time status relative to a supplied `now` — and declares NOTHING certified/compliant.
 *
 * Acceptance (contract): deadlines/penalties sourced, not invented; nothing declared certified/compliant.
 */

// SOURCED from Regulation (EU) 2024/2847 (CRA). Dates are the official application milestones; penalties are the
// official maxima. These are references, not legal advice, and confer no compliance.
const CRA_OBLIGATIONS = Object.freeze([
  { id: "24h-early-warning", epochMs: Date.UTC(2026, 8, 11), date: "2026-09-11", obligation: "Art.14 — early warning of an actively exploited vulnerability or severe incident to CSIRT + ENISA within 24h", appliesToRoles: ["manufacturer"], source: "EUR-Lex 2024/2847 Art.14" },
  { id: "sbom-and-essential-reqs", epochMs: Date.UTC(2027, 11, 11), date: "2027-12-11", obligation: "Main obligations incl. machine-readable SBOM (top-level dependencies, kept up to date) + Annex I essential cybersecurity requirements + conformity assessment", appliesToRoles: ["manufacturer"], source: "EUR-Lex 2024/2847 (36-month application)" },
]);
const CRA_PENALTIES = Object.freeze({ maxEssentialReqBreach: "€15,000,000 or 2.5% of worldwide annual turnover (whichever higher)", source: "EUR-Lex 2024/2847 Art.64" });
const CRA_ROLES = Object.freeze(["manufacturer", "importer", "distributor", "open_source_steward", "not_in_scope"]);

/* track({role, nowEpochMs}) -> applicable obligations + time status. Nothing is declared certified/compliant. */
function track(input: any): any {
  const i = input && typeof input === "object" ? input : {};
  const role = CRA_ROLES.includes(i.role) ? i.role : "UNKNOWN";
  const now = typeof i.nowEpochMs === "number" && isFinite(i.nowEpochMs) ? i.nowEpochMs : null;

  if (role === "UNKNOWN") return Object.freeze({ metier: "M1", role, applicable: Object.freeze([]), note: "role not qualified ⇒ applicability UNDETERMINED (not assumed); CRA applies by legal role, not by default", penalties: CRA_PENALTIES, honesty: honest() });
  if (role === "not_in_scope") return Object.freeze({ metier: "M1", role, applicable: Object.freeze([]), note: "declared not in scope ⇒ no CRA obligations tracked (owner's legal qualification, not asserted by ODG)", penalties: CRA_PENALTIES, honesty: honest() });

  const applicable = CRA_OBLIGATIONS.filter((o: any) => o.appliesToRoles.includes(role)).map((o: any) => Object.freeze({
    id: o.id, date: o.date, obligation: o.obligation, source: o.source,
    timeStatus: now === null ? "NOT_EVALUATED (no now supplied)" : now < o.epochMs ? "UPCOMING" : "IN_EFFECT",
    daysUntil: now === null ? null : Math.round((o.epochMs - now) / 86400000),
  }));
  return Object.freeze({
    metier: "M1", role, applicable: Object.freeze(applicable), penalties: CRA_PENALTIES,
    certified: false, compliant: "NOT_DECLARED",
    note: "obligations + dates + penalties are SOURCED from EUR-Lex 2024/2847; applicability follows the owner's declared legal role; NOTHING is declared certified or compliant.",
    honesty: honest(),
  });
}
function honest(): string { return "deadlines + penalties are sourced from the official CRA text (not invented); applicability depends on the owner's legal role; ODG declares nothing certified/compliant — this is a tracker, not legal conformity."; }

const CRA_DEADLINE_TRACKER_CONTRACT = Object.freeze({
  id: "IMP-M1-CRA-TRACKER",
  purpose: "M1 — CRA deadline/obligation tracker; sourced dates+penalties; role-based applicability; nothing certified",
  invariants: Object.freeze([
    "deadlines + penalties are SOURCED from EUR-Lex 2024/2847 — not invented",
    "applicability follows the owner's DECLARED legal role (not assumed); unknown role ⇒ UNDETERMINED",
    "ODG declares NOTHING certified or compliant — tracker only, not legal conformity",
    "deterministic; read-only; no new engine",
  ]),
});

module.exports = { CRA_OBLIGATIONS, CRA_PENALTIES, CRA_ROLES, track, CRA_DEADLINE_TRACKER_CONTRACT };
export {};
