#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V62 (§10/§11) — ACTIVATION-READINESS SCAFFOLD. Enumerates the operational capability areas and the
 * human-information slots required for go-live, so that after the indispensable human inputs are supplied, activation is
 * as fast as possible. Each capability area is tagged PREPARED (built/tested locally) / PLACEHOLDER (mechanism present,
 * awaits config) / NOT_BUILT. Each human-info slot (company identity, bank, insurance, supplier accounts, contracts,
 * justificatifs) is left EXPLICITLY EMPTY with status PENDING_HUMAN — NEVER a fabricated number, document, identity,
 * certification, insurance or legal validation. Read-only aggregation; no new engine. Run: `odg-activation-readiness.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");

// operational capability areas (§10) with an honest local-readiness status + the module/mechanism that backs it.
const CAPABILITY_AREAS = [
  { area: "organization management", status: "PLACEHOLDER", backing: "multi-tenant isolation primitives present (profile.tenantId)" },
  { area: "users & roles", status: "PLACEHOLDER", backing: "agent-identity / authorization seam present" },
  { area: "onboarding", status: "PLACEHOLDER", backing: "client-journey-sim models the flow (synthetic)" },
  { area: "métier configuration", status: "PREPARED", backing: "15 métier guards + E4 demonstrators" },
  { area: "mission management", status: "PREPARED", backing: "mission-contract-factory + autonomy-persistence + checkpoint-engine" },
  { area: "quoting & pricing", status: "PLACEHOLDER", backing: "synthetic-enterprise quote stage; pricing HYPOTHESIS (owner-set)" },
  { area: "contracts & templates", status: "PLACEHOLDER", backing: "document templates slot (empty — owner/legal)" },
  { area: "invoicing", status: "PLACEHOLDER", backing: "synthetic-enterprise invoicing TEST-mode; real billing owner-gated" },
  { area: "payments (test mode)", status: "PLACEHOLDER", backing: "prepared≠sent≠cashed discipline; no real gateway credentials" },
  { area: "accounting & exports", status: "PLACEHOLDER", backing: "cost-engine attribution; export format slot" },
  { area: "dashboards", status: "PREPARED", backing: "scorecards / tri-status / performance fiches" },
  { area: "support & incident mgmt", status: "PREPARED", backing: "synthetic-enterprise support stage + rce-assurance + circuit-breaker" },
  { area: "monitoring & logging", status: "PREPARED", backing: "evidence-provenance + audit-log + metric-window-integrity" },
  { area: "backup & restore", status: "PREPARED", backing: "operational-backup snapshots + recovery-drill-benchmark" },
  { area: "continuity", status: "PREPARED", backing: "checkpoint-engine + idempotency-guard + autonomy-persistence resume" },
  { area: "access & data management", status: "PREPARED", backing: "action-gate deny-by-default + root-of-trust + confinement" },
  { area: "security controls", status: "PREPARED", backing: "emergency-stop + third-party-agent-gate + secret-rotation-hygiene" },
  { area: "delivery & maintenance procedures", status: "PLACEHOLDER", backing: "pilot delivery packagers; procedures slot" },
  { area: "user & admin documentation", status: "PLACEHOLDER", backing: "doc generation present; per-deploy content slot" },
];

// human-information slots — EXPLICITLY EMPTY, never fabricated. Status PENDING_HUMAN.
const HUMAN_INFO_SLOTS = [
  "company legal identity (name, registration number)", "registered address", "bank account / IBAN",
  "professional insurance (policy)", "VAT number", "model-provider accounts & API credentials",
  "payment gateway credentials", "signed client contracts", "regulatory/compliance certifications",
  "supplier contracts", "supporting documents (justificatifs)", "authorized signatories",
].map((label) => ({ slot: label, value: null, status: "PENDING_HUMAN", note: "left empty — to be supplied/validated by the owner; never fabricated" }));

const prepared = CAPABILITY_AREAS.filter((a) => a.status === "PREPARED").length;
const placeholder = CAPABILITY_AREAS.filter((a) => a.status === "PLACEHOLDER").length;
const anyFilled = HUMAN_INFO_SLOTS.some((s) => s.value !== null);

const out = {
  "//": "CTO V62 §10/§11 — activation-readiness scaffold. Operational capability areas tagged PREPARED/PLACEHOLDER; human-info slots left EXPLICITLY EMPTY (PENDING_HUMAN). NO fabricated number/document/identity/certification/insurance/legal validation. Read-only; no new engine.",
  capabilityAreaCount: CAPABILITY_AREAS.length, prepared, placeholder,
  capabilityAreas: CAPABILITY_AREAS,
  humanInfoSlots: HUMAN_INFO_SLOTS,
  allHumanSlotsEmpty: !anyFilled,
  honestConclusion: `${CAPABILITY_AREAS.length} operational areas scaffolded: ${prepared} PREPARED (built/tested locally), ${placeholder} PLACEHOLDER (mechanism present, awaits config). ${HUMAN_INFO_SLOTS.length} human-info slots left EXPLICITLY EMPTY (PENDING_HUMAN). After the owner supplies the indispensable human inputs, activation is config-only. Nothing fabricated.`,
  invariant: "A human-info slot is never filled with a fabricated value; identities, numbers, documents, certifications, insurance and legal validations are the owner's to supply. PREPARED means built+tested locally; PLACEHOLDER means the mechanism exists but awaits config.",
};
fs.writeFileSync(path.join(D, "V62_ACTIVATION_READINESS.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ areas: CAPABILITY_AREAS.length, prepared, placeholder, humanSlots: HUMAN_INFO_SLOTS.length, allHumanSlotsEmpty: !anyFilled }, null, 2) + "\n");
export {};
