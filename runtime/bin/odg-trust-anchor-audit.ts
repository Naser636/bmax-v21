#!/usr/bin/env node
"use strict";
/*
 * V15 closure — TRUST_ANCHORS.json audit: DETECTION + ATTRIBUTION of every change to the owner trust anchors on a ref
 * (default origin/main). READ-ONLY (git plumbing only). For every pinned fingerprint it reports the commit that introduced
 * it, its author/committer, its Git signature status (%G?), and the PR merge that brought it in; it also lists every
 * historical add/remove.
 *
 * What it is NOT: an enforcing control. The provider's gh uses the same GitHub account that merges PRs, so attribution
 * by author name proves nothing (the provider commits as "ODG Runtime"). The only technically meaningful field is the
 * commit SIGNATURE: a provider cannot produce a valid signature with a key it does not hold. `--require-signed` exits 1
 * when any CURRENTLY pinned fingerprint was introduced by a commit whose signature is not "G" (good) — usable as a CI
 * check if the owner decides to sign anchor commits (owner decision; repository settings are not changed here).
 *
 *   node runtime/bin/odg-trust-anchor-audit.ts [--repo DIR] [--ref origin/main] [--require-signed] [--json]
 */
const cp = require("child_process");
const path = require("path");
const FILE = "docs/odg/evidence/TRUST_ANCHORS.json";
const PURPOSES = ["COLLECTION_ARTIFACT", "KNOWLEDGE_RECORD", "INSPECTION_RECORD", "MATURITY_EVIDENCE"];

function git(repo: string, args: string[]): { ok: boolean; out: string } {
  const r = cp.spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout || "" };
}
function anchorsAt(repo: string, rev: string): Record<string, string[]> | null {
  const r = git(repo, ["show", rev + ":" + FILE]); if (!r.ok) return null;
  let j: any; try { j = JSON.parse(r.out); } catch { return { __MALFORMED__: [] }; }
  const out: Record<string, string[]> = {};
  for (const p of PURPOSES) out[p] = Array.isArray(j[p]) ? j[p].map(String) : [];
  for (const k of Object.keys(j)) if (k !== "//" && !PURPOSES.includes(k)) out[k] = Array.isArray(j[k]) ? j[k].map(String) : [];
  return out;
}
function prOf(repo: string, sha: string, ref: string): string | null {
  // the EARLIEST "Merge pull request" commit descending from sha (the PR that brought it in)
  const r = git(repo, ["log", "--merges", "--ancestry-path", "--reverse", "--format=%H %s", sha + ".." + ref]);
  const m = r.out.split("\n").map((l: string) => /^([0-9a-f]{40}) Merge pull request #(\d+)/.exec(l)).find(Boolean);
  return m ? "#" + m[2] + " (" + m[1].slice(0, 8) + ")" : null;
}

function audit(repo: string, ref: string): any {
  const v = git(repo, ["rev-parse", "--verify", ref + "^{commit}"]);
  if (!v.ok) return { ok: false, reason: "REF_NOT_FOUND " + ref };
  const head = v.out.trim();
  const log = git(repo, ["log", "--reverse", "--format=%H%x1f%G?%x1f%GK%x1f%an <%ae>%x1f%cn <%ce>%x1f%cI%x1f%s", head, "--", FILE]);
  const changes: any[] = []; const introducedBy: Record<string, any> = {};
  for (const line of log.out.split("\n").filter(Boolean)) {
    const [sha, sig, sigKey, author, committer, date, subject] = line.split("\x1f");
    const parents = git(repo, ["rev-list", "--parents", "-n", "1", sha]).out.trim().split(" ").slice(1);
    const before = parents.length ? anchorsAt(repo, parents[0]) || {} : {};
    const after = anchorsAt(repo, sha) || {};
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    const added: any[] = [], removed: any[] = [];
    for (const k of keys) {
      const b = new Set(before[k] || []), a = new Set(after[k] || []);
      for (const fp of a) if (!b.has(fp)) { added.push({ purpose: k, fingerprint: fp }); introducedBy[k + ":" + fp] = { sha, sig, sigKey, author, committer, date }; }
      for (const fp of b) if (!a.has(fp)) removed.push({ purpose: k, fingerprint: fp });
    }
    changes.push({ sha, signature: sig, signingKey: sigKey || null, author, committer, date, subject, pr: prOf(repo, sha, head), added, removed });
  }
  const current = anchorsAt(repo, head);
  const pinned: any[] = [];
  if (current) for (const k of Object.keys(current)) for (const fp of current[k]) {
    const by = introducedBy[k + ":" + fp] || null;
    pinned.push({ purpose: k, fingerprint: fp, introducedBy: by ? { sha: by.sha, signature: by.sig, signingKey: by.sigKey || null, author: by.author, committer: by.committer, date: by.date, pr: prOf(repo, by.sha, head) } : null,
      signedIntroduction: !!(by && by.sig === "G") });
  }
  const malformed = !!(current && current.__MALFORMED__);
  return { ok: true, ref, head, file: FILE, present: !!current, malformed, pinnedCount: pinned.length, pinned, changes,
    unknownPurposes: current ? Object.keys(current).filter((k) => !PURPOSES.includes(k)) : [],
    unsignedPins: pinned.filter((p) => !p.signedIntroduction).length,
    verdict: !current ? "ANCHOR_FILE_ABSENT" : malformed ? "ANCHOR_FILE_MALFORMED" : pinned.length === 0 ? "NO_ANCHORS_PINNED" : pinned.every((p) => p.signedIntroduction) ? "ALL_PINS_SIGNED_COMMITS" : "PINS_FROM_UNSIGNED_COMMITS",
    limits: "attribution by author/committer name proves nothing (provider and owner share the merging account); only a good commit signature (%G?=G) by an owner key is meaningful, and which keys are the owner's is itself an owner decision" };
}

function main(argv: string[]): void {
  const a = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const repo = path.resolve(a("--repo") || path.resolve(__dirname, __dirname.split(path.sep).includes("dist") ? "../../.." : "../.."));
  const r = audit(repo, a("--ref") || "origin/main");
  if (argv.includes("--json")) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  else if (!r.ok) process.stdout.write("[trust-anchor-audit] " + r.reason + "\n");
  else {
    process.stdout.write(`[trust-anchor-audit] ${r.ref}@${r.head.slice(0, 8)} verdict=${r.verdict} pinned=${r.pinnedCount} unsignedPins=${r.unsignedPins} changes=${r.changes.length}\n`);
    for (const p of r.pinned) process.stdout.write(`  PIN ${p.purpose} ${p.fingerprint.slice(0, 16)}… by ${p.introducedBy ? p.introducedBy.sha.slice(0, 8) + " sig=" + p.introducedBy.signature + " " + (p.introducedBy.pr || "no PR") : "UNKNOWN"}\n`);
    for (const c of r.changes) process.stdout.write(`  ${c.sha.slice(0, 8)} sig=${c.signature} +${c.added.length}/-${c.removed.length} ${c.pr || ""} ${c.subject.slice(0, 70)}\n`);
  }
  if (!r.ok || r.malformed) process.exit(1);
  if (argv.includes("--require-signed") && r.unsignedPins > 0) process.exit(1);
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { audit, FILE, PURPOSES };
export {};
