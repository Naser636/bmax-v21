# ODG Capability Inventory — evidence-graded (Market Study V1, 2026-10-22)

Graded from REAL repo evidence (code/tests/artifacts), not self-reports. Status ∈ PROVEN | PARTIAL | REPORTED | NOT_MEASURABLE | BLOCKED | NOT_IMPLEMENTED. A repo test ≠ client validation, regulatory conformity, production capability, or general autonomy.

## A. Executable END-TO-END today (own repo, offline, reproducible) — the sellable substrate
| Capability | Status | Evidence | What it produces for a client |
|---|---|---|---|
| **SBOM generation (CycloneDX)** | **PROVEN** | `runtime/core/supply-chain-attest.ts:16 buildSbom` + test; artifact `runtime/generated/supply-chain/sbom.cdx.json` (CycloneDX 1.5, ~489 components); PoC reproduced | A complete, reproducible component inventory from a lockfile — offline, fail-closed |
| **Evidence/provenance stamping** | **PROVEN** | `runtime/core/evidence-provenance.ts` (sha256 + git-rev bind, pure, fail-closed) + test + equivalence bench | Tamper-evident, source-bound attestation on every artifact (adapted SLSA/in-toto/SSDF) |
| **Truth-lock (git-state gate)** | **PROVEN (local)** | `runtime/core/truth-lock.ts` + tests; `truth-lock.json` (HEAD==origin/main) | Deterministic "clean, on-reference, reproducible" gate |
| **JS/TS equivalence benches** | **PROVEN** | ~88 `runtime/__bench__/*-equivalence.e2e.test.ts` (byte-identical parity) | High-assurance refactor/migration parity proof (no behavioural drift) |
| **Own-repo TypeScript migration** | **PROVEN (self) / PARTIAL (general)** | dual `.js`/`.ts` ports; `migrate-ts` 5-gate | TS migration *with parity evidence* — demonstrated on ODG's own code only |
| **Mission ledger (append-only)** | **PROVEN (as a log)** | `runtime/core/mission-ledger.ts` + 5 tests; ~1299 entries | Auditable execution trail. Caveat: "proven mission ids" ≠ distinct capabilities |
| **Local static / clean-workspace / self-diagnostic scans** | **PARTIAL** | `self-diagnostic`, `scope-observer`, `clean-workspace` executor; `npm audit` advisories tracked | Own-repo hygiene/audit scans + evidence |
| **Governed local executors (git ff-only, sandboxed bash)** | **PARTIAL / fail-closed-gated** | `capability-executors.ts` EXECUTORS[]; 4/6 unit-tested; live paths self-gate | Local, bounded, dry-run-default actions with evidence |
| **Readiness matrix (CRA/AI-Act/ISO-42001 style)** | **PARTIAL** | O3 deterministic readiness-matrix tool executed (10/10 tests) | A structured gap/readiness scorecard — **readiness ≠ compliance/certification** |
| **Read-only decision-precedent reuse (G9)** | **PROVEN (mechanism)** | `decision-precedent.{ts,js}` + 23/23 test; live capability executor (this campaign) | Reusable, provenance-bound decision precedents (internal reliability aid) |

## B. Analyze/recommend or GATED only (NOT client-deliverable end-to-end)
| Capability | Status | Evidence | Limit |
|---|---|---|---|
| SLSA build provenance **L2** | **BLOCKED** | `supply-chain-attest.ts:34 buildAttestation` (ed25519, self-signed) | Only L1 + self-signed; no managed/keyless signing ⇒ not L2-attestable for a client |
| Governance kernel "authority" | **PARTIAL (mis-named)** | `governance-kernel.ts:35`; `authorized` is an alias of `transitionPossible`, `authorityEnforced:false` | A lifecycle-transition fact, NOT an enforced authority grant |
| Automated full-suite QA gate | **REPORTED** | validation-engine/local-test-gate; last on-disk `test-report.json` shows a partial/stale run | Full-suite green is an internal claim; **DEF-GAMMA**: a read-only RECORDED no-op can reach `validated=true` (fix BLOCKED) |
| Autonomy measurement (live) | **NOT_MEASURABLE** | `autonomy-rate.json` → `measurable:false, autonomyPercent:null` (live artifact) | Mechanism works on an isolated single unit (G10 campaign) but the LIVE fleet rate has a null denominator — no live % |
| External web research / acquisition (autonomous) | **BLOCKED** | `external-research-acquisition.json` LIVE vs synthetic `https://a.test` (7 bytes); fetcher must be human-injected | ODG's own autonomous egress is gated; real web research in these studies is done by the bounded provider (Claude Code), not ODG autonomously |
| TS migration / delivery on EXTERNAL / large repos | **NOT_IMPLEMENTED (demonstrated)** | self-flagged HIGH gap | Never shown on a client codebase |
| Dashboard/runtime identity + preprod supervision | **REPORTED** | `odg-preprod`/`fleet-bridge` services claimed active, loopback-only | Not independently re-verified here; staging/prod self-marked BLOCKED |
| IDP (Internal Developer Platform) build | **NOT_IMPLEMENTED** | O8 = SPECIFICATION_ONLY | Spec only; no running platform |
| Cloud/GPU FinOps | **NOT_IMPLEMENTED** | no billing/cloud-cost integration in repo | No capability; analyze-only at best |

## C. Delivery-capacity & trust constraints (apply to EVERY opportunity)
- **Zero verified buyers, zero collected revenue** (ODG's own docs); €100k/month target self-marked NOT SUBSTANTIATED.
- **Solo delivery** (no team, references, insurance, certifications, SLA/support org). Large programs would need partnering/subcontracting.
- **Named defects that temper any assurance sale:** DEF-GAMMA false-success; governance `authorityEnforced:false`; 3/6 executor evidence stale; SLSA L2 blocked; external-research against `a.test`.
- **G8 (reboot/recovery)** BLOCKED_BY_DEPENDENCY, **G10 (live fleet autonomy)** NOT_MEASURABLE — so "autonomous delivery at scale" cannot be claimed to a buyer.

## What this means commercially (one line)
ODG can genuinely deliver **deterministic, reproducible software-EVIDENCE artifacts** (SBOM, provenance, parity, readiness scorecards, own-repo audit) as **human-reviewed diagnostics/pilots** — not certification, not at-scale autonomous delivery, not platforms. The sellable edge is *evidence quality + reproducibility*, scoped small and fixed-fee.
