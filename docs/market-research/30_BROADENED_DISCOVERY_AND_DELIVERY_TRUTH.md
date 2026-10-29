# Broadened Discovery + End-to-End Delivery Truth (Mission ODG_GLOBAL_ENTERPRISE_100K_500K_END_TO_END, 2026-10-22)

Workstream stays **OPEN**. **Mandate received TRUNCATED** (ended mid-§1 list at "…optimisation"; governance/deliverables/closure sections not received) — proceeded within this session's standing rules (OPEN, €0 budget, no contact/spend/private-access, preserve research+5 stashes, boussole, no fabrication, no unrelated commit). No code change, no commit this lot. €10M fixed, unproven; revenue €0.

## 1. Broadened discovery (beyond cyber/supply-chain — per §1 principle)
Query (public TED API, HTTP 200): CPV IN (72000000 72212000 72250000 72260000 48000000) since 2026-09-01 → **250 returned / 11,816 total**. Of the 250, **52 are in the €100k–500k band** — but **0 match ODG's demonstrated end-to-end deliverable**. The band is general IT: project-management consulting, backup-software subscriptions, data-transmission services, IS/server supply, generic software maintenance, advertising design, programming+consulting. Representative (value / title):
- €218,400 project-management consulting (FI); €329,184 backup/restore software subscription (RO); €285,093 information systems + servers supply (ES); €427,750 software maintenance & repair (HR); €150,000 software programming + consulting (EE); €350,403 project-management consulting (ES).
These require vendor references / local presence / eligibility ODG lacks, and — crucially — they are **general app-dev / maintenance / consulting / hosting / data-services**, not ODG's demonstrated capability.

## 2. The decisive truth: broadening the SEARCH did not broaden the DELIVERABLE
The CTO principle (don't lock ODG into one specialty) is honored by searching broadly. But the **evidence** shows ODG's *demonstrated end-to-end deliverable* is currently specialized:
| Listed domain (§1) | ODG end-to-end-deliverable today? | Evidence |
|---|---|---|
| SBOM / provenance / supply-chain evidence | **YES (proven end-to-end)** | `odg-evidence-pack` R9-lite on real public repos (npm/cli ×2) |
| Automated test / QA / parity assurance | **PARTIAL (own-repo proven)** | ~88 equivalence benches; own-repo only |
| Software migration (TS) / modernization | **PARTIAL (own-repo only)** | own `.js↔.ts` ports; NOT on external client code |
| Observability/evidence of delivery | PARTIAL | evidence-provenance, mission-ledger |
| Web/mobile/SaaS app development | **NO** | never demonstrated on external/client projects |
| CRM/ERP (Dynamics/SAP/Salesforce) | **NO** | no capability/experience (will not claim) |
| AI agents / business AI for clients | **NO (external)** | internal only; egress blocked |
| Data pipelines/dashboards, API integration (client) | **NO (external)** | not demonstrated |
**⇒ The €100–500k opportunities in the market are overwhelmingly the "NO" rows (general app-dev/maintenance/consulting). ODG's genuine end-to-end-deliverable is the "YES/PARTIAL" rows (evidence/assurance + migration-with-parity), which the market rarely procures as a standalone ≥€100k public lot (base rate ≈0, established across prior lots).** Broadening won't change this without BUILDING new delivery capability (external app-dev + references) — a capability-build program, not a search result.

## 3. End-to-end delivery proof — what IS proven
For ODG's actual deliverable, end-to-end delivery is **PROVEN**: `odg-evidence-pack` takes a real lockfile → CycloneDX SBOM + in-toto/SLSA-L1 provenance (sign+verify+tamper) + licence/dependency-risk + report, reproducibly, on **real public code** (npm/cli v10.9.0 & v9.9.4). For general app-dev it is **NOT proven and not buildable within a research mandate**. So the "retained scope ODG can deliver end-to-end" = the **evidence/assurance pack** (and own-style QA/parity + TS migration), delivered as a sub-scope/OEM under a prime — not a standalone €100–500k app-dev lot.

## 4. Honest conclusion + options (no fabrication)
No €100–500k opportunity found that ODG can deliver end-to-end AND that is procured as a standalone lot matching ODG's deliverable. Two real paths (both previously documented):
- **B (realistic now):** ODG supplies its evidence/assurance layer as a sub/OEM under a prime (web-dev titulaire, SI, or Liquid Reply-type supply-chain partner). ODG portion typically < €100k per engagement; €500k needs multi-engagement/recurring aggregation (to be evidenced, not assumed).
- **Capability-BUILD (strategic decision, not research):** extend ODG into a demonstrable external-delivery capability (e.g., productized QA/migration-with-parity service with references) so a €100–500k engagement is fully ODG-deliverable. This is a build program requiring a CTO decision + investment, out of this research mandate.

## 5. Next bounded action (workstream OPEN)
(a) Confirm the §1-truncated mandate's missing governance/deliverables with the CTO (what was cut). (b) Continue the private/OEM partner route (doc `29`) + targeted TED/Find-a-Tender OCDS mining for the rare standalone assurance/QA/migration lot (valid CPV, value≥€100k, future deadline, notice-XML verify). (c) If the CTO wants a fully-ODG-deliverable €100–500k offer, open a capability-BUILD decision (productize QA/migration-with-parity + first reference). Keep `odg-evidence-pack` demo-ready. **Do not close; do not fabricate an opportunity or a capability.**
