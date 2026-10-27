# ODG — Website audit + conversion plan (V1, 2026-10-27)

**Existing site found (not recreated):** static HTML in `site/` (`index/services/pricing/method/contact/legal/proofs`
+ `proofs/`), served same-origin via the Next.js route `src/app/site/[...slug]/route.ts` (path-confined, no traversal);
contact form `site/contact.html` → `POST /api/intake`. Deployed state not verified in-session (loopback VPS only;
public exposure NOT authorised). **No auto-publish, no deploy.**

## Strengths (keep — already honest)
Clear FR positioning ("Engineering & Technical Intelligence"); services with **problem / result / deliverable / limits
/ next-step**; pricing page deliberately **quote-only** ("no price displayed without validation"); **no fake
testimonials, no certification claim, no guaranteed outcome**. This honesty is a differentiator — preserve it.

## Top 3 conversion improvements (highest impact; PREPARED, not published)
1. **Reduce first-sale friction (Voie A).** Add a tightly-scoped **"Diagnostic" / "Audit limité" entry offer with an
   honest "à partir de €X" starting-from price** (from `PRICING_GRID_V1`, publicDisplay entries) + a one-click "demander
   un diagnostic" CTA. Rationale: the paid pilot/diagnostic is the shortest path to first cash (SALES_CYCLE_RESEARCH_V1);
   a visible starting price lowers the quote-request barrier for small deals. (Keep larger work quote-after-scoping.)
2. **Distinct paths for deal sizes + a partners page.** Separate, scannable sections/pages for **small missions /
   intermediate projects / large contracts**, each with scope + deliverable + acceptance + "request a proposal"; add a
   **Partners** page (Voie D) with a concrete subcontract/white-label proposition. Rationale: a single generic "platform"
   promise doesn't convert; buyers self-select by deal size.
3. **Trust + objection handling.** A **FAQ** answering buy objections (how pricing works, what's excluded, "are you
   certified?" → honest no, data handling), and **clearly-labelled SYNTHETIC sample reports** (from
   `ASSURANCE_PILOT_SAMPLE_DOSSIER_V1`) as proof-of-method — explicitly "exemple synthétique, pas une mission client".

## Lower-priority / SEO (do carefully, no keyword spam)
Ensure each page has a unique title/description; add a sitemap + robots; structured data for an Organization/Service;
2-3 genuinely useful technical guides (see editorial plan) targeting real buyer questions — **not** thin duplicated pages.

## 90-day editorial plan (Phase 7, compact)
| theme | audience | buyer question | CTA | proof | success metric |
|---|---|---|---|---|---|
| "EU AI Act Art.50 — what shipping an LLM feature requires" | SME product/CTO | "do we need to mark AI content?" | request diagnostic | register findings | diagnostic requests |
| "SBOM & the EU CRA (2026-09-11 / 2027-12-11) — a readiness checklist" | SME shipping software | "what does CRA require?" | download checklist | synthetic SBOM sample | checklist downloads |
| "A technical audit in 2 days: what you get" | eng lead | "what's in an audit?" | request audit | synthetic dossier | audit requests |
| "Vendor security questionnaires: the evidence buyers ask for" | B2B SaaS | "how do we answer these?" | request assurance | evidence-pack sample | assurance requests |
Cadence ~1 piece / 1–2 weeks; each reusable on the site + in proposals. **No claim that content generates leads until data shows it.**

## Delivery stance
Changes prepared as a **reviewable plan/diff**; the build (`next build`) + site tests exist (`site/proofs/*.test.ts`).
**Publishing unvalidated public prices + any deploy are CTO decisions** (prices HYPOTHESIS; public exposure not
authorised). ODG preserves existing URLs/content/SEO; nothing deployed or auto-published this lot.
