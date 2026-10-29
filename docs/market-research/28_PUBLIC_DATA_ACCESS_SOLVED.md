# Gate 2 — Public Procurement Data Access SOLVED + Data-Driven Pass (2026-10-22)

Workstream `ODG_500K_PUBLIC_DATA_ACCESS_AND_QUALIFICATION` — stays **OPEN**. The data-access blocker from the prior lot (403/SPA on HTML pages) is **RESOLVED via official public APIs**. No contact, no spend, no code change, no commit. €10M fixed, unproven; revenue €0.

## Gate 2 — access resolved (reproducible, no auth, no key)
| Source | Endpoint tested | Result | Usable? |
|---|---|---|---|
| **TED Search API v3** | `POST https://api.ted.europa.eu/v3/notices/search` (JSON `{query, fields, limit}`) | **HTTP 200** | **YES** — public search, no key; returns notices JSON (publication-number, notice-title, buyer-name, total-value, links) |
| **Find-a-Tender OCDS** | `GET https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?stages=tender&limit=N` | **HTTP 200** | **YES** — public OCDS open data; releases carry `tender.title`, `tender.value{amount,currency}`, `tender.tenderPeriod.endDate` |
| TED/Find-a-Tender **HTML notice pages** | GET prepareViewCfTWS / find-tender/Notice | 403 / SPA | NO (bot-protected) — use the APIs above instead |
| **SAM.gov** | opp page | SPA (unfetchable); public API needs a **free api.data.gov key** (human) | partial — documented blocker; non-US anyway |

Classification (per Gate 2): **public SEARCH APIs = available** (TED v3 search, Find-a-Tender OCDS); submission/authenticated APIs + SAM opp API = key/human; protected HTML pages = 403. **The system is NOT blocked** — the public read path works.

## Working, reproducible query (verified HTTP 200)
`{"query":"classification-cpv IN (72000000 72212000 72250000) AND publication-date>=20260901","fields":["publication-number","notice-title","buyer-name","total-value"],"limit":100}` → **100 returned / 8255 total** matching (IT-services CPV, since 2026-09-01); 70 value-populated; max value €290,000,000.

## Data-driven ≥€500k pass (real primary data, this sample)
Keyword (supply-chain/SBOM/DevSecOps/assurance/security/audit/quality) × value≥€500k over the 100-notice sample:
| Notice | Country | Value | Title | ODG-addressable? |
|---|---|---|---|---|
| **601097-2026** | ES (Agencia Digital de Andalucía) | €650,250 | Computer-review consulting + hardware consulting | **No** — HW/consulting, not SBOM/evidence |
| **601103-2026** | IE (Health & Safety Authority) | €900,000 | Technical computer support — **Security Operations Centre (SOC)** | **No** — managed SOC ops, not ODG's evidence/SBOM domain |
Both are ≥€500k and real, but **neither matches ODG's demonstrated capability** (SBOM/provenance/licence-evidence). **No ODG-addressable ≥€500k opportunity in this sample.** (Sample = 100 of 8255; not exhaustive.)

## Gate 4 verdict
**Still NOT met:** no primary-verified opportunity with an **ODG-addressable** scope ≥€500k. The access method is now solved, so continuation is a data-mining task, not a blocked one.

## Gate 5/6 (unchanged)
`odg-evidence-pack` (R9-lite) + R2 (npm/cli ×2) already prove the SBOM/provenance/licence-evidence layer; no new run justified this lot (no qualifying candidate to map to). FDIC-class capability map (doc `27`) stands: ODG = evidence component/sub, not prime.

## Second pass (larger sample) — decisive signal
Query CPV IN (72000000 72212000 72250000 72260000 48000000) AND publication-date>=20260601 → **250 returned / 32,168 total**. Filtered titles for ODG-SPECIFIC terms (SBOM / supply-chain / provenance / DevSecOps / attestation / reproducible build / dependency risk / licence compliance): **0 hits** across the 250 sample. ⇒ **Strong evidence: software-supply-chain assurance is NOT a named ≥€500k EU public-tender line.** The demand is embedded inside broader "security / software development / managed-services" lots (Route B/C, ODG as a component) or sits in **private / CRA-readiness / OEM** channels that public-procurement APIs do not surface. This reinforces every prior cycle: **ODG's ≥€500k-addressable path is a private enterprise/OEM assurance program, not an open public tender.** (Sample 250/32,168; a full paginate could still find a rare hit, but the base rate is ~0.)

## Next bounded action (workstream OPEN)
Data-mine the 8255 TED notices + Find-a-Tender OCDS programmatically: **(1)** paginate TED (`limit`+`page`) across all 8255; **(2)** fix the CPV set to valid codes (the working set 72000000/72212000/72250000; add verified software CPVs — some guessed codes 400'd, so validate against the TED CPV list first); **(3)** parse each for value≥€500k AND a title/CPV matching ODG's SBOM/provenance/software-assurance domain AND a future deadline; **(4)** for any hit, fetch its machine-readable notice (TED XML/`/notice/<id>/xml`) to confirm value/deadline/eligibility and assess the ODG-addressable portion vs the €500k gate. In parallel, query Find-a-Tender OCDS with software CPV filters. SAM.gov: register a free api.data.gov key (human) to add US opportunities. Keep `odg-evidence-pack` ready for a consented buyer/partner repo. **Do not close; do not fabricate.**
