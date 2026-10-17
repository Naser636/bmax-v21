# ODG — CAPABILITY ENGINEERING & PRIVATE-SECTOR OPPORTUNITY GATE (evidence-gated)

> CTO directive @ checkpoint `93274b7`. **Honest-scope deliverable:** GATE A/B/C executed with real
> evidence; **GATE D (10 private-sector €500k opportunity dossiers) NOT fabricated** — the directive's own
> §7/§16 forbid inventing sources, market sizes, financials or amounts, and these cannot be produced as
> VERIFIED without live, citable market research + real business/legal context. Additive, docs-only; no
> runtime/contract/ROADMAP.json/stash change; 9 primitives intact; §12/Ph.11/Option-C/`.js`-rollback preserved.

## GATE A — Truth Lock certificate
- Repo `/home/ubuntu/bmax-v21`: HEAD == origin/main == **`93274b7`**, branch `main`, divergence 0/0, worktree clean (0 tracked changes), **5 stashes preserved**, 29 tags.
- Services: `odg-preprod.service` ACTIVE, `fleet-bridge.service` ACTIVE; next-server `127.0.0.1:3000` (loopback); `/api/health` HTTP 200 (prior turn).
- 9 primitives intact; no second orchestrator/registry; migration converged (planner SKIPPED); W6 GO; §M-3 #6 accepted; #8 at step-2/Option-C with #2/#7 unproven (JS rollback live).
- Reused evidence (not re-run blindly): `npm test` EXIT 0 @ this HEAD; E2E `RUNTIME_SELF_AUDIT` 13/13 + ledger/cockpit coherent; failure parcours fail-closed.

## GATE B — technical consolidation + security
- **Tests:** full suite `npm test` EXIT 0 (valid at `93274b7`; no source change since — docs-only commits). PASS.
- **Dependency audit (`npm audit --omit=dev`, read-only):** **6 advisories (1 critical, 4 high, 1 moderate)** — `sharp` (image-codec CVEs; fix forces BREAKING `next@16.4.2`) + `source-map-js` (build-time DoS). Both OFF the loopback surface (image optimizer / build-time; not on `/api/health`/`/api/intake`). No forced upgrade (regression + rollback risk). **RESERVED** as a tested rollback-guarded upgrade mission (D6). *Note: "off-surface" is a reachability argument, not "no risk" — the advisories remain OPEN until remediated.* Detail: `ODG_SSDF_TRACEABILITY.md`.
- **systemd hardening (`odg-preprod.service`) — PROPOSED, not applied** (no test/rollback window on an active unit this pass): minimal candidate directives, each to be verified against the real access set (`node server.js` in `.next/standalone`; writes only `ODG_CLIENT_STORE=/var/lib/odg/clients`): `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=read-only`, `ReadWritePaths=/var/lib/odg/clients`, `PrivateTmp=yes`, `ProtectKernelTunables=yes`, `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`. **Verification protocol before applying:** copy unit → add directives → `systemd-analyze security` improves → `systemctl daemon-reload` + restart in a rollback window → `/api/health` 200 + E2E mission SUCCESS → else revert. Reserved (active-unit change).
- **Backup/rollback:** §M-6 local vault present + restore proven (`client-store-backup.js`, CHG-OD-12); store empty (no data at risk). JS rollback `ODG_RUNTIME=js` proven. Off-host drill HOST-BLOCKED. Not re-run (proven, unchanged).

## GATE C — capability catalog (C01–C10 → EXISTING components; honest status)
Status vocab: `IMPLEMENTED_AND_VERIFIED` · `PARTIAL` · `SPECIFICATION_ONLY` · `BLOCKED` · `REJECTED`. No family is a shipped enterprise product; each maps to ODG governed-runtime primitives at the stated level. Full productization is gated by the semantic-execution + provider-activation gates (BLOCKED where live external execution is required).

| Cap | Existing ODG components (reused) | Status | Key gap / blocker |
|---|---|---|---|
| **C01** safe agent orchestration | `persistent-autonomy-controller` (bounded retry/exhaustion), `mission-cli`/`runtime-executor`, `action-gate`, `checkpoint-engine`, fleet-* | **PARTIAL** | governed single-flow orchestration exists; multi-agent/tool concurrency + per-action budget as a product = SPEC |
| **C02** context & evidence | `knowledge-engine`, `project-context-engine`, `mission-context-builder`, `evidence-provenance` (provenance/sha256) | **PARTIAL** | provenance + context exist; general retrieval index + staleness/contradiction detection = SPEC |
| **C03** universal integration connector | `capability-router`, provider adapters (`fleet-bridge`, OpenAI/Claude), `email-gateway` (injected) | **SPECIFICATION_ONLY** | per-adapter exists; a uniform governed connector contract is unbuilt; live connectors **BLOCKED** (no creds) |
| **C04** quality & release gate | `validation-engine`, `local-test-gate`, `migrate-ts` 5-gate, equivalence benches, release-gate | **PARTIAL→strong** | risk-based selection + flaky-detection as a product = SPEC; the gate mechanics are IMPLEMENTED+VERIFIED |
| **C05** AI security & permission guard | `action-gate` (deny-by-default), `capability-authorization` (fail-closed), `dispatch-authorization-invariant` (OWASP ASVS), `provider-sandbox`, `bash-command-governor` | **PARTIAL→strong** | prompt-injection/output-validation layer for LLM I/O = SPEC; the authz/sandbox invariants are TESTED |
| **C06** legacy modernization | `migrate-ts` + equivalence benches + `runtime-paths` + `build-dist-closure` | **PARTIAL** | proven for ODG's OWN JS→TS migration (88 dual ports); as a general client product = SPEC |
| **C07** self-service golden path | `mission-contract-factory`, `odg-bootstrap` | **SPECIFICATION_ONLY** | templated project scaffolding exists in spirit; versioned golden-path product unbuilt |
| **C08** observability & incident | `self-diagnostic`, `incident-recurrence`, `odg cockpit`/`health`/`status`, `autonomy-measure`/`autonomy-rate` | **PARTIAL** | OpenTelemetry correlation + anomaly grouping = SPEC; evidence-linked diagnosis is IMPLEMENTED |
| **C09** cloud/AI FinOps | `live-cost-metering`, `economic-unit`/`economic-verification`, `budget-contract` (frozen `budget-ledger` §12) | **PARTIAL** | cost attribution/metering exist (simulation); live cloud-cost ingestion = SPEC + needs external access |
| **C10** business workflow automation | `capability-executors`, `bounded-remediation` (propose-only), `action-gate` | **PARTIAL** | governed step execution exists; a business-workflow engine with external connectors = SPEC + authz-gated |

**Automation %:** NOT claimed as a single global figure (directive §6). Per family, the *governed-runtime substrate* is reusable; the *enterprise-product surface* is largely SPECIFICATION_ONLY and, where live external execution is required (C03/C09/C10), **BLOCKED** on provider/credential access. No new primitive introduced.

## GATE D — private-sector opportunity research: NOT RUN (honest disposition)
**Not executed / not fabricated.** The directive requires 10 opportunities each ≥ €500k gross with *verifiable* sources (URLs, dates), market-size method, competitor pricing, 3-scenario financial models, and reproducible PoCs — AND explicitly forbids inventing sources, amounts, or results, or inflating to reach ten (§7, §8, §16). I cannot produce these as VERIFIED without: (a) live, citable market research with real retrievable sources; (b) real ODG business/legal identity + target-sector context (see `HUMAN_INPUTS_REQUIRED.md` C1–C10); (c) a dedicated research mission (multi-source fan-out + adversarial source verification) rather than a finalization pass. Producing them from model priors would be **fabrication** — refused.
**Prepared (non-fabricated):** `RESEARCH_METHODOLOGY` = primary-source-first (official regulatory calendars, standards/certification bodies, maintainer advisories/CVE DBs, published private procurement/partner calls, vendor pricing pages, sector studies), **exclude all public-sector/government tenders** (directive), each candidate scored on demand-evidence/contract-size/ODG-fit/automation/gaps/risk/confidence with the §8 contract-vs-revenue-vs-margin-vs-net separation and 3 scenarios. The 10 candidate AXES (directive §7) map onto the C01–C10 substrate above. **Next action for GATE D:** authorize a dedicated opportunity-research mission with web access + the business-context inputs; this gate stays **NOT RUN** until then — no dossier fabricated.

## Learning chain
Reused (DISCOVERABLE→REUSED): the `npm audit`/SSDF evidence + the capability-coverage register + the deployment facts were reused to build this catalog (not re-derived). No EFFECTIVE claim (no measured before/after this pass). No redundant memory written.

## Final per-axis verdict
GATE A Truth Lock = **VERIFIED**. GATE B tests = **VERIFIED (reused)**; npm audit = **VERIFIED (6 open, remediation RESERVED)**; systemd hardening = **PARTIAL (proposed, not applied)**. GATE C catalog = **PARTIAL** (substrate real; products SPEC/BLOCKED). GATE D opportunities = **NOT RUN** (fabrication-forbidden; dedicated mission + web + business context required). Deployment = **LOCAL_DEPLOYMENT_VERIFIED**; staging/production = **BLOCKED (external)**.
