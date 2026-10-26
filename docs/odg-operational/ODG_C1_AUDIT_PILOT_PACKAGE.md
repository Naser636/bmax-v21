# C1 — Autonomous Code-Audit Pilot Package (PREPARED; NOT PUBLISHED)

CTO V3 §1. Budget €0. **Status: PREPARED for a future demand test. NOTHING published, no prospecting, no contact,
no spend.** Everything below awaits a SEPARATE CTO authorization to go live (§1E). Labels: `OBSERVATION` (sourced) /
`ESTIMATION` / `HYPOTHÈSE` / `INCONNU`.

## A. Market & price re-verification (primary-ish, dated)
`OBSERVATION` (robustdevs.co, dated **Aug 2026**) — code-audit tiers with NAMED providers:
- Tier 1 **automated scan $49–$1,300**, 24–72h (Afterbuild Labs $49; Data Jackson $1,297).
- Tier 2 senior review **$950–$5,000**, 5–10 d (Enviera $950; Yellow Labs $995). "**Most startups belong in the
  $950–$5,000 band.**"
- Tier 3 investor diligence $5K–$15K; Tier 4 M&A >$15K.
Cross-check `OBSERVATION` (V2, 2026-10-26): entry fixed $49–$1,500; "strong SMB demand for affordable entry-level".
**Interpretation:** $99 is viable at the Tier-1 floor, but observed willingness-to-pay concentrates higher
($950–5,000). ⇒ offer a $99 entry AND a higher scoped tier. **A displayed competitor price is NOT proof our service
sells** (§1A) — demand remains `INCONNU` until tested.

## B. Pilot service definition
- **Target / problem:** SMB/startup (pre-Series-A) needing an affordable, fast, audit-grade review of a code
  repository before a release, hire, or fundraise — a tier human auditors can't profitably serve.
- **Scope (INCLUDED):** 1 git repository (≤ a stated size/LOC cap); automated review for (a) dependency/license
  risk (via `license-policy` + `supply-chain-attest` SBOM), (b) common correctness/security smells, (c) a
  prioritized findings report with evidence (file:line + rationale + suggested fix), (d) a machine-checkable
  summary. Deterministic + evidence-stamped (ODG's governed analysis + `evidence-provenance`).
- **EXCLUSIONS (explicit, no over-promise):** NOT an exhaustive audit; NOT a guarantee of "no vulnerabilities"; NOT
  a certification; no runtime/pentest; no proprietary-dependency decompilation. Findings are advisory.
- **Deliverables / SLA (`ESTIMATION`):** a report within 72h; fixed scope; 1 clarification round.
- **Secure client-code handling (`HYPOTHÈSE`, to harden before live):** client grants read-only access to a
  specific repo or uploads an archive; processing in an **isolated workspace, network-restricted, least-privilege**
  (ODG already runs bubblewrap-isolated governed bash); **no production secrets ingested**; artifacts + client code
  **deleted after delivery + a retention window**; no client data used to train/improve without consent.
- **Human verification gate:** a human reviews + signs off BEFORE any critical/security conclusion is sent — ODG
  produces the evidence-backed draft; a human confirms (ODG's `capability-authorization` human-gate pattern).
- **Contract / liability (`INCONNU` — needs legal review):** limitation-of-liability, "advisory, no warranty",
  data-processing terms, IP. **Flagged for legal; NOT drafted as binding here.**

## C. Fixed-price vs real delivery cost (unit-economics, computed)
Prices `OBSERVATION`; costs `HYPOTHÈSE`; margins by the real `unit-economics` module.
| Tier | Price | Compute/API (HYP) | ODG active (not charged as human) | Human review | Contribution margin |
|---|---|---|---|---|---|
| Entry | **$99** | ~$15 | ~120 min | ~40 min (€40) | **€84** (−€40 human ≈ €44 net) |
| Standard | **$499** | ~$10 | ~150 min | ~45 min | **€489** (−€45 human ≈ €444 net) |
| Deep | **$999** | ~$5 | ~180 min | ~60 min | **€994** (−€60 human ≈ €934 net) |
Break-even `ESTIMATION`: ~€1,500/mo fixed overhead ⇒ ~**6 standard audits/mo** (or ~34 entry). **Binding unknowns:
CAC + conversion + real delivery time (`INCONNU`).** Near-zero marginal compute cost is the structural moat.

## D. Demand experiment — PRE-REGISTERED (criteria fixed BEFORE any launch)
- **Question:** will the target segment pay for a $99–$499 autonomous code audit at a viable CAC?
- **Channel (candidate, NOT executed):** a single low-friction listing (dev marketplace / a "Show HN"-style post /
  a landing page) — **requires CTO publication authorization**.
- **Metrics:** qualified visits · relevant inbound inquiries · quote requests · **paid conversions** · objections ·
  stated willingness-to-pay · delivery time per audit · contribution margin per delivered audit.
- **PASS (go to a scaled test):** ≥ **3 paid conversions** OR ≥ **10 qualified inbound inquiries with explicit
  willingness-to-pay** within a 2-week / ≤N-visit window, at a tolerable (then-measured) CAC.
- **FAIL (drop/reposition):** < 1 paid conversion AND < 3 qualified inquiries in the window.
- **STOP conditions:** any spend exceeding a separately-authorized cap; any legal/liability blocker; any client-data
  handling risk unresolved. **A click/visit/"interest" is NOT a sale (§1D).**

## E. Authorization boundary (what is prepared vs what awaits CTO authz)
PREPARED here (allowed): market research, offer design, this spec, pricing/margin computation, a LOCAL **unpublished**
demo page (`c1-audit-pilot-demo.html`), scenario simulation. **AWAITING SEPARATE CTO AUTHORIZATION (not done):**
any publication/listing, prospecting, collecting contact details, campaign, spend, or client engagement; binding
contract/liability terms (legal); live handling of real client code. No real client data used.

## Next action (single, CTO-gated)
Authorize the §D demand test on ONE channel (e.g. a $99 entry + $499 standard listing) with the pre-registered
PASS/FAIL — the only step that converts C1 from feasibility-proven to demand-validated.
