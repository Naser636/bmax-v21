# Boussole V14.4 — versioned roadmap (ADOPTED by owner V372, 2026-11-22)

> **Status: ADOPTED** as the strategic roadmap by the owner (CTO V372 §2, 2026-11-22), after correction and reconciliation.
> Adoption is **additive**. Boussole V12.4 is fully preserved: its requirements, its identifiers (sections A–S, 24 missions in `docs/odg/v124-consolidated-roadmap.json`), its 9 primitives, its history and its decisions.
> V14.4 organises the execution; it does not rewrite V12.4.
> History: this file was first committed as PROPOSED (`eae59c00`, PR #852); the adoption is recorded here rather than by rewriting that commit.

## 1. Lineage (verified in the repository, 2026-11-22)
- **No V14.4 existed before this file.** The repo, the git history and the session memory contain no V14.4 roadmap; the V315 audit had already confirmed "NO V14.4, V12.4 canonical".
- V12.4 lineage: the V234–V238 programs were consolidated into V12.4 (sections A–S) and are tracked in `v124-consolidated-roadmap.json`. Of its 24 missions:

  | Status | Count |
  |---|---|
  | ACCEPTED | 14 |
  | REVIEW | 6 |
  | READY | 2 |
  | IN_PROGRESS | 1 |
  | BLOCKED | 1 |

- Two facts announced in the directive are **not satisfiable as stated**, and V14.4 carries them over without fabrication:
  - **"166 capabilities":** governed by the ACCEPTED decision `DEC-V60-166-RETIREMENT`, which formally SUPERSEDED the V12.4 §80/§115 "recover 166" requirement as unsatisfiable.
  - **"A01–A54 architecture points":** A02–A53 are recorded as NOT_RECOVERED. No mapping is invented.
- Other invariants carried over unchanged:
  - 9 primitives, no 10th;
  - 20 métiers (P1–P15 + M1–M5) FROZEN, including M2 BTP;
  - a single orchestrator, mission chain, Radar and memory;
  - the hard registers stay byte-identical (`closure-register.json`, 427 items).

## 2. Structure: phases mapped onto existing V12.4 missions (no new engine)
| V14.4 phase | Exit criterion (summary) | V12.4 anchor(s) | Current real state |
|---|---|---|---|
| 0 Truth & foundations | checkpoint + classification + correspondence merged | C `CM-V237-REPO-VPS-MAP` (READY), D continuity (ACCEPTED) | V371 checkpoint MERGED (#851); repo↔VPS map deferred ("VPS untouchable" scope to clarify) |
| 1 Radar & knowledge | traced chain Radar→knowledge→memory→decision with reuse proof | **I `CM-RADAR-GATE-CHAIN` (READY)** | 4 components present + tested; the link Radar→acquisition→memory→improvement-chain is missing; real collection BLOCKED (grant) |
| 2 Brain & memory | per-axis measured gains on held-out cases | B observation-currency (ACCEPTED); existing memory-trust-gate, knowledge-engine, mission-context-builder | per-axis eval exists (#840–#842); several axes NOT_MEASURED on real data |
| 3 Autonomy & orchestration | one internal mission selected → executed → independently verified | E `CM-V234-RESIDENT-DRIVER` (IN_PROGRESS), F orchestration (REVIEW), G A–Z scenario (REVIEW) | L0 only; L1+ owner-gated |
| 4 Reliability & performance | p50/p95, resources, resilience measured before/after | K `CM-BENCHMARK-AUDIT` (REVIEW) | partial measurements; no SLO/error-budget policy wired |
| 5 Multimodality | quality/latency measured on real media | P `CM-MULTIMODAL-VIDEO` (BLOCKED) | BLOCKED (resources) |
| 6 20 métiers | per-métier dossier → owner authorization → build | L métier baselines (REVIEW), S BTP (ACCEPTED, frozen) | frozen; dossiers only |
| 7 Global validation | cross-métier, load, security, independent audit | — (new exit criteria, no new engine) | NOT_STARTED |
| 8 Release readiness | release dossier + rollback + owner authorization | existing release pipeline (`odg-release.sh`) | release b8b1aaf5 prepared; deploy owner/root-gated |

## 3. Correspondence register (method, not a new system)
The register is derived from the existing modules `odg-mission-crosswalk`, `capability-traceability` and `odg-component-census`. It maps:

> V12.4 mission → components → census status (CONNECTED / NO_CONSUMER) → tests → evidence → V14.4 phase

Statuses use the 12-value taxonomy; anything without data is NOT_MEASURED. It is to be generated in Phase 0, lot 2 under its own WORK_ITEM_CONTRACT, and is **not** hand-written here.

## 4. Gates that remain closed
- Deploy, VPS changes, egress, new accounts, payments and métier activation all remain closed.
- Radar real collection needs an accepted, unexpired grant: `V372_RESEARCH_GRANT.json` (accepted V372, expires 2026-12-22). V141 is expired.
- Every work item needs a WORK_ITEM_CONTRACT authorized by a human (`ODG_AUTONOMOUS_WORK_PROTOCOL.json`).
- The first contract is `docs/odg/WIC_CM-RADAR-GATE-CHAIN_STEP1.json` (AUTHORIZED by owner V372).

## 5. Reconciliation notes (V372)
- **`CM-RADAR-GATE-CHAIN` was already partially built.**
  - `runtime/core/odg-radar-gate-chain.ts` (V254/V257, PR #636, 2026-11-17) is a read-only *coverage* verifier: every stage maps to a component.
  - The V12.4 companion still lists the mission as READY with `commit: null`. That gap is recorded here, and the companion is left unchanged (hard register).
  - Step 1 (branch `feat/cm-radar-gate-chain-step1`) **extends** that same module with the *executed* data path (acquire → admit → reuse → gate). It is not a duplicate.
- **Contract.** `WIC-CM-RADAR-GATE-CHAIN-STEP1` was AUTHORIZED by the owner in V372. Its write_set listed the module as new; the extension is reconciled in the contract file.
- **Radar grant.**
  - `docs/odg/V372_RESEARCH_GRANT.json` is ACCEPTED (owner V372) and technically verified:
    - `research-governor.govern`: ALLOW for allowlisted domains and their subdomains; DENY for other domains, after expiry, and for the expired V141 grant;
    - `bounded-http-client`: `NOT_HTTPS` and SSRF `PRIVATE_HOST_BLOCKED` enforced.
  - The grant expires on 2026-12-22. V141 remains expired and unused.
- **Métiers.** Under V372, construction and tests are allowed in development/sandbox only. Real operation still requires a separate owner decision.
