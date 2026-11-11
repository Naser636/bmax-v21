# V134–V140 — Research-Driven Autonomy Enrichment · Reconciliation Proposal

**Status: PROPOSED (not canonical).** This is an *additive* reconciliation. It does **not** overwrite `runtime/governance/ROADMAP.json` (ODG Runtime Roadmap v1.0, 11 missions), create a 10th primitive / 16th métier / parallel ledger / parallel queue / parallel roadmap, or fabricate evidence. Milestones remain proposed until ODG reconciles them through the canonical governance process.

## 0. Research provenance (honest labeling)
Live external egress is **grant-gated and currently absent** (`research-governor.govern` fail-closes without an ALLOW grant; `research-cycle` performs NO egress). Therefore the comparative study below is **INTERNAL_EVIDENCE / engineering common-knowledge** (model knowledge, cutoff Jan 2026) — **NOT** freshly-fetched PRIMARY_SOURCE with verified live URLs/dates. Under the directive's labels it is `HYPOTHESIS`/`UNVERIFIED` pending a real governed research cycle. **NASA-STD-8739.8C** (owner-asserted draft, 5 Nov 2026) is **post-cutoff ⇒ UNVERIFIED by me**; distinguished from the active **8739.8B** — do not treat the draft as approved. Real source-verification requires V138 under a scoped egress grant.

## 1. Comparative engineering study → applicable patterns (INTERNAL_EVIDENCE)
- **NASA/ESA/JPL (mission assurance, onboard autonomy):** fault protection ladder DETECT→DIAGNOSE→ISOLATE→CONTAIN→SAFE-MODE→RECOVER→VERIFY→REPORT; degraded/safe-mode that preserves essential functions awaiting intervention; independent V&V; resource preservation; no silent privilege escalation on fault.
- **Airbus (MBSE, digital continuity):** requirement→architecture→contract→impl→test→release→telemetry→maintenance traceability; one consistent verifiable architecture representation; interface/dependency ownership; test pyramid; "simulated twin ≠ production-connected twin".
- **Tesla (software-defined, fleet learning):** canary + staged cohorts; measurable release health; progressive promotion; automatic stop conditions; **verified rollback** (ODG must keep this — no irreversible update).
- **NIST AI RMF:** GOVERN→MAP→MEASURE→MANAGE per model/provider; drift/incident history; reproducible baseline; no "reliable because one example passed".
- **Reliability (FMEA/FMECA, fault trees):** failure mode/cause/effect/severity/likelihood/detectability/safeguard/residual-risk/recovery; scoring from policy, not invented numbers.
- **Security/supply-chain:** least privilege, SBOM, provenance, dependency integrity, egress control, no secrets in logs.
- **Distributed systems:** idempotency, bounded retries, circuit breakers, queue integrity, dedup.
- **AI/data eng:** eval, injection resistance, provenance/freshness/lineage, contamination controls.

## 2. Gap analysis — pattern → existing canonical mechanism (COVERED vs MISSING)
| Pattern | Canonical mechanism (verified present) | State |
|---|---|---|
| FDIR / fault protection ladder | `fdir-engine`, `self-diagnostic`, `odg-recover.sh` | **VALIDATED + recovery ACTIVE_IN_PRODUCTION** (incidents.jsonl 65) |
| FMEA/FMECA | `safety-fmea` | VALIDATED module — **not yet applied per-métier (gap: application)** |
| Root-cause | `rce-root-cause-intelligence`, `rce-assurance-chain` | VALIDATED |
| Safe-mode / fail-closed | Truth-Lock (`truth-lock-gate`), `emergency-stop`, `local-work-mandate` | VALIDATED |
| Verified rollback / progressive release | `odg-release.sh` (build/verify/activate/rollback), `progressive-delivery-gate` | VALIDATED; rollback **ACTIVE** (previous→22900dd) |
| Canary / staged | `odg-schedule-tick` canary (read-only, allowlist) | VALIDATED; **IDLE (empty allowlist)** |
| Requirement traceability | `capability-attribution`, `capability-map`, register, `ROADMAP.json` | PARTIAL — **no explicit NEED→…→MAINTENANCE chain per capability (gap)** |
| Model governance | `model-router`, `ai-assurance-assessment`, `benchmark-contamination` | VALIDATED (synthetic corpora); **live provider drift NOT_MEASURED** |
| Supply chain / SBOM | `sbom-audit-service`, `p3-dependency-trust-gate`, `p8-slsa-level-gate`, `tool-definition-integrity-gate` | VALIDATED |
| Injection / egress control | `lethal-trifecta-gate`, `research-governor` (fail-closed egress) | VALIDATED |
| Provenance / evidence | `evidence-provenance`, `audit-log` (append-only chain), `actor-provenance` | VALIDATED |
| Memory / continuous learning | `memory-architecture`, `memory-trust-gate`, `learning-chain` | VALIDATED |
| Research pipeline | `research-governor/radar/ledger/budget/safety-benchmark/cycle` | VALIDATED; **fixtures only — live research egress-gated** |
| Economic / cost-per-outcome | `spend-governor`, `budget-ledger`, `p9-unit-economics`, `cost-engine` | VALIDATED; **real spend/revenue NOT_MEASURED (€0)** |

**Conclusion:** the *mechanisms* are overwhelmingly present (no new architecture required). The **genuine gaps are operational/evidence**: (a) apply FMEA + the qualification grid across all 15 métiers; (b) wire release-identity ↔ real operational telemetry; (c) an **end-to-end ODG-led autonomy proof** (not Claude-led); (d) **real** métier operational evidence (today: structural/SIMULATED); (e) **live** research under a grant; (f) explicit requirement-traceability chains; (g) real economic/commercial evidence.

## 3. V134–V140 reconciliation
- **Covered already:** 9 primitives, 15 métiers (structural), 4 programs, FDIR/recovery/rollback (ACTIVE), FMEA/SBOM/model-gov/provenance/memory/progressive-delivery/benchmark **mechanisms**, research stack, Truth-Lock, append-only audit. Full gate 540/540; production supervised (5jBq).
- **Genuinely missing (evidence/operation):** per-métier FMEA + nominal/boundary/failure qualification (V137); release↔telemetry correlation + SLO baseline (V139); end-to-end autonomy proof with intervention ledger (V136); live research cycle (V138, egress grant); fault-injection + verified backup *restore* (V139); independent reproduction/assurance (V140); explicit capability traceability chains (V135).
- **Should ADD = application/wiring of existing mechanisms, NOT new ones:** apply `safety-fmea` per métier; a traceability view over `capability-attribution`+register; wire incidents.jsonl/health into release records; a bounded reversible autonomy-proof mission.
- **Should NOT add (already covered):** any new primitive, métier, research ledger, mission queue, policy engine, recovery engine, roadmap, or digital-twin service — all map to existing mechanisms. A "digital twin" must reuse `capability-map`/telemetry and be labeled simulated-vs-production.

## 4. Dependency order + acceptance criteria (evidence-based, no narrative-pass)
- **V134 (DONE):** baseline truth — PR #490/#491 merged, main==origin/main, production 5jBq supervised, rollback verified, Truth-Lock PASS, gate 540/540. *Accept:* repo evidence reconciled (this file). ✔
- **V135 Governance/Requirements/Risk:** traceability for ≥1 critical capability (NEED→…→MAINTENANCE); grant/permission/owner-gate map; `safety-fmea` applied to ≥1 métier; allowed/denied action tests. *Accept:* traceability artifact + FMEA record + pass/deny tests, independently checkable.
- **V136 First real autonomy loop:** one low-risk reversible internal mission executed via canonical mechanisms with an **intervention ledger** (every human/Claude step recorded). *Accept:* PROVEN only if ODG leads steps 1–13 and the lesson is reused (14); else PARTIAL.
- **V137 15-métier qualification:** nominal+boundary+failure per métier; evidence matrix; ACTIVE_IN_PRODUCTION only with real operational evidence (today none → SIMULATED/VALIDATED).
- **V138 Research radar:** real weekly schedule proven; live read-only research under scoped egress grant; candidate benchmarks; evidence-backed improvement missions (independent validation before integration).
- **V139 Endurance/fault/release:** fault-injection campaigns; verified backup **restore** (not just existence); health-gated progressive promotion; resource/stability measured.
- **V140 Independent assurance:** reproduce critical tests independently; validate autonomy end-to-end; separate technical vs commercial maturity; final evidence-based closure.
- **Review gates (XIII):** Requirements, Architecture, Design/Risk, Test-Readiness, Operational-Readiness, Independent-Acceptance — each records scope/baseline/entry/evidence/risks/decision/authority/exit. No narrative-only pass.

## 5. Smallest safe next implementation lot (V135 seed — internal, reversible, no egress, no new architecture)
1. **Traceability record** for one critical capability (e.g. RECOVERY): NEED→REQUIREMENT→ACCEPTANCE→`build-recovery-engine`/`odg-recover.sh`→CONTRACT→TEST→`incidents.jsonl` evidence→RELEASE→OBSERVATION. Stored as a docs artifact referencing the register (no parallel registry).
2. **Apply `safety-fmea`** to one métier (e.g. P7-SRE): failure mode/effect/severity/detect/safeguard/residual/recovery, scoring from existing risk policy (not invented), as an FMEA record + a regression test asserting the safe-refusal path.
3. **One allowed/denied action test pair** proving POLICY enforcement (reuse `action-gate`).
Each is local, reversible, gate-tested, independently verifiable, and reuses canonical mechanisms. Larger lots (V136 autonomy proof, V138 live research) require the owner's canary/egress grants and are **BLOQUÉ** until granted.

## 6. Blockers requiring owner grants (unchanged from V134)
Live research egress grant (V138); `ODG_CANARY_ALLOWLIST` + mission queue for real autonomous missions (V136); `ODG_PROVIDER_LIVE`+`fleet-bridge.env` (provider); real commercial/economic data (€0 today). No invention of grants, missions, scores, or sources.
