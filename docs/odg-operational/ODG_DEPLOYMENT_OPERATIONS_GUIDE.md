# ODG — Deployment & Operations Guide

> **Scope & honesty.** This documents what is **actually** on the host as observed 2026-11-08, what this
> work session deployed (and did **not**), the build/verify/health procedures, the security posture, and
> the recovery procedure. It distinguishes OBSERVED reality from ASPIRATIONAL targets. It is operational
> documentation, **not** a conformity/security certification. Authority: V12.4 is the strategic référentiel;
> `ODG_PROJECT_STATE.md` is the compass; this guide is subordinate to both.

## 1. Host & environment (OBSERVED)

| Fact | Value |
|---|---|
| Host | `vps-6d919042` — **this host IS the VPS** (not a separate deploy target) |
| OS / kernel | Linux 7.0.0-42-generic |
| Node / npm | v22.22.1 / 9.2.0 |
| Resources | 8 vCPU · 22 GiB RAM (≈16 GiB free) · load ~0.6 · uptime ~14 h |
| systemd | **degraded** (some units failed); **no root** → system units not manageable here |

## 2. Services currently running (OBSERVED, read-only)

| Service | Port | Bind | Status | Owned by this session? |
|---|---|---|---|---|
| `edg-core` (Docker) | 8080 → 80 | `0.0.0.0` (public) | Up ~14 h | **No** — pre-existing; **observed read-only, never mutated** |
| `next-server` (Next.js) | 3000 | `127.0.0.1` (local) | running (pid 1002) | No — pre-existing |
| `ollama` | 11434 | `127.0.0.1` (local) | listening | No — local model runtime |
| SSH | 22 | `0.0.0.0` | listening | No — host-managed |

**This session deployed NO new service and opened NO new public port.** See §6 for why (a real limit, not a choice).

## 3. Build, verify, health (REPRODUCIBLE)

```bash
# Runtime build (closure-based → runtime/dist, ~1.9 MB)
npm run build:runtime            # tsx scripts/build-runtime-guard.ts

# App build (Next.js → .next)
npm run build                    # next build

# Full verify gate (build + TypeScript strict + generated-contract validity)
./runtime/bin/odg verify         # → build:true, typescript:true, generatedContractsValid:true

# Classified test gate (the CI gate; ~302 suites, fail-closed on FAIL/BLOCKED/NOT_RUN)
npm run test:report

# Runtime health smoke test
./runtime/bin/odg health         # → Runtime/Foundation/Pipeline/Brain READY; 240 caps ready; 98% completion
```

Last observed health (2026-11-08): **all four subsystems READY**, 240 capabilities ready / 4 missing, 1438 missions recorded.

## 4. Architecture (pointer, not a copy)

- **Runtime core**: `runtime/core/*.ts` — pure/deterministic modules (9 primitives + G0 Root-of-Trust, 15 profession
  reference projects P1–P15, ledgers for gates/campaigns/dossiers/failures/study-steps, scorecard). Dual CJS/ESM export.
- **Entry**: `runtime/bin/odg` (verify/health/…); `runtime/bin/odg-resume.ts` for session handoff.
- **Governance**: `ODG_AUTONOMOUS_WORK_PROTOCOL.json` (canonical), Master (FROZEN), Runtime Constitution, CTO Directives,
  `runtime/governance/ROADMAP.json`. Traceability: `docs/odg/V12.4_SECTION_TRACEABILITY_MATRIX.md` + `docs/odg/closure-register.json`.
- Full section map: `docs/odg-operational/ODG_MASTER_ROADMAP_V12.4.md` (index) + the traceability matrix.

## 5. Security posture (OBSERVED, honest)

- **No secrets in the repo / in any pushed diff** — pushes are secret-scanned (patterns incl. keys/tokens/private-keys);
  the only secret-shaped strings in-tree are `EXAMPLE` test fixtures (e.g. the P3 planted `AKIA…EXAMPLE…` for detection tests).
- **Local-only restrictions (§104)** enforced + now **machine-checkable** via `runtime/core/preservation-invariant.ts`
  (read-only git; fail-closed) and `truth-lock-gate.ts`.
- **Egress**: no real paid API calls; external network used only for authorized GitHub operations and licensed dependency fetch.
- This is posture documentation, **not** an ISO/CRA conformity statement (those remain NOT_CERTIFIED — see the ISO/AI-Act modules).

## 6. Deployment capability & limits (HONEST)

**Reachable on this host (user-space):** build, verify, test, run the runtime, local health checks, run user processes.

**Blocked by a real environment limit (NOT policy, NOT a choice):**
- `sudo` is **denied** at the settings level → cannot install system packages, manage `systemd` units, change the
  firewall, or open a **new public port**. A new *managed public production deployment* is therefore **not reachable** here.
- Public exposure of any new service would require firewall/reverse-proxy changes that need root → **owner/human action**.

**Consequence:** this host already serves `edg-core` (8080, public) and a Next app (3000, local). Standing up an additional
public ODG endpoint requires an owner with root (or a reverse-proxy config the owner controls). Documented, not worked around.

## 7. Recovery procedure

```bash
# 1. Resume exactly where the last verified checkpoint left off
git checkout excellence/v3-wave3-demonstrators-20261101
npx tsx runtime/bin/odg-resume.ts docs/odg/closure-register.json   # prints counts + blockers + next action

# 2. Verify integrity before any change
./runtime/bin/odg verify
npx tsx runtime/core/campaign-controller.test.ts                   # register integrity (0 stale)
npx tsx runtime/core/preservation-invariant.ts                     # untracked/stashes/branch preserved (read-only)

# 3. Preserved work (never delete): untracked working set (≥404 recursive), 5 git stashes, the edg-core container.
```

Rollback is git-based (every lot is a clean commit). No destructive reset/clean/force-push is used; `main` is branch-protected
(require PR + CI). The preservation invariant fails closed if any preserved work is dropped.

## 8. What is NOT done (explicit)

- No real external client, no real revenue, no E5 (external-reality) validation — owner-gated, never fabricated.
- No new public deployment this session (see §6).
- Campaign closure C1–C4 and global Gate A–G PASS remain **not demonstrated** (need owner-gated prerequisites FR-07/VPS-root/E5).
- Historical §80 assets (Build Factory, Economic World Model, …) remain UNKNOWN/TO_AUDIT — preservation ≠ recovery.
