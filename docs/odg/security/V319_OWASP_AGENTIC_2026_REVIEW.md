# V319 §10 — fresh OWASP Agentic 2026 (ASI01–ASI10) security review

**Status: DOCUMENTED crosswalk + gap analysis.** Maps the **OWASP Top 10 for Agentic Applications 2026** (categories
**ASI01–ASI10**, published 2025-12-09 by the OWASP GenAI Security Project — consulted via grant-V141 WebSearch,
search-result metadata, the spec itself not deep-read) onto ODG's **existing** controls (the T1–T17 matrix in
`odg-owasp-agentic-matrix`, which runs 4 EXECUTED threat tests). This is a **reporting view** — it builds no new
security engine and **certifies nothing**; coverage is honestly COVERED / PARTIAL / GAP. Nothing here claims ODG is
"secure"; several items are PROVEN by executed tests, others are PARTIAL or documented-only.

## Baseline (re-run this session, all enforced)
`odg-owasp-agentic-matrix` — 17/17 threats mapped; **4 threat tests EXECUTED & ENFORCED**: T8 audit-tamper
(keyed-HMAC + tip-anchor, clean-verifies + tampered-rejected), T9 identity-replay (Ed25519 nonce, valid-ok +
replay-rejected), T11 RCE (`odg-closed-executor` refuses code-strings + unregistered ops), T17 supply-chain
(SLSA self-claim not trusted). `executedVerified ⊂ covered` — never conflated with full coverage.

## ASI01–ASI10 (2026) → ODG controls
| 2026 category | ODG control(s) | coverage | note |
|---|---|---|---|
| **ASI01 Agent Goal Hijack** | deny-by-default gates (V184 loop), mission contracts, injection-resistance (`governanceGate`: source content is never a governance instruction; `hostileInjection` ignored), negation-inversion safety | **COVERED** | a score/finding is never an authorization; refused≠executed |
| **ASI02 Tool Misuse / Exploitation** | `odg-closed-executor` (registered ops only, no eval/`new Function`), write-set confinement, `delegate-isolation` | **COVERED (PROVEN)** | exercised live in V318/V319 — untrusted model edits can only touch the authorized write-set |
| **ASI03 Identity & Privilege Abuse** | `agent-identity` (Ed25519, nonce replay-protection — T9), `odg-sovereign-delegation` (provider cannot self-authorize/expand-scope/self-accept/self-close) | **COVERED (PROVEN T9)** | provider = TECHNICAL_PROVIDER_ONLY |
| **ASI04 Agentic Supply Chain** | v97 guard (deps byte-identical to baseline + owner-authorized-deltas), `p8-slsa` (T17), multi-ecosystem SBOM | **COVERED (PROVEN T17)** | SLSA self-claim adjudicated to achieved=0 (claim not trusted) |
| **ASI05 Unexpected Code Execution (RCE)** | `odg-closed-executor` (T11), `repair-workflow` (untrusted model code applied ONLY in an isolated workspace, acceptance-gated, **exact rollback**), **C6 bwrap isolation** (`--unshare-all`, egress allowlist) | **COVERED (PROVEN, strongest)** | exactly the containment exercised in V318/V319: generate→isolated-apply→test→rollback; certified C6 8/8 |
| **ASI06 Memory & Context Poisoning** | audit-log keyed-HMAC + tip-anchor (T8), `prolonged-autonomy-integrity`, deny-by-default dedup/provenance in the radar loop | **PARTIAL (T8 PROVEN for audit integrity)** | durable cross-session memory poisoning beyond the audit log not fully tested |
| **ASI07 Insecure Inter-Agent Communication** | `evaluator-independence`, `delegate-isolation`, `odg-provider-governance` (Ed25519-sealed evidence, nonce) | **PARTIAL** | sealed/independent evidence exists; a broad inter-agent channel threat model is not fully built |
| **ASI08 Cascading Failures** | fail-closed everywhere, bounded attempts (no unbounded retry), bounded auto-recovery + health-gated activation (`odg-release.sh`), `SOURCE_UNAVAILABLE` fail-closed radar | **PARTIAL** | per-component fail-closed proven; a system-wide cascade/blast-radius model is documented-only |
| **ASI09 Human-Agent Trust Exploitation** | anti-overclaim (unproven-claim detector, honesty ladder DOCUMENTED≠…≠VERIFIED_IN_PRODUCTION, "cannot verify = FAIL"), OWNER_GATED for every consequential action | **PARTIAL (honest limit)** | maps to the matrix's T15 "Human Manipulation" (honestly OUT_OF_SCOPE as a fully-solved control); mitigated by owner-gating + no fabricated success, not eliminated |
| **ASI10 Rogue Agents** | `odg-sovereign-delegation` (10 states, deny-by-default; no self-authorize/self-accept/self-close), `evaluator-independence`, OWNER_GATED authority, canonical registers ALWAYS_PROTECTED | **COVERED** | a provider deliverable needs a crypto chain AND independent reproduction before acceptance |

## Honest scorecard (this review)
- **COVERED: 5** (ASI01, ASI02, ASI03, ASI04, ASI10) — with ASI02/03/04/05 backed by EXECUTED tests or live V318/V319 exercise.
- **COVERED (strongest, PROVEN): ASI05** — the containment stack (closed-executor + isolated repair-workflow + certified C6) was exercised repeatedly this session.
- **PARTIAL: 4** (ASI06, ASI07, ASI08, ASI09).
- **No category is "certified"** — external audit + operational evidence remain required; this is a controls/coverage view, not a certification.

## Gaps → candidate missions (PROPOSED, not authorized)
1. **ASI07 inter-agent threat model** — build an explicit inter-agent channel test (message tampering / confused-deputy) over the existing delegate/provider seams.
2. **ASI08 cascade/blast-radius drill** — a bounded fault-injection across the mission pipeline measuring containment (reuse `odg-perf-fault-harness`).
3. **ASI06 durable-memory poisoning test** — adversarial cross-session memory tampering beyond the audit log.

## Governance
Reuses `odg-owasp-agentic-matrix` (no second security engine); cites OWASP Agentic 2026 ASI01–ASI10; reporting-only;
no control weakened; nothing certified; external content untrusted. Evidence basis: the 4 executed threat tests above
(re-run green this session) + the live V318/V319 containment exercise.
