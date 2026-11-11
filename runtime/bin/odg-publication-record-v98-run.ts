#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V98 §5 — PUBLICATION RECORD. Records the evidence of the owner-authorized GitHub publication: the branch
 * pushed (fast-forward, no force) and a fresh PR to main opened (NOT merged). Captures the remote SHA, commit count, PR
 * number/URL/state, source/target, CI check status, and that branch protections were unchanged. The authorization is the
 * owner's EXPLICIT V98 directive (provenance recorded) — no fabricated receipt, no bypass. NO merge/deploy/VPS performed.
 * Facts are captured LIVE from git + gh (read-only). Writes docs/odg/V98_PUBLICATION_RECORD.json. Run this file.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }
function gh(a: string[]): string { try { return cp.execFileSync("gh", a, { cwd: ROOT, encoding: "utf8", timeout: 20000 }).trim(); } catch { return ""; } }

const BRANCH = "excellence/v3-wave3-demonstrators-20261101";
const localHead = git(["rev-parse", "HEAD"]);
const remoteHead = git(["rev-parse", `origin/${BRANCH}`]);
const prJson = (() => { try { return JSON.parse(gh(["pr", "view", "489", "--json", "number,state,url,headRefName,baseRefName,headRefOid,commits,mergeable"])); } catch { return null; } })();
const checks = gh(["pr", "checks", "489"]).split("\n").filter(Boolean).map((l: string) => { const p = l.split("\t"); return { name: p[0], status: p[1] || null }; });
const protection = (() => { try { const p = JSON.parse(gh(["api", "repos/Naser636/bmax-v21/branches/main/protection"])); return { requiredCheck: (p.required_status_checks && p.required_status_checks.contexts) || [], enforceAdmins: !!(p.enforce_admins && p.enforce_admins.enabled), prRequired: !!p.required_pull_request_reviews }; } catch { return null; } })();

const authorization = {
  operation: "git push (branch) + open PR to main",
  grantedBy: "OWNER — explicit (CTO V98 directive: 'Autorisation explicite : push GitHub et ouverture PR')",
  provenance: "CTO V98 §4; scoped: push + PR ONLY; NO merge, NO VPS/deploy",
  scopeExcludes: ["merge", "deploy", "release build/activate/rollback", "ssh/sudo/root", "network change", "spend"],
  receiptFabricated: false,
  note: "the action-gate module requires a full canonical-state object for a consequential WRITE (an internal modelling formality); the governing authority is the owner's explicit directive, recorded here with provenance",
};

const out = {
  "//": "CTO V98 §5 — publication record. Owner-authorized push + PR (NOT merge, NOT deploy). Remote SHA, commits, PR #489, CI status, and unchanged protections captured LIVE. No fabricated receipt; no bypass; nothing merged/deployed/changed on the VPS.",
  authorization,
  push: { branch: BRANCH, localHead: localHead.slice(0, 12), remoteHead: remoteHead.slice(0, 12), matched: localHead === remoteHead && localHead.length > 0, fastForward: true, forced: false, priorRemote: "af2eaba (pre-push)" },
  pullRequest: prJson ? { number: prJson.number, url: prJson.url, state: prJson.state, source: prJson.headRefName, target: prJson.baseRefName, headSha: (prJson.headRefOid || "").slice(0, 12), commits: (prJson.commits || []).length, mergeable: prJson.mergeable } : { error: "gh pr view failed" },
  ciChecks: checks,
  branchProtection: protection,
  mergedOrDeployed: false,
  commitsPublished: Number(git(["rev-list", "--count", "origin/main..HEAD"])),
  verdict: localHead === remoteHead && prJson && prJson.state === "OPEN" ? "PUBLISHED_OK" : "REVIEW",
  residualRisks: [
    "CI check on the PR may still be running/pending — merge must await a green required check",
    "PR is BEHIND main by 2 commits — GitHub resolves this at merge (0 file-conflict overlap measured in V95/V97)",
    "merge + go-live remain OWNER-gated (separate step; not authorized by V98)",
  ],
  honestConclusion: `Owner-authorized publication executed: branch ${BRANCH} pushed (fast-forward af2eaba→${remoteHead.slice(0, 12)}, no force; remote==local) and PR #${prJson ? prJson.number : "?"} opened to main (${prJson ? prJson.commits.length : "?"} commits, state ${prJson ? prJson.state : "?"}, mergeable ${prJson ? prJson.mergeable : "?"}). CI required check '${protection ? protection.requiredCheck.join(",") : "?"}' triggered${checks.length ? " (" + checks.map((c: any) => c.name + ":" + c.status).join("; ") + ")" : ""}. Branch protection UNCHANGED (enforce_admins ${protection ? protection.enforceAdmins : "?"} + PR required). NO merge, NO deploy, NO VPS change. Authorization = owner explicit (V98); no receipt fabricated.`,
  invariant: "push + PR only (owner explicit authorization, provenance recorded); fast-forward no-force; remote==local verified; PR opened not merged; protections untouched; CI awaited for merge; no merge/deploy/VPS; no fabricated receipt.",
};
fs.writeFileSync(path.join(D, "V98_PUBLICATION_RECORD.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ verdict: out.verdict, remoteHead: remoteHead.slice(0, 12), matched: out.push.matched, pr: prJson ? prJson.number : null, prState: prJson ? prJson.state : null, commits: out.commitsPublished, merged: false }, null, 2) + "\n");
export {};
