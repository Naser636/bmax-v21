#!/usr/bin/env node
"use strict";
/* V12.4-EXT §18/§19/§20 — observation-currency decider. Proves: a memorized observation is CURRENT only while its world
 * is provably unchanged (same commit, or a known changed-set that misses its scope); crossing a commit/scope/time boundary
 * demotes it to HISTORICAL_OBSERVED (reverify) — it must NOT assert present state; hypothesis/superseded/expired/malformed
 * never assert; deny-by-default; composes memory-taxonomy.isStale; deterministic + frozen. */
const C = require("./odg-observation-currency.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const DAY = 86400000, T0 = Date.UTC(2026, 10, 16);
const obs = (o: any) => Object.assign({ claim: "x", observedAtEpochMs: T0, observedCommit: "d1c042f", scope: ["runtime"], method: "pgrep" }, o);

function main() {
  // CURRENT_OBSERVED: same commit, fresh, method-backed ⇒ assertable.
  const cur = C.assess(obs({}), { asOfEpochMs: T0 + DAY, currentCommit: "d1c042f" });
  check("same commit + fresh ⇒ CURRENT_OBSERVED and mayAssertCurrent", cur.currency === "CURRENT_OBSERVED" && cur.mayAssertCurrent === true && cur.reverifyRequired === false);

  // DEMOTION: commit advanced, scope touched ⇒ HISTORICAL_OBSERVED, NOT assertable, reverify.
  const hist = C.assess(obs({}), { asOfEpochMs: T0 + DAY, currentCommit: "zzz", changedPathsKnown: true, changedPaths: ["runtime/core/a.ts"] });
  check("commit advanced + scope touched ⇒ HISTORICAL_OBSERVED, mayAssertCurrent=false, reverify", hist.currency === "HISTORICAL_OBSERVED" && hist.mayAssertCurrent === false && hist.reverifyRequired === true);

  // deny-by-default: commit advanced, changed-set UNKNOWN ⇒ cannot prove untouched ⇒ HISTORICAL.
  const unk = C.assess(obs({}), { asOfEpochMs: T0 + DAY, currentCommit: "zzz" });
  check("commit advanced + unknown changed-set ⇒ HISTORICAL (deny-by-default), not current", unk.currency === "HISTORICAL_OBSERVED" && unk.mayAssertCurrent === false);

  // provably untouched: commit advanced but KNOWN changed-set misses scope ⇒ still CURRENT_OBSERVED.
  const untouched = C.assess(obs({}), { asOfEpochMs: T0 + DAY, currentCommit: "zzz", changedPathsKnown: true, changedPaths: ["docs/x.md"] });
  check("commit advanced + known changed-set misses scope ⇒ still CURRENT_OBSERVED", untouched.currency === "CURRENT_OBSERVED" && untouched.mayAssertCurrent === true);

  // EXPIRED via composed memory-taxonomy.isStale.
  const exp = C.assess(obs({ validityDays: 7 }), { asOfEpochMs: T0 + 30 * DAY, currentCommit: "d1c042f" });
  check("age > validityDays ⇒ EXPIRED (composed memory-taxonomy.isStale), not current", exp.currency === "EXPIRED" && exp.mayAssertCurrent === false && exp.reverifyRequired === true);

  // SUPERSEDED, HYPOTHESIS, PROPOSED, UNKNOWN never assert present state.
  check("supersededBy ⇒ SUPERSEDED, not current", C.assess(obs({ supersededBy: "y" }), { asOfEpochMs: T0, currentCommit: "d1c042f" }).currency === "SUPERSEDED");
  const hyp = C.assess({ claim: "m", kind: "HYPOTHESIS", observedAtEpochMs: T0, method: "guess" }, { asOfEpochMs: T0, currentCommit: "d1c042f" });
  check("HYPOTHESIS ⇒ never asserts present state (not an observation)", hyp.currency === "HYPOTHESIS" && hyp.mayAssertCurrent === false);
  check("PROPOSED ⇒ never asserts present state", C.assess({ claim: "m", kind: "PROPOSED", observedAtEpochMs: T0, method: "g" }, { asOfEpochMs: T0, currentCommit: "d1c042f" }).currency === "PROPOSED");
  check("malformed (no method) ⇒ UNKNOWN, not current, reverify", (() => { const r = C.assess({ claim: "x", observedAtEpochMs: T0 }, { asOfEpochMs: T0, currentCommit: "d1c042f" }); return r.currency === "UNKNOWN" && r.mayAssertCurrent === false && r.reverifyRequired === true; })());

  // strength grading when world unchanged.
  const corr = C.assess(obs({ independentlyVerified: true, corroboratingSources: 2 }), { asOfEpochMs: T0, currentCommit: "d1c042f" });
  check("independently verified + ≥2 sources ⇒ CORROBORATED (assertable)", corr.currency === "CORROBORATED" && corr.mayAssertCurrent === true);
  check("independently verified single path ⇒ VERIFIED", C.assess(obs({ independentlyVerified: true }), { asOfEpochMs: T0, currentCommit: "d1c042f" }).currency === "VERIFIED");

  // invariant: mayAssertCurrent ⟺ currency ∈ ASSERTABLE, across every scenario produced by demonstrate().
  const d = C.demonstrate();
  const all = Object.values(d.scenarios) as any[];
  check("INVARIANT: mayAssertCurrent ⟺ currency ∈ ASSERTABLE (CURRENT/VERIFIED/CORROBORATED), all scenarios", all.every((s: any) => s.mayAssertCurrent === C.ASSERTABLE.includes(s.currency)));
  check("V234 forensic demotion PROVEN: same-commit CURRENT_OBSERVED → commit-advanced HISTORICAL_OBSERVED", d.demotionProven === true && d.scenarios.v234_sameCommitFresh.currency === "CURRENT_OBSERVED" && d.scenarios.v234_commitAdvancedScopeTouched.currency === "HISTORICAL_OBSERVED");

  // §19 reconcile: anti-rediscovery partition (reuse vs re-verify vs not-an-observation).
  const rec = C.reconcile([obs({ id: "a" }), obs({ id: "b", validityDays: 1 }), { id: "h", claim: "m", kind: "HYPOTHESIS", observedAtEpochMs: T0, method: "g" }],
    { asOfEpochMs: T0 + 10 * DAY, currentCommit: "d1c042f" });
  check("reconcile partitions: fresh 'a' reusable, stale 'b' re-verify, hypothesis not-an-observation", rec.reusableCount === 1 && rec.reverifyCount === 1 && rec.notObservationCount === 1 && rec.assertableCurrent[0].id === "a");

  // determinism + frozen + contract.
  check("deterministic + frozen (assess + demonstrate)", JSON.stringify(C.demonstrate()) === JSON.stringify(d) && Object.isFrozen(cur) && Object.isFrozen(d) && Object.isFrozen(d.scenarios));
  check("contract: deny-by-default, composes memory-taxonomy, no 2nd store/primitive", C.OBSERVATION_CURRENCY_CONTRACT.invariants.some((i: string) => /DENY-BY-DEFAULT/.test(i)) && C.OBSERVATION_CURRENCY_CONTRACT.invariants.some((i: string) => /COMPOSES memory-taxonomy\.isStale/.test(i) && /NO 10th primitive/.test(i)));

  // V16.9 Phase 1b — evidence currency + commit binding (assessEvidenceCurrency / localGitProbes)
  {
    const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto");
    const ROOT = path.resolve(__dirname, "..", "..");
    const P = C.localGitProbes(ROOT);
    const head = String(cp.execFileSync("git", ["-C", ROOT, "rev-parse", `${P.mainRef}^{commit}`], { encoding: "utf8" })).trim();
    const fx = (o: any) => Object.freeze({ mainRef: "fixture-main", commitExists: () => true, isAncestorOfMain: () => true, fileSha256: () => null, ...o });
    check("evidence: a record with no binding field ⇒ NOT_CHECKABLE (never CURRENT), usable (nothing to refute)", (() => { const r = C.assessEvidenceCurrency({ note: "x" }, P); return r.status === "NOT_CHECKABLE" && r.bindings.length === 0; })());
    check("evidence: session ids / run ids are NOT commit bindings (explicit field names only)", C.extractBindings({ inspectorSessionId: "ab6a445c9679c2387", runId: "67be602e6ec7047a", history: [{ head: "587650b0" }] }).commits.length === 0);
    const real = C.assessEvidenceCurrency({ inspectedHeadSha: head }, P);
    check("evidence REAL git: inspectedHeadSha = the main ref's commit ⇒ CURRENT, usableAsProof", real.status === "CURRENT" && real.usableAsProof === true && real.counts.CURRENT === 1);
    const ghost = C.assessEvidenceCurrency({ inspectedHeadSha: "deadbeef".repeat(5) }, P);
    check("evidence REAL git: well-formed but NON-EXISTENT inspectedHeadSha ⇒ WRONG_COMMIT, NOT usable", ghost.status === "WRONG_COMMIT" && ghost.usableAsProof === false && ghost.blocking.join() === "inspectedHeadSha");
    check("evidence: commit exists but not an ancestor of main ⇒ WRONG_COMMIT", C.assessEvidenceCurrency({ headAtCheckpoint: "a".repeat(40) }, fx({ isAncestorOfMain: () => false })).status === "WRONG_COMMIT");
    check("evidence: no probe injected ⇒ NOT_CHECKABLE/NO_PROBE and NOT usable (fail-closed)", (() => { const r = C.assessEvidenceCurrency({ inspectedHeadSha: head }); return r.status === "NOT_CHECKABLE" && r.usableAsProof === false && r.bindings[0].why === "NO_PROBE"; })());
    check("evidence: requireCommitBinding with no commit field ⇒ NOT usable", C.assessEvidenceCurrency({ x: 1 }, P, { requireCommitBinding: true }).usableAsProof === false);
    // cited file hashes: a temp git-less dir is enough for file probes (labelled fixture files, removed after)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocur-ev-"));
    try {
      fs.writeFileSync(path.join(dir, "data.json"), "v1\n"); fs.writeFileSync(path.join(dir, "ctx.json"), "c1\n");
      const h = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
      const FP = C.localGitProbes(dir, { mainRef: "main" });
      const rec = { inputs: { dataset: { path: "data.json", sha256: h("v1\n") }, contracts: { path: "ctx.json", sha256File: h("c1\n") } } };
      check("evidence: cited dataset + context hashes match the files today ⇒ CURRENT", C.assessEvidenceCurrency(rec, FP).status === "CURRENT");
      fs.writeFileSync(path.join(dir, "data.json"), "v2\n");
      const st = C.assessEvidenceCurrency(rec, C.localGitProbes(dir, { mainRef: "main" }));
      check("evidence: CITED DATASET CHANGED since ⇒ STALE (decisive) ⇒ NOT usable", st.status === "STALE" && st.usableAsProof === false && st.blocking.join() === "inputs.dataset");
      fs.writeFileSync(path.join(dir, "data.json"), "v1\n"); fs.writeFileSync(path.join(dir, "ctx.json"), "c2\n");
      const ctx = C.assessEvidenceCurrency(rec, C.localGitProbes(dir, { mainRef: "main" }));
      check("evidence: a CONTEXT citation (multi-record file) changed ⇒ STALE reported but still usable (decisive bindings checked by the caller)", ctx.status === "STALE" && ctx.usableAsProof === true && ctx.blocking.length === 0);
      fs.unlinkSync(path.join(dir, "data.json"));
      check("evidence: cited dataset DELETED ⇒ STALE, NOT usable", C.assessEvidenceCurrency(rec, C.localGitProbes(dir, { mainRef: "main" })).usableAsProof === false);
      check("evidence: a path escaping the repo ('..') ⇒ NOT_CHECKABLE (never read)", C.assessEvidenceCurrency({ ev: { path: "../etc/passwd", sha256: h("x") } }, FP).bindings[0].status === "NOT_CHECKABLE");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    check("evidence: contractSha256 ≠ the current contract entry ⇒ STALE (decisive)", C.assessEvidenceCurrency({ contractSha256: "1".repeat(64) }, P, { currentContractSha256: "2".repeat(64) }).usableAsProof === false);
    check("evidence: limits state what is NOT established (real-but-wrong ancestor, remote, claim truth)", C.EVIDENCE_CURRENCY_LIMITS.doesNotEstablish.length >= 3 && /remote/.test(C.EVIDENCE_CURRENCY_LIMITS.doesNotEstablish.join(" ")));
  }

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — observation-currency (V12.4-EXT §18/§19/§20: memoire != etat actuel — CURRENT only while world provably unchanged; commit/scope/time boundary ⇒ HISTORICAL_OBSERVED reverify; hypothesis/superseded/expired/malformed never assert; deny-by-default; composes memory-taxonomy.isStale; V234 demotion proven)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
