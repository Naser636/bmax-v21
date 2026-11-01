# ODG_CAPABILITY_INVENTORY — evidence-backed (V1, 2026-11-01)

**Authority:** CTO (post-57e1c82 autonomy-evolution directive §2/§11). **Rule:** a capability is listed only with DEMONSTRATED execution evidence (merged PR + tests + independent validation) — never because a command or doc describes it. Re-verify + update after meaningful capability changes. Baseline `main @ 57e1c82`.

Framework per directive §2 (A–H). "Evidence" = concrete artifacts from the governed campaign.

## A. Understand & analyze natively — DEMONSTRATED
- Read/trace repo subsystems, reconcile Git/GitHub truth, classify defects by root cause. Evidence: the read-only audits + the two independent review waves (eleven-domain + autonomy/reliability) that located real defects (e.g. `build-recovery-engine` sibling-escape) vs refuted non-defects (NONEXISTENT_MISSION_XYZ by-design, dataset-quality intentional). Register `closure-register.json` as machine SSOT.

## B. Decide under delegated authority — DEMONSTRATED
- Select bounded lots, classify P0/BLOCKER/OWNER_GATED/ENVIRONMENT/UNVERIFIED/PLANNED, decide accept/merge on validator+CI evidence, refuse to fabricate (left profession list BLOCKED; did not flip broad-it without a live coverage artifact). Evidence: governed merges #318–#336; honest "no change / by-design" outcomes.

## C. Execute with available tools/permissions — DEMONSTRATED
- Edit TS, run `build:runtime` + `tsc` (both tsconfigs) + the 245-suite classified gate, branch/commit/push, open PRs, drive CI (incl. the known "Classified test gate" stall → cancel+rerun remedy), merge via the protected-branch PR flow. Enabled `main` branch protection (admin). Evidence: 18 PRs merged this session; `main` protection verified active (require PR + CI, enforce_admins, no force-push/delete).

## D. Delegate to independent technical agents — DEMONSTRATED
- Spawn separate-context agents for adversarial validation + read-only recon; agents run in their own context (isolated), never self-accept the implementer's work. Evidence: every lot #319–#336 independently validated by a distinct agent context (one REJECTED #326's NUL regression — real independence).

## E. Test & validate independently — DEMONSTRATED
- Focused tests first → full classified gate at integration → a DISTINCT agent context adversarially verifies (pre-fix-vs-post-fix proofs, end-to-end drives, byte-identical proofs) → 2 green CI for security/core. Evidence: validator transcripts for #319, #320, #326 (incl. real `recordMission` tamper refusal), #332, #335.

## F. Missing capabilities (honest) — observed limits
1. **No durable self-wake after session termination.** Automatic continuation works WITHIN a session (task-completion re-invocation); a terminated session needs an external wake (cron/systemd — owner-gated). NEVER claimed as present.
2. **No keyed authenticity for evidence** (audit-log/evidence-provenance/mission-ledger are keyless tamper-evident; keyed HMAC needs an owner-provisioned secret).
3. **No external web competitive-intelligence run demonstrated** in this campaign (WebSearch/WebFetch exist as tools but the profession program's research hasn't been exercised + is CTO-definition-blocked).
4. **No private-VPS mutation** (systemd/sudo/deploy) — reserved.
5. **Structured roadmap deps not live-enforced** in the selector (represented + checkable only; sole edge is out-of-scope).

## G. Missing caps ODG CAN build safely within the architecture (bounded missions)
- Keyless tamper-evidence for other evidence writers (pattern proven: audit-log #326, evidence-provenance #328, mission-ledger #332) — reusable where an evidence file lacks a seal.
- Live-enforcement wiring of `roadmap-dep-check` into the selector (currently no in-scope effect — low value; only if a real in-scope dep arises).
- Capability-gap self-detection surfacing (a read-model over the register's BLOCKED/owner-gated set) — additive, no new primitive.
- hadolint toolchain-absent BLOCKED_BY_TOOLCHAIN hardening (if not already fail-closed — it is; no change warranted).

## H. Genuinely requires unavailable tool / permission / human decision (owner-gated)
- HMAC key provisioning (unblocks keyed integrity); private-VPS systemd activation; `hadolint` binary install; an independently-labelled broad-IT dataset; the VPS front-door smoke; **the eleven-profession definitions (CTO)**; public TLS/billing/commercial/public-deploy (OUT OF SCOPE this phase). Tracked in `OWNER_GATE_EXECUTION_PLAN.md` + `ELEVEN_PROFESSIONS_DECISION_DOSSIER_V1.md`.

## Autonomy posture (honest)
ODG plans → contracts → executes/delegates → tests → independently validates → integrates → reconciles the register/compass → detects capability gaps, continuously WITHIN a session. It does NOT fabricate evidence, does NOT self-accept, and refuses to invent undefined scope (professions). The high-value in-scope engineering frontier is hardened + largely exhausted; remaining work is owner-gated or CTO-definition-blocked.
