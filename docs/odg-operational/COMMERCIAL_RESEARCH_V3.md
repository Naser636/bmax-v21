# ODG — Commercial research V3: purchase triggers + verified prices (2026-10-27)

Closer-to-purchase research for offers A (technical audit) and C (technical assurance). Read-only, €0, **no contact, no
buying intent asserted.** Fact ladder: market-size estimate < detected opportunity < **verified prospect** < buying
intent. **Nothing below is a verified prospect or intent** — these are triggers, prices, and segments.

## Purchase TRIGGER events (real, dated)
- **Technical due diligence** between term sheet and closing (2–6 weeks, deal-bound) — funding/M&A trigger. (Nulab, Black Duck)
- **Enterprise security questionnaire** as a deal-blocker ("pentest within 12 months", SOC2/ISO) — 46% report delayed sales, 38% lose bids for lack of compliance. (Secureframe, ResponseHub)
- **EU AI Act Art.50** transparency — hard date **2026-08-02** (marking grace **2026-12-02**), fines ≤€15M/3%. (Sidley, artificialintelligenceact.eu)
- **EU CRA (Cyber Resilience Act, Reg (EU) 2024/2847)** — **2026-09-11** reporting obligations (24h/72h/14-day to ENISA); **2027-12-11** full application incl. **SBOM** in technical documentation. Readiness demand peaks 2026–mid-2027 (~15 months ahead). *(secondary sources; confirm vs EUR-Lex before client-facing claim.)* (Keysight, Anchore, Finite State)

## Comparable PUBLIC prices (VERIFIED where noted)
| service | published price | source |
|---|---|---|
| Fixed-fee code audit (1–2 wk) | **$4,000–12,000** (startups $1,300–5,000; investor-grade $5,000–15,000) | robustdevs (VERIFIED) |
| Pentest (SMB ≤150 emp) | **$8,000–20,000**; avg ~$18,300; day $1,200–3,000 | DeepStrike (VERIFIED) |
| ISO 27001 readiness/gap | **€3,000–6,000** (indep. €5,000–15,000) | heyData/soc2auditors (VERIFIED) |
| ISO 42001 gap / implementation | gap **$5–15k**; impl **$15–50k**; Big Four $75k+ | Scytale/certbetter (VERIFIED) |
| SBOM/supply-chain platforms | free→quote (Trivy/Dependency-Track free; Snyk from $25/mo) | ReversingLabs/OX (tooling cheap; **gap = expertise+evidence**) |
| Competitor EuroAIGuard (AI-gov SaaS) | **€490/990/2,290 per month** | euroaiguard.com (VERIFIED, prior lot) |

**Implication for ODG pricing:** the HYPOTHESIS ranges (A €3–8k, C €5–15k, recurring €1–2k/mo) are **consistent with
verified market prices** — code-audit €4–12k and ISO-readiness €3–6k bracket A; ISO-42001 gap $5–15k and pentest brackets
support C; EuroAIGuard's €490–2,290/mo supports recurring. Still HYPOTHESIS until a real quote is accepted.

## Sales→cash delay
SMB services **30–90 days** need→purchase; mid-market 90–180; deadline-driven (AI Act/CRA) or deal-driven (DD) compress
urgency. Non-deadline discretionary buyers = **uncertain** timing. (Gangly)

## Alternatives & solo differentiation
Free/OSS tools (Trivy, Dependency-Track, SonarQube, Snyk free), boutique dev shops, Big Four, in-house. **Tools find
issues; they don't produce a defensible remediation plan / auditor-ready evidence narrative.** Solo edge: fixed-scope,
fast (5–10 days), neutral (didn't write the code), evidence-backed, far below Big Four — positioned as **readiness/
assurance, NOT certification** (certification needs an accredited CB).

## Ranked near-term SEGMENTS (not companies to contact) + qualification criteria
1. **EU CRA-in-scope "products with digital elements" vendors** — *Offer C.* Signal: ships commercial/connected software to EU, no published SBOM/VDP. **Strongest (hard 2026/2027 mandate + ODG has a proven multi-ecosystem SBOM capability).**
2. **EU B2B SaaS SMEs selling upmarket** — *C then A.* Signal: enterprise logos but no SOC2/ISO/trust page ⇒ questionnaire pain.
3. **Startups with a recent/imminent funding round or M&A** — *Offer A.* Signal: public round/acquisition ⇒ tech-DD window (2–6 wk), high-conversion, time-boxed.
4. **EU SMEs with customer-facing GenAI** — *Offer C (AI Act Art.50).* Signal: live chatbot/AI media, no transparency notice.
5. **Vendors with a public failure signal** — *A+C.* Signal: disclosed breach, status-page incidents, stale public repos/failing CI.
Discipline: a segment lead is "detected opportunity" ONLY; promote to "verified prospect" solely on a concrete public
signal; never infer budget/intent. **No message/contact generated.**

## ACCESS SUMMARY
Public web only; €0; no auth/paywall; no contact. Prices: code-audit/pentest/ISO-27001/ISO-42001 = VERIFIED published;
SBOM-platform enterprise = quote. Regulatory dates (CRA/AI-Act) = reputable secondary, **confirm vs EUR-Lex**. No prospect
verified; no buying intent; US-index may under-represent EU-language price pages. Dated 2026-10-27.
