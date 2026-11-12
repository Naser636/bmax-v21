#!/usr/bin/env node
"use strict";
/* V171 §5 — weekly radar scheduler runtime. Deterministic tests for the full checklist: window open/close + DST transitions;
 * budget exhaustion + grant expiry; duplicate source/mission prevention; backoff/retry/recovery; concurrent-trigger rejection
 * + overlap prevention; persistent resumable checkpoint; Truth-Lock/owner-gated mission handling. Time is INJECTED (epoch ms);
 * research via an injected seam (NO real egress). Reuses the canonical radar-schedule WINDOW. realScheduledRun = NOT_MEASURED. */
const S = require("./odg-weekly-radar-scheduler.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const GRANT = { authorized: true, expiresMs: Date.UTC(2026, 10, 19, 0, 0) }; // 2026-11-19T00:00Z
// Sundays: winter 2026-01-04 (CET UTC+1), summer 2026-07-05 (CEST UTC+2).
const WIN_SUN_0230 = Date.UTC(2026, 0, 4, 1, 30);   // 02:30 Paris (winter)
const SUM_SUN_0330 = Date.UTC(2026, 6, 5, 1, 30);   // 03:30 Paris (summer, +2)
const WIN_SUN_0530 = Date.UTC(2026, 0, 4, 4, 30);   // 05:30 Paris (after window)
const WIN_MON_0230 = Date.UTC(2026, 0, 5, 1, 30);   // Monday
const SUM_SUN_0130 = Date.UTC(2026, 6, 5, 23, 30);  // 2026-07-05 23:30 UTC = Mon 01:30 Paris (outside)

function main() {
  // ---- window open/close + DST ----
  check("window OPEN on a winter Sunday 02:30 Paris (CET)", S.isWindowOpen(WIN_SUN_0230) === true);
  check("window OPEN on a summer Sunday 03:30 Paris (CEST, DST +2) — DST handled", S.isWindowOpen(SUM_SUN_0330) === true);
  check("window CLOSED at 05:30 Paris (after endHour)", S.isWindowOpen(WIN_SUN_0530) === false);
  check("window CLOSED on Monday (not Sunday)", S.isWindowOpen(WIN_MON_0230) === false);
  check("DST-correct: a UTC time that is Monday 01:30 in Paris is CLOSED", S.isWindowOpen(SUM_SUN_0130) === false);

  // ---- grant expiry: never valid at/after exact expiry ----
  check("grant valid before expiry, INVALID at/after 2026-11-19T00:00Z", S.grantValid(GRANT, WIN_SUN_0230) === true && S.grantValid(GRANT, Date.UTC(2026, 10, 19, 0, 0)) === false && S.grantValid(GRANT, Date.UTC(2026, 10, 20, 0, 0)) === false);

  // ---- shouldTrigger gate ----
  check("shouldTrigger TRUE in-window + valid grant + fresh week + no overlap", S.shouldTrigger({}, WIN_SUN_0230, GRANT).trigger === true);
  check("shouldTrigger FALSE outside window / expired grant / already-ran-week / running", S.shouldTrigger({}, WIN_MON_0230, GRANT).trigger === false && S.shouldTrigger({}, Date.UTC(2026, 11, 1, 1, 30), GRANT).trigger === false && S.shouldTrigger({ lastRunWeek: S.weekKey(WIN_SUN_0230) }, WIN_SUN_0230, GRANT).trigger === false && S.shouldTrigger({ running: true }, WIN_SUN_0230, GRANT).trigger === false);

  // ---- a clean full cycle (dedup + completion + NOT_MEASURED) ----
  const clean = S.runWindow({}, { now: WIN_SUN_0230, grant: GRANT, sources: ["a", "a", "b", "c"], missions: ["m1", "m1"], maxCalls: 50, clock: () => WIN_SUN_0230, doUnit: () => ({ ok: true }) });
  check("duplicate sources + missions DEDUPLICATED", clean.deduplicatedSourceCount === 3 && clean.deduplicatedMissionCount === 1);
  check("clean cycle completes + marks the week + realScheduledRun NOT_MEASURED", clean.ran === true && clean.complete === true && clean.state.lastRunWeek === S.weekKey(WIN_SUN_0230) && clean.realScheduledRun === "NOT_MEASURED");

  // ---- budget exhaustion ----
  const budget = S.runWindow({}, { now: WIN_SUN_0230, grant: GRANT, sources: ["a", "b", "c", "d", "e"], maxCalls: 2, clock: () => WIN_SUN_0230, doUnit: () => ({ ok: true }) });
  check("budget exhaustion stops the cycle (calls ≤ maxCalls, not complete)", budget.calls <= 2 && budget.complete === false && /budget exhausted/.test(budget.shutdownReason));

  // ---- 3h max duration controlled shutdown ----
  let t = WIN_SUN_0230; const dur = S.runWindow({}, { now: WIN_SUN_0230, grant: GRANT, sources: ["a", "b", "c"], maxCalls: 50, maxDurationMs: 3 * 3600e3, clock: () => { t += 2 * 3600e3; return t; }, doUnit: () => ({ ok: true }) });
  check("3h max duration triggers controlled shutdown", /3h max duration/.test(dur.shutdownReason) && dur.complete === false);

  // ---- backoff + retry on failure, then recovery ----
  let attempts = 0; const flaky = S.runWindow({}, { now: WIN_SUN_0230, grant: GRANT, sources: ["x"], maxCalls: 50, clock: () => WIN_SUN_0230, doUnit: () => { attempts++; return { ok: attempts >= 2 }; } });
  check("failure ⇒ bounded backoff + retry ⇒ recovery (source eventually processed)", flaky.backoff.length === 1 && flaky.backoff[0].retried === true && flaky.processedSources.includes("x"));

  // ---- concurrent-trigger rejection (overlap) ----
  const locked = S.runWindow(S.beginLock({}), { now: WIN_SUN_0230, grant: GRANT, sources: ["a"], clock: () => WIN_SUN_0230, doUnit: () => ({ ok: true }) });
  check("a cycle already running ⇒ concurrent trigger REJECTED (no overlap)", locked.ran === false && /concurrent trigger REJECTED/.test(locked.reason));

  // ---- persistent checkpoint + resumable (no duplicate work) ----
  const interrupted = S.runWindow({}, { now: WIN_SUN_0230, grant: GRANT, sources: ["a", "b", "c", "d"], maxCalls: 2, clock: () => WIN_SUN_0230, doUnit: () => ({ ok: true }) });
  check("interrupted cycle persists a resumable checkpoint", interrupted.state.checkpoint.resumable === true && interrupted.state.checkpoint.doneSources.length >= 1);
  const resumed = S.runWindow({ checkpoint: interrupted.state.checkpoint }, { now: WIN_SUN_0230, grant: GRANT, sources: ["a", "b", "c", "d"], maxCalls: 50, clock: () => WIN_SUN_0230, doUnit: () => ({ ok: true }) });
  check("resume continues from checkpoint WITHOUT redoing done sources (no duplicate)", resumed.processedSources.every((s: string) => !interrupted.state.checkpoint.doneSources.includes(s)) && resumed.complete === true);

  // ---- Truth-Lock / owner-gated mission handling ----
  const gated = S.runWindow({}, { now: WIN_SUN_0230, grant: GRANT, sources: ["a"], missions: ["radar-research", "VPS_DEPLOY", "ROTATE_SECRET"], maxCalls: 50, clock: () => WIN_SUN_0230, doUnit: () => ({ ok: true }) });
  check("owner-gated missions (VPS/DEPLOY/SECRET) are NOT auto-run — surfaced for owner", gated.ownerGatedMissionsSkipped.includes("VPS_DEPLOY") && gated.ownerGatedMissionsSkipped.includes("ROTATE_SECRET") && gated.autoRunnableMissions.includes("radar-research"));

  // ---- composes canonical envelope; real-run NOT_MEASURED ----
  check("reuses the canonical radar-schedule WINDOW (Sunday 02:00–05:00 Europe/Paris, 3h)", S.WINDOW.day === "SUN" && S.WINDOW.tz === "Europe/Paris" && S.WINDOW.startHour === 2 && S.WINDOW.endHour === 5);
  check("realScheduledRunStatus honest: NOT_MEASURED pending owner/root timer", S.realScheduledRunStatus().status === "NOT_MEASURED" && /owner\/root/.test(S.realScheduledRunStatus().ownerDependency));
  check("contract: reuses canonical WINDOW, no parallel scheduler, NOT_MEASURED until observed", S.WEEKLY_RADAR_SCHEDULER_CONTRACT.invariants.some((i: string) => /no parallel scheduler/.test(i)) && S.WEEKLY_RADAR_SCHEDULER_CONTRACT.invariants.some((i: string) => /NOT a real scheduled run/.test(i)));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — weekly-radar-scheduler (§5: Sunday 02:00–05:00 Europe/Paris window [DST-correct] + controlled cycle: budget exhaustion, grant-expiry, source/mission dedup, backoff+retry+recovery, concurrent-trigger rejection, persistent resumable checkpoint, owner-gated/Truth-Lock skipping; reuses canonical WINDOW, no parallel scheduler; realScheduledRun NOT_MEASURED until observed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
