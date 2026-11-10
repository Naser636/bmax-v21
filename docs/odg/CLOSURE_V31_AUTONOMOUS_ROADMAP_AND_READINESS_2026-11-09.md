# V12.4 — V31: Autonomous Roadmap Management + Operational-Readiness Dossier (2026-11-09)

Delivers the §3 native autonomous-roadmap-management capability (the decisive new piece) and reconciles the global program
into an honest operational-readiness dossier (§15). Discovery is open; execution stays governed.

## §3/§16 — Autonomous roadmap management (NEW capability)
`runtime/core/roadmap-manager.ts` (PURE, gate suite) gives ODG the cycle DISCOVERY → INTAKE → DEDUPLICATION →
CLASSIFICATION → IMPACT/DEPENDENCY → PRIORITIZATION → (separate AUTHORIZATION) over the CANONICAL register — NO parallel
roadmap/registry. **Load-bearing invariant (tested):** a discovery is recorded as **PROPOSED only (authorized:false,
executed:false)** — discovery NEVER authorizes or executes itself; authorization is a SEPARATE deny-by-default step
requiring an explicit approved external decision (the Radar/discovery cannot self-authorize). Deduplicates against existing
items (DUPLICATE, not re-added); classifies by signal (DEFECT/MISSING_CAPABILITY/SECURITY/…). **Falsifications caught:**
discovery auto-authorized ⇒ no (always false); duplicate ⇒ deduped; authorization without approval ⇒ refused; a
non-PROPOSED record ⇒ not authorizable; titleless ⇒ REJECTED.
**Real exhaustive inventory (from the register, §16.4):** `progress 96.3% · total 405 · accepted 390 · open 15` — the 15
open are ALL owner-gated (the 13 dossier decisions + 2 déjà-satisfait); forecast honestly "completion depends on
authorizations/owner inputs — NOT auto-executable." The roadmap is now a living mechanism (discover + classify + inventory
+ forecast), governed.

## §4 Radar · §5 native construction · §6 VPS · §8 métiers — reconciled (not re-audited without new anomaly)
- **Radar** (traceable, deduplicated, provenance-stamped; promotion gated by promotion-assurance; never self-authorizes) —
  V15/V16/V24; used as-is. **Read-only public research** remains available within limits (no spend/account/secret).
- **Native construction** — V28 2-file, V29/V30 3-file reliable (7B 3/3), V30 meta-engineering via decomposition (symbol
  detector built + independently verified on unseen cases). V31 chantiers A–E (pre-check integration / 5-file / memory /
  ≥5-run reliability / self-analysis) are the active native-engineering frontier — carried forward (bounded by the local
  models, honestly scoped; no provider authoring).
- **VPS** (V24/V26 read-only probes): preprod responds on 127.0.0.1:3000, scheduler-audit-chain verifies, radar timer
  active, Ollama 3B/7B live, only SSH:22 public, edg-core loopback. No new anomaly ⇒ not re-audited (§6/§8).
- **15 métiers** individually qualified (V17–V23, EXECUTED+VERIFIED each) with independent assurers; monitored via
  metier-parcours + metier-baseline. No regression signal ⇒ closed, re-openable on new evidence.

## §15 — Operational-readiness dossier (honest, evidence-based)
| # | Closure criterion | State |
|---|---|---|
| 1 | Architecture/inventory coherent | ✓ roadmap-manager inventory (96.3%), capability-map, SYSTEM_INTEGRATION_AUDIT |
| 2 | Full compilation | ✓ gate build + tsc |
| 3 | Tests + end-to-end | ✓ gate (now 412-suite), runner e2e 14/14, odg-qualify QUALIFIED |
| 4 | Services functional | ✓ preprod responds, radar timer active, Ollama live (loopback) |
| 5 | Connections + persistence | ✓ audit-chain verifies, frontier proposals persisted, register coherent |
| 6 | Native autonomy measured | ✓ repair (V26) + 3-file construction reliable (V30 3/3) + meta-engineering via decomposition (V30) |
| 7 | 15 métiers monitored individually | ✓ V17–V23 parcours + metier-baseline |
| 8 | Radar governed | ✓ traceable, promotion-assurance, no self-authorize |
| 9 | Autonomous roadmap operational | ✓ **this directive** (roadmap-manager, discovery≠authorization) |
| 10 | Security + recovery verified | ✓ SSH key-only, recovery-drill (0 silent loss), rollback |
| 11 | Backup/restore demonstrated | recovery-drill (isolated) ✓; real VPS backup = operational (owner/infra, not re-tested destructively) |
| 12 | Documentation + canonical proofs | ✓ docs/odg + register (405 items) |
| 13 | No blocking undisclosed defect | ✓ all 15 open items disclosed + owner-gated |
| 14 | Explicit technical-limits list | below |
| 15 | Human-only list (separated) | below |

**Technical limits remaining (14):** native 5-file construction not yet proven; monolithic meta-engineering fails
(decomposition required); 3B insufficient for multi-file (7B required); live-model results non-deterministic (orchestration
logic is deterministically gate-tested); SSH hardening extras need root/sudo (denied). None blocks the private technical
finalization; each is a bounded, documented frontier (native-engineering chantiers carried forward).

**Human-only steps (15 — isolated; do NOT block private technical finalization):** the 13 owner decisions
(dashboard-TLS exposure, demand validation, billing provider credentials, HMAC key custody, ADR-166 ratification,
eleven-profession canonical source, 28-jul source, master-unified scope, golden-path/commercial productization,
delegate-provenance deep work, broad-IT independent labelled data, structured-roadmap protected write) + the
commercial/legal formalities (company, insurance, accounts, contracts, first real client). Each needs a human act or a
real external input — ODG has driven every one to its last non-privileged point (V2 dossier + ingestion pathway V12–V14).

## Provenance & security
`roadmap-manager.ts` + test = provider-authored framework (stated; `autonomy-claim-guard` consistent). Native code this
lot = none newly generated (V30 native results carried forward). §13 restrictions intact (Truth Lock, 9 primitives,
permissions, private VPS, SSH:22 only, edg-core loopback, no spend/secret/deletion/background task).

## Boussole + next
Register reconciled (new item `serie30-v31-autonomous-roadmap`). HEAD=origin/main=`4a73690`. The roadmap is now a living,
governed mechanism; the private technical environment is 96.3%-complete with all remaining work explicitly owner-gated.
**Next (ODG-selectable):** the native-engineering frontier chantiers (V31 A–E), the weekly Radar, or an owner input — each
a PROPOSED path requiring the governed authorization the roadmap-manager now enforces.
