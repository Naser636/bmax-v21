#!/usr/bin/env node
"use strict";
/*
 * V16.8 mission H — REVISE_CONTRACT: assembles and FREEZES the pre-registered dataset of scenario H
 * (docs/odg/evidence/V168_H_HELDOUT.json) from COMMITTED evidence only, BEFORE any experiment and before any metric:
 *   - rows + labels: docs/odg/evidence/V160_SCENARIO_G_PR_HISTORY.json (committed snapshot; sha256 pinned below);
 *   - changed-file lists: the LOCAL git object store (no egress): for PR #N, the unique commit M on the FIRST-PARENT
 *     history of the pinned base commit whose subject is "Merge pull request #N …" (merge) or ends with "(#N)" (squash),
 *     files = `git diff --name-only M^1...M` (same diff definition as V157_PERFORMANCE_BASELINE historicalPRs).
 * Split (pre-registered in contract H): rows sorted by PR number ascending; DEV = first ceil(n/2), HELDOUT = the rest.
 * It computes NO metric, runs NO mechanism, and PRINTS NO LABEL (only row/exclusion counts) — anti-leakage.
 * Usage: npx tsx runtime/bin/odg-v168-scenario-h-heldout-build.ts [--write]   (without --write: dry run, nothing written)
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "..");
const HISTORY = "docs/odg/evidence/V160_SCENARIO_G_PR_HISTORY.json";
const HISTORY_SHA256 = "09a1112dd42c6821e030d3ebf2058f2c93f440a28b4ed34aef4f631ac646d9ea";
const BASE_COMMIT = "ba9b77e8";   // origin/main tip when the dataset was frozen (contains every merge of #519–#920)
const OUT = "docs/odg/evidence/V168_H_HELDOUT.json";

function git(args: string[]): string { return String(cp.execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })); }
const sha256 = (b: any) => crypto.createHash("sha256").update(b).digest("hex");

function main(): void {
  const raw = fs.readFileSync(path.join(ROOT, HISTORY));
  if (sha256(raw) !== HISTORY_SHA256) { process.stderr.write(`history sha256 mismatch — refusing\n`); process.exit(2); }
  const hist = JSON.parse(String(raw));
  const base = git(["rev-parse", BASE_COMMIT + "^{commit}"]).trim();
  const merges: any = {};
  // first-parent history of the base = what landed on main: a merge commit "Merge pull request #N …" or a squash commit
  // whose subject ends with "(#N)". Each PR must map to EXACTLY one such commit (else excluded, never guessed).
  for (const line of git(["log", base, "--first-parent", "--format=%H%x09%s"]).split("\n")) {
    const m = /^([0-9a-f]{40})\tMerge pull request #(\d+) /.exec(line) || /^([0-9a-f]{40})\t.*\(#(\d+)\)\s*$/.exec(line);
    if (m) (merges[m[2]] = merges[m[2]] || []).push(m[1]);
  }
  const rows: any[] = []; const excluded: any[] = [];
  const sorted = hist.prs.slice().sort((a: any, b: any) => a.number - b.number);
  for (const r of sorted) {
    const ok = Number.isFinite(r.commits) && Number.isFinite(r.changedFiles);
    if (!ok) { excluded.push({ number: r.number, reason: "NON_FINITE_FIELDS" }); continue; }
    const ms = merges[String(r.number)] || [];
    if (ms.length !== 1) { excluded.push({ number: r.number, reason: ms.length ? "AMBIGUOUS_MERGE_COMMIT" : "NO_LOCAL_MERGE_COMMIT" }); continue; }
    let files: string[];
    try { files = git(["diff", "--name-only", `${ms[0]}^1...${ms[0]}`]).split("\n").filter(Boolean).sort(); } catch { excluded.push({ number: r.number, reason: "DIFF_FAILED" }); continue; }
    if (!files.length) { excluded.push({ number: r.number, reason: "EMPTY_DIFF" }); continue; }
    rows.push({ number: r.number, mergeCommit: ms[0], changedFiles: files, commits: r.commits, label: r.commits >= 2 ? "HIGH_ITERATION" : "LOW_ITERATION" });
  }
  const nDev = Math.ceil(rows.length / 2);
  rows.forEach((r: any, i: number) => { r.split = i < nDev ? "DEV" : "HELDOUT"; });
  const doc = {
    "//": "V16.8 scenario H — FROZEN pre-registered dataset (built by runtime/bin/odg-v168-scenario-h-heldout-build.ts --write BEFORE any H experiment or metric; its file sha256 is pinned in docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#H WORK_ITEM_CONTRACT.preRegistration.dataset.sha256). Labels were written by the builder without being printed or inspected. Any edit of this file ⇒ the experiment is NOT_MEASURED.",
    schema: "odg-v168-h-heldout/1",
    sources: { history: { path: HISTORY, sha256: HISTORY_SHA256 }, changedFiles: `local git: git diff --name-only M^1...M for the unique first-parent commit of ${base} whose subject is 'Merge pull request #N …' or ends with '(#N)'` },
    baseCommit: base,
    labelRule: "HIGH_ITERATION iff commits >= 2 (commit count = the V160 proxy for fix cycles), else LOW_ITERATION",
    splitRule: "rows sorted by PR number ascending; DEV = first ceil(n/2) rows, HELDOUT = the remaining rows",
    counts: { rows: rows.length, dev: nDev, heldout: rows.length - nDev, excluded: excluded.length },
    excluded,
    rows,
  };
  const text = JSON.stringify(doc, null, 1) + "\n";
  process.stdout.write(`rows ${rows.length} (DEV ${nDev}, HELDOUT ${rows.length - nDev}), excluded ${excluded.length}; sha256 ${sha256(text)}\n`);
  if (process.argv.includes("--write")) { fs.writeFileSync(path.join(ROOT, OUT), text); process.stdout.write(`wrote ${OUT}\n`); }
}
main();
export {};
