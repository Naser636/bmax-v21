# ODG_DASHBOARD_RECOVERY_FINAL_CONVERGENCE_AND_VPS_HANDOFF_V1 — Closure Report + VPS Handoff

**Attempt ID:** `DASHBOARD_RECOVERY_VPS_HANDOFF_V1#2026-10-20`. **Date:** 2026-10-20.
**Dashboard verdict: CORRIGÉ ET TESTÉ LOCALEMENT — VPS NON VALIDÉ** (current build serves health 200 + root 200 in isolation; the live service serves a stale build — a service restart remains, host-gated). No code defect found. No destructive op; 5 stashes intact; no repo code change (nothing bounded to fix).

## Phase 1 — Truth Lock
HEAD `65a4432`, branch `main` synced with `origin/main`, worktree CLEAN, **5 stashes intact**, protected paths untouched.

## Phase 2 — Dashboard diagnostic (evidence-based)
**Components present + healthy (repo-local):** entry `src/app/page.tsx`; API routes `/api/{health,intake,runtime-state}`; `next.config.ts` `output:"standalone"`; build artifacts on disk (`.next/BUILD_ID=RviAr6-bRalxYte7tQkv2`, `.next/standalone/server.js`); `src/app` tsc **0 errors**; `next build` was EXIT 0 (prior session).
**Live service:** loopback `127.0.0.1:3000` → `/api/health` **HTTP 200** (served by `next-server` pid 3970445). The dashboard is UP.
**Root cause (classified = PROCESS/SERVICE-STATE, not code/build/config/route):** **runtime-identity DRIFT** — the running process serves build **F8Uf38BKvKk1rrhCwhLqr** while on-disk is **RviAr6-bRalxYte7tQkv2** (`scripts/runtime-identity-check.js`). The long-running `odg-preprod.service` process predates the latest `next build`, so it serves a stale version. The on-disk standalone is internally consistent (`.next` BUILD_ID == `.next/standalone/.next` BUILD_ID == RviAr6).
**Local fix verification (non-destructive, isolated — did NOT touch :3000):** started the **current** standalone build on a transient loopback `:3999` with a temp `ODG_CLIENT_STORE` → `/api/health` **HTTP 200** `{status:"ready",storage:"READY",buildId:"RviAr6…"}` + root `/` **HTTP 200**; stopped cleanly; live `:3000` still HTTP 200. **⇒ the current build is healthy and deployable.**
**Separation (as required):**
- **Correction locale vérifiée:** current build serves 200 (health + root) in isolation; code compiles; no code defect.
- **Validation VPS NON effectuée:** the live `:3000` still serves the stale build.
- **Action VPS exacte restante:** redeploy/restart `odg-preprod.service` so it serves the current `.next/standalone` (rebuild + copy static assets + restart) — a **service restart**, forbidden here without separate authorization.
- **Test de succès après l'action:** `node scripts/runtime-identity-check.js` → no DRIFT (served == disk) **and** `curl -s http://127.0.0.1:3000/api/health` → `buildId:"RviAr6…"` (current).

## Phase 3 — JavaScript retirement (re-verified, not assumed)
`node scripts/odg-rollback-inventory.cjs` at HEAD → exit 0, **0 `.js` removable** (unchanged); **A3 off-host backup still UNSET (HOST-BLOCKED)**; no D5 manifest/CTO auth. **No deletion authorized; rollback PRESERVED.** No external-migration demo re-run (superseded by the convergence mandate). Situation unchanged vs `65a4432`.

## Phase 4 — Other open technical lots
- **fleet-stage B2** — env-BLOCKED by the live `fleet-bridge.service` (background process breaks the hermetic spawn test); not a code fix.
- **`per-dual-coverage.json`** — **no generator script exists** in the repo ⇒ not regenerable in the current environment; minor evidence gap (primary coverage evidence = the classifier re-run + the equivalence benches).
- **21-module equivalence closure** — RESOLVED prior session (`final-report` bench PASSES at 21; stale comment fixed at `65a4432`).
- **build / strict tsc / contracts / cross-runtime parity / recovery / false-success gates** — green at HEAD (prior audits `dfbde91`); no change/risk ⇒ not needlessly re-run.
- **No bounded code defect** remains to fix this mission.

## Phase 5 — Governance & limits
Provider spend-safe (no `ANTHROPIC_API_KEY`, `CLAUDECODE` session, no paid API) and not needed. No service restart / sudo / systemd / port / firewall / proxy / DNS / TLS / secret / deploy performed. Human/host blockers are stated as precise actions below (none is a mislabeled technical task).

## Phase 6 — Validation (exit codes verified)
`runtime-identity-check` (DRIFT, exit as-is); transient current-build serve → health+root 200; `src/app` tsc 0; classifier exit 0 (0 removable); live :3000 health 200 before+after (untouched). No repo code changed ⇒ full green suites not repeated (per mandate).

## Phase 7 — VPS HANDOFF (read-only first; real names only)
1. **Git:** HEAD `65a4432`, `main` synced with `origin/main`, clean, 5 stashes.
2. **Dashboard:** cause = runtime-identity DRIFT (stale served build); files corrected = none (code healthy; only a stale comment fixed last session); tests = transient current-build serve health+root 200 (local), live :3000 health 200; **local = healthy/deployable, VPS = stale-serving (restart pending)**.
3. **Expected URL/port (proven by config + live probe):** `http://127.0.0.1:3000` (loopback only) — routes `/`, `/api/health`, `/api/intake`, `/api/runtime-state`. **No public URL/DNS/TLS** (not provisioned).
4. **VPS verification sequence — READ-ONLY FIRST:**
   - `curl -s http://127.0.0.1:3000/api/health` → expect 200 + `buildId`.
   - `node scripts/runtime-identity-check.js` → currently DRIFT (served F8Uf38 ≠ disk RviAr6).
   - `systemctl status odg-preprod.service` (or `systemctl --user status odg-preprod.service` per install) → confirm ACTIVE + its working dir (`.next/standalone`) — **read-only**.
   - `cat .next/BUILD_ID` and `cat .next/standalone/.next/BUILD_ID` → confirm both current.
5. **Actions requiring authorization/host access (ISOLATED — do NOT run without separate CTO/host authorization):**
   - rebuild + refresh standalone: `npm run build` then copy `public` + `.next/static` into `.next/standalone` (DEPLOYMENT.md §1).
   - **restart the service:** `systemctl restart odg-preprod.service` (service restart — gated).
   - post-restart success test: `runtime-identity-check` → no DRIFT **and** `curl :3000/api/health` → `buildId` == current on-disk `.next/BUILD_ID`.
6. **A3 / JS inventory:** A3 off-host backup = UNSET (HOST-BLOCKED) — keystone before any JS retirement; JS inventory = 125 duals, **0 removable**, rollback load-bearing & preserved; each remaining `.js` blocked by (still-consumed rollback + A3). 
7. **Technical lots:** dashboard (local-fixed/VPS-pending), JS-retire (A3-blocked), fleet-stage B2 (env/fleet-bridge), per-dual-coverage (no generator). All others green.
8. **Tests/commands/exit codes:** as in Phases 2–6 (classifier exit 0; transient serve 200; src/app tsc 0).
9. **Commits/push:** this closure report + compass update (documentary); no code commit (nothing bounded to fix).
10. **Time/cost:** ODG-active ≈ one bounded diagnostic session; wait ≈ negligible (no heavy build/test this mission); elapsed ≈ same; **direct cost = none measured** (subscription session, no paid API). No fabricated figures.
11. **Next precise action:** on the VPS, run the read-only sequence (item 4); if DRIFT confirmed, perform the authorized rebuild+restart (item 5) and verify with the success test. That is the ONLY step to move the dashboard from "local-healthy" to "VPS-current".

## Stop condition — met
Feasible authorized technical work is closed (dashboard diagnosed + local-verified; JS re-verified; lots reconciled); no bounded code defect remains; remaining actions are precisely-documented host/human steps (service restart for the dashboard; A3 off-host backup for JS retirement; isolated env for fleet-stage B2). Compass + registers reflect the evidence.

## Verdict
- **Dashboard: CORRIGÉ ET TESTÉ LOCALEMENT** (current build serves health+root 200 in isolation; no code defect) — **VPS NON VALIDÉ** (live service serves a stale build; restart pending, host-gated).
- **JS retirement: BLOCKED at A3 (HOST)**, 0 removable, rollback preserved.
- **Other lots:** closed or genuinely host/env-blocked.

**STOP.** Awaiting the next VPS session; no new campaign launched; no deployment / service change / destructive op.
