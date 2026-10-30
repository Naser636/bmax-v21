#!/usr/bin/env node
/*
 * odg-integration-preflight — a READ-ONLY, non-interactive git/GitHub integration state reporter.
 *
 * ROOT-CAUSE this closes (POST-V107 forensic): the campaign conflated "git push succeeded" with "merged to main".
 * They are DIFFERENT channels and DIFFERENT facts:
 *   - `git push` authenticates via the SSH key (works here) ⇒ a commit reaches origin/<branch>  ⇒ state PUSHED.
 *   - landing on the PROTECTED `main` goes through a PR + `gh` (a SEPARATE GitHub API token, absent here) ⇒ MERGED.
 * This tool reports the HONEST per-branch state using ONLY git (no gh needed to OBSERVE state), detects gh-auth
 * non-interactively (fail-fast with the EXACT owner command — never drives an interactive menu from a non-tty), and
 * NEVER reports MERGED unless the branch tip is a real ancestor of origin/main (fail-closed: cannot verify ⇒ NOT merged).
 *
 * Pure helpers (classifyBranch / authState / planMergeOrder) are exported + unit-tested; the CLI is a thin wire over
 * `git` (read-only) + `gh auth status`. No writes, no network mutation, no interactive prompt.
 */
"use strict";

const cp = require("child_process");

// The six integration states the campaign must never collapse (mandate §4). A lot advances strictly left→right;
// each transition needs its OWN evidence — PUSHED proves nothing about MERGED, MERGED nothing about RELEASED/ACCEPTED.
const STATES = ["LOCAL", "PUSHED", "PR_OPEN", "MERGED", "VERIFIED", "ACCEPTED"] as const;

/**
 * classifyBranch — PURE. Given the observable git facts for one branch, return its honest integration state.
 *   localTip        : sha of the local branch (or null if absent)
 *   remoteTip       : sha of origin/<branch> (or null if not pushed)
 *   mergedIntoMain  : boolean — is the branch tip a real ancestor of origin/main? (git merge-base --is-ancestor)
 * Fail-closed: mergedIntoMain must be an EXPLICIT true; anything else (false/undefined) ⇒ NOT merged.
 */
function classifyBranch(input: any): any {
  const localTip = input && typeof input.localTip === "string" ? input.localTip : null;
  const remoteTip = input && typeof input.remoteTip === "string" ? input.remoteTip : null;
  // Self-enforcing invariant (audit hardening): a branch that is not even pushed (no remote tip) can NEVER be merged.
  // Make the pure API defend this itself, not only via the caller's wiring.
  const mergedIntoMain = input && input.mergedIntoMain === true && remoteTip !== null;
  const pushed = !!(localTip && remoteTip && localTip === remoteTip);
  const state = mergedIntoMain ? "MERGED" : (pushed ? "PUSHED" : (localTip ? "LOCAL" : "ABSENT"));
  return {
    name: input && input.name,
    localTip, remoteTip, pushed, mergedIntoMain, state,
    // A pushed-but-unmerged branch is the campaign's normal "awaiting the merge gate" state — explicit, never a success.
    detail: mergedIntoMain
      ? "MERGED — tip is an ancestor of origin/main (on main)"
      : pushed
        ? "PUSHED — on origin/<branch> but NOT on main (awaiting PR+merge)"
        : localTip
          ? (remoteTip ? "DIVERGED — local != origin/<branch> (re-push needed)" : "LOCAL — not pushed")
          : "ABSENT — no local branch",
  };
}

/**
 * authState — PURE. gh (GitHub API) auth is a SEPARATE channel from git-over-SSH. Report whether PR/merge ops are
 * possible and, if not, the EXACT non-interactive owner command (never an interactive menu from a non-tty process).
 */
function authState(input: any): any {
  const ghStatusOk = !!(input && input.ghStatusOk === true);
  const ghTokenPresent = !!(input && input.ghTokenPresent === true);
  const authed = ghStatusOk || ghTokenPresent;
  return {
    authed,
    // GH_TOKEN takes PRECEDENCE in the label: when set, gh uses it instead of any stored credential (per gh docs), so
    // reporting "GH_TOKEN-env" is the honest channel even if `gh auth status` also returns 0 because it read the token.
    method: ghTokenPresent ? "GH_TOKEN-env" : (ghStatusOk ? "stored-credential" : null),
    // Official headless recommendation (cli.github.com / docs.github.com): a fine-grained PAT via GH_TOKEN (no disk
    // write, non-interactive). --with-token (classic PAT, scopes repo,read:org,gist) is the alternative. Device-flow
    // is interactive and needs a TTY — unavailable to this agent process.
    ownerCommand: authed ? null
      : "export GH_TOKEN=<fine-grained PAT: Contents=RW + Pull requests=RW on Naser636/bmax-v21>   # then re-run; OR in your terminal: gh auth login",
  };
}

/** planMergeOrder — PURE. A linear stack (each branch's tip descends from the previous) merges in parent→child order.
 *  Given branches with {name, parentTip, tip}, return the dependency-ordered name list (roots first). */
function planMergeOrder(branches: any[]): string[] {
  const list = Array.isArray(branches) ? branches.filter((b) => b && typeof b.name === "string") : [];
  const byTip = new Map(list.map((b) => [b.tip, b]));
  const order: string[] = [];
  const seen = new Set<string>();
  const onStack = new Set<string>(); // cycle guard: a branch currently being visited (audit hardening — malformed
  // cyclic parentTip must not infinite-recurse into a RangeError; real git ancestry is acyclic, but input may not be).
  // roots = branches whose parentTip is NOT another branch's tip (i.e. parent is main)
  const visit = (b: any) => {
    if (!b || seen.has(b.name) || onStack.has(b.name)) return;
    onStack.add(b.name);
    const parent = byTip.get(b.parentTip);
    if (parent) visit(parent);
    onStack.delete(b.name);
    if (!seen.has(b.name)) { seen.add(b.name); order.push(b.name); }
  };
  for (const b of list) visit(b);
  return order;
}

// ---- thin read-only CLI wiring (not unit-tested; exercised via the pure fns + an injected runner) --------------
function git(args: string[], runner?: any): string | null {
  const run = typeof runner === "function" ? runner : (a: string[]) => {
    const r = cp.spawnSync("git", a, { encoding: "utf8" });
    return r.status === 0 ? String(r.stdout || "").trim() : null;
  };
  return run(args);
}
// ONLY the stored-credential channel (gh auth status) — deliberately does NOT consider GH_TOKEN, so reportCli can
// route each channel into the correct authState slot and LABEL it honestly (audit fix: GH_TOKEN-only was mislabeled
// "stored-credential"). GH_TOKEN presence is checked separately (env, value never read).
function ghStatusOk(runner?: any): boolean {
  const run = typeof runner === "function" ? runner : () => {
    const r = cp.spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
    return r.status === 0;
  };
  return !!run();
}

function reportCli(branchNames: string[], opts: any = {}): any {
  const originMain = git(["rev-parse", "origin/main"], opts.git);
  const auth = authState({ ghStatusOk: ghStatusOk(opts.gh), ghTokenPresent: typeof process.env.GH_TOKEN === "string" && !!process.env.GH_TOKEN });
  const rows = branchNames.map((name) => {
    const localTip = git(["rev-parse", name], opts.git);
    const remoteTip = git(["rev-parse", `origin/${name}`], opts.git);
    // MERGED only when git PROVES the tip is an ancestor of origin/main (exit 0). Fail-closed on any error.
    let mergedIntoMain = false;
    if (remoteTip) {
      const probe = typeof opts.git === "function" ? opts.git(["merge-base", "--is-ancestor", `origin/${name}`, "origin/main"]) : (() => {
        const r = cp.spawnSync("git", ["merge-base", "--is-ancestor", `origin/${name}`, "origin/main"], { encoding: "utf8" });
        return r.status === 0 ? "" : null;
      })();
      mergedIntoMain = probe !== null;
    }
    return classifyBranch({ name, localTip, remoteTip, mergedIntoMain });
  });
  return { originMain, auth, rows };
}

export { classifyBranch, authState, planMergeOrder, reportCli, STATES };
module.exports = { classifyBranch, authState, planMergeOrder, reportCli, STATES };

if (require.main === module) {
  const names = process.argv.slice(2);
  const rep = reportCli(names.length ? names : []);
  const L: string[] = [];
  L.push("ODG INTEGRATION PREFLIGHT (read-only; push ≠ merge ≠ release)");
  L.push(`origin/main: ${rep.originMain || "UNKNOWN"}`);
  L.push(`gh auth: ${rep.auth.authed ? `AUTHED (${rep.auth.method})` : "NOT AUTHED — PR/merge BLOCKED"}`);
  if (!rep.auth.authed) L.push(`  owner action: ${rep.auth.ownerCommand}`);
  for (const r of rep.rows) L.push(`  [${r.state}] ${r.name} — ${r.detail}`);
  const pending = rep.rows.filter((r: any) => r.state === "PUSHED").length;
  L.push(`SUMMARY: ${rep.rows.filter((r: any) => r.state === "MERGED").length} merged / ${pending} pushed-awaiting-merge / ${rep.rows.length} total`);
  if (pending && !rep.auth.authed) L.push("NEXT: authenticate gh (above), then merge each pushed branch via PR in dependency order. NOTHING is RELEASED until merged to origin/main.");
  process.stdout.write(L.join("\n") + "\n");
}
