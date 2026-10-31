# MASTER CTO CAMPAIGN V2 — Final Acceptance Bilan (2026-10-30)

**Truth Lock:** `main @ 9f1faf6` — Pole C (#282 `b41d5f5`) + Pole B (#283 `fbf7434`) + Pole A (#284 `9f1faf6`)
ALL MERGED, 0 open PRs (this bilan's Pole-A lot is itself now merged). Register **123 items**,
dup-free (123 unique ids). Companion machine SSOT: `docs/odg/closure-register.json`. Companion owner-action pack:
`docs/odg/OWNER_GATED_DEPENDENCY_DOSSIER.md`. Supersedes nothing — extends `CAMPAIGN_CLOSURE_BILAN_2026-10-30.md`.

This is an acceptance **bilan**, not a completion claim. Every number below is recomputed from the register and
the merged PRs; nothing is simulated, blended, or self-certified — each executed lot was **independently verified by
a separate agent** (no agent accepted its own work).

---

## 1. Method — three specialist poles + independent verification

Per the V2 mandate, an exhaustive audit was run through three specialist poles over isolated lots with explicit
contracts, and **a separate verifier confirmed each executed lot before acceptance**:

- **Pole A — Governance / Roadmaps.** Reconciliation findings (this lot): stale crosswalk counts, stale `pending/*`
  count, a protected-Master stale phrase (owner-gated, NOT edited), and the `acceptance:null` dual-convention.
- **Pole B — Engineering / Infrastructure.** 6 confirmed defects → PR #283, independently verified (PASS).
- **Pole C — Intelligence / Capabilities.** 2 confirmed under-detection defects → PR #282, independently verified
  (CONFIRMED_FIX_CORRECT on both).

## 2. What was executed and accepted this campaign (computer-side)

| Lot | PR | Merge | Independent verdict | Register |
|---|---|---|---|---|
| **Pole C** — false-success detector blind to gate-bypass (C-1) + bias detector ignoring refusal/quality parity (C-2) | #282 | `b41d5f5` | CONFIRMED_FIX_CORRECT ×2; pins reconstructed (fail pre-fix) | `v2-poleC-false-success-fairness-under-detection` ACCEPTED |
| **Pole B** — 6 fail-open / fabrication / unbounded-spawn fixes (B-1 delegate write-set gate, B-2 CI gate NOT_RUN, B-3 dashboards, B-4 intake body, B-5/B-6 spawn timeouts) | #283 | `fbf7434` | PASS, safe to merge; B-1/B-2/B-3/B-6 pins reconstructed | `v2-poleB-engineering-infra-hardening` ACCEPTED |
| **Pole A** — crosswalk + register reconciliation (this lot) | (in-flight) | — | — | docs + integration blocks |

Both executed lots: `tsc` clean on **both** tsconfigs, `build:runtime` OK, affected suites green, CI green on a
real runner, merged via merge-commit (never force-push, never a protection bypass — `main` is unprotected and was
NOT auto-merged; each merge was a bounded check-then-merge).

## 3. Acceptance accounting — deduped, with formula

Deduped over the 123 unique register ids (an item's `integration.MERGED` block is orthogonal to its `status` — it
is NOT a second row, so there is no double-count):

```
TOTAL            = 123
ACCEPTED         = 113
non-ACCEPTED     =  10  = 7 BLOCKED + 1 IN_PROGRESS + 2 DEFERRED
```

- **Raw acceptance rate** = ACCEPTED / TOTAL = 113 / 123 = **91.87%**.
- **Owner/external-gated** (not computer-side blocked): all **10** non-ACCEPTED items — each has a block proof +
  one-step owner action + resume test in the Owner-Gated Dependency Dossier (A1–A7, B1, C1–C2).
- **Computer-side frontier completion** = ACCEPTED / (TOTAL − owner_gated) = 113 / (123 − 10) = 113 / 113 = **100%**.

Interpretation: **every item that ODG can advance without a privileged/external/owner authority is ACCEPTED.** The
residual 8.13% is not incomplete engineering — it is work that is *correctly* waiting on an owner/third-party action.

`acceptance` convention note: 113 ACCEPTED items are marked by EITHER `acceptedAt` (string) OR an `acceptance`
object (43 use the former, hence `acceptance:null` on those — a dual convention, both valid; 0 items are ACCEPTED
without a recorded acceptance). No backfill was done (it would fabricate metadata).

## 4. The 10 owner-gated items (pointer)

7 BLOCKED: `dashboard-tls-exposure` (P1), `structured-roadmap-deps` (P1), `campaign-runner-systemd-activation`,
`new-language-families` (hadolint), `broad-it-independent-eval-set`, `p01-demand-validation`, `p01-billing-sandbox`.
1 IN_PROGRESS: `broad-it-corpus-grow` (coverage PROVEN 11/12 = 0.9167; NO_DATA solely on self-authored labels ⇒
blocked on the independent eval set). 2 DEFERRED: `golden-path-scaffolder-poc`, `commercial-ops-substrate-h3`
(owner product decisions). Full block proof + exact action + resume test: `OWNER_GATED_DEPENDENCY_DOSSIER.md`.

## 5. Invariants held

- **9 permanent primitives FROZEN** (IDENTITY·STATE·CONTRACT·POLICY·RESOLVER·EXECUTOR·EVIDENCE·RECOVERY·ALLOCATOR);
  **no 10th** (Master FICHE_01:1147). Every V2 fix composes existing primitives — none introduced a primitive.
- **No protected-path mutation.** The FROZEN Master (`ODG_MASTER_ROADMAP.md`), Runtime Constitution, CTO Directives
  and `runtime/governance/ROADMAP.json` were NOT edited. One stale phrase in the Master (`§S` L824, "default stays
  JS") is recorded as an owner-gated correction — it is already banner-scoped HISTORICAL (L866–869); ODG does not
  edit the frozen Master.
- **No force-push, no protection bypass, no destructive/irreversible/privileged action.** No deletion or overwrite
  of foreign files or stashes; the stray 0-byte untracked root files (`bmax-v21@0.1.0`, `tsx`) were left untouched.

## 6. Honest residuals (not shipped as done)

- `odg-test-report` fails on NOT_RUN (a listed suite that never ran) but has **no listed-vs-globbed drift
  cross-check** — a brand-new *unlisted* suite is still silently un-gated (additive enhancement, separate lot).
- B-4 (intake body) and B-5 (scheduler dispatch timeout) are verified by reasoning + adjacent tests — no route /
  real-hang harness exists.
- `stereotype_association` remains declared-but-uncomputed in `fairness-eval` (needs an NL/semantic surface that
  does not exist today) — honestly bounded, not a regression.

## 7. Resume

```
git checkout main && git pull --ff-only origin main && npx tsx runtime/bin/odg-resume.ts docs/odg/closure-register.json
```
