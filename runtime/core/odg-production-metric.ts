#!/usr/bin/env node
"use strict";
/*
 * V17.5 (owner CTO directive 2026-11-24, PRIORITY 5 « Mesure de production vérifiée, par mission ») — PRODUCTION METRIC.
 * PURE, deterministic, READ-ONLY. Per mission: results really produced; outputs accepted (merged + independently
 * inspected); time consumed; cost available vs really engaged; share built by ODG (GO-dispatched steps, ODG-written files)
 * vs share supplied by agents (provider-authored commits / lines). Plus, per PR, where the wall time went between PR open,
 * CI and merge (build vs verify vs wait — directive §7).
 *
 * HONESTY:
 *   - Everything not recorded is NOT_MEASURED with a reason — never 0, never estimated. In particular: provider (Claude
 *     Code) token / € consumption is not recorded anywhere in the repository ⇒ NOT_MEASURED; no € budget field exists in
 *     the contracts ⇒ costAvailableEur NOT_MEASURED (compute caps are reported when the contract declares them).
 *   - €0 native cost is reported ONLY with its source (the GO STRATEGY step's own rationale "NATIVE (€0)").
 *   - The inspection VERDICT time is not recorded (inspections run in separate sessions; PRs carry no review / comment) ⇒
 *     NOT_MEASURED. A commit whose subject names an inspection finding gives an UPPER BOUND ("a verdict existed before").
 *   - "Native" lines = lines ODG's GO-dispatched run wrote (the DISPATCHED writeSet) and that were merged. They are evidence
 *     DATA, not code: native-built CODE lines are reported separately (0 unless a writeSet path is code).
 *   - Pre-PR build time is NOT_MEASURED (the work start is not recorded; the first commit time is only an upper bound).
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function ms(a: any, b: any): number | null { const x = Date.parse(String(a)), y = Date.parse(String(b)); return Number.isFinite(x) && Number.isFinite(y) ? y - x : null; }
function nm(reason: string): any { return { status: "NOT_MEASURED", reason }; }
function r4(n: number): number { return Number(n.toFixed(4)); }
function median(xs: number[]): number | null { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
const CODE_PATH = /^(runtime|src|scripts|site)\/.*\.(ts|tsx|js|mjs|cjs)$/;
const INSPECTION_SUBJECT = /inspection/i;

/* traceSummary(events) — what a GO EXECUTE trace says about one cycle (first CYCLE_END only: a trace may repeat it). */
function traceSummary(events: any): any {
  const ev = arr(events).filter(isObj);
  const start = ev.find((e: any) => e.kind === "CYCLE_START");
  const end = ev.find((e: any) => e.kind === "CYCLE_END");
  const steps = ev.filter((e: any) => e.kind === "STEP");
  const exec = steps.find((e: any) => e.step === "EXECUTE");
  const strat = steps.find((e: any) => e.step === "STRATEGY");
  const disp = ev.filter((e: any) => e.kind === "DISPATCHED");
  const stop = ev.find((e: any) => e.kind === "STOP");
  const rationale = strat && strat.decision ? String(strat.decision.rationale || "") : "";
  return {
    runId: disp.length ? disp[0].runId : null,
    startedAt: start ? start.startedAt : null, endedAt: end ? end.endedAt : null,
    cycleMs: end && isNum(end.durationMs) ? end.durationMs : nm("no CYCLE_END.durationMs"),
    executeStepMs: exec ? ms(exec.startedAt, exec.endedAt) : null,
    cycleStatus: end ? end.status : null, stop: stop ? { beforeStep: stop.beforeStep, reason: stop.reason } : null,
    goSteps: steps.map((e: any) => `${e.step}:${e.status}`),
    dispatchCalls: end && isNum(end.dispatchCalls) ? end.dispatchCalls : disp.length,
    providerLaunched: end && isNum(end.providerLaunched) ? end.providerLaunched : null,
    dispatchedMissions: disp.map((d: any) => d.mission),
    writeSet: Array.from(new Set(disp.flatMap((d: any) => arr(d.dispatchTarget && d.dispatchTarget.writeSet)))).sort(),
    strategyMode: strat && strat.decision ? strat.decision.mode || null : null,
    nativeEurFromTrace: /NATIVE \(€0\)/.test(rationale) ? 0 : null,
    strategyRationale: rationale || null,
  };
}

/* prTimeline(pr) — wall-time split for one PR (latest CI run in the snapshot). */
function prTimeline(pr: any): any {
  const p = isObj(pr) ? pr : {};
  const commits = arr(p.commits).slice().sort((a: any, b: any) => String(a.committedDate).localeCompare(String(b.committedDate)));
  const first = commits[0], last = commits[commits.length - 1];
  const checks = arr(p.checks).filter((c: any) => c && c.startedAt && c.completedAt);
  const ciStart = checks.length ? checks.map((c: any) => c.startedAt).sort()[0] : null;
  const ciEnd = checks.length ? checks.map((c: any) => c.completedAt).sort().slice(-1)[0] : null;
  const insp = commits.filter((c: any) => INSPECTION_SUBJECT.test(String(c.messageHeadline || "")));
  return {
    number: p.number, state: p.state, title: p.title || null,
    openedAt: p.createdAt || null, mergedAt: p.mergedAt || null,
    commits: commits.length,
    firstCommitToOpenMs: first ? ms(first.committedDate, p.createdAt) : null,
    preOpenBuildMs: nm("work start not recorded; first commit time is only an upper bound on when building ended for the first commit"),
    openToLastCommitMs: last ? Math.max(0, ms(p.createdAt, last.committedDate) || 0) : null,
    lastCommitToCiStartMs: last && ciStart ? ms(last.committedDate, ciStart) : null,
    ciMs: ciStart && ciEnd ? ms(ciStart, ciEnd) : nm("no completed check run in the snapshot"),
    ciConclusion: checks.length ? checks.map((c: any) => c.conclusion).join(",") : null,
    ciEndToMergeMs: ciEnd && p.mergedAt ? ms(ciEnd, p.mergedAt) : (p.mergedAt ? nm("no completed check run") : nm(`not merged (${p.state})`)),
    openToMergeMs: p.mergedAt ? ms(p.createdAt, p.mergedAt) : nm(`not merged (${p.state})`),
    inspectionVerdictAt: nm("inspection verdicts are not recorded on the PR (no review/comment); see inspectionFindingCommits for an upper bound"),
    inspectionFindingCommits: insp.map((c: any) => ({ sha: String(c.oid).slice(0, 8), committedDate: c.committedDate, headline: c.messageHeadline, verdictExistedBefore: c.committedDate })),
    reviewCount: arr(p.reviews).length, commentCount: arr(p.comments).length,
  };
}

/* splitLines(commits, nativePaths) — additions by provider-authored commits, split by whether the file was ODG-written. */
function splitLines(commits: any, nativePaths: string[]): any {
  const nat = new Set(nativePaths);
  let nativeLines = 0, nativeCode = 0, providerLines = 0, providerCommits = 0, otherCommits = 0;
  const nativeFiles = new Set<string>();
  for (const c of arr(commits)) {
    if (c.providerTrailer) providerCommits++; else otherCommits++;
    for (const f of arr(c.files)) {
      if (!isNum(f.add)) continue;
      if (nat.has(f.path)) { nativeLines += f.add; nativeFiles.add(f.path); if (CODE_PATH.test(f.path)) nativeCode += f.add; }
      else providerLines += f.add;
    }
  }
  const total = nativeLines + providerLines;
  return { commits: arr(commits).length, providerAuthoredCommits: providerCommits, nonProviderCommits: otherCommits,
    nativeWrittenLinesMerged: nativeLines, nativeWrittenFiles: Array.from(nativeFiles).sort(), nativeCodeLinesMerged: nativeCode,
    providerLinesMerged: providerLines, nativeLineShare: total ? r4(nativeLines / total) : null,
    note: "native = additions to files in the GO DISPATCHED writeSet (ODG-written evidence data, committed by the provider); provider = every other added line; the git author of every commit is the shared 'ODG Runtime' identity, so a Claude Co-Authored-By trailer is the only authorship signal; nonProviderCommits = commits WITHOUT that trailer (authorship not attributable from git — not evidence of ODG authorship)" };
}

/**
 * measureProduction({ missions, prs, windowPrs }) — missions: [{ id, experiment:{ path, outcome, sha256, run }, results,
 *   validation:{ present, grade, bound, inspectionVerdict, inspectedPr }, trace (events|null), tracePath, caps,
 *   experimentPr, validationPr, prCommits:{ [pr]: commits[] } }]; prs: snapshot rows; windowPrs: [from, to].
 */
function measureProduction(input: any): any {
  const inp = isObj(input) ? input : {};
  const prs = arr(inp.prs).slice().sort((a: any, b: any) => a.number - b.number);
  const prBy: any = {}; for (const p of prs) prBy[p.number] = p;
  const missions = arr(inp.missions).filter(isObj).map((m: any) => {
    const t = m.trace ? traceSummary(m.trace) : null;
    const ePr = m.experimentPr ? prBy[m.experimentPr] : null, vPr = m.validationPr ? prBy[m.validationPr] : null;
    const nativePaths = t ? t.writeSet : [];
    const scopeCommits = [...arr(m.prCommits && m.prCommits[m.experimentPr]), ...arr(m.prCommits && m.prCommits[m.validationPr])];
    const v = isObj(m.validation) ? m.validation : {};
    const accepted = !!(ePr && ePr.mergedAt) && v.inspectionVerdict === "ACCEPT";
    return {
      id: m.id,
      resultsProduced: { record: m.experiment.path, recordSha256: m.experiment.sha256, outcome: m.experiment.outcome, detail: m.results || null },
      outputsAccepted: {
        accepted, merged: !!(ePr && ePr.mergedAt), experimentPr: m.experimentPr || null, experimentMergedAt: ePr ? ePr.mergedAt : null,
        inspection: v.present ? { verdict: v.inspectionVerdict || null, inspectedPr: v.inspectedPr || null, source: v.source } : nm("no VALIDATE_CRITERIA record yet ⇒ the independent inspection verdict of the experiment result is not recorded"),
        validatedGrade: v.present ? v.grade : "PENDING", validationBoundToExperiment: v.present ? v.bound === true : null,
        validationPr: m.validationPr || null, validationMergedAt: vPr ? vPr.mergedAt : null,
      },
      time: {
        goCycleMs: t ? t.cycleMs : nm("not GO-dispatched (no GO trace) — the run was executed by the provider session"),
        executeStepMs: t ? t.executeStepMs : nm("no GO trace"),
        recordRunMs: m.experiment.run && m.experiment.run.startedAt && m.experiment.run.finishedAt ? ms(m.experiment.run.startedAt, m.experiment.run.finishedAt) : nm("experiment record carries no run start/finish time"),
        goStop: t ? t.stop : null,
        runEndToExperimentPrOpenMs: t && t.endedAt && ePr ? ms(t.endedAt, ePr.createdAt) : nm(t ? "experiment PR not in snapshot" : "no GO trace end time"),
        experimentPrOpenToMergeMs: ePr && ePr.mergedAt ? ms(ePr.createdAt, ePr.mergedAt) : nm("experiment PR not merged / not in snapshot"),
        experimentMergeToValidationMergeMs: ePr && vPr && ePr.mergedAt && vPr.mergedAt ? ms(ePr.mergedAt, vPr.mergedAt) : nm("validation not merged yet"),
        runEndToClosureMs: t && t.endedAt && vPr && vPr.mergedAt ? ms(t.endedAt, vPr.mergedAt) : nm(t ? "validation not merged yet" : "no GO trace end time"),
      },
      cost: {
        costAvailableEur: nm("no € budget field in the contract"),
        computeCaps: m.caps || null,
        nativeEngagedEur: t && t.nativeEurFromTrace === 0 ? { value: 0, source: `${m.tracePath}#STEP[STRATEGY].decision.rationale: ${t.strategyRationale}` } : nm(t ? "STRATEGY rationale does not state NATIVE (€0)" : "not GO-dispatched — no ODG strategy record"),
        providerEngagedEur: nm("provider (Claude Code) token / € consumption is not recorded in the repository"),
        localModelCalls: isNum(m.results && m.results.modelCallsTotal) ? m.results.modelCallsTotal : nm("no model calls recorded by the experiment record"),
        providerCallsByGo: t ? t.providerLaunched : nm("no GO trace"),
      },
      share: {
        builtByOdg: t ? { goDispatched: true, runId: t.runId, goSteps: t.goSteps, dispatchCalls: t.dispatchCalls, odgWrittenFiles: t.writeSet, source: m.tracePath } : { goDispatched: false, goSteps: [], dispatchCalls: 0, note: "the experiment command was run by the provider session (record run has no GO dispatch)" },
        lines: splitLines(scopeCommits, nativePaths),
        linesScope: `commits of the experiment PR #${m.experimentPr || "?"}${m.validationPr ? ` and the validation PR #${m.validationPr}` : ""} (the runner, contract and inspection PRs are not attributed to one mission)`,
      },
    };
  });

  const [lo, hi] = arr(inp.windowPrs).length === 2 ? inp.windowPrs : [0, Infinity];
  const timeline = prs.filter((p: any) => p.number >= lo && p.number <= hi).map(prTimeline);
  const merged = timeline.filter((t: any) => isNum(t.openToMergeMs));
  const sum = (k: string) => merged.reduce((a: number, t: any) => a + (isNum(t[k]) ? t[k] : 0), 0);
  const total = sum("openToMergeMs");
  const agg = {
    prs: timeline.length, merged: merged.length, notMerged: timeline.filter((t: any) => !isNum(t.openToMergeMs)).map((t: any) => `#${t.number} ${t.state}`),
    totalOpenToMergeMs: total, medianOpenToMergeMs: median(merged.map((t: any) => t.openToMergeMs)),
    medianCiMs: median(merged.filter((t: any) => isNum(t.ciMs)).map((t: any) => t.ciMs)),
    medianOpenToLastCommitMs: median(merged.map((t: any) => t.openToLastCommitMs).filter(isNum)),
    medianCiEndToMergeMs: median(merged.map((t: any) => t.ciEndToMergeMs).filter(isNum)),
    longestOpenToMerge: merged.length ? merged.slice().sort((a: any, b: any) => b.openToMergeMs - a.openToMergeMs || a.number - b.number).slice(0, 1).map((t: any) => ({ number: t.number, openToMergeMs: t.openToMergeMs, shareOfTotal: total ? r4(t.openToMergeMs / total) : null }))[0] : null,
    split: total ? {
      afterOpenUntilLastCommitShare: r4(sum("openToLastCommitMs") / total),
      ciQueueShare: r4(sum("lastCommitToCiStartMs") / total),
      ciVerifyShare: r4(sum("ciMs") / total),
      waitAfterCiShare: r4(sum("ciEndToMergeMs") / total),
      note: "phases are sequential per PR: open → last commit (building/rework incl. inspection fixes and main merges, OR idle waiting between commits — e.g. for an owner decision; git cannot separate the two) → CI start (queue) → CI end (verify) → merge (wait: merge decision); shares of the summed open→merge time over merged PRs. The phases can overlap with an earlier CI run that the snapshot does not keep (latest run only) — report-only",
    } : null,
    withInspectionFindingCommits: timeline.filter((t: any) => t.inspectionFindingCommits.length).map((t: any) => `#${t.number}`),
    reviewsOrCommentsOnPr: timeline.reduce((a: number, t: any) => a + t.reviewCount + t.commentCount, 0),
  };
  return freeze({ schema: "ODG_V175_PRODUCTION_METRIC/1", missions, prTimeline: { window: [lo, hi], prs: timeline, aggregate: agg },
    honesty: [
      "NOT_MEASURED is preserved wherever the repository holds no record (provider € / tokens, € budget, inspection verdict time, pre-PR build time)",
      "native €0 is reported only from the GO STRATEGY rationale; it does not cover the provider session",
      "native-written lines are evidence data produced by a GO-dispatched run; native-built code merged is reported separately",
      "inspection timing is an upper bound from commit subjects naming an inspection finding, never a recorded verdict time",
    ] });
}

const PRODUCTION_METRIC_CONTRACT = freeze({ module: "odg-production-metric", pure: true, notMeasuredPreserved: true });

module.exports = { measureProduction, traceSummary, prTimeline, splitLines, PRODUCTION_METRIC_CONTRACT };
export {};
