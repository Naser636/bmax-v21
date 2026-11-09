# V12.4 — Business Preparation Dossier (CTO Continuation §8, 2026-11-09)

**Editable templates + checklists. No company created, no expense, no signature made (§8).** Owner-only decisions are
marked **`[OWNER-SIGN]`**. Figures that change over time (tax thresholds, rates, fees) are marked **`[VERIFY-CURRENT]`** —
ODG does **not** assert specific 2026 rates without a dated source. French context (`.fr`); verify all against official
sources before acting.

## 1. Legal form comparison (France — factual categories; thresholds `[VERIFY-CURRENT]`)

| Form | Fit for | Liability | Notes |
|---|---|---|---|
| **Micro-entreprise** | solo start, low overhead, simple accounting | personal (mitigable) | turnover ceilings + simplified régime `[VERIFY-CURRENT]`; fast to open |
| **EI** (entreprise individuelle) | solo, above micro ceilings | patrimoine séparé (since 2022 reform) | real régime; more accounting |
| **EURL** | solo with a company shell | limited to contributions | SARL-type; more formalities |
| **SASU** | solo, raising/scaling, president social regime | limited to contributions | flexible; higher admin/accounting cost |

**Recommendation (structure, not a decision):** a software-services solo launch commonly starts **micro-entreprise** (speed/
simplicity) and migrates to **SASU/EURL** when revenue/liability warrant — but the choice is **`[OWNER-SIGN]`** and depends
on projected revenue (pending §7 inputs) + liability appetite.

## 2. Activity classification `[VERIFY-CURRENT]`
- Likely APE/NAF around **62.01Z** (programmation informatique) / **62.02A** (conseil en systèmes et logiciels) — **verify**
  the exact code with INSEE/guichet-unique for the declared activity set (software dev + technical consulting).

## 3. Checklists (owner completes / signs)
- **Registration dossier:** activity description · chosen form `[OWNER-SIGN]` · guichet-unique filing · SIRET · (optional) EI patrimoine declaration.
- **Bank:** business account comparison (fees, API, cards) — **comparison template** `[VERIFY-CURRENT]`; opening `[OWNER-SIGN]`.
- **Insurance:** **RC Pro** (professional liability) — recommended for software services; **décennale** only if a covered activity (construction) applies (it does **not** for pure software) — `[VERIFY-CURRENT]`, subscription `[OWNER-SIGN]`.
- **Contracts & CGV/CGU:** service contract template · CGV (B2B) · SLA terms — **draft templates to prepare**; legal review `[OWNER-SIGN]`.
- **IP:** code ownership/licensing clauses · client-deliverable IP assignment — template; `[OWNER-SIGN]`.
- **Privacy / RGPD:** privacy policy · processing register (registre des traitements) · consent on the contact form · retention periods · data-subject-rights procedure — **the site already has `legal.html`; extend with a processing register**; legal review `[OWNER-SIGN]`.
- **AI compliance:** AI-Act posture (the repo already tracks `ai-act-in-force` dates + `regulatory-assurance` no-overclaim) — map obligations to offered services `[VERIFY-CURRENT]`.
- **E-invoicing:** France e-invoicing reform dates tracked in-repo (`einvoice*`, in-force dates) — prepare compliant invoice format; activation `[OWNER-SIGN]`.
- **Payment policy:** terms, deposits, late-payment — template; provider is owner-gated (`p01-billing-sandbox`).
- **Customer support & complaints:** intake (the site has `/api/intake`) · SLA · complaints procedure — template.
- **Accounting procedures:** invoicing · expense tracking · VAT régime `[VERIFY-CURRENT]` · annual filing — checklist.
- **Security procedures:** access control, backups, incident response — see the infra dossier (§9).

**Owner-decision summary** (consolidated for §11): legal form · activity codes · bank · insurance · pricing · provider
enablement · public exposure · contract/CGV sign-off. All `[OWNER-SIGN]`; ODG prepares the editable documents, the owner
signs. Nothing here creates a company or incurs cost.
