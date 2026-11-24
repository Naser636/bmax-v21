#!/usr/bin/env node
"use strict";
/*
 * V17.2 — SCENARIO G2 held-out builder (contract docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#G2,
 * WORK_ITEM_CONTRACT.preRegistration.dataset.heldOutPrimary / heldOutReportOnly). Implements the pre-registered rule
 * LITERALLY, from the LOCAL git object store only (no fetch, no network):
 *
 *   one row per PR number N with LO ≤ N ≤ HI whose merge commit M is a first-parent commit of main at e97bcc43 with
 *   subject '^Merge pull request #N ' and exactly 2 parents;
 *     commits = git rev-list --count M^1..M^2
 *     size    = Σ(added + deleted) of git diff --numstat M^1 M   (binary '-' ⇒ 0)
 *   PR numbers with only a squash commit (subject ending '(#N)') ⇒ EXCLUDED LABEL_NOT_RECOVERABLE_LOCALLY (listed);
 *   duplicate subjects for one N ⇒ EXCLUDED AMBIGUOUS (listed).
 *   Blocks: HB = #319–#518 (PRIMARY), HF = #921–#954 (REPORT-ONLY). Label HIGH_ITERATION iff commits ≥ 2.
 *
 * This module NEVER writes a file. The held-out file docs/odg/evidence/V172_G2_HELDOUT.json is written only by the
 * contract-declared dispatch target runtime/bin/odg-v172-scenario-g2-experiment.ts, AFTER the fitted thresholds are
 * sealed (anti-leakage, preRegistration C3). The CLI prints row / exclusion COUNTS and the sha256 only — never a label,
 * a commit count or a size:
 *   npx tsx runtime/bin/odg-v172-scenario-g2-heldout-build.ts            dry run: counts + sha256 of a fresh build
 *   npx tsx runtime/bin/odg-v172-scenario-g2-heldout-build.ts --check    fresh build byte-equal to the committed file?
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = "docs/odg/evidence/V172_G2_HELDOUT.json";
const SELF = "runtime/bin/odg-v172-scenario-g2-heldout-build.ts";
const RULE = Object.freeze({
  baseCommit: "e97bcc43",
  blocks: Object.freeze({ HB: Object.freeze({ lo: 319, hi: 518, role: "PRIMARY" }), HF: Object.freeze({ lo: 921, hi: 954, role: "REPORT-ONLY" }) }),
  mergeSubject: "^Merge pull request #N ",
  squashSubject: "ends with '(#N)'",
  highIterationMinCommits: 2,
  expectedMergeStyle: Object.freeze({ HB: 168, HF: 34 }),   // subject/parent counts noted at registration (informational)
  expectedSquashStyle: Object.freeze({ HB: 32, HF: 0 }),
});

const sha256 = (b: any) => crypto.createHash("sha256").update(b).digest("hex");
/* git with config pinned to git's defaults (a user config must not change the measured numbers); local objects only. */
function git(root: string, args: string[]): string {
  return String(cp.execFileSync("git", ["-C", root, "-c", "diff.renames=true", "-c", "core.quotepath=false", ...args],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" } }));
}

/* first-parent index of the base: N → [{ sha, parents, kind: MERGE|SQUASH }] (subject + parent count only) */
function firstParentIndex(root: string, base: string): any {
  const idx: any = {};
  for (const line of git(root, ["log", "--first-parent", "--format=%H%x09%P%x09%s", base]).split("\n")) {
    if (!line) continue;
    const [sha, parents, ...rest] = line.split("\t"); const subject = rest.join("\t");
    const np = parents ? parents.split(" ").filter(Boolean).length : 0;
    const m = /^Merge pull request #(\d+) /.exec(subject);
    const s = /\(#(\d+)\)\s*$/.exec(subject);
    if (m) (idx[m[1]] = idx[m[1]] || []).push({ sha, parents: np, kind: "MERGE" });
    if (s) (idx[s[1]] = idx[s[1]] || []).push({ sha, parents: np, kind: "SQUASH" });
  }
  return idx;
}

/* size of one merge: Σ(added + deleted) of git diff --numstat M^1 M (binary '-' ⇒ 0) */
function numstatSize(root: string, m: string): number {
  let size = 0;
  for (const line of git(root, ["diff", "--numstat", "--no-ext-diff", "--no-textconv", `${m}^1`, m]).split("\n")) {
    if (!line) continue;
    const [a, d] = line.split("\t");
    size += (a === "-" ? 0 : Number(a)) + (d === "-" ? 0 : Number(d));
  }
  return size;
}
function commitCount(root: string, m: string): number { return Number(git(root, ["rev-list", "--count", `${m}^1..${m}^2`]).trim()); }

/* measureRange(root, idx, lo, hi) → { rows:[{number, mergeCommit, commits, size, label}], excluded:[{number, reason}] } */
function measureRange(root: string, idx: any, lo: number, hi: number): any {
  const rows: any[] = [], excluded: any[] = [];
  for (let n = lo; n <= hi; n++) {
    const c = idx[String(n)] || [];
    if (!c.length) { excluded.push({ number: n, reason: "NO_FIRST_PARENT_COMMIT" }); continue; }
    if (c.length > 1) { excluded.push({ number: n, reason: "AMBIGUOUS", commits: c.map((x: any) => x.sha) }); continue; }
    const one = c[0];
    if (one.kind === "SQUASH") { excluded.push({ number: n, reason: "LABEL_NOT_RECOVERABLE_LOCALLY", commit: one.sha, parents: one.parents }); continue; }
    if (one.parents !== 2) { excluded.push({ number: n, reason: "MERGE_SUBJECT_NOT_TWO_PARENTS", commit: one.sha, parents: one.parents }); continue; }
    const commits = commitCount(root, one.sha), size = numstatSize(root, one.sha);
    rows.push({ number: n, mergeCommit: one.sha, commits, size, label: commits >= RULE.highIterationMinCommits ? "HIGH_ITERATION" : "LOW_ITERATION" });
  }
  return { rows, excluded };
}
const reasonCounts = (ex: any[]) => ex.reduce((a: any, e: any) => { a[e.reason] = (a[e.reason] || 0) + 1; return a; }, {});

/* build(root, opts?) → { doc, text, sha256, index } — deterministic, writes nothing. opts.baseCommit / opts.blocks exist
 * ONLY for the synthetic selftest repository; the dispatch always uses RULE (the gate checks it against the contract). */
function build(root: string = ROOT, opts: any = {}): any {
  const ruleBlocks = opts.blocks || RULE.blocks;
  const base = git(root, ["rev-parse", `${opts.baseCommit || RULE.baseCommit}^{commit}`]).trim();
  const idx = firstParentIndex(root, base);
  const blocks: any = {};
  for (const id of Object.keys(ruleBlocks)) {
    const b = (ruleBlocks as any)[id];
    const r = measureRange(root, idx, b.lo, b.hi);
    blocks[id] = { role: b.role, range: [b.lo, b.hi], counts: { rows: r.rows.length, excluded: r.excluded.length, excludedByReason: reasonCounts(r.excluded),
      expectedMergeStyleAtRegistration: (RULE.expectedMergeStyle as any)[id], expectedSquashStyleAtRegistration: (RULE.expectedSquashStyle as any)[id] }, excluded: r.excluded, rows: r.rows };
  }
  const doc = {
    "//": "V17.2 scenario G2 — held-out era blocks, built ONCE by the pre-registered deterministic rule (runtime/bin/odg-v172-scenario-g2-heldout-build.ts) inside the contract-declared RUN_CONTROLLED_EXPERIMENTS dispatch, AFTER the fitted thresholds were sealed; never edited after its first build (any edit ⇒ the experiment is NOT_MEASURED). Recompute: npx tsx runtime/bin/odg-v172-scenario-g2-heldout-build.ts --check",
    schema: "odg-v172-g2-heldout/1",
    contract: "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#G2",
    builder: SELF,
    baseCommit: base,
    rule: {
      row: "one row per PR number N in the block range whose merge commit M is a first-parent commit of the base with subject '^Merge pull request #N ' and exactly 2 parents",
      commits: "git rev-list --count M^1..M^2",
      size: "Σ(added + deleted) of git diff --numstat M^1 M (binary '-' ⇒ 0); git run with -c diff.renames=true (git's default) --no-ext-diff --no-textconv",
      label: "HIGH_ITERATION iff commits ≥ 2, else LOW_ITERATION",
      exclusions: "only a squash commit (subject ending '(#N)') ⇒ LABEL_NOT_RECOVERABLE_LOCALLY; > 1 first-parent subject for N ⇒ AMBIGUOUS; no first-parent subject ⇒ NO_FIRST_PARENT_COMMIT; merge subject without exactly 2 parents ⇒ MERGE_SUBJECT_NOT_TWO_PARENTS",
      egress: "NONE — local git objects only",
    },
    blocks,
  };
  const text = JSON.stringify(doc, null, 1) + "\n";
  return { doc, text, sha256: sha256(text), index: idx, baseCommit: base };
}

const fpCache = new Map<string, Set<string>>();
function isFirstParentOf(root: string, sha: string, base: string): boolean {
  const k = root + "\0" + base;
  if (!fpCache.has(k)) fpCache.set(k, new Set(git(root, ["rev-list", "--first-parent", base]).split("\n").filter(Boolean)));
  return (fpCache.get(k) as Set<string>).has(sha);
}
/* verifyRule(root, doc) — independent re-check of every row/exclusion against the rule (subject, parents, range, label) */
function verifyRule(root: string, doc: any, ruleBlocks: any = RULE.blocks): any {
  const violations: string[] = [];
  if (!doc || !doc.blocks) return { ok: false, violations: ["no blocks"] };
  if (JSON.stringify(Object.keys(doc.blocks)) !== JSON.stringify(Object.keys(ruleBlocks))) violations.push("block ids ≠ rule");
  for (const id of Object.keys(ruleBlocks)) {
    const b = (ruleBlocks as any)[id]; const blk = doc.blocks[id];
    if (!blk || !Array.isArray(blk.rows) || !Array.isArray(blk.excluded)) { violations.push(`${id}: missing`); continue; }
    const seen = new Set<number>();
    for (const r of blk.rows) {
      if (!Number.isInteger(r.number) || r.number < b.lo || r.number > b.hi) violations.push(`${id} #${r.number}: out of range`);
      if (seen.has(r.number)) violations.push(`${id} #${r.number}: duplicate row`); seen.add(r.number);
      let subj = "", parents = -1;
      try { const o = git(root, ["log", "-1", "--format=%P%x09%s", r.mergeCommit]).replace(/\n$/, ""); const [p, ...s] = o.split("\t"); parents = p.split(" ").filter(Boolean).length; subj = s.join("\t"); } catch { violations.push(`${id} #${r.number}: commit unreadable`); continue; }
      if (!subj.startsWith(`Merge pull request #${r.number} `)) violations.push(`${id} #${r.number}: subject does not match`);
      if (doc.baseCommit && !isFirstParentOf(root, r.mergeCommit, doc.baseCommit)) violations.push(`${id} #${r.number}: not a first-parent commit of the base`);
      if (parents !== 2) violations.push(`${id} #${r.number}: ${parents} parents`);
      if (!Number.isInteger(r.commits) || !Number.isInteger(r.size) || r.commits < 0 || r.size < 0) violations.push(`${id} #${r.number}: non-integer measurement`);
      if (r.label !== (r.commits >= RULE.highIterationMinCommits ? "HIGH_ITERATION" : "LOW_ITERATION")) violations.push(`${id} #${r.number}: label ≠ rule`);
    }
    for (const e of blk.excluded) { if (seen.has(e.number)) violations.push(`${id} #${e.number}: both row and excluded`); seen.add(e.number); }
    if (seen.size !== b.hi - b.lo + 1) violations.push(`${id}: ${seen.size} PR numbers accounted for ≠ ${b.hi - b.lo + 1}`);
  }
  return { ok: violations.length === 0, violations: violations.slice(0, 20), violationCount: violations.length };
}

/* contractDiagnostics(doc) — DIAGNOSTIC ONLY (never feeds build(), verifyRule() or the experiment; cannot alter any row,
 * exclusion, file text or sha256). The frozen G2 contract (sha 94ca64ca…) states the squash exclusion as "subject ending
 * '(#N)', 1 parent"; build() excludes on the subject alone. This reports every LABEL_NOT_RECOVERABLE_LOCALLY exclusion
 * whose commit does NOT have exactly 1 parent (a deviation from the contract's wording, surfaced — not silently fixed),
 * and every AMBIGUOUS exclusion (incl. a PR number with both a merge subject and a '(#N)' squash subject).
 * Measured at e97bcc43: HB 32/32 squash exclusions have 1 parent, 0 AMBIGUOUS; HF none ⇒ no deviation. */
function contractDiagnostics(doc: any): any {
  const squashNotOneParent: any[] = [], ambiguous: any[] = [];
  for (const [id, blk] of Object.entries((doc && doc.blocks) || {}) as any) {
    for (const e of (blk && blk.excluded) || []) {
      if (e.reason === "LABEL_NOT_RECOVERABLE_LOCALLY" && e.parents !== 1) squashNotOneParent.push({ block: id, number: e.number, parents: e.parents });
      if (e.reason === "AMBIGUOUS") ambiguous.push({ block: id, number: e.number, commits: (e.commits || []).length });
    }
  }
  return { ok: squashNotOneParent.length === 0, squashNotOneParent, ambiguous, note: "diagnostic only — does not change the built file; a non-empty squashNotOneParent is a contract-wording deviation to report to the owner/inspector" };
}

if (require.main === module) {
  const b = build(ROOT);
  const counts = Object.fromEntries(Object.entries(b.doc.blocks).map(([k, v]: any) => [k, v.counts]));
  const diag = contractDiagnostics(b.doc);
  if (!diag.ok) process.stderr.write(`DIAGNOSTIC (contract wording "(#N)', 1 parent"): ${diag.squashNotOneParent.length} squash exclusion(s) without exactly 1 parent: ${JSON.stringify(diag.squashNotOneParent)} — output unchanged\n`);
  if (process.argv.includes("--check")) {
    let cur: string | null = null; try { cur = fs.readFileSync(path.join(ROOT, OUT), "utf8"); } catch { cur = null; }
    const same = cur !== null && cur === b.text;
    process.stdout.write(`${JSON.stringify({ counts, freshSha256: b.sha256, committedSha256: cur === null ? null : sha256(cur) })}\n${same ? "CHECK OK — held-out file reproduces byte-for-byte" : "CHECK FAILED — held-out file absent or differs from a fresh build"}\n`);
    process.exitCode = same ? 0 : 1;
  } else {
    process.stdout.write(`${JSON.stringify({ dryRun: true, counts, sha256: b.sha256, note: "counts only — no label, commit count or size printed; nothing written" })}\n`);
  }
}
module.exports = { build, verifyRule, contractDiagnostics, firstParentIndex, measureRange, numstatSize, commitCount, RULE, OUT, SELF };
export {};
