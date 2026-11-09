# V12.4 — V24: Transversal Phase, Batch 01 — Promotion-Assurance Gate (2026-11-09)

Transversal phase opens. Métier qualification is closed (V23, 15/15 with evidence). This batch strengthens ODG's
governance of its own self-improvement: a single auditable promotion control. ODG selected, built, tested, verified.

## A. Initial state (evidence)
- **Repo:** HEAD = origin/main = `d75bfb4`; branch `excellence/…`; tracked tree clean (only the 5 preserved stashes / 6
  untracked docs dirs). Register 398 [383 ACCEPTED].
- **VPS (what actually runs):** `odg-radar-weekly.timer` **active/waiting** (next Mon); `odg-preprod.service` inactive
  (last run exit 0 — ran then exited, not currently serving). **Ports: only SSH:22 public** (key-only); edg-core
  `127.0.0.1:8080`, ollama/dashboard loopback — no public port.
- **Repo vs integrated vs running:** the métier-parcours + ingestion + Radar-persistence code is **integrated** (on main)
  and **CALLABLE** (gate 404→405); the only **running** ODG units are the radar timer (periodic) and on-demand preprod.
  No claim of a continuously-serving deployment is made.
- **L0-L4:** Ollama live on loopback with 3 models (7b/3b/0.5b). **Radar:** proposals **persisted + traceable**
  (`frontier-proposal-registry.json`), dedup journal present, resilience hardened (V15/V16). **3 voies + 13 decisions:**
  unchanged, owner-gated.

## B. Current batch — Promotion-Assurance Gate (deep)
**Selection (ODG, by evidence):** auditing the self-improvement / Radar chain (§6) confirmed it is already sound — the
frontier-lab has an INDEPENDENT verifier, promotion is external-only, and `self-improvement-chain` never self-authorizes.
**Not rebuilt.** The real gap: the §6 promotion invariant ("no promotion bypasses POLICY, Truth Lock, or independent
assurance; no proposal self-authorizes") was enforced **implicitly across several modules**, not as ONE auditable gate.

**Built:** `runtime/core/promotion-assurance.ts` (PURE, fail-closed, gate suite **#405**) — `evaluatePromotion(proposal,
context)` composes the EXISTING controls into a single deny-by-default decision: PROMOTE only when ALL of
{proposal well-formed + grants no permission, not self-authorized, POLICY ALLOW, Truth Lock satisfied, EXTERNAL
authorization, INDEPENDENT verification PASS} hold; REFUSE otherwise with the exact missing control. It performs no
promotion (the governed caller acts only on PROMOTE).

**Excellence — falsification tests (§5):** EACH required control, when missing/false, REFUSES (exhaustive). **Key
falsification:** a PASS that is the **proposer's own measurement** (`proposerMeasured:true`) is **NOT** independent ⇒
REFUSE — mirroring the métier-parcours "assurance ≠ reproducibility" discipline. Null/empty input ⇒ REFUSE (never a silent
PROMOTE).

**Independent assurance (§7.4):** the gate's decision is validated by the exhaustive falsification suite (a distinct check
per control) + a live integration against the REAL persisted Radar proposal:
```
real proposal frontier-prop:cand:a108ed914e71670c (PROPOSED, grantsNoPermission)
 → no owner auth        ⇒ REFUSE (missing: externalAuthorization, independentVerification)   [matches its real PROMOTION_REVIEW hold]
 → owner auth + lab PASS ⇒ PROMOTE   [the governed path, only once the owner authorizes + an independent verifier passes]
```

**Chantier status:** REGISTERED + CONNECTED (uses the real frontier proposal shape; enforces §6 on the live proposal) +
CALLABLE (gate #405) + EXECUTED (run live on the real proposal) + **VERIFIED** (exhaustive falsification + the
independent-≠-proposer check). **VPS:** N/A — a pure governance module (not a deployed service); no deploy claimed.

## C. Unresolved defects / blockers
- None introduced. The promotion path still (correctly) requires an **owner/CTO external authorization** to actually
  promote any proposal — that is a governance decision, not a defect (owner-gated).
- The frontier candidate remains held at PROMOTION_REVIEW (no owner authorization supplied) — the gate now REFUSES it
  explicitly with the exact missing controls, improving traceability.

## D. Next batch prepared (V25, audited — NOT executed)
ODG-selected next transversal chantiers (evidence/dependency-ranked):
1. **L4 native engineering benchmark** — a MEASURED, reproducible benchmark of ODG repairing SEEDED controlled defects via
   the local model under a governed write-set + independent test (prove "ODG writes/fixes code" with numbers + a
   falsification: a wrong fix must fail the independent test). Prereq: `l4-campaign`/`repair-autonomy-selftest` reuse; a
   seeded-defect fixture set (SYNTHETIC). Acceptance: ≥1 real seeded defect repaired end-to-end, independently verified,
   with a reproducible pass/fail and a measured tok/s.
2. **Recovery/rollback reproducible drill** — a governed, measured recovery benchmark (checkpoint → interrupt → resume →
   verify identical state; rollback restores). Reuse: checkpoint-engine, odg-rollback. Acceptance: resume + rollback
   proven idempotent with evidence.
3. **Learning-loop efficacy measurement** — does the reuse-ledger actually suppress net-regressing precedents (measured
   over a synthetic precedent history)? Reuse: capability-router reuse-ledger. Acceptance: a measured select/suppress
   decision proven correct on a synthetic history, with a falsification (a net-regressed precedent must be suppressed).

Each is a focused, deeply-provable chantier reusing existing capabilities; synthetic fixtures stay SYNTHETIC and unblock
nothing canonical. Execution deferred to V25.

## E. Boussole
Register reconciled (new item `serie30-v24-promotion-assurance`). Gate 405/405. HEAD=origin/main=`d75bfb4`. §9
restrictions intact (Truth Lock, 9 primitives, permissions, private VPS, SSH, edg-core 127.0.0.1:8080, no public port, no
net, no spend, no secret, no deletion). Next priority: the V25 transversal batch above, or the weekly Radar / owner inputs.
