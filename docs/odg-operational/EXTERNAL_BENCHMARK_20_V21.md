# ODG — External benchmark of 20 world-class references (V21 Phase 2)

**All 20 references verified live on 2026-10-27** against official-domain pages/docs. This benchmark exists to
import *proven ideas and open standards*, not dependencies: for each reference we record the problem, demonstrated
capabilities + limits, the **reusable mechanism** (open standard / published pattern — never proprietary code), free
vs paid vs integration, adoption cost + lock-in, and one **concrete, testable, proportionate** adaptation for ODG's
internal TypeScript system. **Integration discipline:** we do NOT adopt 20 dependencies by principle — we adopt the
*pattern* and prefer a simple internal implementation. Every external money / CRM / send / traffic-routing action
stays **human-authorized**; every adaptation is **fail-closed** and preserves ODG's existing honesty distinctions
(DOCUMENTED≠EXECUTED; prepared≠sent≠signed≠cashed; mechanism≠satisfied; no self-certification).

> Vendor-stated automation percentages (Vanta ~90%, Drata ~85%), n8n node counts, the Oct-2026 Cloudflare Brotli CVE
> id, Chainguard per-artifact SLSA level, and specific SDK version strings are **vendor/blog claims, independently
> unverified** — flagged inline. Securiti was acquired by Veeam (Dec 2025); its long-term roadmap is uncertain.

---

## A. Agents, orchestration, durable execution

| # | Reference | Reusable mechanism (open) | Lock-in | Proportionate ODG adaptation |
|---|---|---|---|---|
| 1 | **OpenAI** Agents SDK / Responses API | pluggable **trace-processor** pattern + span taxonomy (agent/tool/guardrail/handoff) → maps to OTel | med-high (if Responses API + hosted traces) | `Span{kind,input?,output?,redactSensitive}` emitter w/ swappable processor array; test redaction + null-vs-file exporter |
| 2 | **Anthropic** effective-agents / context engineering | workflow-pattern vocabulary + **artifact-handoff / session-continuation** (smallest-useful-context) | low (model-agnostic) | formalize `SessionArtifact` writer + resume loader; test a killed run resumes without redoing completed steps (ODG already has checkpoint/resume) |
| 3 | **LangChain / LangSmith** | **OpenTelemetry/OTLP as trace wire format** (backend-neutral) | low–med | emit agent/mission spans in OTLP JSON (thin serializer, no SDK); test round-trip through a standard OTel collector |
| 4 | **Temporal** durable execution | **event-sourcing + deterministic replay** + **declarative retry policy** | low (pattern); med (SDK/server) | append-only JSON event log per mission + pure replay reducer + `RetryPolicy{maxAttempts,backoffMs}`; test kill→replay→identical state, no double-exec |
| 5 | **n8n** workflow automation | typed **node/connector + trigger/webhook DAG** (`onError: retry\|halt`) | med (n8n-JSON + fair-code license) | model pipelines as a typed node DAG serialized to JSON; test a 3-node chain where a failing middle node routes to its error branch |

**Highest-leverage here:** #3 **OTLP spans** — emit once, point at any backend (zero lock-in tracing). #4 **event-sourced
missions** fits ODG's existing mission-ledger/checkpoint model directly.

## B. Software & supply-chain security

| # | Reference | Reusable mechanism (open) | Lock-in | Proportionate ODG adaptation |
|---|---|---|---|---|
| 6 | **GitHub** code/secret scanning | **SARIF 2.1.0** (OASIS) scanner-output interchange (caps: 10 MB/file, 25k results/run) | low (open std); CodeQL engine med | make ODG scanners **emit SARIF 2.1.0** (run/tool/result/location) respecting caps; test the JSON validates + renders in GitHub code-scanning |
| 7 | **Snyk** SCA / SBOM | **CycloneDX / SPDX** SBOM + **"SBOM-test" decoupling** (match against free **OSV.dev**) | med-high (if Snyk DB/fix engine) | emit **CycloneDX 1.6 JSON** for ODG's dep tree, match components vs the free OSV API (purl-keyed); test a known-vuln fixture yields the expected advisory (extends ODG multi-ecosystem SBOM) |
| 8 | **Chainguard** supply-chain | **SLSA provenance + in-toto attestation (+ optional Sigstore/Cosign)** | low (standards); med (catalog) | generate **in-toto/SLSA provenance JSON** per build artifact (builder id, materials, sha256) beside the SBOM; test tamper ⇒ provenance verify fails (builds on ODG evidence-provenance) |
| 9 | **Cloudflare** app/infra security | **OWASP-pattern managed rulesets** + **identity-aware-proxy / outbound-only-tunnel** | low (patterns); high (if traffic/DNS routed) | OWASP-pattern **request-validation middleware** (deny-by-default allowlist + injection/traversal checks) with `Log`-only shadow mode → enforce; test known payloads flagged then blocked |
| 10 | **1Password** secrets | **secret-reference + JIT in-memory injection** (`op://…`) + scoped non-human identity | med-high (resolver vendor-specific) | vendor-neutral `secret://scope/name` scheme resolved at startup by a pluggable provider; assert secrets never hit logs/disk; test in-memory resolve + redacted logging |

**Highest-leverage here:** #6 **SARIF 2.1.0** (emit it and every consumer reads ODG results — lowest lock-in, directly
sells software-assurance output) and #7 **CycloneDX + OSV** (self-contained SBOM vuln scanner, no vendor).

## C. Compliance, trust, governance

| # | Reference | Reusable mechanism (open) | Lock-in | Proportionate ODG adaptation |
|---|---|---|---|---|
| 11 | **Vanta** | control → mapped-evidence → **continuous-test w/ freshness timestamp** → status | HIGH (evidence captive) | `control-evidence-freshness.ts`: per clause-matrix control, record last-check timestamp, emit `STALE` past a policy TTL; fail-closed |
| 12 | **Drata** | **MTTR-per-failed-control** metric + named **test-library** bound to controls | HIGH | `mttr.ts` over existing incident `OPENED`/`RESOLVED` timestamps, per-control; pure function over the ledger |
| 13 | **Securiti** (now Veeam) | **DPIA + data-lineage mapping** (which data → which AI system) → ISO 42001 Annex A / NIST **Map** | HIGH | `data-lineage-register.ts`: per mission, record input data sources + required DPIA fields; fail-closed refuse "governed" if lineage/impact absent |
| 14 | **NIST** AI RMF | **Govern / Map / Measure / Manage** function taxonomy (free, public-domain, citable) | LOW | tag each governance control `nistAiRmfFunction` enum + coverage report highlighting the weakest function (industry-wide that's **Measure** — ODG's strength) |
| 15 | **ISO** 27001 / 42001 | **Annex A control-structure** + **Statement-of-Applicability** (IDs referenceable; text copyrighted) | LOW (portable structure) | `statement-of-applicability.ts`: per control `{status: IMPLEMENTED\|PLANNED\|NA, justification, evidenceRef}`, fail-closed on missing justification; keep "0 SATISFIED" honesty |

**Highest-leverage here:** #14 **NIST AI RMF taxonomy** (free vocabulary to classify every control; near-zero cost,
low lock-in) and #15 **SoA pattern** (extends ODG's existing clause matrix).

## D. Reliability, measurement, continuous improvement

| # | Reference | Reusable mechanism (open) | Lock-in | Proportionate ODG adaptation |
|---|---|---|---|---|
| 16 | **Arize / Phoenix** | **OpenInference semantic conventions on OpenTelemetry** (open GenAI span vocab) | LOW (Phoenix is ELv2 source-available) | emit mission/LLM-call traces as JSON spans using OpenInference attribute names (`llm.model_name`, `input.value`…) into the evidence ledger; later exportable to any OTel tool |
| 17 | **AWS Well-Architected** | **six pillars as a review checklist** (Ops/Security/Reliability/Perf/Cost/Sustainability) | LOW (just a checklist) | `well-architected-review.ts`: 6 pillar enums + a small question set each → per-mission scorecard (score + gaps); pure data + scoring |
| 18 | **PostHog** | **event-based funnel analytics** (`{event,timestamp,distinct_id,properties}` → ordered-step conversion) | LOW–MED (schema portable) | `funnel.ts` over ODG's own commercial-pipeline events (prepared→sent→signed→cashed) → per-stage conversion/drop-off; no external service, no send |

**Highest-leverage here:** #18 **internal funnel** directly measures the commercial pipeline ODG already models, and
#16 **OpenInference/OTel** reinforces the same open-tracing choice as A#3.

## E. Commercialization & customer

| # | Reference | Reusable mechanism (open) | Lock-in | Proportionate ODG adaptation |
|---|---|---|---|---|
| 19 | **Stripe** payments/billing | **idempotency-key** (safe retries) + **webhook-reconciliation/dedupe** (process event id once) + Smart-Retries dunning concept | MED (patterns portable) | `idempotency-ledger.ts` + `webhook-dedupe.ts` applied to ODG's **own** state-changing actions (exactly-once); real charges/sends stay behind the human-authorization gate |
| 20 | **HubSpot** CRM/pipeline | **pipeline-stage model** w/ per-stage win-probability → `expected = Σ(amount × P(stage))`; lifecycle-stage progression | MED-HIGH (data captive) | `pipeline-weighted-forecast.ts`: per-stage probability + weighted expected revenue, **fail-closed never double-counting** prepared≠sent≠signed≠cashed; no outbound CRM write |

**Highest-leverage here:** #19 **idempotency + webhook-dedupe** gives ODG exactly-once internal actions (reliability,
reusable everywhere) and #20 **weighted forecast** sharpens the revenue model honestly (no double-counting).

---

## Cross-cutting synthesis — adopt-now vs benchmark-only

**Adopt directly (open, free, low lock-in — highest reuse value):**
1. **SARIF 2.1.0** (6) — assurance-output interchange; the clearest commercial lever (ODG results consumable anywhere).
2. **CycloneDX/SPDX + OSV** (7) — self-contained SBOM vuln scan, no vendor DB.
3. **OpenTelemetry/OTLP + OpenInference** (3, 16) — backend-neutral mission/LLM tracing (single tracing choice).
4. **Event-sourcing + deterministic replay + declarative retry** (4) — durable missions on an append-only log.
5. **SLSA provenance + in-toto (+ optional Sigstore)** (8) — signed build recipe beside the SBOM.
6. **NIST AI RMF taxonomy** (14) + **ISO SoA pattern** (15) — free governance classification + applicability discipline.
7. **Idempotency-key + webhook-dedupe** (19), **weighted pipeline forecast** (20), **internal event funnel** (18) —
   reliability + honest commercial measurement, no external side effects.
8. **Well-Architected pillar checklist** (17), **OWASP validation middleware** (9), **secret-reference JIT** (10),
   **artifact-handoff** (2), **trace-processor redaction** (1) — in-process disciplines, zero lock-in.

**Benchmark the mechanism, do NOT integrate (proprietary SaaS, high lock-in):** Vanta (11), Drata (12), Securiti (13),
HubSpot cloud (20), Arize hosted (16), Cloudflare routed traffic (9), 1Password resolver (10), n8n engine (5). Borrow
the *data model / metric* (control-evidence freshness, MTTR, data-lineage/DPIA, weighted forecast, OWASP rules), not
the product.

## What this prioritizes for ODG (next lots, each its own bounded + gated unit)
In rough value order for the software-assurance product + €500k NET engine, **none requiring a new heavy dependency**:
- **SARIF 2.1.0 emitter** for the assurance pilot output (sells the result; interoperable) — strongest single lever.
- **CycloneDX + OSV scanner** reusing the existing SBOM attest (adds a verifiable vuln verdict to the dossier).
- **in-toto/SLSA provenance** per dossier (extends evidence-provenance; strengthens the assurance claim).
- **weighted-pipeline forecast + internal funnel** over the commercial-pipeline (honest revenue measurement, Phase 10).
- **NIST-RMF control tagging + ISO SoA** (sharpens the certification-readiness work, Phase 11).
- **OTLP/OpenInference span emitter** (observability + autonomy measurement, Phase 5).
- **idempotency-ledger + event-sourced mission log** (reliability substrate, Phase 8 — complements the reuse-ledger).

Each is proportionate, testable, fail-closed, and composes from the existing architecture. Sources are recorded per
reference in the research notes; all 20 official pages were verified on **2026-10-27**.
