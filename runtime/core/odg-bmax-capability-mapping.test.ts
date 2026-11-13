#!/usr/bin/env node
"use strict";
/* V181 — BMAX capability mapping. Proves: the Truth-Lock asset-absence is honored (BMAX maturity UNVERIFIABLE, audits
 * BLOCKED, no TRL 8/9); the §4 mapping points at REAL existing ODG components; NO second canonical system is proposed
 * (forbidden families never BUILD); trading + infra-provisioning REJECTED; the payment-unlock invariant holds; §6
 * competitors are OBSERVED not confirmed; read-only + deterministic. */
const B = require("./odg-bmax-capability-mapping.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const m = B.mapping();
  const byId: any = {}; for (const r of m.rows) byId[r.id] = r;

  // ---- Truth-Lock: assets absent, nothing fabricated ----
  check("Truth-Lock: both BMAX assets reported ABSENT and audits BLOCKED_ASSET_ABSENT", /ABSENT/.test(B.ASSET_STATUS.hft) && /ABSENT/.test(B.ASSET_STATUS.ao) && B.AUDIT_CRITERIA.status === "BLOCKED_ASSET_ABSENT");
  check("no TRL 8/9 accepted; BMAX-side maturity UNVERIFIABLE", /UNVERIFIABLE/.test(m.bmaxMaturityNote) && /no TRL 8\/9/.test(m.bmaxMaturityNote));

  // ---- mapping shape + real components ----
  check("every row has primitive + metier + odgComponent + odgMaturity + a valid verdict", m.rows.every((r: any) => r.primitive && r.metier && r.odgComponent && B.ODG_MATURITY.includes(r.odgMaturity) && B.VERDICT.includes(r.verdict) && r.rationale));
  check("key rows map to REAL existing components (audit-log, document-intelligence, chantier-profitability)", /audit-log/.test(byId.event_integrity.odgComponent) && /document-intelligence/.test(byId.document_intelligence.odgComponent) && /chantier-profitability/.test(byId.margin_protection.odgComponent));

  // ---- anti-duplication: forbidden families never BUILD ----
  check("NO second canonical system: memory/scheduler/governance/economic-model/evidence never verdict BUILD", m.rows.filter((r: any) => B.NO_SECOND_SYSTEM.includes(r.family)).every((r: any) => r.verdict !== "BUILD"));
  check("evidence + scheduler families are REUSE/IMPROVE (reuse the canonical system)", byId.deterministic_logging.verdict === "REUSE" && byId.event_integrity.verdict === "REUSE" && byId.concurrency_throttle.verdict === "IMPROVE");

  // ---- rejects: trading + infra-provisioning + unsafe memory ----
  check("trading / order-book / account-binding are REJECTED (no real money, no Binance)", byId.order_book_matching.verdict === "REJECT" && byId.trading_account_binding.verdict === "REJECT" && /forbidden/i.test(byId.trading_account_binding.rationale));
  check("infra-provisioning REJECTED (ODG spec-only, provisions no infra)", byId.terraform_infra_provisioning.verdict === "REJECT" && /SPEC-ONLY|spec-only|no infra/i.test(byId.terraform_infra_provisioning.odgComponent + byId.terraform_infra_provisioning.rationale));

  // ---- the one genuine BUILD is a product, not a parallel system ----
  const d = B.decisions();
  check("the only BUILD candidate is the BTP DCE analyzer (a product on the doc-intel base)", d.buildCandidates.length === 1 && d.buildCandidates[0] === "btp_dce_contract_analyzer" && byId.btp_dce_contract_analyzer.verdict === "BUILD");

  // ---- payment-unlock invariant (§3 critical) ----
  check("billing: NO payment-unlock bypasses a CONFIRMED transaction (owner-gated)", /CONFIRMED transaction/.test(byId.billing_reconciliation.rationale) && B.AUDIT_CRITERIA.ao.finance.some((c: string) => /bypasses a CONFIRMED transaction/.test(c)) && B.BMAX_MAPPING_CONTRACT.invariants.some((i: string) => /payment-unlock may bypass a CONFIRMED/.test(i)));

  // ---- §2/§3 audit criteria grounded (WAL durability references) ----
  check("HFT WAL criteria include fsync-before-ack + per-record checksum + truncate-at-torn-write", B.AUDIT_CRITERIA.hft.wal.some((c: string) => /fsync-before-ack/.test(c)) && B.AUDIT_CRITERIA.hft.wal.some((c: string) => /CRC32C/.test(c)) && B.AUDIT_CRITERIA.hft.wal.some((c: string) => /TRUNCATES/.test(c)));

  // ---- §6 BTP study: competitors OBSERVED, prices as ranges, not confirmed ----
  check("BTP study lists REAL FR competitors as OBSERVED (KALAO, MarchéClair, BTP Copilot)", B.BTP_STUDY.observedCompetitors.some((c: any) => c.name === "KALAO" && c.evidence === "OBSERVED") && B.BTP_STUDY.observedCompetitors.some((c: any) => /MarchéClair/.test(c.name)));
  check("BTP study: competitors/prices OBSERVED not confirmed; archive KPIs NOT treated as confirmed; 98% claim UNVERIFIED", /OBSERVED public signals/.test(B.BTP_STUDY.honesty) && /NOT treated as confirmed/.test(B.BTP_STUDY.honesty) && /UNVERIFIED/.test(B.BTP_STUDY.honesty));

  // ---- contract + determinism ----
  check("contract: asset-absent truth-lock + no-second-system + reject-trading/infra + payment invariant", /BLOCKED_ASSET_ABSENT/.test(B.BMAX_MAPPING_CONTRACT.truthLock) && B.BMAX_MAPPING_CONTRACT.invariants.some((i: string) => /no second canonical system/.test(i)) && B.BMAX_MAPPING_CONTRACT.invariants.some((i: string) => /REJECTED/.test(i)));
  check("deterministic + frozen", JSON.stringify(B.mapping().byVerdict) === JSON.stringify(m.byVerdict) && Object.isFrozen(m) && Object.isFrozen(B.MAPPING) && Object.isFrozen(B.AUDIT_CRITERIA));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — bmax-capability-mapping (V181: Truth-Lock = both BMAX assets ABSENT ⇒ audits BLOCKED, BMAX maturity UNVERIFIABLE, no TRL 8/9, nothing fabricated; §4 maps named capabilities to REAL ODG components; NO second canonical system; trading+infra-provisioning REJECTED; payment-unlock invariant held; §6 BTP competitors OBSERVED not confirmed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
