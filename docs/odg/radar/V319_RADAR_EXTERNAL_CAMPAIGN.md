# V319 §4 — real external Radar campaign (routed through the Radar, not parallel)

**Status: REAL external research executed THROUGH the Radar; findings = mission PROPOSALS only (OWNER_GATED).**
This closes the "real external Radar campaign NOT_RUN" gap from the V319 crosswalk. Nothing was registered or executed;
no canonical write. External content is untrusted and was never treated as a governance instruction.

## Routing (honest)
REAL `grant-V141` WebSearch was operated by the technical provider (Claude Code) and **INJECTED via
`odg-radar-collection-adapter.collect()`** — the Radar owns provenance, dedup, real/synthetic tagging, and fail-closed
behaviour. This is **not** a parallel collection. Verified in the run:
- `grantValid: true` (authorized, unexpired, within budget).
- **deny-by-default proven**: `collect()` with no injected provider ⇒ `BLOCKED / NO_INJECTED_PROVIDER` (the Radar never self-egresses here; autonomous egress remains NOT_MEASURED / OWNER_GATED).
- 3 queries ⇒ `COLLECTED_REAL`, all records `real:true`, provenance `OBSERVED_EVIDENCE`.

## Honesty bound
`OBSERVED_EVIDENCE` here = **search-result metadata** (titles/URLs/snippets) — the pages were **NOT deep-read**. No
claim is made of having studied inaccessible content. A signal is not a fact; a finding is not an authorization.

## Collected (through the Radar)
| topic | sources (observed) |
|---|---|
| agentic-coding benchmarks | arXiv "Benchmarks Misaligned with Agentic SE", "SWE-Bench Pro Verified", ArtificialAnalysis "GDPval-AA v2.1" |
| BTP takeoff | Procore Estimating (AI floor-plan area detect + auto-count symbols), Autodesk Forma Takeoff (auto quantities from 3D) |
| local code LLM | benchlm.ai (Kimi K3.1 Pro / DeepSeek V4.1 Flash lead), Qwen3-Coder-Next (58.7% SWE-bench Verified, 256K ctx, 24GB GPU) |

## Mission PROPOSALS (evaluated by value / cost / risk / urgency / canonical-compat — all PROPOSED, OWNER_GATED)
1. **RMP-AUTONOMY-HOLDOUT** — evaluate ODG autonomy against SWE-bench Pro Verified using **private adversarial holdouts** (never a single external judge). Value HIGH / cost MED / risk LOW. **Corroborated by this session's V319b overfit finding** (external sources flag ~19.78% of SWE-bench "solved" as semantically wrong). Reuses `generative-repair-eval` + `odg-broad-it-eval-set`.
2. **RMP-GEN-MODEL-UPGRADE** — A/B trial **Qwen3-Coder-Next / DeepSeek V4.1 Flash** vs `qwen2.5-coder:7b` through the existing V318/V319 harness. Value HIGH (lifts the measured accept-rate ceiling) / cost MED / risk MED (isolate in C6). Reuses the `ollama-provider` seam. Directly targets the model-dependence measured in V318/V319b.
3. **RMP-BTP-TAKEOFF** — scope a plan/photo **takeoff** capability (OCR/vision area detect + symbol auto-count) vs Procore / Autodesk Forma / Togal. Value HIGH (core §7 differentiator) / cost HIGH / risk MED (human-confirm before contractual use). Extends `document-intelligence` + `chantier-profitability`; the largest §7 gap.

## Governance
`PROPOSED ≠ AUTHORIZED ≠ EXECUTED`. Real mission creation is **OWNER_GATED** (K). No second Radar/registry/roadmap;
the existing Radar adapter + V184 loop own the governance. No paid API/license/campaign spend. No secrets.

Evidence: `docs/odg/radar/V319_RADAR_EXTERNAL_CAMPAIGN_EVIDENCE.json` (grant validity, deny-by-default proof, collected
records with provenance, proposals).
