/**
 * V17.5 PRIORITY 5 — PRODUCTION METRIC record. READ-ONLY.
 *
 *   npx tsx runtime/bin/odg-v175-production-metric.ts --snapshot-prs   (network, gh READ only) refresh the PR timeline
 *                                                                      snapshot docs/odg/evidence/V175_PR_TIMELINE_SNAPSHOT.json
 *   npx tsx runtime/bin/odg-v175-production-metric.ts                  write docs/odg/evidence/V175_PRODUCTION_METRIC.json (offline)
 *   npx tsx runtime/bin/odg-v175-production-metric.ts --check          recompute offline; exit 1 on any byte drift
 *
 * Inputs (committed): odg-outcome-learning.CLOSED_MISSIONS experiment / validation records + GO traces, the contracts'
 * caps, the PR snapshot (gh data frozen at snapshot time — PR open/merge, commits, latest check run, reviews, comments),
 * and read-only git history: the PR of a record = the earliest (topological, ancestry-path) "Merge pull request #N" commit containing the
 * commit that added the record; per-commit additions = `git log --numstat <merge>^1..<merge>^2`, provider authorship =
 * a Co-Authored-By trailer naming Claude. The pure computation is odg-production-metric.measureProduction.
 * HISTORY-DEPENDENT (full clone; CI fetch-depth 0). No network except --snapshot-prs (gh GET only); no git write.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const OL = require("../core/odg-outcome-learning.js");
const PM = require("../core/odg-production-metric.js");
const AS = require("../core/odg-authorization-scope.js");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = "docs/odg/evidence/V175_PRODUCTION_METRIC.json";
const SNAP = "docs/odg/evidence/V175_PR_TIMELINE_SNAPSHOT.json";
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const WINDOW = [955, 971];
const MISSION_PRS = [935, 937, 946, 947]; // G / H experiment + validation PRs (outside the window, needed for mission times)

function git(args: string[]): string { return String(execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })); }
function readJson(rel: string): any { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); }
function exists(rel: string): boolean { return fs.existsSync(path.join(ROOT, rel)); }

function snapshotPrs(): void {
  const nums = [...MISSION_PRS]; for (let n = WINDOW[0]; n <= WINDOW[1]; n++) nums.push(n);
  const rows = nums.map((n) => {
    const d = JSON.parse(String(execFileSync("gh", ["pr", "view", String(n), "--json", "number,title,state,createdAt,mergedAt,closedAt,commits,comments,reviews,statusCheckRollup,mergeCommit,headRefOid"], { cwd: ROOT, encoding: "utf8" })));
    return { number: d.number, title: d.title, state: d.state, createdAt: d.createdAt, mergedAt: d.mergedAt || null, closedAt: d.closedAt || null,
      mergeCommit: d.mergeCommit ? d.mergeCommit.oid : null, headRefOid: d.headRefOid,
      commits: (d.commits || []).map((c: any) => ({ oid: c.oid, committedDate: c.committedDate, messageHeadline: c.messageHeadline })),
      checks: (d.statusCheckRollup || []).map((c: any) => ({ name: c.name || c.context || null, startedAt: c.startedAt || null, completedAt: c.completedAt || null, conclusion: c.conclusion || c.state || null })),
      reviews: (d.reviews || []).map((r: any) => ({ submittedAt: r.submittedAt, state: r.state })),
      comments: (d.comments || []).map((c: any) => ({ createdAt: c.createdAt })) };
  });
  const snap = { "//": "V17.5 — frozen gh READ of the PRs used by V175_PRODUCTION_METRIC (PR open/merge, commits, latest check run, review/comment timestamps only). Refresh: npx tsx runtime/bin/odg-v175-production-metric.ts --snapshot-prs", schema: "ODG_V175_PR_TIMELINE_SNAPSHOT/1",
    snapshotAt: new Date().toISOString(), window: WINDOW, missionPrs: MISSION_PRS, prs: rows };
  fs.writeFileSync(path.join(ROOT, SNAP), JSON.stringify(snap, null, 2) + "\n");
  process.stdout.write(`wrote ${SNAP} (${rows.length} PRs)\n`);
}

/* prOfFile(rel) — the PR whose "Merge pull request #N" commit is the earliest (topological) merge containing the commit that added rel. */
function prOfFile(rel: string): number | null {
  const add = git(["log", "--diff-filter=A", "--format=%H", "--", rel]).split("\n").filter(Boolean).pop();
  if (!add) return null;
  const merges = git(["log", "--merges", "--ancestry-path", "--topo-order", "--reverse", "--format=%H %s", `${add}..HEAD`]).split("\n").filter(Boolean); // earliest PR merge containing add (independent of which branch HEAD is on)
  for (const line of merges) {
    const [sha, ...rest] = line.split(" ");
    if (!/Merge pull request #\d+/.test(rest.join(" "))) continue; // branch-local merges of main are not PR merges
    try { execFileSync("git", ["-C", ROOT, "merge-base", "--is-ancestor", add, sha], { stdio: "ignore" }); } catch { continue; }
    const m = rest.join(" ").match(/Merge pull request #(\d+)/); return m ? Number(m[1]) : null;
  }
  return null;
}

function prCommits(merge: string | null): any[] {
  if (!merge) return [];
  const out = git(["log", "--no-merges", "--numstat", "--format=@@%H%x09%(trailers:key=Co-Authored-By,valueonly,separator=;)", `${merge}^1..${merge}^2`]);
  const commits: any[] = []; let cur: any = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("@@")) { const [sha, tr] = line.slice(2).split("\t"); cur = { sha: sha.slice(0, 12), providerTrailer: /Claude/i.test(tr || ""), files: [] }; commits.push(cur); continue; }
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (m && cur) cur.files.push({ path: m[3], add: m[1] === "-" ? null : Number(m[1]), del: m[2] === "-" ? null : Number(m[2]) });
  }
  return commits.sort((a, b) => a.sha.localeCompare(b.sha));
}

function build(): string {
  const snap = readJson(SNAP);
  const contracts = readJson(CONTRACTS);
  const prBy: any = {}; for (const p of snap.prs) prBy[p.number] = p;
  const missions = OL.CLOSED_MISSIONS.map((m: any) => {
    const exp = readJson(m.experiment);
    const c = contracts.contracts.find((x: any) => x.scenario === m.id);
    const caps = c && c.WORK_ITEM_CONTRACT.preRegistration && c.WORK_ITEM_CONTRACT.preRegistration.caps ? c.WORK_ITEM_CONTRACT.preRegistration.caps : null;
    let validation: any = { present: false };
    if (exists(m.validation)) { const v = readJson(m.validation); validation = { present: true, grade: v.scenarioGrade, bound: !!(v.experimentEvidence && v.experimentEvidence.experimentSha256 === AS.experimentSha256(exp)), inspectionVerdict: v.experimentInspection ? v.experimentInspection.verdict : null, inspectedPr: v.experimentInspection ? v.experimentInspection.pr : null, source: `${m.validation}#experimentInspection` }; }
    let results: any = { primary: exp.grade ? exp.grade.because || null : null };
    if (exp.summary && exp.summary.perArmSeed) { const arms = exp.summary.perArmSeed; const ks = Object.keys(arms).sort();
      results = { ...results, rows: Array.isArray(exp.rows) ? exp.rows.length : null, rowsMeasured: ks.reduce((a: number, k: string) => a + (arms[k].measured || 0), 0), acceptedTaskRuns: ks.reduce((a: number, k: string) => a + (arms[k].passes || 0), 0), modelCallsTotal: ks.reduce((a: number, k: string) => a + (arms[k].modelCalls || 0), 0), source: `${m.experiment}#summary.perArmSeed` }; }
    else if (exp.primary && exp.primary.counts) results = { ...results, heldoutN: typeof exp.primary.counts.n === "number" ? exp.primary.counts.n : (exp.primary.counts.test ? exp.primary.counts.test.n : null), source: `${m.experiment}#primary.counts` };
    const ePr = prOfFile(m.experiment), vPr = exists(m.validation) ? prOfFile(m.validation) : null;
    const pc: any = {}; for (const n of [ePr, vPr]) if (n && prBy[n]) pc[n] = prCommits(prBy[n].mergeCommit);
    return { id: m.id, experiment: { path: m.experiment, outcome: exp.outcome, sha256: AS.experimentSha256(exp), run: exp.run || null }, results, validation,
      trace: m.trace && exists(m.trace) ? fs.readFileSync(path.join(ROOT, m.trace), "utf8").split("\n").filter((l: string) => l.trim()).map((l: string) => JSON.parse(l)) : null,
      tracePath: m.trace, caps, experimentPr: ePr, validationPr: vPr, prCommits: pc };
  });
  // window-wide native vs provider split (every merged PR in the window), GO-written paths from every committed GO trace
  const traces = fs.readdirSync(path.join(ROOT, "docs/odg/evidence")).filter((f: string) => /_GO_EXECUTE_TRACE\.jsonl$/.test(f)).sort();
  const nativePaths = Array.from(new Set(traces.flatMap((f: string) => PM.traceSummary(fs.readFileSync(path.join(ROOT, "docs/odg/evidence", f), "utf8").split("\n").filter((l: string) => l.trim()).map((l: string) => JSON.parse(l))).writeSet))).sort() as string[];
  const windowCommits = snap.prs.filter((p: any) => p.number >= WINDOW[0] && p.number <= WINDOW[1] && p.mergeCommit && p.mergedAt).flatMap((p: any) => prCommits(p.mergeCommit));
  // RB-RECORD-INSPECTION-VERDICT-TIME: committed inspection records that carry verdictAt (current + priorVerdicts), by inspectedPr
  const inspectionVerdicts: any = {};
  for (const f of fs.readdirSync(path.join(ROOT, "docs/odg/evidence")).filter((x: string) => /_CONTRACT_INSPECTION\.json$/.test(x)).sort()) {
    let r: any = null; try { r = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence", f), "utf8")); } catch { r = null; }
    for (const v of [r, ...(r && Array.isArray(r.priorVerdicts) ? r.priorVerdicts : [])]) if (v && typeof v.verdictAt === "string" && Number.isInteger(v.inspectedPr)) inspectionVerdicts[String(v.inspectedPr)] = { verdictAt: v.verdictAt, verdict: v.verdict || null, record: `docs/odg/evidence/${f}` };
  }
  const rec = PM.measureProduction({ missions, prs: snap.prs, windowPrs: WINDOW, inspectionVerdicts });
  const out = { "//": "V17.5 PRIORITY 5 — verified production measure per mission (G, H, G2, J2) + PR #955–#971 wall-time split. READ-ONLY; NOT_MEASURED preserved. Recompute: npx tsx runtime/bin/odg-v175-production-metric.ts --check",
    ...rec,
    windowShare: { prs: `#${WINDOW[0]}–#${WINDOW[1]} merged`, goTraces: traces.map((f: string) => `docs/odg/evidence/${f}`), odgWrittenPaths: nativePaths, ...PM.splitLines(windowCommits, nativePaths) },
    sources: { snapshot: SNAP, snapshotAt: snap.snapshotAt, contracts: CONTRACTS, git: "git log --numstat <merge>^1..<merge>^2 per merged PR; git log --diff-filter=A + first-parent merges for record → PR" } };
  return JSON.stringify(out, null, 2) + "\n";
}

function main(): void {
  if (process.argv.includes("--snapshot-prs")) { snapshotPrs(); return; }
  const text = build();
  if (process.argv.includes("--check")) {
    const cur = exists(OUT) ? fs.readFileSync(path.join(ROOT, OUT), "utf8") : "";
    if (cur !== text) { process.stderr.write(`CHECK FAILED: ${OUT} differs from a fresh computation\n`); process.exit(1); }
    process.stdout.write(`CHECK OK ${OUT}\n`); return;
  }
  fs.writeFileSync(path.join(ROOT, OUT), text);
  process.stdout.write(`wrote ${OUT}\n`);
}

if (require.main === module) main();
module.exports = { build, prOfFile, prCommits };
export {};
