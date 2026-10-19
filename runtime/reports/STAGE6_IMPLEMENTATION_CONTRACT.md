# ODG — Stage-6 Autonomous Code-Implementation: Diagnosis + Implementation Contract (PROPOSED)

**Date:** 2026-10-19 · **Base:** `b9ca466` · **Status:** DESIGN ONLY — no functional change until this contract +
write-set are CTO-authorized. ODG is the sole orchestrator; a provider is a subordinate technical executor with
no autonomous authority (proven below).

## 1. Root cause (VERIFIED in code — demonstrated / hypothesis / unknown)
**Demonstrated (file:line):**
1. **No activated autonomous code-generator.** `local-model-manager.ts:33` reads `ODG_LOCAL_MODEL_CMD`; unset ⇒
   `isAvailable()` false ⇒ `capability-router.ts:10` Local-LLM tier is skipped, leaving only "External AI (last
   resort)". No local model is configured/bundled.
2. **Activation policy keeps generators off.** `runtime/config/runtime-mode.json`: `providersEnabled:false`,
   `providerActivation:"MANUAL_ONLY"` (human-only). `build-recovery-engine.ts:353` only *escalates* to the
   provider when local repair exhausts (`providerAuthorized=!(build&&typescript)`); it never crosses it.
3. **ODG's only self-authored "implementation" is a STUB.** `patch-executor.ts:583-612` `IMPLEMENT_MISSING_CAPABILITIES`
   writes a SCAFFOLD (`status:"SCAFFOLDED", implemented:false`), never real logic.
4. **The governed delegation seam exists but is authorless.** `delegate-isolation.ts` (E1–E6): `validateScope`
   (refuses out-of-scope), `applyProposal`, `selectDelegateMode` (no silent fallback), `acceptanceGate` (ODG never
   auto-commits) — proven by `delegate-isolation.test.ts` (61 assertions). It needs a provider to produce the diff.

**⇒ The lock is NOT orchestration/contract/authorization/verification/recovery (all exist & tested — see §2).
It is specifically: (a) no activated code-GENERATOR, and (b) activation policy.** External providers (Claude Code)
are billable AND excluded by the no-network sandbox (`provider-sandbox` + E1–E6), so they are not the autonomous path.

**Hypothesis (NOT demonstrated):** a locally-runnable model of sufficient quality can generate correct novel code.
**Unknown (genuine dependency):** whether any capable local model is installed/runnable on this host — likely ABSENT
(`ODG_LOCAL_MODEL_CMD` unset). This is a real resource dependency, not fabricatable.

## 2. Existing capabilities to REUSE (no new primitive — the 9 canonical primitives are preserved)
| Cycle stage | Existing component (reuse) |
|---|---|
| discovery/selection/diagnosis | runtime-model, migration-selector, self-diagnostic, root-cause-engine (all autonomous) |
| contract + write-set | `mission-contract-factory` / `mission-synthesizer` (≈98% of contracts ODG-generated) |
| authorization (POLICY) | `action-gate` + `capability-authorization` (deny-by-default; cannot self-authorize) |
| **delegation seam (EXECUTOR-adjacent)** | **`delegate-isolation` (working-copy→diff→validateScope→apply→acceptanceGate, fail-closed)** |
| **local generator (RESOLVER tier)** | **`local-model-manager` (argv, no-shell, inside bwrap `provider-sandbox`, no network)** + `capability-router` Local-LLM tier |
| tests + independent verification (EVIDENCE) | `local-test-gate`, `validation-engine`, `mechanical-acceptance` (facts-not-claims) |
| recovery (RECOVERY) | `checkpoint-engine` (resume), `idempotency-guard`, `build-recovery-engine` (escalation) |
| acceptance / learning / compass | `mission-lifecycle` S4 (human commit), `patch-memory`/`learning-chain`, `compass-update` |

## 3. Exact gaps
G1. No activation sub-policy distinguishing **LOCAL-autonomous** (no billing, sandboxed) from **EXTERNAL-billable**
    (stays MANUAL_ONLY/human). Today one blanket `MANUAL_ONLY` blocks both.
G2. No capability wiring an engineering objective's generation through: router Local-LLM → `delegate-isolation`
    working-copy → scoped diff → `validateScope` → apply → verify. Today the router replays patch-memory or
    `IMPLEMENT_MISSING_CAPABILITIES` only scaffolds.
G3. No configured local generator (`ODG_LOCAL_MODEL_CMD`) — dependency, likely needs host setup/authorization.

## 4. Minimal correction architecture (target cycle)
A governed capability **`IMPLEMENT_VIA_LOCAL_PROVIDER`**: for an engineering objective with no Memory/Rules hit,
IF `local-model-manager.isAvailable()` AND the LOCAL activation sub-policy permits → materialize a working-copy
(`delegate-isolation`), prompt the sandboxed local model for a diff scoped to `authorized_paths`, `validateScope`
(fail-closed; out-of-scope ⇒ atomic refuse), `applyProposal`, run `local-test-gate` + `validation-engine`, cap at
VERIFIED (human commit = acceptance, by design). If the local generator/sandbox is unavailable ⇒ fail-closed to the
existing escalation (NO silent external/billable activation). External providers remain MANUAL_ONLY/human.

## 5. PROPOSED write-set (for the FUTURE implementation mission — to be authorized; NOT touched now)
- `runtime/config/runtime-mode.json` — add `localProviderActivation:"AUTONOMOUS_SANDBOXED"` (LOCAL only); leave
  `providerActivation:"MANUAL_ONLY"` (external) UNCHANGED.
- `runtime/core/capability-executors.ts` (+ registry) — new `IMPLEMENT_VIA_LOCAL_PROVIDER` capability composing the
  §2 components (dual-port `.js`/`.ts`).
- wiring in `runtime/core/decision-engine.ts` or `capability-router.ts` to route engineering objectives to it.
- tests (below). **No ROADMAP.json / Master / Constitution / primitives / stashes.**

## 6. Tests (required before acceptance)
- **Unit:** activation policy gates LOCAL vs EXTERNAL correctly; LOCAL permitted only when sandbox+model available.
- **Integration (injected fake local model):** in-scope diff ⇒ applied+verified; out-of-scope diff ⇒ `validateScope`
  atomic REFUSE, nothing applied; model-unavailable ⇒ fail-closed escalation (no external activation).
- **Security:** provider runs no-network (sandbox), cannot self-authorize, cannot commit (ODG caps at VERIFIED),
  `selectDelegateMode` no silent fallback; generated evidence provenance-stamped (SLSA-style).
- **E2E:** a tiny real objective on a disposable git fixture, diff from a STUB generator, applied+tested+verified,
  zero human authoring, capped at VERIFIED.

## 7. Success / failure criteria
- **SUCCESS:** ODG generates+applies+verifies a novel IN-SCOPE change via the LOCAL generator with zero human
  authoring, diff scope-validated, capped at VERIFIED; measured as `ODG_EXECUTED_VERIFIED` ONLY when a capable local
  model genuinely produced it.
- **FAILURE/REFUSE (fail-closed):** out-of-scope diff, sandbox/model unavailable, or policy-forbidden ⇒ refuse +
  escalate; never a silent external/billable call; acceptance blocked on any scope/authority violation.

## 8. Recovery strategy
`checkpoint-engine` resume + `idempotency-guard` (replay ⇒ zero mutation) + `delegate-isolation` atomic refuse +
`build-recovery-engine` escalation. An interrupted generation resumes from the last DONE stage; a bad diff reverts
the working-copy (never the real tree — apply is gated by validateScope).

## 9. Proof the provider stays WITHOUT autonomous authority
`delegate-isolation.validateScope` refuses out-of-scope atomically (61-assertion test); apply only within the exact
write-set; `mission-lifecycle.ts:140-148` caps at VERIFIED (ODG never auto-commits — human commit = acceptance);
provider runs in a no-network bwrap sandbox; `capability-authorization.ts:310` `grant.human!==true ⇒ DENY`.

## 10. Autonomy measurement
A new objective exercising `IMPLEMENT_VIA_LOCAL_PROVIDER` counts toward `ODG_EXECUTED_VERIFIED` (autonomy-measure)
ONLY on genuine ODG-executed+evidenced generation; if no capable local model is available it is left UNMEASURED
(honest — never fabricated). **No "100% autonomy" claim without per-capability proof.**

## 11. References mapped (adapted, not adopted blindly; no new primitive)
- **SLSA / NIST SSDF** (supply-chain provenance): generated-artifact provenance → ODG already has `evidence-provenance`
  (stamp+verify); extend to stamp provider-generated diffs. **COVERED + extend.**
- **Least-privilege sandbox** (agent tool isolation): `provider-sandbox`/E1–E6 (no-net, clearenv). **COVERED.**
- **Author ≠ verifier** (independent oracle, anti-collusion): `mechanical-acceptance` facts-not-claims +
  `validation-engine` independent probes. **COVERED.**
- **Human-in-the-loop for irreversible/external** (OWASP Agentic T3/T10, Google SRE change-gating): commit + external
  billing stay human/MANUAL_ONLY. **COVERED.**
- **Idempotent apply / bounded retries** (SRE): `idempotency-guard` + bounded `build-recovery-engine`. **COVERED.**
Gap vs references: only the *activated local generator* (G3) is a genuine new dependency; everything else is wiring.

## 12. Boundary / human decision required (critical only)
Two genuine dependencies gate PRODUCTION Stage-6 autonomy, both CTO calls: **(D1)** provide/authorize a capable
**local** code model (`ODG_LOCAL_MODEL_CMD` + host setup) for the no-billing autonomous path, OR **(D2)** authorize a
billable EXTERNAL provider under the E1–E6 seam (flips `providersEnabled`/activation for external, with billing
authority). The MECHANISM (§4) can be built + proven now with a STUB generator (no model, no billing) to demonstrate
ODG's end-to-end governance of generated code — that build is the next authorized implementation mission.
