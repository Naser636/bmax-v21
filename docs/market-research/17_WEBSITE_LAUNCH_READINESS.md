# Website & Commercial Launch Readiness (Study V4, 2026-10-22)

**No deployment or production change performed.** Prioritized plan + exact next steps only.

## What exists (evidence)
- A single Next.js app route `src/app/page.tsx` = **"BMAX v21 — Runtime Dashboard"** (`src/app/layout.tsx:10`) — a **private runtime/governance dashboard**, served loopback-only via `odg-preprod.service` (active, 127.0.0.1); public exposure/TLS/DNS are HUMAN-gated per standing governance.
- `public/` holds only default Next.js SVGs. **No marketing/landing, pricing, offer, contact, case-study, lead-capture, or trust pages exist.**
- **Conclusion: there is NO commercial website.** The dashboard ≠ a commercial site and must not be repurposed as one (it exposes runtime internals and is loopback-gated).

## Assessment vs €10M commercial needs
| Dimension | Current | Gap for €10M strategy |
|---|---|---|
| Positioning / offer clarity | none (dashboard only) | build a commercial site stating the "Software Evidence Pack" offer (`15`) |
| Trust / credibility | none | **blocked on R4 references + case studies** (cannot fabricate) |
| Case studies / references | 0 | gated on first accepted engagement (R4) |
| Lead capture / qualification | none | form + qualification workflow (privacy-compliant) |
| Security / privacy | dashboard loopback-only | public site needs TLS, headers, GDPR notice, no secret exposure (human-gated deploy) |
| Performance / reliability / a11y | n/a (not public) | standard for a public marketing site |
| Deployment readiness + cost | preprod loopback only; public exposure HUMAN-gated | hosting + domain + TLS (small cost; in `18`) |
| Analytics / conversion | none | privacy-friendly analytics + conversion path |
| Support / delivery workflow | none | intake → qualification → delivery checklist (`19`) |

## Prioritized launch-readiness plan (build, do NOT deploy here)
1. **P1 (pre-revenue, cheap):** a 1-page static commercial site — positioning + the Evidence-Pack offer + an honest capability statement (readiness-not-certification wording) + a contact/lead form. Separate project/route from the runtime dashboard. No references yet (add post-R4).
2. **P2:** lead-capture + qualification workflow (privacy notice, no PII over-collection), privacy-friendly analytics.
3. **P3:** trust layer — add case studies/testimonials **only after R4** (real, consented references).
4. **P4:** security/privacy hardening + public deployment — **HUMAN-gated** (TLS/DNS/all-interface bind forbidden without a verified security design; a separate authorized deploy mission).

## Exact next implementation steps (future-authorized; not executed)
- New isolated route/app for the commercial site (NOT the dashboard); draft copy from `19`; local build only. 
- Deployment, domain, TLS, public exposure = separate CTO-authorized mission (host/security-gated). 
- Do not expose the runtime dashboard publicly.

## Status
Commercial website: **NOT_STARTED** (dashboard exists but is not a commercial site). Launch path: planned + prioritized; public deploy **HUMAN-gated**. Trust/case-study layer **BLOCKED on R4**. No production change made.
