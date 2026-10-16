#!/usr/bin/env node
"use strict";

/*
 * `odg triage` — READ-ONLY end-to-end surface for the §V S3 integration (incident-triage.ts). It makes the
 * two composition capabilities (A root-cause-intelligence, B bounded-remediation) genuinely REUSED on the
 * live pipeline output: it reads the EXISTING self-diagnostic report (same seam `odg diagnose` uses),
 * turns an open incident into A's structured assessment, and — only on a DIAGNOSED verdict — B's
 * PROPOSE-ONLY remediation decision. It writes NOTHING, spawns nothing, contacts no network, and applies
 * nothing (B's applier is never wired). Exit 0 = no divergence (nothing to triage); 1 = an incident is
 * DIAGNOSED — so it composes as a gate / post-event trigger exactly like `odg diagnose`.
 *
 * The incident→assessment seam is INJECTED with the report we already computed (no second diagnose run);
 * B keeps its default action-gate authority (deny-by-default) with NO remediation input, so without an
 * explicitly-authorized fix it honestly reports BLOCKED/REFUSED — never a fabricated or applied change.
 */

const sd: any = require("../../runtime/core/self-diagnostic");
const { triage }: any = require("./incident-triage");
const recurrenceMod: any = require("../../runtime/core/incident-recurrence");

function main(): number {
  const report = typeof sd.diagnose === "function" ? sd.diagnose({}) : null;
  const incident = report && report.incident ? report.incident : null;
  const divergences = report && Array.isArray(report.divergences) ? report.divergences : [];

  console.log("======================================");
  console.log("ODG TRIAGE (root-cause + propose-only remediation)");
  console.log("======================================");
  console.log("Mission     :", (report && report.mission) || "(none loaded)");
  console.log("Divergences :", divergences.length);

  if (!incident) {
    console.log("Incident    : none");
    console.log("Summary     : NO_DIVERGENCE — nothing to triage.");
    console.log("======================================");
    return 0;
  }

  const incidentInput = {
    incidentId: incident.id,
    failureClass: "runtime-divergence",
    symptoms: divergences.map((d: any) => (d && d.check) || "").filter(Boolean),
    evidenceRefs: [sd.REPORT_FILE],
    impact: (report && report.summary) || null,
  };
  // Inject the already-computed report as A's runtime-divergence authority (no second diagnose run);
  // B keeps its default action-gate authority (deny-by-default). No remediation input ⇒ propose-only + honest.
  const result = triage({ incident: incidentInput }, { rootCause: { runtimeDiagnose: () => report } });
  const a = result.assessment;
  const p = result.proposal;

  // OBSERVED cross-run recurrence for THIS incident (from the shared ledger read-model) — kept DISTINCT
  // from the assessment's forward-looking recurrenceRisk (a hypothesis from this run's divergence count), so
  // `odg triage` reports the SAME observed recurrence as `odg diagnose` / `odg learn` (operational coherence).
  let recObserved = "not analyzed";
  try {
    const rec = recurrenceMod.recordFor(recurrenceMod.loadRecurrence({}), incident.id);
    if (rec) recObserved = `${rec.oscillating ? "FROZEN_LOOP" : rec.recurring ? "RECURRING" : "first-seen"} ×${rec.attempts} (${rec.status})`;
    else recObserved = "no ledger record";
  } catch { /* best-effort, read-only */ }

  console.log("Incident    :", `${incident.id} ${incident.status}`);
  console.log("Recurrence  :", `OBSERVED ${recObserved}  |  risk (hypothesis): ${a.recurrenceRisk}`);
  console.log("Assessment  :", `${a.verdict} (authority: ${a.authority || "none"})`);
  console.log("  observed   :", a.observedFacts.join(" | ") || "(none)");
  console.log("  hypotheses :", a.hypotheses.join(" | ") || "(none)");
  console.log("  actions    :", a.actions.map((x: any) => `${x.priority} ${x.action}`).join(" | ") || "(none)");
  console.log("Remediation :", p ? `${p.decision} [applied:${p.applied}, mode:${p.mode}]` : "(not consulted — assessment not DIAGNOSED)");
  if (p) console.log("  reason     :", p.reason);
  console.log("Applied     :", result.applied, "(propose-only — apply is a separate, explicitly-authorized step)");
  console.log("Report      :", sd.REPORT_FILE);
  console.log("======================================");
  return a.verdict === "DIAGNOSED" ? 1 : 0;
}

process.exit(main());

export {};
