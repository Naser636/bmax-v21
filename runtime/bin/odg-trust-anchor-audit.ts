#!/usr/bin/env node
"use strict";
/*
 * V15 closure — TRUST_ANCHORS.json audit: DETECTION + ATTRIBUTION of every change to the owner trust anchors that LANDED
 * on a ref (default origin/main). READ-ONLY (git plumbing only).
 *
 * Method (inspection HIGH-1 fix): walk the ref's FIRST-PARENT chain — exactly the sequence of states main went through —
 * and compare the anchor file's blob at each step with the previous step (`git cat-file --batch-check`, one call). Every
 * step whose blob differs is a change: a direct commit, or a merge (PR #N from its "Merge pull request #N" subject). For a
 * merge, the commits that touched the file on the merged side (p0..merge, --full-history) are listed with their
 * signature status. No history simplification: a revoke followed by a re-pin through a merge is always visible.
 *
 * Strict parsing (inspection HIGH-2): any purpose whose value is not an array of strings ⇒ ANCHOR_FILE_MALFORMED.
 *
 * Signatures (inspection MED-1): %G? = G only means "signed by a key the AUDITOR's git trusts" (allowedSignersFile / gpg
 * keyring — configured by whoever runs the audit). A pin counts as OWNER-SIGNED only if every commit that introduced it
 * is G AND its signing key (%GK) is in --signer-keys <file> (one key id / fingerprint per line), which the owner keeps.
 * `--require-signed` without --signer-keys is refused (exit 2): it would prove nothing.
 *
 * What it is NOT: an enforcing control by itself (shared merging account); it makes every pin visible and attributable.
 *   npx tsx runtime/bin/odg-trust-anchor-audit.ts [--repo DIR] [--ref origin/main] [--signer-keys FILE] [--require-signed] [--json]
 */
const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const FILE = "docs/odg/evidence/TRUST_ANCHORS.json";
const PURPOSES = ["COLLECTION_ARTIFACT", "KNOWLEDGE_RECORD", "INSPECTION_RECORD", "MATURITY_EVIDENCE"];

function git(repo: string, args: string[], input?: string): { ok: boolean; out: string } {
  const r = cp.spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, input });
  return { ok: r.status === 0, out: r.stdout || "" };
}
/* parse(text) -> { ok, anchors } | { ok:false } — strict: every non-comment key must be an array of strings. A UTF-8 BOM
 * is stripped (consumers that require() the file strip it too — inspection LOW-3). */
function parse(text: string): any {
  let j: any; try { j = JSON.parse(text.replace(/^﻿/, "")); } catch { return { ok: false, why: "INVALID_JSON" }; }
  if (j === null || typeof j !== "object" || Array.isArray(j)) return { ok: false, why: "NOT_AN_OBJECT" };
  const anchors: Record<string, string[]> = {};
  for (const k of Object.keys(j)) {
    if (k === "//") continue;
    if (!Array.isArray(j[k]) || !j[k].every((x: any) => typeof x === "string")) return { ok: false, why: "NON_ARRAY_OR_NON_STRING_VALUE (" + k + ")" };
    anchors[k] = j[k].slice();
  }
  for (const p of PURPOSES) if (!anchors[p]) anchors[p] = [];
  return { ok: true, anchors };
}
function blobText(repo: string, blob: string): string { return git(repo, ["cat-file", "-p", blob]).out; }
function anchorsOf(repo: string, rev: string): Record<string, string[]> | null { const r = git(repo, ["show", rev + ":" + FILE]); if (!r.ok) return null; const q = parse(r.out); return q.ok ? q.anchors : null; }
function commitInfo(repo: string, sha: string): any {
  const [sig, key, author, committer, date, subject, parents] = git(repo, ["show", "-s", "--format=%G?%x1f%GK%x1f%an <%ae>%x1f%cn <%ce>%x1f%cI%x1f%s%x1f%P", sha]).out.replace(/\n$/, "").split("\x1f");
  return { sha, signature: sig, signingKey: key || null, author, committer, date, subject, parents: (parents || "").split(" ").filter(Boolean) };
}

function audit(repo: string, ref: string, signerKeys: string[] | null): any {
  const v = git(repo, ["rev-parse", "--verify", ref + "^{commit}"]);
  if (!v.ok) return { ok: false, reason: "REF_NOT_FOUND " + ref };
  const head = v.out.trim();
  const chain = git(repo, ["rev-list", "--first-parent", "--reverse", head]).out.split("\n").filter(Boolean);
  const blobs = git(repo, ["cat-file", "--batch-check=%(objectname) %(objecttype)"], chain.map((c: string) => c + ":" + FILE).join("\n") + "\n").out.split("\n");
  const ownerSigned = (ci: any) => ci.signature === "G" && !!signerKeys && !!ci.signingKey && signerKeys.includes(ci.signingKey);
  let prevBlob: string | null = null; let prev: any = { ok: true, anchors: Object.fromEntries(PURPOSES.map((p) => [p, []])) };
  const changes: any[] = []; const pinIntro: Record<string, any> = {}; let malformedAt: string | null = null;
  for (let i = 0; i < chain.length; i++) {
    const m = /^([0-9a-f]{40,64}) blob$/.exec(blobs[i] || ""); const blob = m ? m[1] : null;
    if (blob === prevBlob) continue;
    const step = commitInfo(repo, chain[i]);
    const cur = blob ? parse(blobText(repo, blob)) : { ok: true, anchors: Object.fromEntries(PURPOSES.map((p) => [p, []])), absent: true };
    const pr = /^Merge pull request #(\d+)/.exec(step.subject || "");
    // commits that actually authored the change: the step itself if direct, else every commit on the merged side touching the file
    const authors = step.parents.length > 1
      ? git(repo, ["log", "--full-history", "--format=%H", step.parents[0] + ".." + chain[i], "--", FILE]).out.split("\n").filter((s: string) => s && s !== chain[i]).map((s: string) => commitInfo(repo, s))
      : [step];
    // (re-inspection HIGH) a merge whose file blob equals NO parent's blob wrote content itself (conflict resolution /
    // octopus): the merge commit is then an AUTHOR too, so an unsigned merge can never launder a pin under a signed side.
    if (step.parents.length > 1 && blob) {
      const pb = git(repo, ["cat-file", "--batch-check=%(objectname)"], step.parents.map((q: string) => q + ":" + FILE).join("\n") + "\n").out.split("\n").filter(Boolean);
      if (!pb.includes(blob)) authors.push(step);
    }
    const added: any[] = [], removed: any[] = [];
    if (!cur.ok) { if (!malformedAt) malformedAt = chain[i]; }
    else {
      const keys = Array.from(new Set([...Object.keys(prev.ok ? prev.anchors : {}), ...Object.keys(cur.anchors)]));
      for (const k of keys) {
        const b = new Set(prev.ok ? prev.anchors[k] || [] : []), a = new Set(cur.anchors[k] || []);
        for (const fp of a) if (!b.has(fp)) { added.push({ purpose: k, fingerprint: fp }); pinIntro[k + "\u0000" + fp] = { step, authors, pr: pr ? "#" + pr[1] : "DIRECT" }; }
        for (const fp of b) if (!a.has(fp)) { removed.push({ purpose: k, fingerprint: fp }); delete pinIntro[k + "\u0000" + fp]; }
      }
    }
    changes.push({ sha: step.sha, kind: step.parents.length > 1 ? "MERGE" : "DIRECT", pr: pr ? "#" + pr[1] : (step.parents.length > 1 ? "MERGE_WITHOUT_PR_SUBJECT" : "DIRECT"),
      stepSignature: step.signature, subject: step.subject, date: step.date, malformed: !cur.ok ? cur.why : null, added, removed,
      authoredBy: authors.map((a: any) => ({ sha: a.sha, signature: a.signature, signingKey: a.signingKey, author: a.author, ownerSigned: ownerSigned(a) })) });
    prevBlob = blob; if (cur.ok) prev = cur;
  }
  const finalBlobLine = blobs[chain.length - 1] || ""; const present = /blob$/.test(finalBlobLine);
  const final = present ? parse(blobText(repo, finalBlobLine.split(" ")[0])) : null;
  const pinned: any[] = [];
  if (final && final.ok) for (const k of Object.keys(final.anchors)) for (const fp of final.anchors[k]) {
    const intro = pinIntro[k + "\u0000" + fp] || null;
    // (re-inspection MED E5) every author owner-signed AND at least one owner-signed author's OWN diff (vs its first
    // parent) adds this exact fingerprint — a provider pin carried in history under an owner commit is not credited.
    const addsIt = (ci: any) => { const p0 = ci.parents[0]; const before = p0 ? anchorsOf(repo, p0) : null; const after = anchorsOf(repo, ci.sha);
      return !!(after && (after[k] || []).includes(fp) && !(before && (before[k] || []).includes(fp))); };
    const allOwner = !!(intro && intro.authors.length && intro.authors.every(ownerSigned) && intro.authors.some((ci: any) => ownerSigned(ci) && addsIt(ci)));
    pinned.push({ purpose: k, fingerprint: fp, introducedAt: intro ? { step: intro.step.sha, pr: intro.pr, authoredBy: intro.authors.map((a: any) => ({ sha: a.sha, signature: a.signature, signingKey: a.signingKey })) } : null, ownerSigned: allOwner });
  }
  const malformed = !!(final && !final.ok);
  return { ok: true, ref, head, file: FILE, present, malformed, malformedReason: malformed ? final.why : null, malformedInHistory: malformedAt,
    pinnedCount: pinned.length, pinned, changes, signerKeysProvided: !!signerKeys,
    unknownPurposes: final && final.ok ? Object.keys(final.anchors).filter((k) => !PURPOSES.includes(k)) : [],
    pinsNotOwnerSigned: pinned.filter((p) => !p.ownerSigned).length,
    verdict: !present ? "ANCHOR_FILE_ABSENT" : malformed ? "ANCHOR_FILE_MALFORMED" : pinned.length === 0 ? "NO_ANCHORS_PINNED" : !signerKeys ? "PINS_PRESENT_SIGNERS_UNVERIFIED" : pinned.every((p) => p.ownerSigned) ? "ALL_PINS_OWNER_SIGNED" : "PINS_NOT_OWNER_SIGNED",
    limits: "author/committer names prove nothing (shared merging account); a pin is OWNER_SIGNED only if each introducing commit has a good signature (%G?=G) by a key listed in --signer-keys — the list and the auditor's git trust configuration are the owner's" };
}

function main(argv: string[]): void {
  const a = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const repo = path.resolve(a("--repo") || path.resolve(__dirname, __dirname.split(path.sep).includes("dist") ? "../../.." : "../.."));
  const sk = a("--signer-keys"); let signerKeys: string[] | null = null;
  if (sk) { try { signerKeys = fs.readFileSync(sk, "utf8").split("\n").map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith("#")); } catch { process.stderr.write("[trust-anchor-audit] cannot read --signer-keys\n"); process.exit(2); } }
  if (argv.includes("--require-signed") && !signerKeys) { process.stderr.write("[trust-anchor-audit] REFUSED: --require-signed needs --signer-keys <owner key list> (a bare %G?=G proves only 'signed by a key this git trusts')\n"); process.exit(2); }
  const r = audit(repo, a("--ref") || "origin/main", signerKeys);
  if (argv.includes("--json")) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  else if (!r.ok) process.stdout.write("[trust-anchor-audit] " + r.reason + "\n");
  else {
    process.stdout.write(`[trust-anchor-audit] ${r.ref}@${r.head.slice(0, 8)} verdict=${r.verdict} pinned=${r.pinnedCount} notOwnerSigned=${r.pinsNotOwnerSigned} changes=${r.changes.length}\n`);
    for (const p of r.pinned) process.stdout.write(`  PIN ${p.purpose} ${p.fingerprint.slice(0, 16)}… at ${p.introducedAt ? p.introducedAt.step.slice(0, 8) + " " + p.introducedAt.pr : "UNKNOWN"} ownerSigned=${p.ownerSigned}\n`);
    for (const c of r.changes) process.stdout.write(`  ${c.sha.slice(0, 8)} ${c.kind} ${c.pr} +${c.added.length}/-${c.removed.length}${c.malformed ? " MALFORMED" : ""} ${String(c.subject).slice(0, 60)}\n`);
  }
  if (!r.ok || r.malformed) process.exit(1);
  if (argv.includes("--require-signed") && (r.pinsNotOwnerSigned > 0 || !r.present)) process.exit(1);   // absent file ⇒ not a pass (re-inspection MED)
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { audit, parse, FILE, PURPOSES };
export {};
