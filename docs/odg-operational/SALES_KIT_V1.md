# ODG — Sales kit (V1, 2026-10-27) — DRAFTS ONLY, nothing sent

Companion to `GO_TO_MARKET_V1.md`. **€0, no outreach sent, no third-party data collected.** All prices are
**HYPOTHESIS** (not market-validated); all prospects are a **method + synthetic placeholders**, never real contacts
until the CTO authorises sending. No fabricated client, result or testimonial.

## 1. Product sheet (one-pager)
- **What:** ODG runs a **governed AI-agent & regulatory-readiness assessment** and delivers a reproducible evidence
  dossier (obligations → controls → gaps → owners → verification) + an OWASP-ASI-mapped agent-security review.
- **For:** EU SMEs/scale-ups shipping LLM-agent features who face customer security reviews and the EU AI Act runway
  (Annex-III deployers → 2027-12-02).
- **Proof (FACT):** hermetic, reproducible — `npm run test:report` = 70/70 gated suites; agent-governance mapped to
  OWASP ASI01–10; tamper-evident audit-log; regulatory-assurance dossiers with declared-vs-independently-verified
  evidence and fail-closed hallucination control (an obligation without a cited source is refused).
- **Not (FACT):** not an ISO/AI-Act certification; not a legal conformity opinion; not production-hosted; no guarantee.

## 2. Live demo (REAL + reproducible)
Run on a **synthetic** profile — no client data:
`tsx runtime/core/demo-dossier.test.ts` (gated) renders an honest dossier showing SATISFIED-verified vs
DECLARED-unverified vs GAP vs NOT_APPLICABLE(justified), prioritized remediation, excellence self-review, and the
NOT_CERTIFIED banner. The renderer is `runtime/core/demo-dossier.renderDemoDossier(profile, {registry, now, verifier})`
— deterministic (same inputs ⇒ same dossier), sealable + tamper-evident. **This is the demonstration, not a slide.**

## 3. Pilot proposal template (to be legally reviewed before use)
- **Objective:** deliver a readiness dossier + agent-security review for ONE scoped product/processing.
- **Scope / exclusions:** frameworks in-scope (GDPR + ISO27001 principle-level by default; ISO42001/DORA only if
  applicable); excludes certification, legal sign-off, production deployment.
- **Inputs from client:** company profile + declared evidence (client provides; ODG does not invent).
- **Deliverables:** dossier, prioritized remediation, evidence pack, excellence review.
- **Success criteria:** gaps identified + prioritized; a security artifact the client can show buyers; a runway plan.
- **Price (HYPOTHESIS):** Starter €2,500–4,000 / Standard €6,000–9,000 (see GTM model). **[LEGAL REVIEW REQUIRED]** for
  liability limits, DPA, and the explicit "preparation ≠ certification" clause.

## 4. Objection / Q&A (honest answers)
- *"Are you ISO 27001 certified?"* — No. ODG **prepares** readiness evidence; an accredited body certifies. We show our
  own 70/70 hermetic test evidence + the readiness matrix.
- *"Is this production-grade / multi-tenant isolated?"* — The logic is proven hermetically; **production** authN, KMS/HSM
  and multi-tenant isolation are EXTERNAL and gated — we won't claim them until validated.
- *"How do I know the output isn't hallucinated?"* — Every obligation cites a registry source or is refused; evidence
  is classed declared-vs-independently-verified; dossiers are sealed + tamper-evident.
- *"What about the EU AI Act?"* — We map your role + obligations with sourced dates (Annex-III → 2027-12-02) and build a
  runway; we do not self-certify your system.

## 5. Discovery questionnaire (client-provided inputs)
Sector; size; country/jurisdiction; processes EU personal data? data categories (personal/sensitive/health); AI systems
(purpose/risk); target frameworks (GDPR/ISO27001/ISO42001/DORA-if-financial-entity); existing evidence/controls; buyer
security-review pressure; timeline/driver (AI Act / customer / tender). **ODG never fabricates these — the client fills them.**

## 6. Prospect method (public sources only; drafts UNSENT)
- **Build the list** from PUBLIC legal sources (company registries, public job posts mentioning "LLM/AI agent",
  conference/community member lists) — **no excessive personal-data collection, no scraping of private data.**
- **Qualify** against the beachhead (EU, SME/scale-up, ships LLM agents, plausible security-review pressure).
- **Personalise** an outreach draft per prospect; **store drafts; DO NOT SEND.** The CTO authorises + sends a first
  small batch. Record replies in a simple feedback log.

### Example outreach draft (SYNTHETIC placeholders — do not send as-is)
> Objet : préparation express « gouvernance d'agent IA + conformité » avant vos revues sécurité
> Bonjour {{prénom}}, vous déployez {{fonctionnalité-agent-LLM}} chez {{entreprise}}. Avant l'échéance AI Act
> (systèmes à haut risque : 2027-12-02) et les revues sécurité de vos clients, nous produisons un **dossier de
> préparation réglementaire + revue sécurité d'agent (OWASP ASI)** reproductible, sans prétendre à une certification.
> Seriez-vous ouvert à un court pilote cadré ? Je peux vous montrer une démonstration sur un profil synthétique.
**{{…}} are placeholders. No real recipient, address, or company is included. Sending requires CTO authorisation.**

## 7. Free client-access channels to research (eligibility TBV)
French-tech communities, France Num advisor network, Bpifrance Diag Cyber ecosystem, startup/incubator programs, sector
associations, public events. **Research-level only — no registration, partnership or contact without authorisation.**
