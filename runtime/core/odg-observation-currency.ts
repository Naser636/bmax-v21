#!/usr/bin/env node
"use strict";

/*
 * V12.4-EXT §18/§19/§20 — OBSERVATION CURRENCY DECIDER (memoire != etat actuel). PURE, deterministic (asOf injected,
 * no clock/random). It answers the central rule of the extension directive: "ODG ne doit jamais confondre une
 * information memorisee avec une observation actuelle." A memorized observation was true at ITS commit and ITS instant;
 * crossing a commit/scope/time boundary demotes it from CURRENT_OBSERVED to HISTORICAL_OBSERVED, and it may then be used
 * to understand history but NOT to assert that the repo/VPS is still in that state — it must be RE-VERIFIED first.
 *
 * This is NOT a second memory store, NOT a 10th primitive, NOT a parallel truth base (§16). It is the missing CURRENCY
 * lens the existing stores lacked: memory-taxonomy classifies family/quality at WRITE time; memory-trust-gate checks
 * author/tamper/staleness at RETRIEVAL time; neither decides "does this observation still describe the CURRENT world,
 * or only a PAST one?". It COMPOSES memory-taxonomy.isStale for the expiry signal (no duplicated staleness math).
 *
 * DENY-BY-DEFAULT: mayAssertCurrent is true ONLY for a method-backed, non-superseded, non-expired observation whose
 * world is PROVABLY unchanged in the claim's scope — same commit, or a known changed-set that provably misses the scope.
 * Unknown changed-set ⇒ cannot prove untouched ⇒ HISTORICAL_OBSERVED (reverify). A hypothesis/proposal is never current.
 *
 * Forensic motive: V234 observed "no resident campaign-loop driver; odg-radar-weekly.timer runs" at commit d1c042f on
 * 2026-11-16 — a CURRENT_OBSERVED fact THEN. Reused next week, at a new commit, without re-observing, it is only
 * HISTORICAL_OBSERVED and must not assert present VPS state. This module makes that demotion explicit and testable.
 */

const TAX = require("./memory-taxonomy.js");   // isStale(rec, asOf) — the canonical staleness check (composed, not re-derived)

const DAY_MS = 86400000;
// §18 currency ladder (observation currency, distinct from memory-taxonomy QUALITY/CONSOLIDATION).
const CURRENCY = Object.freeze([
  "CURRENT_OBSERVED", "HISTORICAL_OBSERVED", "VERIFIED", "CORROBORATED",
  "HYPOTHESIS", "PROPOSED", "SUPERSEDED", "EXPIRED", "UNKNOWN",
]);
// currencies that are allowed to assert present state (deny-by-default: everything else cannot).
const ASSERTABLE = Object.freeze(["CURRENT_OBSERVED", "VERIFIED", "CORROBORATED"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function arr(v: any): string[] { return Array.isArray(v) ? v.filter(isStr) : []; }

// Do any of the claim's scope paths intersect the changed set? Prefix-aware: "runtime" matches "runtime/core/x.ts".
function scopeIntersectsChanged(scope: string[], changed: string[]): boolean {
  return scope.some((s) => changed.some((c) => c === s || c.startsWith(s + "/") || s.startsWith(c + "/")));
}

/*
 * assess(observation, context) -> { currency, mayAssertCurrent, reverifyRequired, reasons }.
 * observation: { id, claim, kind?("OBSERVATION"|"HYPOTHESIS"|"PROPOSED"), observedAtEpochMs, observedCommit, scope:[],
 *                method, confidence?, validityDays?, independentlyVerified?, corroboratingSources?, supersededBy? }
 * context: { asOfEpochMs, currentCommit, changedPaths?:[], changedPathsKnown?:bool }
 * Deterministic. Fail-closed: any un-provable "still current" lands on HISTORICAL_OBSERVED (reverify), never on current.
 */
function assess(observation: any, context: any): any {
  const rec = isObj(observation) ? observation : {};
  const ctx = isObj(context) ? context : {};
  const reasons: string[] = [];
  const out = (currency: string, mayAssertCurrent: boolean, reverifyRequired: boolean) =>
    Object.freeze({ currency, mayAssertCurrent, reverifyRequired, reasons: Object.freeze(reasons.slice()) });

  // 0. malformed — not even a usable observation.
  if (!isStr(rec.claim) || !isNum(rec.observedAtEpochMs) || !isStr(rec.method)) {
    reasons.push("malformed observation (claim/observedAtEpochMs/method required) ⇒ UNKNOWN; cannot assert current");
    return out("UNKNOWN", false, true);
  }
  // 1. kind gating — a hypothesis/proposal is never an observation of the present.
  const kind = isStr(rec.kind) ? rec.kind : "OBSERVATION";
  if (kind === "HYPOTHESIS") { reasons.push("kind=HYPOTHESIS — never asserts present state (not an observation)"); return out("HYPOTHESIS", false, false); }
  if (kind === "PROPOSED") { reasons.push("kind=PROPOSED — never asserts present state (not an observation)"); return out("PROPOSED", false, false); }

  // 2. explicit supersession by a newer contradicting observation.
  if (isStr(rec.supersededBy)) { reasons.push("supersededBy=" + rec.supersededBy + " — a newer observation replaces it ⇒ must re-verify"); return out("SUPERSEDED", false, true); }

  // 3. expiry — COMPOSE memory-taxonomy.isStale via a validUntil derived from validityDays (no duplicated math).
  if (isNum(rec.validityDays) && isNum(ctx.asOfEpochMs)) {
    const validUntil = rec.observedAtEpochMs + rec.validityDays * DAY_MS;
    if (TAX.isStale({ validUntil }, ctx.asOfEpochMs)) {
      reasons.push("age > validityDays (" + rec.validityDays + "d) ⇒ EXPIRED (memory-taxonomy.isStale) — must re-observe");
      return out("EXPIRED", false, true);
    }
  }

  // 4. commit/scope boundary — the core "memoire != etat actuel" rule. Deny-by-default.
  const scope = arr(rec.scope);
  const sameCommit = isStr(rec.observedCommit) && isStr(ctx.currentCommit) && rec.observedCommit === ctx.currentCommit;
  let worldUnchangedInScope = false;
  if (sameCommit) {
    worldUnchangedInScope = true;
    reasons.push("observedCommit === currentCommit — world has not moved under this observation");
  } else if (isStr(rec.observedCommit) && isStr(ctx.currentCommit)) {
    // commit advanced: only CURRENT if we have a KNOWN changed-set that PROVABLY misses the claim's scope.
    if (ctx.changedPathsKnown === true && scope.length > 0 && !scopeIntersectsChanged(scope, arr(ctx.changedPaths))) {
      worldUnchangedInScope = true;
      reasons.push("commit advanced but the KNOWN changed-set provably misses this scope — observation still describes it");
    } else {
      reasons.push("commit advanced and scope-untouched is NOT provable (unknown changed-set or scope intersects changes) ⇒ HISTORICAL");
    }
  } else {
    reasons.push("observedCommit/currentCommit missing — cannot prove same world ⇒ HISTORICAL (deny-by-default)");
  }

  if (!worldUnchangedInScope) return out("HISTORICAL_OBSERVED", false, true);

  // 5. the observation still describes the present world — grade its strength.
  if (rec.independentlyVerified === true && isNum(rec.corroboratingSources) && rec.corroboratingSources >= 2) {
    reasons.push("independently verified with ≥2 corroborating sources ⇒ CORROBORATED");
    return out("CORROBORATED", true, false);
  }
  if (rec.independentlyVerified === true) { reasons.push("independently verified (single path) ⇒ VERIFIED"); return out("VERIFIED", true, false); }
  reasons.push("method-backed, in-scope, non-stale, world unchanged ⇒ CURRENT_OBSERVED (assertable)");
  return out("CURRENT_OBSERVED", true, false);
}

/*
 * reconcile(observations, context) -> the §19 anti-rediscovery decision: partition a memory set into what may be
 * REUSED as current (skip re-observation) vs what MUST be re-verified vs what is not an assertable observation.
 * "ne refaire que le travail reellement necessaire." Pure projection over assess(); mutates nothing.
 */
function reconcile(observations: any, context: any): any {
  const list = Array.isArray(observations) ? observations : [];
  const assertableCurrent: any[] = [], mustReverify: any[] = [], notAnObservation: any[] = [];
  for (const o of list) {
    const a = assess(o, context);
    const row = Object.freeze({ id: isObj(o) && isStr(o.id) ? o.id : null, currency: a.currency, mayAssertCurrent: a.mayAssertCurrent, reverifyRequired: a.reverifyRequired });
    if (a.mayAssertCurrent) assertableCurrent.push(row);
    else if (a.reverifyRequired) mustReverify.push(row);
    else notAnObservation.push(row);
  }
  return Object.freeze({
    total: list.length,
    reusableCount: assertableCurrent.length,
    reverifyCount: mustReverify.length,
    notObservationCount: notAnObservation.length,
    assertableCurrent: Object.freeze(assertableCurrent),
    mustReverify: Object.freeze(mustReverify),
    notAnObservation: Object.freeze(notAnObservation),
    note: "§19 anti-rediscovery: reuse assertableCurrent as present fact; re-observe mustReverify; notAnObservation cannot assert present state",
  });
}

/*
 * demonstrate() -> deterministic real-shaped scenarios, including the V234 forensic observation, proving the demotion
 * from CURRENT_OBSERVED to HISTORICAL_OBSERVED across a commit/scope boundary. All epochs fixed (no clock).
 */
function demonstrate(): any {
  const T0 = Date.UTC(2026, 10, 16);                 // 2026-11-16 (deterministic constant, not a live clock)
  const v234 = Object.freeze({ id: "v234-no-resident-driver", claim: "no resident campaign-loop driver process; odg-radar-weekly.timer runs",
    kind: "OBSERVATION", observedAtEpochMs: T0, observedCommit: "d1c042f", scope: ["runtime", "systemd-user"], method: "pgrep + systemctl --user list-timers", validityDays: 7 });

  const sameCommitNow = { asOfEpochMs: T0 + DAY_MS, currentCommit: "d1c042f" };                                  // 1 day later, same commit
  const advancedTouched = { asOfEpochMs: T0 + 2 * DAY_MS, currentCommit: "abc1234", changedPathsKnown: true, changedPaths: ["runtime/core/x.ts"] };
  const advancedUntouched = { asOfEpochMs: T0 + 2 * DAY_MS, currentCommit: "abc1234", changedPathsKnown: true, changedPaths: ["docs/readme.md"] };
  const advancedUnknown = { asOfEpochMs: T0 + 2 * DAY_MS, currentCommit: "abc1234" };                            // changed-set unknown
  const expiredCtx = { asOfEpochMs: T0 + 30 * DAY_MS, currentCommit: "d1c042f" };                                // 30d > 7d validity

  const scenarios = Object.freeze({
    v234_sameCommitFresh: assess(v234, sameCommitNow),                                                           // CURRENT_OBSERVED
    v234_commitAdvancedScopeTouched: assess(v234, advancedTouched),                                              // HISTORICAL_OBSERVED
    v234_commitAdvancedScopeUntouched: assess(v234, advancedUntouched),                                          // CURRENT_OBSERVED (provably untouched)
    v234_commitAdvancedUnknownChanges: assess(v234, advancedUnknown),                                            // HISTORICAL_OBSERVED (deny-by-default)
    v234_expired: assess(v234, expiredCtx),                                                                      // EXPIRED
    superseded: assess({ claim: "x", observedAtEpochMs: T0, method: "m", observedCommit: "d1c042f", supersededBy: "obs-99" }, sameCommitNow), // SUPERSEDED
    hypothesis: assess({ claim: "maybe", kind: "HYPOTHESIS", observedAtEpochMs: T0, method: "guess" }, sameCommitNow),                        // HYPOTHESIS
    malformed: assess({ claim: "x" }, sameCommitNow),                                                            // UNKNOWN
  });

  const recon = reconcile([v234, { id: "hyp", claim: "maybe", kind: "HYPOTHESIS", observedAtEpochMs: T0, method: "g" }], advancedUnknown);
  return Object.freeze({ scenarios, reconcileExample: recon,
    demotionProven: scenarios.v234_sameCommitFresh.currency === "CURRENT_OBSERVED" && scenarios.v234_commitAdvancedScopeTouched.currency === "HISTORICAL_OBSERVED" });
}

/*
 * ── V16.9 Phase 1b — EVIDENCE CURRENCY + COMMIT BINDING (addendum §22 proof attributes "sa fraîcheur", "son lien avec le
 * commit et le contrat"; Phase 0 gap #3 "old or wrong proofs go unflagged"). The same currency lens, applied to a
 * COMMITTED EVIDENCE RECORD instead of a memorized observation: does each commit the record binds to really exist in
 * local git and belong to main's history, and does each file hash it cites still match the file today?
 *
 * assessEvidenceCurrency(record, probes, opts?) is PURE over the injected probes (no fs/git here):
 *   probes = { commitExists(sha) → bool, isAncestorOfMain(sha) → bool, fileSha256(repoRel) → hex | null, mainRef? }
 *   opts   = { currentContractSha256?: hex }   (when given, record.contractSha256 is compared with it — decisive)
 * Bindings extracted (explicit field names only — never "any hex string": session ids are hex too):
 *   COMMIT  every key in COMMIT_BINDING_KEYS with a 7–40 hex value, at any depth
 *   FILE    every object carrying a repo-relative `path` and a 64-hex `sha256`/`sha256File`; plus `dataset` + `datasetSha256`
 *   CONTRACT record.contractSha256 vs opts.currentContractSha256
 * Per binding: CURRENT · STALE (cited file changed or gone since / contract entry changed) · WRONG_COMMIT (commit absent
 * from local git, ambiguous, or not an ancestor of main) · NOT_CHECKABLE (field absent, path not repo-relative, or no
 * probe injected ⇒ never silently CURRENT). Record status = WRONG_COMMIT > STALE > NOT_CHECKABLE(no probe) > CURRENT >
 * NOT_CHECKABLE(no binding field at all).
 * usableAsProof (deny-by-default) is false on: any WRONG_COMMIT; a STALE DECISIVE binding (the contract entry, a dataset,
 * or the graded experiment record); a binding left unverified for want of a probe; and, when opts.requireCommitBinding,
 * no verified commit binding at all. A STALE CONTEXT citation (a file-level hash of a multi-record file such as the
 * contracts file, or of an input record that the caller re-validates itself) is REPORTED, not blocking — the decisive
 * entry-level bindings (contractSha256, experimentSha256) are checked by the caller.
 * ESTABLISHES / DOES NOT ESTABLISH: see EVIDENCE_CURRENCY_LIMITS.
 */
const COMMIT_BINDING_KEYS = Object.freeze(["inspectedHeadSha", "inspectedHead", "headAtCheckpoint", "mergeCommit", "merge", "generatedAtHead"]);
const EVIDENCE_STATUS = Object.freeze(["CURRENT", "STALE", "WRONG_COMMIT", "NOT_CHECKABLE"]);
const COMMIT_HEX = /^[0-9a-f]{7,40}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const DECISIVE_FILE_FIELD = /(^|\.)(dataset|datasetSha256|experimentEvidence)(\.|$)/i;
const EVIDENCE_CURRENCY_LIMITS = Object.freeze({
  establishes: Object.freeze([
    "each cited commit exists in the LOCAL git object store and is an ancestor of the main ref (offline: git cat-file -e / merge-base --is-ancestor)",
    "each cited file hash equals the sha256 of that file's bytes TODAY (or the file is gone ⇒ STALE)",
    "record.contractSha256 equals the CURRENT contract entry's sha256 when the caller supplies it",
  ]),
  doesNotEstablish: Object.freeze([
    "that the cited commit is the one the author actually ran on (a real-but-wrong ancestor commit passes)",
    "that the record's claims are true, or that an inspection was independent (other rules decide that)",
    "anything about the remote: a commit absent locally but present on GitHub is WRONG_COMMIT here (offline, fail-closed)",
    "freshness of a claim that cites no commit/file hash (NOT_CHECKABLE, never CURRENT)",
  ]),
});

function relPathSafe(p: any): boolean { return isStr(p) && !p.startsWith("/") && !/\\|\0/.test(p) && !p.split("/").some((x: string) => x === ".." || x === ""); }
/* extractBindings(record) → { commits:[{field, sha}], files:[{field, path, sha256, decisive}] } — explicit field names only. */
function extractBindings(record: any): any {
  const commits: any[] = [], files: any[] = [];
  const walk = (o: any, at: string, depth: number): void => {
    if (depth > 12 || o === null || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach((v, i) => walk(v, `${at}[${i}]`, depth + 1)); return; }
    const fsha = isStr(o.sha256) && SHA256_HEX.test(o.sha256) ? o.sha256 : isStr(o.sha256File) && SHA256_HEX.test(o.sha256File) ? o.sha256File : null;
    if (isStr(o.path) && fsha) files.push({ field: at || "(root)", path: o.path, sha256: fsha, decisive: DECISIVE_FILE_FIELD.test(at) });
    if (isStr(o.dataset) && isStr(o.datasetSha256) && SHA256_HEX.test(o.datasetSha256)) files.push({ field: `${at ? at + "." : ""}datasetSha256`, path: o.dataset, sha256: o.datasetSha256, decisive: true });
    for (const k of Object.keys(o)) {
      const v = o[k];
      const here = at ? `${at}.${k}` : k;
      if (COMMIT_BINDING_KEYS.includes(k) && isStr(v) && COMMIT_HEX.test(v)) commits.push({ field: here, sha: v });
      else if (v && typeof v === "object") walk(v, here, depth + 1);
    }
  };
  walk(isObj(record) ? record : {}, "", 0);
  return { commits, files };
}

function assessEvidenceCurrency(record: any, probes?: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const pr = isObj(probes) ? probes : null;
  const has = (f: string) => !!pr && typeof pr[f] === "function";
  const call = (f: string, x: string): any => { try { return pr[f](x); } catch { return null; } };
  const { commits, files } = extractBindings(record);
  const bindings: any[] = [];
  for (const c of commits) {
    if (!has("commitExists") || !has("isAncestorOfMain")) { bindings.push({ kind: "COMMIT", field: c.field, value: c.sha, status: "NOT_CHECKABLE", why: "NO_PROBE", decisive: true, reason: "no git probe injected — commit existence not verified (never assumed)" }); continue; }
    const exists = call("commitExists", c.sha) === true;
    const anc = exists && call("isAncestorOfMain", c.sha) === true;
    bindings.push({ kind: "COMMIT", field: c.field, value: c.sha, status: anc ? "CURRENT" : "WRONG_COMMIT", decisive: true,
      reason: !exists ? "commit absent from local git (or ambiguous short sha)" : !anc ? `commit exists but is not an ancestor of ${pr.mainRef || "main"}` : `exists and is an ancestor of ${pr.mainRef || "main"}` });
  }
  for (const f of files) {
    if (!relPathSafe(f.path)) { bindings.push({ kind: "FILE", field: f.field, path: f.path, status: "NOT_CHECKABLE", why: "PATH_NOT_REPO_RELATIVE", decisive: f.decisive, reason: "cited path is not repo-relative" }); continue; }
    if (!has("fileSha256")) { bindings.push({ kind: "FILE", field: f.field, path: f.path, status: "NOT_CHECKABLE", why: "NO_PROBE", decisive: f.decisive, reason: "no file probe injected — hash not verified" }); continue; }
    const now = call("fileSha256", f.path);
    bindings.push({ kind: "FILE", field: f.field, path: f.path, recorded: f.sha256, current: now || null, status: now === f.sha256 ? "CURRENT" : "STALE", decisive: f.decisive,
      reason: now === f.sha256 ? "cited hash matches the file today" : now ? "cited file changed since the record was written" : "cited file no longer exists" });
  }
  if (isObj(record) && isStr(record.contractSha256) && isStr(o.currentContractSha256)) {
    const ok = record.contractSha256 === o.currentContractSha256;
    bindings.push({ kind: "CONTRACT", field: "contractSha256", value: record.contractSha256, current: o.currentContractSha256, status: ok ? "CURRENT" : "STALE", decisive: true, reason: ok ? "bound to the current contract entry" : "contract entry changed since the record was written" });
  }
  const any = (st: string, pred: (b: any) => boolean = () => true) => bindings.some((b) => b.status === st && pred(b));
  const noProbe = bindings.some((b) => b.why === "NO_PROBE");
  const status = any("WRONG_COMMIT") ? "WRONG_COMMIT" : any("STALE") ? "STALE" : noProbe ? "NOT_CHECKABLE" : any("CURRENT") ? "CURRENT" : "NOT_CHECKABLE";
  const blocking = bindings.filter((b) => b.status === "WRONG_COMMIT" || (b.status === "STALE" && b.decisive) || (b.why === "NO_PROBE" && b.decisive));
  const verifiedCommit = bindings.some((b) => b.kind === "COMMIT" && b.status === "CURRENT");
  if (o.requireCommitBinding === true && !verifiedCommit && !blocking.length) blocking.push({ kind: "COMMIT", field: "(none)", status: "NOT_CHECKABLE", why: "FIELD_ABSENT", decisive: true, reason: "no verified commit binding (required)" });
  const counts: any = {}; for (const s of EVIDENCE_STATUS) counts[s] = bindings.filter((b) => b.status === s).length;
  const reason = blocking.length ? blocking.map((b) => `${b.field}: ${b.status}${b.why ? "/" + b.why : ""} — ${b.reason}`).join("; ")
    : status === "NOT_CHECKABLE" ? "no commit/file/contract binding present — freshness not checkable (not asserted)"
    : bindings.filter((b) => b.status === "STALE").length ? `usable: only non-decisive context citations are STALE (${bindings.filter((b) => b.status === "STALE").map((b) => b.field).join(", ")})` : "all bindings CURRENT";
  return Object.freeze({ status, usableAsProof: blocking.length === 0, reason, counts: Object.freeze(counts), bindings: Object.freeze(bindings.map((b) => Object.freeze(b))),
    blocking: Object.freeze(blocking.map((b) => b.field)), mainRef: pr && pr.mainRef ? String(pr.mainRef) : null, limits: EVIDENCE_CURRENCY_LIMITS });
}

/*
 * localGitProbes(repoRoot, opts?) — the ONLY I/O entry of this module (read-only, offline): `git cat-file -e <sha>^{commit}`,
 * `git merge-base --is-ancestor <sha> <mainRef>` (mainRef = opts.mainRef, else origin/main if it resolves, else main) and
 * sha256 of a repo-relative file's bytes. Memoized per probe object. Never writes, never fetches. Callers that load
 * committed records (odg-strategic-select.loadSources, odg-go readState, the V16.9 continuity runner) inject it.
 */
function localGitProbes(repoRoot: string, opts?: any): any {
  const cp = require("child_process"), fs = require("fs"), path = require("path"), crypto = require("crypto");
  const root = path.resolve(String(repoRoot));
  const git = (args: string[]): boolean => { try { cp.execFileSync("git", ["-C", root, ...args], { stdio: ["ignore", "ignore", "ignore"] }); return true; } catch { return false; } };
  const o = isObj(opts) ? opts : {};
  const mainRef = isStr(o.mainRef) ? o.mainRef : (git(["rev-parse", "--verify", "--quiet", "origin/main^{commit}"]) ? "origin/main" : "main");
  const memo = new Map<string, any>();
  const m = (k: string, f: () => any) => { if (!memo.has(k)) memo.set(k, f()); return memo.get(k); };
  const hex = (s: any) => isStr(s) && COMMIT_HEX.test(s);
  return Object.freeze({
    label: `local git (offline) at repo root; main ref ${mainRef}`, mainRef,
    commitExists: (sha: string) => hex(sha) && m("e:" + sha, () => git(["cat-file", "-e", `${sha}^{commit}`])),
    isAncestorOfMain: (sha: string) => hex(sha) && m("a:" + sha, () => git(["merge-base", "--is-ancestor", sha, mainRef])),
    fileSha256: (rel: string) => relPathSafe(rel) ? m("f:" + rel, () => { try { return crypto.createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex"); } catch { return null; } }) : null,
  });
}

const OBSERVATION_CURRENCY_CONTRACT = Object.freeze({
  id: "V124EXT-OBSERVATION-CURRENCY",
  purpose: "§18/§19/§20 — decide whether a memorized observation may be asserted as CURRENT state or is only HISTORICAL and must be re-verified; the memoire != etat actuel rule",
  invariants: Object.freeze([
    "DENY-BY-DEFAULT: mayAssertCurrent true ONLY for CURRENT_OBSERVED/VERIFIED/CORROBORATED with a PROVABLY-unchanged world in the claim's scope",
    "commit advanced + scope-untouched NOT provable (unknown changed-set or intersection) ⇒ HISTORICAL_OBSERVED (reverify), never current",
    "a hypothesis/proposal/superseded/expired/malformed observation NEVER asserts present state",
    "COMPOSES memory-taxonomy.isStale for expiry; adds NO second store, NO 10th primitive, NO parallel truth base; deterministic (asOf injected)",
    "V16.9 evidence currency: a committed record is usableAsProof only if no cited commit is WRONG_COMMIT (absent / not an ancestor of main), no DECISIVE citation is STALE and no binding was left unverified for want of a probe; a record without bindings is NOT_CHECKABLE, never CURRENT",
  ]),
});

module.exports = { CURRENCY, ASSERTABLE, assess, reconcile, demonstrate, OBSERVATION_CURRENCY_CONTRACT, EVIDENCE_STATUS, COMMIT_BINDING_KEYS, EVIDENCE_CURRENCY_LIMITS, extractBindings, assessEvidenceCurrency, localGitProbes };
export {};
