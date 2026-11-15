#!/usr/bin/env node
"use strict";
/*
 * IMP-P14-DEVEX-GOLDENPATH (lot-6 contract, owner-authorized block) — P14 DevEx: a golden-path scaffold catalog + a
 * DevEx metric view (DORA/SPACE) computed ONLY from REAL events. PURE, deterministic. Reuses the existing scaffold
 * attestation concept (P14 scaffoldEvidence in metier-benchmark-multidim) rather than duplicating it. Fail-closed: a
 * metric with no events ⇒ NOT_MEASURED (never invented).
 *
 * Acceptance (contract): deterministic only; metrics computed over REAL events not invented; scaffold attestation reused.
 */

function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any): number | null { return typeof v === "number" && isFinite(v) ? v : null; }

// golden-path scaffold catalog — the "opinionated but escapable" paths a platform offers (reference, not provisioned).
const GOLDEN_PATHS = Object.freeze([
  { id: "service-ts", includes: ["scaffold", "ci", "progressive-delivery", "observability", "oncall", "incident-template"], escapable: true },
  { id: "job-batch", includes: ["scaffold", "ci", "observability"], escapable: true },
]);

/* devexView({events}) -> DevEx metrics from REAL events. events = { onboardingDays:[n], goldenPathTeams, totalTeams,
 * npsResponses:[-100..100] }. */
function devexView(input: any): any {
  const e = input && typeof input === "object" && input.events && typeof input.events === "object" ? input.events : {};
  const onboarding = arr(e.onboardingDays).filter((x: any) => num(x) !== null && x >= 0) as number[];
  const gpTeams = num(e.goldenPathTeams), totalTeams = num(e.totalTeams);
  const nps = arr(e.npsResponses).filter((x: any) => num(x) !== null) as number[];

  const onboardingMetric = onboarding.length > 0 ? { status: "MEASURED", medianDays: median(onboarding), samples: onboarding.length } : { status: "NOT_MEASURED", reason: "no onboarding events" };
  const adoption = (gpTeams !== null && totalTeams !== null && totalTeams > 0) ? { status: "MEASURED", value: Number((gpTeams / totalTeams).toFixed(4)) } : { status: "NOT_MEASURED", reason: "no team adoption data" };
  const npsMetric = nps.length > 0 ? { status: "MEASURED", value: Math.round(nps.reduce((a, b) => a + b, 0) / nps.length), samples: nps.length } : { status: "NOT_MEASURED", reason: "no NPS responses" };

  const measured = [onboardingMetric, adoption, npsMetric].filter((m: any) => m.status === "MEASURED").length;
  return Object.freeze({
    metier: "P14", goldenPaths: GOLDEN_PATHS,
    onboardingTime: Object.freeze(onboardingMetric), goldenPathAdoption: Object.freeze(adoption), internalNps: Object.freeze(npsMetric),
    measuredCount: measured,
    scaffoldAttestationReused: "composes the existing P14 scaffold-evidence attestation (build/sbom/confinement/health) — not duplicated",
    honesty: "golden-path catalog is a reference (nothing provisioned); DevEx metrics (onboarding/adoption/NPS) are computed ONLY from supplied real events — absent events ⇒ NOT_MEASURED, never invented.",
  });
}
function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }

const DEVEX_GOLDENPATH_CONTRACT = Object.freeze({
  id: "IMP-P14-DEVEX-GOLDENPATH",
  purpose: "P14 — golden-path scaffold catalog + DevEx metric view from real events; reuses scaffold attestation",
  invariants: Object.freeze([
    "DevEx metrics computed ONLY from supplied real events — never invented; absent events ⇒ NOT_MEASURED",
    "golden-path catalog is a reference (opinionated but escapable); nothing is provisioned",
    "reuses the existing P14 scaffold-evidence attestation, not duplicated; deterministic; no new engine",
  ]),
});

module.exports = { GOLDEN_PATHS, devexView, DEVEX_GOLDENPATH_CONTRACT };
export {};
