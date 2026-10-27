# ODG — Go-to-market, trust, certification & funding strategy (V1, 2026-10-27)

Grounded in the **real** repo state. Labels: **FACT** (verified in-repo or sourced online today), **HYPOTHESIS** (not
market-validated), **EXTERNAL/BLOCKED** (needs account/secret/infra/spend/human). **No fabricated client, revenue,
testimonial, performance or certification.** €0 spent; no external contact made.

## AXE 1 — Real project state (FACT)
- **What ODG is:** a governed autonomous-orchestration runtime (9 permanent primitives) with hermetically-PROVEN
  capabilities: agent-governance (identity→admission gate→authenticated execution→independent verify→recovery,
  OWASP-ASI-mapped), REGULATORY_ASSURANCE (GDPR/ISO27001/ISO42001/DORA-conditional readiness dossiers), a canonical
  excellence policy gating mission/learning/recovery/resolution/execution decisions, tamper-evident audit-log.
- **Evidence surface (FACT):** `npm run test:report` = **70/70 gated suites**, tsc 0, build 0, CI green; every
  capability has adversarial + integration tests at its real decision path.
- **Honest maturity:** **hermetic/internal** proof only. **NOT** production-authenticated, **NOT** multi-tenant-isolated
  in production, **NOT** independently audited, **NOT** ISO/AI-Act certified, **NOT** bank-grade. 7 production
  dependencies EXTERNAL (KMS/HSM, prod datastore + isolation, WORM/SIEM, off-host backups/DR, monitoring, real external
  agent, canonical-queue activation) — each demonstrated, see `PRODUCTION_READINESS_GAPS_V1.md`.
- **Sellable TODAY (HYPOTHESIS, to validate):** a **governed-readiness assessment + evidence pack** service (not a
  self-serve production SaaS): run ODG's regulatory-assurance + agent-governance against a client profile and deliver a
  sourced dossier (obligations→controls→gaps→evidence, AI-agent security review) — because it needs **no** production
  infra and reuses proven hermetic logic.

## AXE 2 — Market & positioning (sourced 2026-10-27; segment choice = HYPOTHESIS)
Driver (FACT, EU AI Act timeline — ec.europa.eu / artificialintelligenceact.eu): in force 2024-08-01; prohibitions since
2025-02-02; GPAI obligations 2025-08-02; GPAI enforcement + Art.50 transparency **2026-08-02**; **high-risk Annex III
applies 2027-12-02**; high-risk-in-products 2028-08-02 ⇒ a ~1-year runway for Annex-III deployers to prepare.

Weighted segment grid (1–5; weights in parens) — scores are ODG's HYPOTHESIS pending discovery:
| Segment | problem intensity (×3) | budget (×2) | sales cycle short (×2) | low impl-cost (×2) | low regulatory risk-to-ODG (×1) | cert-need pulls demand (×2) | renewal (×2) | weighted |
|---|---|---|---|---|---|---|---|---|
| **EU SMEs/scale-ups deploying LLM agents** (AI-governance + agent-security readiness) | 4 | 3 | 4 | 5 | 4 | 5 | 4 | **~72** |
| EU SMEs needing GDPR/ISO27001 readiness (generic) | 3 | 3 | 3 | 4 | 4 | 4 | 4 | ~60 |
| Regulated/finance (DORA) | 5 | 5 | 1 | 1 | 2 | 5 | 5 | ~56 (too heavy to start) |
| Large enterprise / banks | 5 | 5 | 1 | 1 | 1 | 5 | 5 | ~54 (explicitly NOT the start) |

**Chosen beachhead (HYPOTHESIS): EU SMEs/scale-ups shipping LLM-agent features** who must show AI-governance + agent
security + GDPR readiness ahead of AI-Act/customer-security-reviews — ODG's OWASP-ASI-mapped agent governance is a
differentiated, demonstrable fit, implementation cost is ~0 (assessment service), and the AI-Act clock creates pull.
Competitors/substitutes (indirect): GRC/compliance-automation vendors, security-questionnaire tools, consultancies,
DIY + free frameworks (NIST/ANSSI/OWASP). ODG's edge (HYPOTHESIS): evidence-bound, OWASP-ASI-mapped **agent** governance
+ reproducible dossiers, not generic GRC checklists. **Unvalidated:** real willingness-to-pay, cycle length, objection set.

## AXE 3 — Initial offer, pricing HYPOTHESES, financial model
**Offer (HYPOTHESIS): "AI-Agent Governance & Regulatory-Readiness Assessment"** — scoped engagement producing (a) a
REGULATORY_ASSURANCE dossier (applicable obligations→controls→gaps→owners→evidence), (b) an agent-security review
(OWASP ASI01–10 mapped), (c) a prioritized remediation plan, (d) a reusable evidence pack. **Success metrics:** gaps
identified + prioritized, a security-review artifact the client can show buyers, a credible AI-Act/ISO runway plan.
**Exclusions (FACT):** no certification issued, no legal sign-off, no production deployment, no guarantee of conformity.

**Pricing HYPOTHESES (NOT market-validated; anchored to sourced benchmarks):**
- Benchmark anchors (FACT): Bpifrance **Diag Cybersécurité** total €8,800 HT, **50% subsidised → €4,400 HT net**, 8
  expert-days (bpifrance.fr/francenum.gouv.fr); ISO 27001 SME first-year **$8k–$30k** (multiple 2026 industry guides).
- Assessment tiers (HYPOTHESIS): Starter €2,500–4,000 ; Standard €6,000–9,000 ; Deep (+ISO/AI-Act runway) €12,000–18,000.
- Recurring (HYPOTHESIS): quarterly re-assessment / evidence-refresh retainer €400–1,200/mo.

**Prudent / central / favourable 12-mo model (HYPOTHESIS — illustrative, no sale yet):**
| scenario | paid pilots | avg price | recurring (mo end) | gross rev (yr) | variable cost/engagement | gross margin |
|---|---|---|---|---|---|---|
| prudent | 3 | €3,000 | €0 | ~€9,000 | mostly ODG-time (€0 external) | high (labour-only) |
| central | 8 | €6,000 | 3×€600 | ~€48,000 + ~€5,400 | €0 external (hermetic) | high |
| favourable | 15 | €8,000 | 8×€900 | ~€120,000 + ~€43,000 | €0 external | high |
Break-even (FACT of the model): with €0 external spend and labour-as-cost, break-even ≈ first paid pilot covering the
acquisition effort. **Max acceptable CAC (HYPOTHESIS):** < 25–30% of first engagement value. Cash need: low until a
client requires EXTERNAL infra (then gated). **Not a validated price — a testable hypothesis.**

**Sales kit skeleton to build (artifacts, €0, no fabricated proof):** 1-page product sheet, deck, LIVE demo script
(run `test:report` + a sample dossier on a synthetic profile), security one-pager (from AXE 4), objection/Q&A, pilot
proposal template, **contract template [LEGAL REVIEW REQUIRED]**, discovery questionnaire. **Prospect method:** build a
qualified list from PUBLIC legal sources only (company directories, job posts mentioning "LLM/AI agent"), personalised
outreach drafts **prepared but NOT sent** (human authorises sending), feedback captured in a simple log. No scraping of
excessive personal data; no auto-contact.

## AXE 4 — Trust dossier (evidence-based; honest distinctions)
Provide to prospects (all FACT, hermetic): architecture + scope; threat model = OWASP ASI01–10 mapping; reproducible
test results (70/70 gated, adversarial + integration); identity/authorization/tenant-separation (hermetic, logical);
tamper-evident audit-log provenance; recovery/idempotence/no-false-success; dependency + subcontractor + limits list.
**Explicit ladder (never blurred):** internal tests ✔ (have) → internal audit ✔ (have, self) → **independent audit ✘
(EXTERNAL)** → **accredited certification ✘ (EXTERNAL)** → **legal conformity ✘ (lawyer)**. **Never** claim ISO
certified / fully GDPR compliant / bank-ready.

## AXE 5 — Certification & compliance roadmap (sourced; order = HYPOTHESIS)
1. **GDPR + CNIL** first — legal obligation, lowest cost, public text consulted (RoPA/lawful-basis/DPIA/breach). Needs a
   lawyer sign-off for legal conformity (EXTERNAL). ODG prepares the dossier.
2. **ISO/IEC 27001:2022 (+Amd 1:2024 climate action)** when revenue justifies — SME first-year **$8k–$30k** (FACT,
   sourced); clause-level mapping needs the ISO **text** (paywalled; free AFNOR/ANS consultation route eligibility TBV).
3. **ISO/IEC 42001:2023 (AIMS)** only if an AI-management-system scope is justified by clients.
4. **EU AI Act role analysis (FACT timeline):** ODG is most likely a *provider of a GPAI-adjacent governance tool* /
   *deployer-support*, not itself a high-risk Annex-III system — to be confirmed per concrete use; Annex-III deployers
   have until **2027-12-02**. ODG's value = helping clients prepare, not self-certifying.
5. **DORA** only for clients that are EU financial entities (applicability-gated in the product).
Readiness matrix (requirement→control→evidence→owner→status→gap→cost→acceptance): `CONTROLS_REFERENTIAL_V1.md`.
**Certification bodies:** accredited CBs (e.g., AFNOR Certification and other COFRAC-accredited bodies) — exact body,
audit-day count (ISO 27006, ~3–6 days SME) and quote = **EXTERNAL, human, not engaged**.

## AXE 6 — Minimal funding / self-financing (sourced; eligibility TBV = EXTERNAL)
1. **Paid pilots** once value is proven = primary, €0-risk self-financing.
2. **Bpifrance "Diag Cybersécurité" / Dispositif Cyber PME** (FACT): €8,800 HT, **50% subsidised**, €4,400 net, 8 days;
   France Num partner; Plan Cyber PME → 1500 PME/ETI/5yr. **Eligibility (is ODG's own company eligible? is this for
   ODG-as-provider or ODG-as-client?) = TO VERIFY.** Not counted as acquired.
3. **France Num / ANSSI MonAideCyber / regional aids** — research-level only; eligibility TBV.
4. Distribution/design partnerships — prepare, don't sign.
5. External financing (debt/equity) — **avoid until demonstrably necessary**; no commitment on the CTO's behalf.
**No grant/contract counted until notified/signed. Grants do NOT auto-cover buying an ISO standard or a certification audit.**

## AXE 8 — Measurable milestones (none claimed achieved)
first validated client problem → first completed pilot → **first cash received** → repeat/renewal → positive margin +
controlled cost → verifiable client references → independent security validation → certification (if justified) →
partnerships/international → reputation on reproducible results. Track margin, cash, retention, reliability, incidents,
delivery + support cost — not revenue alone. **Status today: pre-first-client (0 on all).**

## AXE 9/10 — Human decisions required (grouped) + single priority
**Only-human (cannot be simulated/bypassed):** (1) authorise outreach sending + approve the contract/legal template
(lawyer); (2) decide pricing to test in-market; (3) authorise any spend (ISO text / certification audit / tools) — €0
until then; (4) verify ODG's eligibility for Bpifrance/France Num aids; (5) the 7 EXTERNAL production dependencies when a
client needs real deployment; (6) legal conformity + certification engagements.

**Single priority recommendation:** **validate demand before any spend** — authorise ODG to (a) finalise the €0 sales
kit + a live demo on a synthetic profile, (b) assemble a public-source qualified-prospect list + personalised outreach
drafts (prepared, **unsent**), then **you send a small first batch** and we record feedback. First paid **pilot** is the
only credible validation of the pricing hypotheses and the beachhead segment. Everything else (ISO text, certification,
production infra, funding) is sequenced **after** demonstrated demand — not before.
