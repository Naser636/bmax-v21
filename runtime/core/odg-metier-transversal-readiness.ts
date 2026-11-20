#!/usr/bin/env node
"use strict";
/*
 * V327 §7 — MÉTIER × TRANSVERSAL-BASE READINESS. PURE, deterministic, fail-closed. The §7 preparation: map the 20-métier
 * roster to the COMMON transversal engines (facturation/clients/paiements/suivi/documents) — the "base commune" §7 names —
 * and confirm each is REUSABLE (a canonical module is present) so métier deployment is per-métier CONFIGURATION of a shared
 * base, NOT rebuilding. It is DISTINCT from odg-program-metier-matrix (which maps métiers to PRIMITIVES, not to the
 * transversal engines); it REUSES that module's ROSTER20 (the canonical 20-métier roster) — no second roster, no duplication.
 *
 * Presence is INJECTED (the set of present core module filenames) so this stays PURE/testable; a bin supplies the real
 * on-disk set. A transversal component with NO present canonical module is an honest GAP (build/connect before deployment).
 */

const PMM = require("./odg-program-metier-matrix.js");   // ROSTER20 — the canonical 20-métier roster (REUSED, not rebuilt)

function freeze<T>(o: T): T { return Object.freeze(o) as T; }

// The 5 common transversal engines §7 names, each → the EXISTING canonical modules that already implement it (verified
// present on disk 2026-11-20). A métier reuses this shared base; it is NOT re-implemented per métier.
const TRANSVERSAL = Object.freeze([
  freeze({ key: "billing", need: "facturation", canonical: freeze(["einvoice-export.ts", "einvoice-validator.ts", "einvoice-parser.ts", "odg-btp-billing-engine.ts", "odg-fr-invoice-compliance.ts"]) }),
  freeze({ key: "clients", need: "clients", canonical: freeze(["client-intake.ts", "odg-crm-account-view.ts", "odg-crm-segmentation.ts", "odg-crm-followup.ts"]) }),
  freeze({ key: "payments", need: "paiements", canonical: freeze(["payments.ts", "odg-fr-payment-terms.ts", "odg-fr-due-date.ts"]) }),
  freeze({ key: "tracking", need: "suivi", canonical: freeze(["mission-ledger.ts", "campaign-controller.ts", "odg-btp-project-workflow.ts"]) }),
  freeze({ key: "documents", need: "documents", canonical: freeze(["document-pipeline.ts", "document-intelligence.ts", "p11-document-routing.ts"]) }),
]);

/** assessBaseReadiness(presentModules) -> { components[], allReusable, gaps[] }. presentModules: array of present core
 *  module filenames. A component is REUSABLE iff ≥1 of its canonical modules is present, else a GAP. */
function assessBaseReadiness(presentModules: any): any {
  const present = new Set(Array.isArray(presentModules) ? presentModules.filter((x: any) => typeof x === "string") : []);
  const components = TRANSVERSAL.map((t) => {
    const have = t.canonical.filter((m) => present.has(m));
    return freeze({ key: t.key, need: t.need, reusable: have.length > 0, present: freeze(have), status: have.length > 0 ? "REUSABLE" : "GAP" });
  });
  const gaps = components.filter((c) => !c.reusable).map((c) => c.key);
  return freeze({ components: freeze(components), allReusable: gaps.length === 0, gaps: freeze(gaps) });
}

/**
 * metierTransversalReadiness(presentModules, opts?) -> { ok, metiersTotal, roster, sharedBase, deploymentReady, note }.
 * Reuses odg-program-metier-matrix.ROSTER20 (opts.roster overrides for tests). The 5 transversal engines are the shared
 * base for ALL métiers; deploymentReady iff the whole base is REUSABLE. No per-métier rebuild is implied — only configuration.
 */
function metierTransversalReadiness(presentModules: any, opts: any = {}): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const roster = Array.isArray(o.roster) ? o.roster : (Array.isArray(PMM.ROSTER20) ? PMM.ROSTER20 : []);
  if (roster.length === 0) return freeze({ ok: false, code: "NO_ROSTER", detail: "canonical 20-métier roster unavailable" });
  const base = assessBaseReadiness(presentModules);
  return freeze({
    ok: true,
    metiersTotal: roster.length,
    roster: freeze(roster.map((m: any) => freeze({ id: m && m.id, name: m && m.name, category: m && m.category }))),
    sharedBase: base,
    deploymentReady: base.allReusable === true,
    note: base.allReusable
      ? `the mutualised transversal base (${TRANSVERSAL.map((t) => t.key).join("/")}) is REUSABLE for all ${roster.length} métiers ⇒ métier deployment = per-métier CONFIGURATION of the shared base, NOT rebuilding (§7)`
      : `GAP(s) in the shared transversal base: ${base.gaps.join(", ")} ⇒ build/connect before métier deployment`,
  });
}

const METIER_TRANSVERSAL_READINESS_CONTRACT = Object.freeze({
  id: "V327-METIER-TRANSVERSAL-READINESS",
  purpose: "§7 — map the 20-métier roster to the COMMON transversal engines (billing/clients/payments/tracking/documents) and confirm the shared base is REUSABLE, so métier deployment is per-métier configuration of a mutualised base, not rebuilding",
  reuses: Object.freeze(["odg-program-metier-matrix.ROSTER20 (the canonical 20-métier roster — NOT a second roster)", "the EXISTING transversal engines (einvoice/crm/payments/mission-ledger/document-pipeline) — mapped, not re-implemented"]),
  invariants: Object.freeze([
    "distinct from odg-program-metier-matrix (métier→PRIMITIVES); this is métier→TRANSVERSAL-ENGINES — no duplication, no second roster",
    "a transversal component is REUSABLE only if a canonical module is actually present (injected set) — else an honest GAP",
    "deployment is per-métier CONFIGURATION of the shared base; it implies NO per-métier rebuild of billing/clients/etc.",
    "PURE (presence injected), deterministic, frozen; fail-closed on a missing roster",
  ]),
});

module.exports = { assessBaseReadiness, metierTransversalReadiness, TRANSVERSAL, METIER_TRANSVERSAL_READINESS_CONTRACT };
export {};
