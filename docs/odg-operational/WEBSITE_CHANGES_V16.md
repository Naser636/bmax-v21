# ODG — Website changes applied in-repo (V16, 2026-10-27)

Concrete, safe, authorised changes to the EXISTING site in `site/` (served via `src/app/site/[...slug]/route.ts`).
**No deploy, no publication, no unvalidated public prices, existing URLs + anti-traversal preserved.**

## Applied
- **NEW `site/partners.html`** (Voie D): honest partner proposition (subcontract / white-label / referral) — scope,
  models, "no partnership presented as acquired", quote-only; CTA "proposer une collaboration".
- **NEW `site/faq.html`**: honest objection-handling (how pricing works, what's included, **"certifiés ISO? Non"**, no
  guarantee, data handling, **synthetic samples labelled as such**); CTAs to contact/services.
- **Nav wired across all 9 pages** (idempotent insert after the Tarifs link): added **Partenaires** + **FAQ** links.
- Pages consistent with existing chrome (header/nav/footer/styles.css); no new dependency.

## Deliberately NOT changed
- **No public prices added** (PRICING_GRID_V1 prices are HYPOTHESIS ⇒ CTO decision to publish). Pages stay quote-after-scoping.
- No deploy / `next build` publish (static site served at runtime from `site/`; public exposure not authorised).
- `src/app/site/[...slug]/route.ts` untouched (path-confinement/anti-traversal intact).

## Verification
`site/proofs/*.test.ts` are unrelated prototype demos (CSV/IoT/platform) — unaffected. New pages are plain static HTML
served by the existing catch-all route (path-confined). Full gate (`test:report`) green; `tsc` 0; `build:runtime` 0.
Top-3 conversion improvements from `WEBSITE_AUDIT_V1`: #2 (partners page + distinct paths) and #3 (FAQ + synthetic
proof framing) are now in-repo; #1 (entry offer with starting-from price) remains a CTO publish decision (prices HYP).
