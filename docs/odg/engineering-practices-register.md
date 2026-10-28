# ODG — Engineering Best-Practices Research Register (Phase 1)

> Consulted 2026-10-28 via live web search. External references, not ODG claims. Generated from `runtime/core/engineering-practices-register.ts` (single source of truth). Quality-gated: weak/incomplete sources are rejected by `validateEntry`.

**19 sources across 9 families** · decisions: {"adapt":8,"adopt":10,"test":1} · reliability: {"HIGH":14,"MEDIUM":5}

## benchmarks

### SWE-bench / SWE-bench Verified: resolving real GitHub issues  
- **Source:** Princeton NLP; OpenAI Preparedness (Verified subset) — <https://arxiv.org/abs/2310.06770> (peer-reviewed benchmark + human-validated subset (500 tasks), reliability HIGH)  
- **Practice:** evaluate coding agents on real, executable repository tasks with hidden tests; Verified removes ambiguous/unsolvable instances  
- **Limits:** Python-repo heavy; Verified is 500 tasks; leaderboard contamination risk over time  
- **Maps to:** P2:engine-capability-measurement  
- **ODG decision:** `adapt` — ODG runs its OWN held-out, leakage-guarded corpus (broad-it-eval) with real executable checks rather than claiming a SWE-bench score it has not run  
- **Reflected in:** `runtime/core/broad-it-eval.ts`

### SWE-Bench Pro Verified: harder long-horizon tasks  
- **Source:** arXiv 2609.08149 — <https://arxiv.org/abs/2609.08149> (benchmark paper, reliability MEDIUM)  
- **Practice:** harder, verified long-horizon SE tasks; shows prior Pro results can OVERESTIMATE real capability  
- **Limits:** recent; methodology still settling  
- **Maps to:** P2:anti-overclaim-capability  
- **ODG decision:** `adopt` — reinforces ODG's refusal to extrapolate a broad rate; capability-taxonomy keeps measuredSuccessRate=null until a representative held-out run exists  
- **Reflected in:** `runtime/core/capability-taxonomy.ts`

## evaluation-integrity

### Train/test (dev/held-out) separation + leakage control  
- **Source:** general ML evaluation methodology — <https://arxiv.org/pdf/2310.06770> (established methodology, reliability HIGH)  
- **Practice:** keep a held-out set disjoint from any tuning data; detect contamination; report accuracy only on unseen data  
- **Limits:** requires discipline to keep partitions disjoint by content, not just id  
- **Maps to:** P2:no-false-success  
- **ODG decision:** `adopt` — broad-it-eval enforces DEV/HELDOUT disjoint by id AND content sha256 (checkLeakage), per-category metrics, NO_DATA until representative  
- **Reflected in:** `runtime/core/broad-it-eval.ts`

### Independent verification as a trust boundary (don't trust self-report)  
- **Source:** ODG5 design principle (adapted from adversarial-eval literature) — <https://arxiv.org/abs/2310.06770> (design principle, reliability MEDIUM)  
- **Practice:** a verdict must be gated by an independent check, not the producer's own claim; false-success excluded from the numerator  
- **Limits:** the gate itself must be adversarially tested  
- **Maps to:** P2:verification-independent  
- **ODG decision:** `adopt` — reality-gate + validation-engine codingFidelityGate hard-gate 'validated'; mission-scoped to prevent cross-mission false-BLOCK  
- **Reflected in:** `runtime/core/reality-gate.ts`

## planning-recovery

### DORA delivery metrics (throughput + stability)  
- **Source:** Google Cloud / DORA, State of DevOps — <https://dora.dev/> (large multi-year industry research (39,000+ respondents in 2024), reliability HIGH)  
- **Practice:** measure deployment frequency, lead time, change fail rate, failed-deployment recovery time (+rework); throughput vs stability tension  
- **Limits:** org-level delivery metrics; not a per-task agent quality measure; survey self-report  
- **Maps to:** P2:observability-reporting, P2:efficiency-metrics  
- **ODG decision:** `adapt` — ODG tracks per-mission efficiency/recovery (attempt-log, latency-measure, recovery) rather than org-wide DORA; DORA informs WHICH signals to expose  
- **Reflected in:** `runtime/core/campaign-controller.ts`

### Topological dependency planning / layering  
- **Source:** classical scheduling (Kahn topological sort) — <https://en.wikipedia.org/wiki/Topological_sorting> (foundational algorithm, reliability HIGH)  
- **Practice:** order work by dependency layers; detect cycles fail-closed; parallelise within a layer safely  
- **Limits:** needs accurate dependency edges  
- **Maps to:** P1:roadmap-order, P2:dependency-resolution  
- **ODG decision:** `adopt` — dep-planner.planLayers with 3 real consumers (roadmap-dep-check, campaign-controller, roadmap-schema-proposal); cycle ⇒ fail-closed  
- **Reflected in:** `runtime/core/dep-planner.ts`

### Isolated change + acceptance-gated rollback  
- **Source:** Google SRE (canary + rollback) / transactional-change practice — <https://sre.google/sre-book/table-of-contents/> (engineering practice, reliability MEDIUM)  
- **Practice:** apply fixes in an isolated workspace, accept only if checks pass, otherwise exact rollback; never partial-apply  
- **Limits:** isolation has setup cost; must verify rollback is complete  
- **Maps to:** P2:recovery-after-failure  
- **ODG decision:** `adopt` — repair-workflow.runRepairWorkflow (isolated workspace, acceptance-gated, exact rollback) + checkpoint/resume  
- **Reflected in:** `runtime/core/repair-workflow.ts`

## code-agents-tooling

### Agent-Computer Interface (bounded, well-shaped tools)  
- **Source:** Princeton (SWE-agent, NeurIPS 2024) — <https://proceedings.neurips.cc/paper_files/paper/2024/file/5a7c947568c1b1328ccc5230172e1e7c-Paper-Conference.pdf> (peer-reviewed, reliability HIGH)  
- **Practice:** carefully designed, bounded tool interfaces materially improve agent reliability over raw shell access  
- **Limits:** interface design is task-specific  
- **Maps to:** P2:tool-orchestration  
- **ODG decision:** `adopt` — code-execution uses argv-array bounded subprocesses (no shell string), isolated temp workspace, output caps, minimal env  
- **Reflected in:** `runtime/core/code-execution.ts`

### Execute real toolchains; never fake a pass  
- **Source:** reproducible-eval practice — <https://arxiv.org/abs/2310.06770> (methodology, reliability HIGH)  
- **Practice:** run the actual compiler/checker; classify UNSUPPORTED honestly when a toolchain is absent instead of guessing  
- **Limits:** needs toolchains installed; absent stacks must be UNSUPPORTED not PASS  
- **Maps to:** P2:no-false-success, P2:multi-language  
- **ODG decision:** `adopt` — code-execution runs node --check / tsc / py_compile / bash -n / sqlite3 / PyYAML; UNSUPPORTED (never faked) when a probe fails  
- **Reflected in:** `runtime/core/code-execution.ts`

## security-appsec-agent-supplychain

### NIST SSDF SP 800-218 (secure SDLC practices)  
- **Source:** NIST — <https://csrc.nist.gov/projects/ssdf> (official US standard (final Feb 2022), reliability HIGH)  
- **Practice:** Prepare/Protect/Produce/Respond practice groups for secure software development  
- **Limits:** framework, not a checklist of controls; needs mapping to concrete controls  
- **Maps to:** P2:security-supplychain  
- **ODG decision:** `adapt` — ODG maps SSDF 'Produce/Respond' to supply-chain-attest (SBOM) + evidence-provenance + governed-apply; gap register tracks unmapped practices  
- **Reflected in:** `runtime/core/supply-chain-attest.ts`

### NIST AI RMF 100-1 (Govern/Map/Measure/Manage) + GenAI Profile 600-1  
- **Source:** NIST — <https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-1.pdf> (official US framework (Jan 2023; 600-1 Jul 2024), reliability HIGH)  
- **Practice:** lifecycle AI risk management across four functions; GenAI profile names 12 risks + 211 actions  
- **Limits:** voluntary; non-sector-specific; requires tailoring  
- **Maps to:** P2:agent-governance, P1:policy  
- **ODG decision:** `adapt` — ODG governance (POLICY primitive, agent-governance-harness, third-party-agent-gate) implements Govern/Measure fail-closed; regulatory-assurance refuses to assert certification  
- **Reflected in:** `runtime/core/third-party-agent-gate.ts`

### OWASP Top 10 for LLM Applications (2025)  
- **Source:** OWASP GenAI Security Project — <https://genai.owasp.org/llm-top-10/> (community standard, reliability HIGH)  
- **Practice:** prompt injection, insecure output handling, excessive agency, supply chain, unbounded consumption, sensitive-info disclosure  
- **Limits:** list, not a verification standard; needs concrete controls  
- **Maps to:** P2:agent-security  
- **ODG decision:** `adopt` — third-party-agent-gate evaluateAgentAction ADMIT|DENY|ESCALATE fail-closed (OWASP Agentic Top 10); excessive-agency countered by deny-by-default authorization  
- **Reflected in:** `runtime/core/third-party-agent-gate.ts`

### SLSA — Supply-chain Levels for Software Artifacts  
- **Source:** OpenSSF — <https://slsa.dev/spec/v1.0/> (industry-consensus standard (v1.0 Apr 2023), reliability HIGH)  
- **Practice:** build provenance (L1), signed provenance (L2), hardened/isolated builders (L3)  
- **Limits:** focuses on build integrity, not whole lifecycle; higher levels need infra  
- **Maps to:** P2:supplychain-provenance  
- **ODG decision:** `adapt` — evidence-provenance stamps sourceCommit + sha256; supply-chain-attest emits multi-ecosystem SBOM; L2+ signing deferred (needs key infra)  
- **Reflected in:** `runtime/core/evidence-provenance.ts`

### OWASP Application Security Verification Standard (ASVS)  
- **Source:** OWASP — <https://owasp.org/www-project-application-security-verification-standard/> (verification standard, reliability HIGH)  
- **Practice:** leveled verification requirements for authentication, access control, logging, etc.  
- **Limits:** broad; a web-app service must select the relevant level  
- **Maps to:** P1:dashboard-security  
- **ODG decision:** `adapt` — dashboard-auth fail-closed (503 when unconfigured, constant-time token); dashboard-exposure-readiness gate requires auth+TLS+access-control before exposure  
- **Reflected in:** `runtime/core/dashboard-exposure-readiness.ts`

## observability-reliability

### OpenTelemetry (traces/metrics/logs standard)  
- **Source:** CNCF / OpenTelemetry — <https://opentelemetry.io/docs/> (CNCF standard + SDKs, reliability HIGH)  
- **Practice:** vendor-neutral signals (traces, metrics, logs) with semantic conventions for consistent observability  
- **Limits:** instrumentation + a backend/collector are operational prerequisites  
- **Maps to:** P2:observability  
- **ODG decision:** `test` — ODG currently uses structured audit-log + evidence stamps; OTel semantic conventions are a candidate for future runtime telemetry (not yet wired; recorded as a gap)  
- **Reflected in:** `runtime/core/audit-log.ts`

## learning-memory

### Durable memory + evidence reuse (don't redo validated work)  
- **Source:** Google SRE (postmortems/learning) / memoization practice — <https://sre.google/sre-book/table-of-contents/> (engineering practice, reliability MEDIUM)  
- **Practice:** persist outcomes with provenance; reuse a prior valid result unless its evidence is stale or a dependency changed  
- **Limits:** must version evidence + check freshness to avoid stale reuse  
- **Maps to:** P2:learning-reuse, P2:no-repetition  
- **ODG decision:** `adopt` — closure-register + campaign-controller persist/resume; ACCEPTED requires evidence; control-evidence-freshness + reuse-ledger guard staleness  
- **Reflected in:** `runtime/core/campaign-controller.ts`

## multi-language-build

### Extensible per-language checker adapters  
- **Source:** Language Server Protocol (pluggable language tooling) — <https://microsoft.github.io/language-server-protocol/> (engineering practice, reliability MEDIUM)  
- **Practice:** model each language/build/test/DB as a pluggable adapter with its own probe + checker; separate detect/compile/execute/validate  
- **Limits:** each stack needs a real toolchain + independent eval  
- **Maps to:** P2:multi-language  
- **ODG decision:** `adopt` — code-execution LANG_SPEC = pluggable adapters (JS/TS/Python/Shell/SQL/YAML/JSON); compiler stacks UNSUPPORTED until authorized install; no new primitive  
- **Reflected in:** `runtime/core/code-execution.ts`

## productization-seo

### Google Search Central SEO Starter Guide  
- **Source:** Google for Developers — <https://developers.google.com/search/docs/fundamentals/seo-starter-guide> (official search-engine guidance, reliability HIGH)  
- **Practice:** help search engines find/understand content; useful content, good titles/meta, internal links, accessibility, performance  
- **Limits:** no guaranteed ranking; guidance evolves  
- **Maps to:** P2:seo-visibility  
- **ODG decision:** `adapt` — seo-strategy register encodes intent/keyword + site architecture + anti-overclaim (no guaranteed ranking, no fabricated testimonials)  
- **Reflected in:** `runtime/core/excellence-policy.ts`

### Google structured data (schema.org) guidelines  
- **Source:** Google for Developers — <https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data> (official guidance, reliability HIGH)  
- **Practice:** mark up content with schema.org types ONLY where it reflects real page content + follows Google's general + type-specific guidelines  
- **Limits:** misuse ⇒ ineligibility/penalty; only where appropriate  
- **Maps to:** P2:seo-structured-data  
- **ODG decision:** `adapt` — seo-strategy applies structured data only where conforming (gated), never to misrepresent; no fabricated review/rating markup  
- **Reflected in:** `runtime/core/excellence-policy.ts`

