# Automated opportunity detector V1 — results of a REAL collection (private)

> **PRIVATE. Read-only external. No contact/spend/bid.** Tags **[FACT]** · **[EST]** · **[HYP]** · **[UNK]**.
> Collection executed **2026-10-19/20**. Grade = EVIDENCE quality (`enterprise-lead-grade`), **NOT** offer-fit or
> win-probability. A published budget is provenance-checked, never assumed available to us. Machine artifact:
> `runtime/generated/opportunity-shortlist.json` (git-ignored).

## Tooling (built + tested, €0)
`runtime/core/opportunity-detector.{ts,js}` (7/7 tests + parity, tsc 0) — pure normalize → dedupe → grade → rank,
reusing the proven modules: `enterprise-lead-grade` (A/B/C/REJECTED + anti-scam), `opportunity-policy` (budget
provenance via 2xx source), `revenue-model.targetPlan` (delivery-capacity feasibility). Honest handling of missing
budgets/deadlines and **past deadlines** (flagged, kept, down-ranked). Dedupe on stable `ref` (fixed a real
shared-listing-URL collapse found during the live run).

## Collection — sources (public, dated)
tendolio.com (appels d'offres IT, 403 ouverts / 130 ≤10 j, 2026-10-19), francemarches.com (BOAMP), free-work.com
(sous-traitance). Fetched read-only by the bounded provider — **ODG's own egress stays gated**, so autonomous
scheduled collection on the VPS is **NOT yet wired** (it would need an egress-authorized collector — future, gated).

## Graded shortlist (real items, ranked by transparent score)
| Grade | Score | Buyer | Subject | Budget | Deadline | Provenance | Fit to our offer [EST] |
|---|---|---|---|---|---|---|---|
| A | 153 | Smals (BE) | Outil collaboratif prototypage | 2,4 M€ (est.) | 57 j | CANDIDATE | LOW (gros, hors cœur TS) |
| A | 147 | CD Yvelines | TMA MS CRM Dynamics | 250 k€ | n.c. | CANDIDATE | MED (TMA, pas JS→TS) |
| A | 97 | Min. Intérieur | AMO denrées+logiciels | 245 k€ | **EXPIRÉ (-121 j)** | CANDIDATE | LOW (+ échéance passée) |
| B | 71 | CPAS Namur (BE) | Migration MS 365 | n.c. | 9 j | N/A | LOW (migration bureautique) |
| B | 63 | GRANDLYON | Solution IAM SaaS | n.c. | 17 j | N/A | LOW |
| B | 60 | SDMIS Lyon | TMA SIRH HR ACCESS | n.c. | 37 j | N/A | MED (TMA) |
| B | 60 | Paris Habitat | Plateforme SIG SaaS + maint. | n.c. | 24 j | N/A | LOW |
| B | 60 | CD Indre-et-Loire | MCO serveurs centraux | n.c. | 28 j | N/A | LOW |
| C | 20 | R&S TELECOM | Tech lead Java/JS/TS + refacto legacy (sous-traitance) | n.c. | — | N/A | **HIGH** (cœur offre) |
| C | 20 | BLOOMAYS | Fullstack Node/TS, dette/refacto (sous-traitance) | n.c. | — | N/A | **HIGH** (cœur offre) |

## Honest reading (grade ≠ recommendation)
- **The A/B tenders are well-EVIDENCED but mostly LOW fit** (M365/SAP/IAM/SIG/mainframe — not JS→TS/reliability),
  and public-tender qualification (références, capacité financière) gates a solo newcomer. Grade reflects evidence,
  not winnability.
- **The two HIGH-fit items (R&S TELECOM, BLOOMAYS) are graded C by design** — job-board leads whose company is not
  yet registry-verified by us ⇒ capped at C until an official RNE check upgrades them (§3). Their `nextAction` =
  "VERIFY in RNE → subcontracting outreach (CTO GO)". **This is the most promising path** (core-offer fit, low
  barrier) and the detector correctly routes it to a verify-first step rather than over-grading it.
- Provenance = **CANDIDATE** everywhere (listings fetched 200 but budgets not formally extracted+hashed) — honest;
  PROVEN requires a hashed extraction (future: wire `economic-extractor`). `N/A` = no disclosed budget to verify.
- Min. Intérieur is **expired** and correctly down-ranked (not hidden).

## Verdict & next
Detector **OPERATIONAL (real collection executed + verified)** — PASS. The highest-fit opportunities are the
**senior subcontracting leads** (core offer, low barrier), gated at a registry-verify step; the high-evidence public
tenders are mostly off-core and qualification-gated. **Next action:** (1) RNE-verify R&S TELECOM / BLOOMAYS to
upgrade C→B, then prepare subcontracting proposals (send human-gated); (2) optionally wire an egress-authorized
scheduled collector (CTO GO) so the detector runs autonomously on the VPS. No contact/bid made.
