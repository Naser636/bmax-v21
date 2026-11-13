#!/usr/bin/env node
"use strict";
/*
 * V181 (§4 capability mapping + §2/§3 audit CRITERIA + §6 BTP study + §7 radar). PURE, READ-ONLY, deterministic, fail-closed.
 *
 * TRUTH-LOCK FINDING (§1): the two candidate source assets — "BMAX HFT Core Engine V1.5.0" and "BMAX AO Risk Engine
 * V1.5.0" — are ABSENT from this environment (no Rust, no Cargo.toml, no Terraform, no dossier anywhere on disk). The
 * §2/§3 forensic audits CANNOT be executed against code that is not present, and fabricating findings is forbidden
 * (directive §8). Therefore every BMAX-side maturity here is UNVERIFIABLE and the audit rubrics carry status
 * BLOCKED_ASSET_ABSENT with reproduction CRITERIA ready to run the moment the real code is provided.
 *
 * What IS executable asset-free and is delivered here:
 *   - §4 capability-category mapping: each capability category the directive NAMES → its ODG primitive + métier +
 *     the REAL EXISTING ODG component + honest ODG maturity + verdict REUSE / IMPROVE / BUILD / DEFER / REJECT.
 *   - §4 anti-duplication guard: memory / scheduler / governance / economic-model / evidence are NEVER verdict BUILD
 *     (no second canonical system) — enforced by the test.
 *   - §2/§3 forensic rubrics as structured, reproducible CRITERIA (grounded in real WAL-durability references), status
 *     BLOCKED_ASSET_ABSENT — no invented results, TRL 8/9 never accepted.
 *   - §6 BTP tender-analysis study with REAL radar competitors (OBSERVED, provenance-tagged; prices as RANGES).
 *   - the honest decision: what ODG should learn / reuse / improve, and what is out of scope (trading, infra-provisioning).
 */

const ASSET_STATUS = Object.freeze({
  hft: "ABSENT — BMAX HFT Core Engine V1.5.0 dossier not present on disk (no Rust/Cargo.toml found)",
  ao: "ABSENT — BMAX AO Risk Engine V1.5.0 dossier not present on disk (no Terraform/source found)",
  consequence: "§2/§3 forensic audits BLOCKED_ASSET_ABSENT; BMAX-side maturity is UNVERIFIABLE; no TRL 8/9 accepted; no findings fabricated.",
});

const VERDICT = Object.freeze(["REUSE", "IMPROVE", "BUILD", "DEFER", "REJECT"]);
const ODG_MATURITY = Object.freeze(["ABSENT", "DOCUMENTED", "IMPLEMENTED", "TESTED", "OPERATIONAL"]);
// categories whose canonical system already exists and must NEVER be rebuilt as a parallel system (directive §4)
const NO_SECOND_SYSTEM = Object.freeze(["memory", "scheduler", "governance", "economic_model", "evidence"]);

// Each row: the capability category (named by the directive), the ODG primitive + métier, the REAL existing component,
// ODG maturity, the no-second-system family (if any), the verdict, and a rationale. BMAX-side maturity is UNVERIFIABLE.
const MAPPING = Object.freeze([
  { id: "wal_durability_recovery", primitive: "RECOVERY", metier: "P7", odgComponent: "audit-log.ts (append + keyed-HMAC V162) + odg-campaign-lifecycle.ts (crash-atomic temp+rename register, V160)", odgMaturity: "TESTED", family: null, verdict: "IMPROVE", rationale: "ODG already persists durably and recovers; the transferable lesson is per-record CRC + torn-write truncation discipline (see auditCriteria.hft.wal)." },
  { id: "deterministic_logging", primitive: "EVIDENCE", metier: "P6", odgComponent: "audit-log.ts + patch-execution evidence (V157)", odgMaturity: "TESTED", family: "evidence", verdict: "REUSE", rationale: "deterministic append-only evidence exists; reuse, do NOT build a second evidence system." },
  { id: "idempotence", primitive: "EXECUTOR", metier: "P15", odgComponent: "odg-support-renewal-engine.ts (idempotent, V174) + executor nonce replay-protection (V157)", odgMaturity: "TESTED", family: null, verdict: "REUSE", rationale: "idempotency + replay-protection already proven; reuse for any event/webhook ingestion." },
  { id: "event_integrity", primitive: "EVIDENCE", metier: "P3", odgComponent: "audit-log.ts keyed-HMAC + tip-anchor (V162, blocked only on owner key DEPLOYMENT)", odgMaturity: "TESTED", family: "evidence", verdict: "REUSE", rationale: "tamper-evidence closes full-rewrite + tail-truncation; reuse." },
  { id: "benchmarks_percentiles", primitive: "EVIDENCE", metier: "P6", odgComponent: "runtime/bin/odg-*-benchmark*.ts + integrated-autonomy-bench", odgMaturity: "IMPLEMENTED", family: null, verdict: "IMPROVE", rationale: "benchmark harnesses exist; improve with latency percentiles/histograms — but NEVER present a simulated bench as a real operation (§8)." },
  { id: "observability_metrics", primitive: "EVIDENCE", metier: "P7", odgComponent: "odg-otel-execution-trace.ts (V167) + odg-otel-genai-trace.ts (V166)", odgMaturity: "TESTED", family: null, verdict: "REUSE", rationale: "OTel spans minted from REAL execution; reuse. Only real exporters, no fabricated metrics." },
  { id: "concurrency_throttle", primitive: "EXECUTOR", metier: "P13", odgComponent: "odg-weekly-radar-scheduler.ts window+backoff (V171) + odg-closed-executor.ts (V153)", odgMaturity: "TESTED", family: "scheduler", verdict: "IMPROVE", rationale: "throttle/backoff disciplines exist; improve in place — do NOT build a second scheduler." },
  { id: "document_intelligence", primitive: "EXECUTOR", metier: "P11", odgComponent: "document-intelligence.ts (provenance+confidence, no-OCR, V147)", odgMaturity: "TESTED", family: null, verdict: "REUSE", rationale: "the base doc-intel engine is the foundation for the BTP analyzer below." },
  { id: "document_integrity_hash", primitive: "EVIDENCE", metier: "P11", odgComponent: "document-intelligence.ts provenance + sha256 evidence-provenance", odgMaturity: "TESTED", family: null, verdict: "REUSE", rationale: "the AO '§3 example-hash consistency' check maps to ODG's existing sha256 provenance discipline." },
  { id: "prompt_injection_resistance", primitive: "POLICY", metier: "P3", odgComponent: "odg-product-design-engine.ts (structured-evidence-only, injection-resistant, V177) + negation-inversion safety", odgMaturity: "TESTED", family: null, verdict: "REUSE", rationale: "DCE prompt-injection resistance is already a solved pattern; reuse." },
  { id: "margin_protection", primitive: "EVIDENCE", metier: "P9", odgComponent: "chantier-profitability.ts (V148) + odg-product-economics-audit.ts (V178) + odg-economic-scaling-model.ts (V179)", odgMaturity: "TESTED", family: null, verdict: "REUSE", rationale: "SELLING≠COST≠NET + 3-level economics already protect margins; reuse for AO loss-simulation." },
  { id: "multi_tenant_isolation", primitive: "POLICY", metier: "P5", odgComponent: "delegate-isolation.ts + provider-sandbox.ts + p01-billing-sandbox.ts", odgMaturity: "IMPLEMENTED", family: null, verdict: "IMPROVE", rationale: "process/exec isolation exists; DATA-layer multi-tenancy (row-scoping) is a genuine gap to improve if a SaaS is built." },
  { id: "billing_reconciliation", primitive: "EXECUTOR", metier: "P9", odgComponent: "invoicing.ts + payments.ts (payment execution OWNER_GATED)", odgMaturity: "IMPLEMENTED", family: null, verdict: "IMPROVE", rationale: "reconciliation logic can improve BUT the §3 CRITICAL invariant holds: NO payment-unlock path may bypass a CONFIRMED transaction (owner-gated)." },
  { id: "rgpd_contractual", primitive: "POLICY", metier: "P10", odgComponent: "GDPR conformity DOCUMENTED (V174-B/V175) + odg-iso27001-evidence-crosswalk.ts", odgMaturity: "DOCUMENTED", family: null, verdict: "REUSE", rationale: "documented posture exists; reuse — DOCUMENTED ≠ CERTIFIED, no audit claimed." },
  { id: "incident_runbooks_recovery", primitive: "RECOVERY", metier: "P7", odgComponent: "incident-recurrence.ts + p10-serious-incident-deadline.ts + odg-release-runbook", odgMaturity: "TESTED", family: null, verdict: "REUSE", rationale: "incident lifecycle + runbooks already exist; reuse." },
  { id: "secrets_management", primitive: "POLICY", metier: "P3", odgComponent: "diag secret-exposure/egress audit + governance-path write-guard", odgMaturity: "TESTED", family: null, verdict: "REUSE", rationale: "secret-exposure auditing exists; reuse for the AO secrets/state-protection review once the asset arrives." },
  // ---- the ONE genuine new-product candidate ----
  { id: "btp_dce_contract_analyzer", primitive: "EXECUTOR", metier: "P11", odgComponent: "document-intelligence.ts (base) — a BTP-specific DCE/CCAP/CCTP analyzer does NOT yet exist", odgMaturity: "ABSENT", family: null, verdict: "BUILD", rationale: "the AO business value (DCE/CCAP/CCTP risk + penalty + price-revision extraction) is a real GAP; BUILD on the existing doc-intel base + chantier-profitability + product-design — a product, NOT a parallel canonical system. See btpStudy." },
  // ---- out of scope / rejected (honest) ----
  { id: "terraform_infra_provisioning", primitive: "ALLOCATOR", metier: "P5", odgComponent: "NONE — ODG is SPEC-ONLY and provisions no infrastructure (O8)", odgMaturity: "ABSENT", family: null, verdict: "REJECT", rationale: "ODG does not provision infra (no root/VPS mutation, §9). Reuse only the declarative/idempotent METHOD for mission-contract scaffolding; reject the provisioning capability itself." },
  { id: "order_book_matching", primitive: "EXECUTOR", metier: "—", odgComponent: "NONE — not an ODG métier", odgMaturity: "ABSENT", family: null, verdict: "REJECT", rationale: "order-book/matching is a trading capability; not an ODG métier and out of scope." },
  { id: "trading_account_binding", primitive: "EXECUTOR", metier: "—", odgComponent: "NONE", odgMaturity: "ABSENT", family: null, verdict: "REJECT", rationale: "binding to Binance / a trading account / real money is EXPLICITLY forbidden (§2, §9). REJECT unconditionally." },
  { id: "unsafe_binary_memory_layout", primitive: "EXECUTOR", metier: "P1", odgComponent: "N/A — ODG uses structured/typed contracts, not unsafe memory", odgMaturity: "ABSENT", family: null, verdict: "REJECT", rationale: "unsafe Rust memory/alignment is not an ODG concern; the transferable lesson (validate serialization) is already covered by structured contracts." },
]);

/* §2 / §3 forensic rubrics — reproducible CRITERIA (NOT results). Grounded in real WAL-durability references (§7). */
const AUDIT_CRITERIA = Object.freeze({
  status: "BLOCKED_ASSET_ABSENT",
  note: "criteria are READY; they run against the REAL asset the moment it is provided. No result asserted here — per §8 a simulation is never presented as a real operation.",
  hft: Object.freeze({
    wal: Object.freeze(["fsync-before-ack (durability)", "per-record checksum CRC32C (torn-write + bit-flip detection)", "recovery stops at first checksum mismatch and TRUNCATES (returns recovered prefix)", "checkpointing bounds replay time", "group-commit vs per-write fsync latency/durability trade-off documented"]),
    integrity: Object.freeze(["journal↔in-memory-state consistency after replay", "idempotent replay (no double-apply)", "order/id validation", "truncated-record read returns prefix not garbage", "I/O-error paths surfaced not swallowed"]),
    perf: Object.freeze(["benchmarks fed by REAL counters (not constants)", "percentiles p50/p95/p99 reproducible", "throttle actually bounds throughput", "P5/P6/P7 feasibility proven not asserted (no TRL 8/9 on faith)"]),
    security: Object.freeze(["STRIDE pass", "Cargo dependency audit", "CI actually runs the tests claimed", "NEVER connect to a trading account / Binance / real money"]),
  }),
  ao: Object.freeze({
    infra: Object.freeze(["Terraform coherence + state protection", "no secrets in code/state", "network/DB config + multi-tenant isolation"]),
    integrity: Object.freeze(["webhook signature + idempotence", "document integrity + example-hash consistency", "PDF-parse/upload sanitization", "DCE prompt-injection resistance", "produced-JSON validity + page-reference provenance", "legal-uncertainty handling (no fabricated certainty)"]),
    finance: Object.freeze(["Stripe reconciliation correctness", "FORBID any payment-unlock that bypasses a CONFIRMED transaction", "retries/queues safe", "commercial/financial KPIs NOT accepted as confirmed (§6)", "real CI test coverage measured"]),
  }),
});

/* §6 — BTP tender-analysis market study. Competitors are OBSERVED via radar (grant V141, 2026-11-13), prices as RANGES. */
const BTP_STUDY = Object.freeze({
  capability: "btp_dce_contract_analyzer",
  observedCompetitors: Object.freeze([
    { name: "KALAO", market: "FR", note: "IA audit of DCE/CCTP/CCAP/DPGF; detects inter-document inconsistencies, obsolete DTU, abusive penalties, compte prorata", evidence: "OBSERVED" },
    { name: "MarchéClair", market: "FR", note: "extracts/classifies penalties, imposed variants, deadlines, financial clauses; claims ~98% penalty-clause detection (vendor claim — NOT verified)", evidence: "OBSERVED" },
    { name: "BTP Copilot", market: "FR", note: "DCE analysis + CCTP reading + plan métré + DPGF + chiffrage", evidence: "OBSERVED" },
    { name: "TenderCrunch", market: "FR", note: "extracts dates, penalties, guarantees, vigilance points, matched to qualification criteria", evidence: "OBSERVED" },
    { name: "Aristote (AGORA BTP)", market: "FR", note: "cross-references CCAP/CCTP/RC/DPGF/BPU/planning for contradictions + unpriced work", evidence: "OBSERVED" },
    { name: "SmartBTP", market: "FR", note: "DCE analysis + tender response", evidence: "OBSERVED" },
    { name: "Nomic / BuildingConnected(Autodesk) / Quotr.ai / STACK / Altura", market: "INTL", note: "tender/bid/estimating platforms; OBSERVED price RANGES: Nomic $20-40/user/mo, BuildingConnected ~$199-399/mo, Quotr $249-500/mo, STACK ~$2.6-3k/yr/user, Altura ~£24k/yr", evidence: "OBSERVED_RANGE" },
  ]),
  odgPositioning: "ODG would reuse document-intelligence (provenance+confidence) + chantier-profitability (margin) + product-design-engine; differentiator = evidence-provenance + page-reference citations + governed no-fabrication. Market is REAL and competitive (many FR incumbents) ⇒ a strong product-design + demand-validation pass is required before BUILD commitment.",
  honesty: "competitors + prices are OBSERVED public signals (provenance: radar 2026-11-13), NOT validated demand and NOT confirmed quotes; vendor accuracy claims (e.g. 98%) are UNVERIFIED. Archive-supplied prices/KPIs are NOT treated as confirmed (§6).",
  sources: Object.freeze(["kalao-solution.fr", "marcheclair.fr", "btpcopilot.fr", "tendercrunch.com", "agorabtp.com", "smartbtp.ai", "nomic.ai", "quotr.ai", "buildvisionai.com"]),
});

function mapping(): any {
  const byVerdict: any = {}; for (const v of VERDICT) byVerdict[v] = 0; for (const r of MAPPING) byVerdict[r.verdict] += 1;
  return Object.freeze({
    assetStatus: ASSET_STATUS,
    rows: MAPPING,
    byVerdict: Object.freeze(byVerdict),
    bmaxMaturityNote: "every BMAX-side maturity is UNVERIFIABLE (asset absent); no TRL 8/9 accepted; no forensic result fabricated.",
    antiDuplication: `no verdict BUILD for any of {${NO_SECOND_SYSTEM.join(", ")}} — no second memory/scheduler/governance/economic-model/evidence system.`,
  });
}

/* decisions() — the §10 REUSE/IMPROVE/BUILD/DEFER/REJECT matrix, plus the single BUILD candidate surfaced. */
function decisions(): any {
  const groups: any = {}; for (const v of VERDICT) groups[v] = MAPPING.filter((r: any) => r.verdict === v).map((r: any) => r.id);
  return Object.freeze({ groups: Object.freeze(groups), buildCandidates: Object.freeze(groups.BUILD), note: "the only BUILD is a BTP DCE analyzer (a product on the existing doc-intel base) — not a parallel canonical system." });
}

const BMAX_MAPPING_CONTRACT = Object.freeze({
  id: "V181-BMAX-CAPABILITY-MAPPING",
  purpose: "§1 Truth-Lock + §4 capability mapping + §2/§3 audit criteria (asset-absent) + §6 BTP study + §7 radar",
  truthLock: "BMAX HFT + AO assets ABSENT; forensic audits BLOCKED_ASSET_ABSENT; no findings fabricated; no TRL 8/9 accepted",
  invariants: Object.freeze([
    "every BMAX-side maturity is UNVERIFIABLE until the real asset is provided; no forensic result asserted",
    "no second canonical system: memory/scheduler/governance/economic-model/evidence are REUSE/IMPROVE, never BUILD",
    "trading/order-book/account-binding REJECTED (no real money, no Binance); infra-provisioning REJECTED (ODG spec-only)",
    "NO payment-unlock may bypass a CONFIRMED transaction (owner-gated); competitors/prices are OBSERVED not confirmed",
    "READ-ONLY; deterministic; fail-closed; no register/audit-log/ROADMAP/canonical-source mutation",
  ]),
});

module.exports = { ASSET_STATUS, VERDICT, ODG_MATURITY, NO_SECOND_SYSTEM, MAPPING, AUDIT_CRITERIA, BTP_STUDY, mapping, decisions, BMAX_MAPPING_CONTRACT };
export {};
