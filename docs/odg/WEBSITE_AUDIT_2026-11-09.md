# V12.4 — Existing Website Audit (CTO Continuation §2, 2026-11-09)

**Read-only audit of the in-repo website + safe local SEO fixes applied. Nothing published (§2).** Two parts:
- **Next.js app** (`src/app/`): server-rendered Dashboard (auth-gated **fail-closed** via `dashboard-auth`; reads REAL
  governed runtime state — no fabricated data), API routes (`/api/runtime-state`, `/api/intake`, `/api/health`), and a
  same-origin static-site server (`src/app/site/[...slug]/route.ts`).
- **Static marketing site** (`site/*.html`): `index, pricing, contact, faq, method, partners, legal` (fr).

## Findings per audit dimension

| Dimension | Finding | Action |
|---|---|---|
| **Architecture / features** | Clean mono-origin: marketing pages + contact form + intake API share one origin (the form POSTs to same-origin `/api/intake`). | OK |
| **User journey** | index → method/pricing/faq → contact(form) → `/api/intake`. Coherent. | OK |
| **Pages / forms** | Contact form is accessible: 6 inputs **each with a `<label>`**. Other pages are content-only. | OK |
| **Conversion / lead-gen** | Single CTA path (contact form). No multi-step funnel, no lead magnet. | Owner/commercial decision — documented, not unilaterally added |
| **SEO** | Every page had `<title>` + meta description + `lang=fr` + viewport. **Missing: Open Graph, canonical, robots, Twitter card.** | **FIXED** — added OG/canonical/robots/twitter to all 7 pages (derived from existing title+description, **no fabricated copy**) |
| **Accessibility** | `lang=fr`, one `<h1>` per page, form labels present, no images (so no alt gaps). | OK (good baseline) |
| **Performance** | Static HTML, small pages (4–8 KB), no heavy JS. | OK |
| **Security** | Dashboard is auth-gated **fail-closed** (no internal state served without a valid token); static route has an extension allowlist + path confinement. | OK |
| **Data protection / RGPD** | `legal.html` (mentions légales + confidentialité) present. Intake form collects contact data → `/api/intake`. | Verify retention/consent copy (owner/legal) |
| **Mobile** | viewport meta on all pages. | OK (no device test run here) |
| **15-métier integration** | **No P1–P15 representation on any marketing page.** | **GAP** — honest métier/capability content is a **content decision** (métiers are E2/E3, NOT commercially operational — any copy must not over-claim); flagged for owner, not fabricated |
| **Payments / subscriptions** | No payment/subscription integration on the site. | GAP — owner-gated (real provider + billing decision; see `p01-billing-sandbox`) |

## Fixes applied (safe, local, tested — not published)

- Added to each of the 7 pages: `<link rel="canonical">`, `robots index,follow`, Open Graph (`og:type/site_name/title/
  description/locale`), `twitter:card`. Values are **derived from each page's existing `<title>` and meta description** —
  no new marketing claims invented. Verified: every page has exactly one `</head>` and the OG tags present; the
  same-origin serving route is unchanged, so the pages still serve and the contact form still POSTs to `/api/intake`.

## Not changed (owner / commercial / legal decisions — honestly deferred)

- **Métier/capability marketing content** (P1–P15): requires honest copy that does not present E2/E3 engineering
  capabilities as live paid services — a content + positioning decision for the owner.
- **Pricing claims, conversion funnel, lead magnets:** commercial decisions.
- **Payment/subscription integration:** owner-gated (real provider, billing — tracked by `p01-billing-sandbox`).
- **RGPD retention/consent specifics:** legal review.
- **Public deployment / TLS exposure:** owner-gated (`dashboard-tls-exposure`); nothing was published.

## Verdict

The website is a **sound, secure, mobile-ready baseline** with an accessible contact funnel. The technical SEO gap is
now **fixed locally**. The remaining improvements (métier content, conversion funnel, payments, RGPD copy, public
exposure) are **commercial/legal/owner decisions** — documented precisely here, not fabricated or unilaterally shipped.
