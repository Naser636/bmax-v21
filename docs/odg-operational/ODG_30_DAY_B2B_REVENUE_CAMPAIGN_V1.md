# ODG — 30-DAY B2B REVENUE CAMPAIGN V1 · Phase 1 (evidence-based plan)

> CTO mandate: **€100k signed contracts in 30 days = STRETCH objective, NOT a forecast or guarantee.** This is a
> decision-ready execution plan, not a claim any revenue is earned. Tags **[FACT]** sourced · **[EST]** source-based
> estimate · **[INF]** inference · **[UNK]**. Public-sector EXCLUDED. No external contact/spend performed.
> Reuses (no re-research): `ODG_PRIVATE_SECTOR_OPPORTUNITIES.md` (O1–O10), `ODG_POC_O2_O3_O8.md` (PoC evidence),
> `ODG_CAPABILITY_ENGINEERING_AND_OPPORTUNITY_GATE.md` (C01–C10), `HUMAN_INPUTS_REQUIRED.md` (A/C/D blockers).

## 0. Truth Lock (start)
`main` · HEAD=origin/main=`8268de1` (= reported start, verified) · worktree clean · 5 stashes intact · protected
zones intact · compass pointer `f9323d2`. Dossiers all present under `docs/odg-operational/`. No uncommitted work.

## 1. Metrics kept separate (never conflated; all MEASURED = 0 today)
qualified pipeline · proposals submitted · **signed €** · invoiced € · **cash collected €** · delivery cost ·
gross margin · owner net (NOT computable w/o legal form). **Current actuals: 0 across the board** (no buyer
contacted, no entity). Revenue is NEVER inferred from market size / programme budget / consulting day-rates.

## 2. Ten-opportunity re-score (evidence-based) — initial-contract lens, not programme value
| # | Opp | Urgency | Demonstrated fit (PoC) | Fast initial contract [EST] | Sales friction | Key blocker | Rank |
|---|---|---|---|---|---|---|---|
| **O2** | CRA/SBOM/SLSA evidence-prep | **HIGH** (CRA SBOM from 09/2026 [FACT]) | **PoC EXECUTED** (real SBOM 489 + provenance + negative test) | audit €3–10k (fast) | LOW (readiness audit needs no client prod access) | full CI integ = access; not a certifier | **#1** |
| **O3** | AI-Act / ISO 42001 readiness | **HIGH** (AI-Act milestones; day rates $1.8–3.5k [FACT]) | **PoC EXECUTED** (matrix 10/10; PARTIAL6/BLOCKED1/GAP1) | gap-assessment €5–25k | MED | NOT a certifier (legal positioning) | **#2** |
| O4 | Legacy→modern migration | MED | ODG's OWN parity proof | €5–15k pilot | MED | per-stack adapters = SPEC; capacity-capped | #3 |
| O6 | Continuous QA / release-gate | MED | validation-engine + golden-set | €3–10k audit | MED | per-client test-infra = SPEC | #4 |
| O8 | Internal Developer Platform | MED-HIGH (priced anchor $450–700k yr1 [FACT]) | **SPEC only** (C07) | heavy build; slow | HIGH (long cycle) | real build needed | #5 (too heavy for 30d) |
| O10 | AI supply-chain posture | MED | overlaps O1; authz/provenance | €5–15k assessment | MED | overlaps O1 | #6 |
| O7 | Observability / AIOps | LOW-MED | self-diagnostic/cockpit | €5–15k | MED-HIGH | needs live data access | #7 |
| O5 | Cloud/AI FinOps | MED | live-cost-metering | €5–15k | HIGH | live cloud read access | #8 |
| O1 | Agentic-AI governance | MED | action-gate/authz | €10–30k | HIGH | live LLM-I/O layer = SPEC; connectors BLOCKED | #9 |
| O9 | B2B workflow automation | LOW-MED | capability-executors | €5–15k | HIGH | connectors/creds BLOCKED | #10 |
**Ranking rationale:** weight shifted to **urgency × demonstrated-PoC-fit × fast low-friction initial contract**,
NOT programme size. O8's large anchor is rejected as primary (SPEC-only build + long cycle ⇒ cannot bank in 30d).
O1/O9/O5/O7 need live external access (blocked). O2 wins: regulatory deadline + the ONLY opportunity with a real
executed PoC + a readiness audit deliverable requiring no client prod access.

## 3. Selection
- **PRIMARY (immediate PoC-ready): O2 — CRA/SBOM/SLSA technical-evidence readiness audit.** PoC already EXECUTED
  (`ODG_POC_O2_O3_O8.md` + the compliance-pack demo: SBOM + signed attestation tamper-evident). Deliverable =
  signed evidence pack + readiness gap-matrix. Fast, low delivery cost, regulatory urgency.
- **SECONDARY: O3 — AI-Act / ISO-42001 readiness matrix** (PoC EXECUTED; strong demand; needs legal positioning
  "evidence/pre-audit, NOT certification").
- **PARTNER / SUBCONTRACTING ROUTE: technical-evidence subcontracting to compliance consultancies / accredited
  auditors / ESNs.** ODG supplies the technical evidence layer (SBOM/attestation/matrix/logging) under a partner
  who holds the client relationship + accreditation — lowers the named-buyer + credibility + capacity barriers.

## 4. Financial scenarios (assumptions tagged; €100k = stretch) — signed ≠ invoiced ≠ collected
Standing start: **no legal entity, no RC Pro, no outreach done, no references, solo capacity.**
| Scenario | Assumptions | Signed (30d) | Invoiced | Collected (30d) | Gross margin |
|---|---|---|---|---|---|
| **Conservative [INF]** | entity+outreach not ready in time; pipeline only | **€0** | €0 | €0 | n/a |
| **Base [EST]** | entity fast-tracked + CTO outreach GO ~day 10 + 1 warm partner ⇒ 1–2 audits €4–10k | **€5–20k** | €5–20k | ~€0 (30–60d terms) | high (coût≈temps) |
| **Stretch €100k [INF]** | requires EITHER ~10–30 audits (∞ solo in 30d) OR 1–2 large O2/O8 programmes (procurement = weeks–months) OR a partner delivering pre-qualified large deals | **not credibly achievable from standing start** | — | — | — |
**Honest verdict:** **€100k signed in 30 days is NOT credible** from today's position (no entity/outreach/refs;
compliance sales cycles are weeks–months; collection terms 30–60d). Realistic 30-day outcome = **qualified pipeline
+ at most 1–2 small signed audits**, cash likely €0 within 30d (payment terms). No conversion % invented.

## 5. 30-day roadmap (bounded phases · entry→exit · evidence · CTO gates)
1. **Truth Lock + evidence reuse** [done this phase] — exit: this doc. €0.
2. **Prioritization** [done] — O2 primary, O3 secondary, partner route. €0.
3. **Primary/secondary PoC finalize** (days 1–3) — reuse O2 executed PoC + compliance-pack; package a client-ready
   sample evidence pack on an OPEN-SOURCE repo (scratchpad). Exit: reproducible demo. €0, autonomous.
4. **Offer + pricing hypothesis + scope + acceptance** (days 2–4) — reuse `ODG_REVENUE_OFFER_AND_MATERIALS` +
   compliance offer-spec; tiers €1.5–10k; acceptance = re-verifiable pack. Exit: offer spec. €0.
5. **Legal/fiscal identity + RC Pro + contract prereqs** (days 1–7) — **HUMAN** (C1–C10): legal entity, SIREN,
   RC Pro insurance, mentions légales, DPA template. **Gate G1 (CTO/human).**
6. **Named private-sector buyer discovery** (days 3–8) — verifiable public sources (company eng-blogs, CRA/AI-Act
   exposure signals, hiring); **no personal data**, role/channel only. Exit: shortlist (grade A/B via lead-grade). €0.
7. **Partner/subcontractor route assessment** (days 3–8) — identify 3–5 compliance consultancies/ESNs; value
   proposition as their technical-evidence sub-layer. Exit: partner shortlist. €0 research.
8. **Personalized proposal + outreach prep** (days 6–10) — drafts only, CNIL opt-out compliant, UNSENT. €0.
9. **CTO authorization gate before ANY external contact** — **Gate G2 (CTO): GO/NO-GO outreach.** Nothing external before this.
10. **Authorized qualification + negotiation** (days 11–25, only post-G2) — real outreach, meetings. Measured funnel.
11. **Signature + delivery + invoicing + collection** (days 15–30, post-signature) — deliver evidence pack; invoice;
    track collection (30–60d, likely lands after day 30). **Gate G3 (CTO): each contract commitment.**
12. **Learning capture** (continuous) — CAPTURED→PERSISTED→DISCOVERABLE→REUSED→EFFECTIVE (evidence per step).

## 6. Funnel / operating dashboard (MEASURED; all 0 now — targets are PLANNING targets only)
prospects identified **0** · evidence-qualified **0** · buyers+budgets verified **0** · partner routes qualified **0**
· meetings authorized/done **0** · proposals submitted **0** · signed **0 / €0** · invoiced **€0** · collected **€0**
· delivery hours **0** · gross margin n/a · rejection/delay reasons — n/a. *(Planning target for 30d: pipeline 5–10
qualified + 1–2 small signed — NOT guaranteed.)*

## 7. Blockers (precise — which commercial action each prevents; not "blocks everything")
- **Legal identity C1–C4 / RC Pro** → prevents **signing/invoicing/representation**; does NOT block research/PoC/prep.
- **CTO outreach GO (G2)** → prevents **external contact**; does NOT block buyer *discovery* from public sources.
- **A1–A5 (host/store/DNS/TLS)** → prevent **public site/API go-live**; the loopback site + PoC prep are unaffected.
- **RGPD/DPA** → prevents **processing prospect personal data**; role/channel research w/o personal data is allowed.
- **SLSA L2** → prevents claiming **L2**; L1+SBOM+signing-mechanism offer stands.
- **npm advisories (D6)** → off-surface; not a sales blocker; disclose in security posture.
- **Capacity (solo)** → caps concurrent delivery; partner route mitigates.

## 8. Remaining human decisions (exact)
G1: authorize legal/fiscal entity + RC Pro (or name the status). G2: GO/NO-GO real outreach. G3: each contract.
Plus: confirm O2-primary selection; approve partner-route outreach; confirm the "evidence/readiness, not
certification" legal positioning. **No external action until G1+G2.**

## 9. Verdict
**PASS WITH BLOCKERS** — decision-ready, evidence-based plan: 10 opps re-scored, O2/O3/O8 explicitly evaluated,
primary+secondary+partner selected with reasons, 3 financial scenarios (signed≠invoiced≠collected), €100k treated
as a stretch **assessed NOT credible in 30d from standing start**, full 30-day roadmap with human gates, blockers
mapped to specific actions. No external action/spend occurred.
