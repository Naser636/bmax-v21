#!/usr/bin/env node
"use strict";
/* V217 §6 — data-chain qualification matrix. Proves: covers the existing chains with verified paths/consumers/controls;
 * honest ladder statuses; records the 2 OWNER_GATED findings (D8 not integrated; no xlsx dep) WITHOUT fabricating a fix;
 * synthetic≠real-quality honesty; dated snapshot; deterministic + frozen. */
const A = require("./odg-data-chain-audit.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = A.audit();

  check("covers the core data chains (ingestion gate, doc-intel, einvoice, economic-extractor, tabular, D8 quote)", r.total === 6 && ["external-input-ingestion", "document-intelligence", "einvoice-chain", "economic-extractor", "data-connector", "renovation-quote-normalize"].every((id) => r.chains.some((c: any) => c.id === id)));
  check("each chain has an end-to-end path, composing modules and controls", r.chains.every((c: any) => typeof c.path === "string" && c.path.includes("→") && Array.isArray(c.modules) && c.modules.length > 0 && typeof c.controls === "string"));
  check("integrated chains carry verified non-test consumers (not inferred from mere presence)", r.chains.filter((c: any) => c.status === "INTEGRATED").every((c: any) => Array.isArray(c.consumers) && c.consumers.length > 0));
  check("ladder honest: einvoice chain is fail-closed with EXACT integer minor units (floats rejected)", r.chains.find((c: any) => c.id === "einvoice-chain").controls.includes("integer minor") && /floats rejected/.test(r.chains.find((c: any) => c.id === "einvoice-chain").controls));
  // accuracy (per independent inspection): cite the REAL import consumers of the validation layer; disclose extractors are test-only consumed
  const einv = r.chains.find((c: any) => c.id === "einvoice-chain");
  check("einvoice consumers cite REAL import consumers (order-coherence-check/einvoice-export/workflow), not the loose p11 shape-composer", einv.consumers.join(" ").includes("order-coherence-check") && einv.consumers.join(" ").includes("einvoice-export") && !einv.consumers.join(" ").includes("p11-document-routing (verified)"));
  check("einvoice limits disclose upstream extractors (pdf-extract/factur-x-extract) are test-only consumed", /UPSTREAM extractors .*NO non-test import consumer/.test(einv.limits) && /test-only/.test(einv.limits));
  check("admission gate is deny-by-default with digest integrity + idempotent dedup; no synthetic unblocks real", /deny-by-default/.test(r.chains.find((c: any) => c.id === "external-input-ingestion").controls) && /NO synthetic ever unblocks/.test(r.chains.find((c: any) => c.id === "external-input-ingestion").realVsSynthetic));

  // the ONE unconsumed mechanism is recorded honestly, NOT force-wired
  const d8 = r.chains.find((c: any) => c.id === "renovation-quote-normalize");
  check("renovation-quote-normalize recorded BUILT+TESTED but NOT_INTEGRATED (no canonical consumer)", d8.status === "BUILT_TESTED_NOT_INTEGRATED" && d8.consumers.join(" ").includes("NONE") && d8.classification === "C");
  check("D8 NOT force-wired: finding classifies it as an OWNER_GATED product decision, not a code defect", r.findings.some((f: any) => f.id === "renovation-quote-normalize-not-integrated" && /OWNER_GATED/.test(f.action) && /not a code defect/.test(f.statement)));
  check("native .xlsx binary parser ABSENT recorded as OWNER_GATED dependency decision (class D), not a defect", r.findings.some((f: any) => f.id === "no-native-xlsx-binary-parser" && f.classification === "D" && /dependency decision/i.test(f.statement)));
  check("upstream PDF extractors test-only consumption recorded as a finding (not force-wired)", r.findings.some((f: any) => f.id === "pdf-extractors-test-only-consumed" && /NO non-test import consumer/.test(f.statement) && /not force-wired/.test(f.action)));

  check("summary counts integrated vs not-integrated honestly", r.summary.integratedCount === 5 && r.summary.notIntegratedCount === 1 && r.summary.notIntegratedIds.includes("renovation-quote-normalize"));
  check("honesty: synthetic test PASS ≠ real data quality; extraction correct ≠ content correct; dated snapshot not live checker", /synthetic test does NOT prove real-world data quality/i.test(r.honesty) && /does NOT prove the economic\/legal correctness/.test(r.honesty) && /DATED audit snapshot, NOT a live checker/.test(r.honesty));
  check("no fabricated build: honesty states the findings are OWNER_GATED decisions, not code defects", /No build was manufactured/.test(r.honesty) && r.asOf === "2026-11-16");
  check("contract: audit-only, no new pipeline, ladder-honest, D8 not force-wired, dated snapshot", A.DATA_CHAIN_AUDIT_CONTRACT.invariants.some((i: string) => /no new pipeline\/extractor/.test(i)) && A.DATA_CHAIN_AUDIT_CONTRACT.invariants.some((i: string) => /NOT force-wired/.test(i)));
  check("deterministic + frozen", JSON.stringify(A.audit().chains) === JSON.stringify(r.chains) && Object.isFrozen(r) && Object.isFrozen(A.CHAINS));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — data-chain-audit (V217 §6: qualification matrix over EXISTING chains; verified paths/consumers/controls; fail-closed/provenance/dedup honest; renovation-quote-normalize NOT_INTEGRATED + no-xlsx recorded as OWNER_GATED decisions, NOT force-wired/fabricated; synthetic≠real-quality; audit-only)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
