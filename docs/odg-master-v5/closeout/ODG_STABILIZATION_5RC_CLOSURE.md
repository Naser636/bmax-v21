# ODG STABILIZATION — 5 RC CAMPAIGN CLOSURE (ARCHIVE)

> **Nature of this document.** Campaign ARCHIVE record, **not** a new operational source of truth.
> It references the existing sources of truth (git commits, in-repo test files, generated artefacts)
> and introduces no new architecture, engine, capability or policy. The authoritative records remain
> the git history and the committed code/tests themselves.

## CAMPAIGN

- Campaign: `STABILIZE_ODG_ORCHESTRATION`
- Mode: controlled intervention (one work item at a time; PROPOSED -> AUTHORIZED -> EXECUTING ->
  VERIFIED -> ACCEPTED -> COMMITTED, each gate human-authorized)
- Branch: `worktree-stabilization+controlled-odg`
- Base: `7ccfcc2`
- Final HEAD: `7b38aba`
- Commit order (oldest -> newest): `f17c292` (RC-2) -> `39619d5` (RC-4) -> `fefb5cc` (RC-5) ->
  `099bb7b` (RC-1) -> `7b38aba` (RC-3)

All five root causes were taken from the read-only stabilization audit (causes #1..#8 of that audit map
onto these five fixes). Each RC changed only its authorized write-set; no file outside a write-set was
modified by that RC.

---

## RC-2 — prevent failed checkpoint resume (`f17c292`)

- **Root cause.** `runtime/core/checkpoint-engine.js` `begin()` treated a `FAILED` checkpoint as
  resumable (`resumable` excluded only `COMPLETE`), so a re-run skipped the `DONE` prefix of a failed
  run without re-proving it (`runtime/bin/odg-run.js:111/149`).
- **Correction.** Added `existing.status !== "FAILED"` to the `resumable` predicate; a FAILED checkpoint
  falls through to a clean fresh start (`resumeIndex 0`, all stages `PENDING`, new rollback anchor).
- **Write-set.** `runtime/core/checkpoint-engine.js`, `runtime/core/checkpoint-engine.test.js`.
- **Invariants/gates.** INTERRUPTED/COMPLETE/changed-stage-list behaviour unchanged; public surface and
  on-disk checkpoint format unchanged; `exit != 0 => FAILED` unchanged.
- **Tests.** `checkpoint-engine.test.js` — 18 assertions pass (13 pre-existing + 5 new FAILED case).
- **Proof.** `node --check` OK; diff confined to the two files.
- **NOT_PROVEN / limits.** No live pipeline reproduction (proven by deterministic unit test). Prevents
  RE-USING an unproven DONE prefix, not its creation (that is RC-1).

## RC-4 — align self-diagnostic with validation verdict (`39619d5`)

- **Root cause.** `runtime/core/self-diagnostic.js` classified only `EXECUTED`/`FAILED` (ignored
  `RECORDED`) and never read `mission-report.json`, so `odg diagnose` could report `NO_DIVERGENCE`
  while validation was `BLOCKED` (observed live in `runtime/reports/ODG_DIAGNOSE_LIVE_RUN_20261005.md`).
- **Correction.** Read-only consumption of the validation verdict (`observe()`), plus two additive
  divergence categories: `recorded-noop` (engineering only) and `validation-blocked`; HYPOTHESES +
  REPAIR_ROUTES added conservatively (always `HUMAN_APPROVAL_REQUIRED`, never AUTO).
- **Write-set.** `runtime/core/self-diagnostic.js`, `runtime/core/self-diagnostic.test.js`.
- **Invariants/gates.** `validation-engine.js` untouched; `PREPARE_NOT_APPLY` preserved; read-only AUDIT
  missions unaffected (no false positive); absent verdict adds nothing; `odg-diagnose.js` untouched.
- **Tests.** `self-diagnostic.test.js` — 29 assertions pass (16 pre-existing + 13 new).
- **Proof.** `node --check` OK; diff confined to the two files.
- **NOT_PROVEN / limits.** No live run; proven via injected/disk verdict fixtures.

## RC-5 — reconcile runtime health with validation verdict (`fefb5cc`)

- **Root cause.** `runtime/core/runtime-model.js` derived `queue/nextMission/lastMission` only from
  `mission-ledger.json` (governance) and never read `mission-report.json`, so Health and Diagnose
  presented disjoint truths.
- **Correction.** `runtime-model` exposes a read-only `lastRun` from `mission-report.json`; `odg-state`
  materialises it into the existing `runtime-state.json`; `odg-health` extracts a pure `render(artifacts)`
  behind `require.main` and ADDS a `Last Run` line + annotates Next Action with the verdict — without
  mutating `queue/provenSet/nextMission`.
- **Write-set.** `runtime/core/runtime-model.js`, `runtime/bin/odg-state.js`, `runtime/bin/odg-health.js`,
  `runtime/core/runtime-model.test.js`, `runtime/core/health-render.test.js` (new).
- **Invariants/gates.** No conflation (governance queue/ledger unchanged; decision: a SUCCESS lastRun
  never removes a mission from nextMission — only the ledger does; Health only annotates); `BLOCKED`
  shown verbatim; no new source of truth; `validation-engine.js` / `mission-ledger.js` untouched.
- **Tests.** `runtime-model.test.js` — 24 assertions pass (incl. SUCCESS/BLOCKED/absent + no-conflation);
  `health-render.test.js` — 12 assertions pass.
- **Proof.** Behaviour-preserving proven: HEAD vs patched `odg-health` produce byte-identical output on
  identical inputs when no verdict is present (mirror-tree comparison). Diff confined to the five files.
- **NOT_PROVEN / limits.** No live run; the `validation-blocked` signal only fires when
  `mission-report.json` exists.

## RC-1 — require stage output before checkpoint done (`099bb7b`)

- **Root cause.** `runtime/bin/odg-run.js` marked a stage `DONE` on subprocess `exit 0` alone (`:149`) —
  DONE meant "exited 0", not "effect exists".
- **Correction.** New pure helper `runtime/core/stage-effect.js` with a `STAGE_OUTPUTS` map (each entry
  verified against the stage that writes it); `odg-run.js` HALTs (`stageFailed` + exit) if a declared
  stage exits 0 without its artefact, before the OK log and `stageDone`.
- **Write-set.** `runtime/bin/odg-run.js`, `runtime/core/stage-effect.js` (new),
  `runtime/core/stage-effect.test.js` (new).
- **Invariants/gates.** Undeclared stages (ProjectContext Engine, Fleet Bridge, Final Report) keep
  `exit 0 => DONE` (no false FAILED); `exit != 0 => FAILED` unchanged; `checkpoint-engine.js` untouched
  (reuses existing `stageDone`/`stageFailed`).
- **Tests.** `stage-effect.test.js` — 10 assertions pass.
- **Proof.** Wiring proven by diff (gate placed after the failure block, before DONE); `node --check` OK.
- **NOT_PROVEN / limits.** This gate is ARTIFACT-EXISTENCE (catches "exit 0 but no output file"),
  complementary to validation's semantic gate; it does NOT catch a RECORDED no-op (the Patch Executor
  still writes its artefact for a no-op — that is validation's / RC-3's domain). `odg-run.js` not run
  live (pipeline execution out of scope); not made require-safe.

## RC-3 — make capability resolution misses explicit (`7b38aba`)

- **Root cause.** `runtime/core/capability-executors.js` `resolve()` returns null when no executor
  matches; `runtime/core/patch-executor.js` default branch then pushed `{status:"RECORDED"}` with NO
  reason — an opaque no-op.
- **Correction (fallback by design).** The status STAYS `"RECORDED"` on purpose — `validation-engine`
  `noRecordedNoOp` (line 77) and `self-diagnostic` `recorded-noop` (line 149) both key on that exact
  status and must keep firing; a rename to e.g. `"UNRESOLVED"` would silence both. For a write-scope
  (engineering) objective an explicit `reason` is attached; a read-only objective stays byte-identical.
- **Write-set.** `runtime/core/patch-executor.js`, `runtime/core/patch-executor.test.js` (new).
- **Invariants/gates.** Both no-op gates preserved (status unchanged); no success fabricated (never
  EXECUTED/APPLIED/DONE); fail-closed preserved; `validation-engine.js` / `self-diagnostic.js` /
  `capability-executors.js` untouched; the 3 intentional NUL bytes of `patch-executor.js` preserved
  (verified 3 before and 3 after the edit).
- **Tests.** `patch-executor.test.js` — 11 assertions pass (black-box: runs the real patch-executor and
  the real validation-engine), including end-to-end proof that validation STILL BLOCKS the engineering
  RECORDED via `noRecordedNoOp`.
- **NOT_PROVEN / limits.** No live AUTONOMY_E2E_LOOP reproduction; TS test
  `src/runtime/validation-engine-recorded-noop.test.ts` not runnable here (no `node_modules`/tsx).

---

## WHAT THIS CAMPAIGN PROVES

Established strictly by the committed deterministic tests and confined diffs above:

- A `FAILED` checkpoint no longer resumes by trusting an unproven `DONE` prefix (RC-2).
- `odg diagnose` can no longer report `NO_DIVERGENCE` while validation is `BLOCKED`, and a `RECORDED`
  engineering no-op is surfaced as a divergence (RC-4).
- The Health dashboard reflects the real last-run verdict without contradicting or conflating the
  governance queue/ledger (RC-5).
- A pipeline stage with a declared output is only `DONE` when that artefact exists and is non-empty
  (RC-1).
- A capability-resolution miss is explicit (reason) for write-scope objectives, while all existing no-op
  gates keep firing (RC-3).
- Preserved throughout: `validation-engine` `noRecordedNoOp` still blocks; no `FAILED`/`BLOCKED` was
  turned into `SUCCESS`; no new source of truth was introduced; the intentional NUL bytes were kept.
- Regression posture: all six RC proof suites green (18 + 29 + 24 + 12 + 10 + 11 assertions); the
  `runtime/core/*.test.js` node sweep is 59 pass / 1 fail, the single failure being the pre-existing
  environmental one below.

## WHAT THIS CAMPAIGN DOES NOT PROVE

- Live end-to-end behaviour of the full pipeline is NOT proven (no complete live run was executed).
- `AUTONOMY_E2E_LOOP` was NOT executed.
- Tests and build that depend on `tsc`/`tsx` are NOT executable in this worktree (`node_modules` absent;
  installation was out of scope).
- `runtime/core/build-recovery-engine.test.js` is a KNOWN pre-existing / environmental failure: it shells
  `npx tsc` / `npm run build`, impossible without `node_modules`; it fails identically on the base and is
  causally isolated from all five write-sets (it is NOT a regression of this campaign).
- No new capability or executor was created (RC-3 kept the honest, explicit BLOCK rather than
  implementing a new executor).
- `origin/main` remains `7ccfcc2` (unchanged). The stabilization branch was pushed to origin. No pull
  request was created. No merge was performed.

## CONVERGENCE CONCLUSION

**CONVERGED — for the proven scope of the five RC.**

Reservation (explicit): this does NOT constitute proof of full live convergence of the entire ODG
autonomy. It certifies only the five audited root causes, each VERIFIED by green deterministic tests
with confined write-sets and preserved gates, then ACCEPTED and COMMITTED on a clean working tree.

## NEXT PHASE — ECONOMIC DISCOVERY (documentary transition only — NOT STARTED)

The next phase is scoped here for continuity only and is **not launched by this document**. It will have
ODG perform a verifiable economic Internet research: real sources, concrete results, identified
opportunities, costs, potential revenue/margins, and genuine execution evidence — all under the existing
governed external-research seam and policy. Nothing of this phase is executed, authorized, or begun here.

---

## ECONOMIC DISCOVERY — TECHNICAL REPAIR LOG (D1–D4) · 2026-10-05 → 2026-10-06

> Appended after closure as the chronological continuation of the "NEXT PHASE — ECONOMIC DISCOVERY"
> section above. TECHNICAL repair trace only (no opportunity list). Facts proven by tests + LIVE runs.
> Not committed at time of writing. "PROVEN" for an opportunity = economically SOURCED & TRACEABLE
> (observed price with provenance) — NOT proven profitability.

### D1 — live acquisition impossible without an injected fetcher
- **Date:** 2026-10-05.
- **Defect:** the single research seam (External Research Acquisition) was dry-run-only in practice.
- **Reproduction:** executor run with `execute:true` + policy enabled + allowlist, no injected fetcher ⇒ `BLOCKED: no fetcher injected`; default ⇒ `mode DRY_RUN, acquired:false` (zero network).
- **Root cause:** live path required an injected fetcher function; none available on the disk path.
- **Files touched:** `runtime/core/governed-web-fetch.js` (NEW), `runtime/core/capability-executors.js` (MODIFIED: `resolveFetcher` last-resort built-in).
- **Repair:** governed built-in client used as last-resort fetcher inside the already-passed LIVE gates.
- **Tests:** `external-research-live.test.js` (9).
- **LIVE proof:** real GET `https://example.com` ⇒ 200 via the seam.
- **Before/after:** before `acquired:false` (dry-run only) → after `acquired:true` (LIVE_BUILTIN).
- **Remaining limits:** none for acquisition reachability itself.
- **State:** RESOLVED (VERIFIED, uncommitted).

### D2 — a fetcher function cannot survive JSON transport
- **Date:** 2026-10-05.
- **Defect:** a disk-driven JSON mission cannot carry a function, so live acquisition was unreachable.
- **Reproduction:** `typeof JSON.parse(JSON.stringify({fetch:()=>{}})).fetch === "function"` ⇒ **false**.
- **Root cause:** only an injected function enabled live; JSON transport drops functions.
- **Files touched:** `runtime/core/capability-executors.js` (MODIFIED), `runtime/core/governed-web-fetch.js` (NEW, synchronous facade via the existing subprocess pattern).
- **Repair:** the built-in client needs no injected function ⇒ a JSON-only mission reaches real network.
- **Tests:** `external-research-live.test.js` case G (JSON transport) + B/H.
- **LIVE proof:** a JSON round-tripped mission (`typeof fetch === undefined`) acquired LIVE through the seam.
- **Before/after:** before disk mission ⇒ forced dry-run → after disk mission ⇒ real LIVE acquisition.
- **Remaining limits:** none.
- **State:** RESOLVED (VERIFIED, uncommitted).

### D3 — no built-in HTTP research client
- **Date:** 2026-10-05.
- **Defect:** `runtime/core` had no governed outbound HTTP client for research (only a local-LLM `fetch`).
- **Reproduction:** grep of `runtime/core/*.js` found no research HTTP client; reachability ≠ research by design.
- **Root cause:** deliberate "no built-in network client" design; egress itself proven available (DNS + HTTPS HEAD example.com=200, api.github.com=403).
- **Files touched:** `runtime/core/governed-web-fetch.js` (NEW).
- **Repair:** governed synchronous HTTPS client — https-only, 8s timeout, 1 MiB cap, NO redirect-follow (minimal SSRF guard), honest UA, no secrets.
- **Tests:** `external-research-live.test.js` (A network-unavailable fail-closed; C non-https refused; E unverified-citation fail-closed).
- **LIVE proof:** direct client — example.com 200/577B; `http://` refused (status 0); bad host ⇒ ENOTFOUND (status 0, fail-closed).
- **Before/after:** before no client → after governed client, gates (authorization/policy/allowlist/2xx-only/citation-verified) unchanged.
- **Remaining limits:** sequential (one request per source); no distributed rate-limiter.
- **State:** RESOLVED (VERIFIED, uncommitted).

### D4 — acquisition possible but no OBSERVED economic extraction
- **Date:** 2026-10-06.
- **Defect:** the seam stored provenance (hash/date/status) but discarded the body ⇒ zero observed economic value.
- **Reproduction:** seam run on a primary JSON price source ⇒ evidence had `sources` (provenance only), no observed value.
- **Root cause:** no extractor; opportunity figures were never derived from acquired bytes.
- **Files touched:** `runtime/core/economic-extractor.js` (NEW), `runtime/core/opportunity-policy.js` (NEW), `runtime/core/capability-executors.js` (MODIFIED: in-loop extraction over the SAME bytes + opportunity classification into evidence), `runtime/core/economic-extractor.test.js` (NEW), `runtime/core/opportunity-policy.test.js` (NEW), `runtime/core/economic-discovery-live.test.js` (NEW).
- **Repair:** DETERMINISTIC declared-rule extractor (json pointer / regex; exact decimal→minor, no float, over-precision ⇒ UNKNOWN; malformed rule ⇒ throw) reusing `economic-unit`; minimal opportunity policy OBSERVED/CALCULATED/INFERRED/UNKNOWN → PROVEN/CANDIDATE/REJECTED with the full chain OPPORTUNITY→EVIDENCE→SOURCE→URL→DATE→OBSERVATION→CALCULATION→VERIFICATION_STATUS.
- **Tests:** `economic-extractor.test.js` (11), `opportunity-policy.test.js` (10), `economic-discovery-live.test.js` (6); existing seam tests still green (capability-executors 31, external-research-transport 7, capability-probes 27); full core sweep 63 PASS / 1 FAIL.
- **LIVE proof:** real pass through the seam over 4 primary JSON sources (Coinbase BTC/ETH spot, Bitstamp btcusd, Kraken XBTUSD), all 200; 5 OBSERVED USD prices (dated 2026-10-06, sha256); 2 CALCULATED cross-exchange spreads (labeled DERIVED, "not realized"); result = 3 PROVEN / 0 CANDIDATE / 0 REJECTED / 0 fabricated; evidence `runtime/generated/external-research-acquisition.json` (gitignored).
- **Before/after:** before provenance-only (no observed value) → after OBSERVED economic values + classified opportunities with full chain.
- **Remaining limits:** the 3 PROVEN are OBSERVED prices + 1 dispersion SIGNAL — **NOT proven profitability**; realizable arbitrage is INFERRED/conditional (fees/withdrawal/latency/slippage UNKNOWN, none observed); paired cost↔sell marketplaces (true margin) not deterministically extractable here (JS-rendered/anti-bot); volume is 3 real (not forced to 100).
- **State:** RESOLVED (VERIFIED, uncommitted).

### Files added / modified by Economic Discovery (uncommitted at time of writing)
- NEW: `runtime/core/governed-web-fetch.js`, `runtime/core/external-research-live.test.js`, `runtime/core/economic-extractor.js`, `runtime/core/opportunity-policy.js`, `runtime/core/economic-extractor.test.js`, `runtime/core/opportunity-policy.test.js`, `runtime/core/economic-discovery-live.test.js`.
- MODIFIED: `runtime/core/capability-executors.js` (built-in fetcher last-resort + acquisitionMode tag; in-loop OBSERVED extraction + opportunity classification in evidence).
- EVIDENCE (gitignored, not a deliverable): `runtime/generated/external-research-acquisition.json`.

### Outcome
ECONOMIC DISCOVERY acquisition + extraction capability is functional and LIVE-proven; D1–D4 resolved in the authorized write-set. Economic result really produced = 3 PROVEN observations/signal (sourced, dated, hashed, chained), 0 fabricated. This is NOT a claim of realized profit or full live convergence of ODG autonomy.
