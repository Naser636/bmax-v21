# Operational Commercial Dossier + Send-Capability Diagnostic (ODG_EUR10M_R9LITE_COMMERCIAL_CONVERSION_V1, 2026-10-22)

Concise, human-usable action dossier. **No message sent** (no authorized sending channel — §3). Messages are copy-paste ready; the minimal technical unblock is specified. No contact, no spend, no fabricated interest.

## Three actions — operational table
| # | Target (profile) | Objective | Proof attached | Precise ask | Planned follow-up | Status |
|---|---|---|---|---|---|---|
| R3 | Independent reviewer (supply-chain/SBOM/SLSA/OSS-licence; no conflict with ODG) | Obtain an independent opinion on the R2 evidence pack | Doc `20` (npm/cli v10.9.0@`977fd578…` + v9.9.4@`64763a34…`; sbom hashes `7ff49874…`/`73e3c667…`; mechanical checks) + the R9-lite pack output | "Confirm independence, scope, timeline, cost; review the mechanical checks + give a written opinion on scope/limits" | If free+unconflicted → proceed; if paid → §4 human approval first | **READY-TO-SEND; no channel ⇒ HUMAN** |
| R4 | Mid-size ISV/SaaS or product team with a real SBOM/provenance/licence pain (CRA readiness / customer audit / DD) | Land + deliver the first bounded pilot → accepted reference | Pilot spec `15`; sample pack (R9-lite on a public repo) as a capability demo (NOT their data) | "15-min exploratory call to confirm the problem, buying process, timeline; propose a 3–5 day read-only pilot on 1 repo with consent + NDA" | On consent+NDA → ODG runs pilot → R4 | **READY-TO-SEND; no channel ⇒ HUMAN** |
| Anchor | OEM/supply-chain-sec vendor, SI/ESN, or MSSP with enterprise channel (`09`/`13`) | Test the €10M-gating hypothesis (adopt/integrate/sell/deliver at volume) | R9-lite engine demo + evidence packs; OEM value-prop `21` | "Exploratory discussion on OEM/embed or subcontract fit, accessible volume, integration time, rev-share (20–35%), delivery responsibilities" | Capture volume/timeline/terms → qualify/falsify | **READY-TO-SEND; no channel ⇒ HUMAN** |

Full message text: `22 §C` (send-ready, guards baked in: vendor framing; no "agreed" claim; R2≠R4; no SLSA-L2/compliance/cert/audit claim; no third-party data).

## Send-capability diagnostic + minimal unblock (§3)
- **Current:** ODG has NO authorized outbound channel — no mail/SMTP/messaging CLI; the only MCP connector is doc-authoring (claude.ai Docs), which is **not** a channel to external third parties. So ODG cannot itself send, and must not fake sending.
- **Minimal technical unblock (smallest, so ODG can later send via an explicitly authorized channel):** a human provisions ONE authorized, traceable outbound connector + its credential — e.g. (a) an MCP email/Slack/outreach connector enabled for this workspace, or (b) an SMTP/API credential placed in an authorized secret store with a thin ODG adapter. **This requires a human action** (credential/connector provisioning is a secrets/infra change ODG is forbidden to do). Once a traceable authorized channel exists, ODG can send the `22 §C` messages itself and log recipient/date/channel/response per §3.
- **Until then:** messages stay READY-TO-SEND; the human sends (copy-paste); ODG records responses when provided.

## Commercial priority linkage (§4)
Highest-contribution next steps toward €10M: (1) R3 independent opinion (credibility); (2) R4 first pilot + accepted reference (unlocks SI/OEM program entry needing ≥2 refs); (3) anchor-partner qualification (the only route that delivers €10M-scale without ODG labor). The R9-lite product now makes the pilot/demo **immediately deliverable** (CLI proven on real public code), removing the "can we even produce the deliverable" risk — the remaining gates are human-executed outreach + consent.

## Metrics (unchanged reality)
contacted 0 · reviewers solicited 0 · pilots 0/0/0/0 · partners contacted 0 · signed/recognized/collected €0. €10M fixed, unproven.
