#!/usr/bin/env node
"use strict";
/* V293 Lot A — tests for odg-artifact-identity (qualification control C11). Hermetic (injected archive bytes). Asserts
 * real sha256 (known-answer), determinism/reproducibility, fail-closed on bad input, and the deploy-the-qualified-commit
 * protection (verify accepts ONLY a matching commit AND digest). */
const A = require("./odg-artifact-identity.js");
const crypto = require("crypto");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

const COMMIT = "250aa025f3f0bcb02906b426cd2e9b3936b2bb58";

function main() {
  // real sha256 (known-answer: sha256("abc")).
  const id = A.computeArtifactIdentity({ commit: COMMIT, archive: "abc" });
  check("computes a REAL sha256 (known-answer for 'abc')", id.ok && id.treeDigest === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" && id.byteLength === 3);
  // determinism / reproducibility: identical bytes ⇒ identical digest.
  check("reproducible: identical archive bytes ⇒ identical digest", A.computeArtifactIdentity({ commit: COMMIT, archive: "same" }).treeDigest === A.computeArtifactIdentity({ commit: COMMIT, archive: "same" }).treeDigest);
  check("different bytes ⇒ different digest", A.computeArtifactIdentity({ commit: COMMIT, archive: "a" }).treeDigest !== A.computeArtifactIdentity({ commit: COMMIT, archive: "b" }).treeDigest);
  // accepts Buffer + Uint8Array equivalently.
  check("Buffer and Uint8Array of the same bytes ⇒ same digest", A.computeArtifactIdentity({ commit: COMMIT, archive: Buffer.from("xy") }).treeDigest === A.computeArtifactIdentity({ commit: COMMIT, archive: new Uint8Array([120, 121]) }).treeDigest);

  // fail-closed on bad input.
  check("missing/invalid commit ⇒ fail-closed", A.computeArtifactIdentity({ archive: "x" }).ok === false && A.computeArtifactIdentity({ commit: "nothex!", archive: "x" }).ok === false);
  check("missing/empty archive ⇒ fail-closed", A.computeArtifactIdentity({ commit: COMMIT }).ok === false && A.computeArtifactIdentity({ commit: COMMIT, archive: "" }).ok === false);

  // PROTECTION: verify accepts ONLY a matching commit AND digest (deploy-the-qualified-commit).
  const expected = { commit: COMMIT, treeDigest: crypto.createHash("sha256").update("ARTIFACT_BYTES").digest("hex") };
  check("verify: exact commit+digest match ⇒ ok", A.verifyArtifactIdentity(expected, { commit: COMMIT, archive: "ARTIFACT_BYTES" }).ok === true);
  check("verify: digest mismatch (tampered/other build) ⇒ REFUSED", (() => { const r = A.verifyArtifactIdentity(expected, { commit: COMMIT, archive: "DIFFERENT_BYTES" }); return r.ok === false && /treeDigest mismatch/.test(r.reason); })());
  check("verify: commit mismatch ⇒ REFUSED (never deploy a different commit)", A.verifyArtifactIdentity(expected, { commit: "0000000000000000000000000000000000000000", archive: "ARTIFACT_BYTES" }).ok === false);
  check("verify: incomplete expected identity ⇒ fail-closed", A.verifyArtifactIdentity({ commit: COMMIT }, { commit: COMMIT, archive: "ARTIFACT_BYTES" }).ok === false && A.verifyArtifactIdentity({}, { commit: COMMIT, archive: "x" }).ok === false);

  // determinism of the identity object + contract + spec.
  check("identity object is frozen + carries the reproducible algorithm label", Object.isFrozen(id) && /sha256\(git archive/.test(id.algorithm));
  check("contract: reproducible identity + fail-closed verify (deploy-qualified-commit) invariants present", A.ARTIFACT_IDENTITY_CONTRACT.invariants.some((i: string) => /reproducible across hosts/.test(i)) && A.ARTIFACT_IDENTITY_CONTRACT.invariants.some((i: string) => /accept ONLY when commit AND treeDigest both match/.test(i)) && /git archive/.test(A.GIT_ARCHIVE_SPEC.command));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-artifact-identity (V293 Lot A / qual C11: real-sha256 reproducible commit→tree digest via git-archive, deterministic, fail-closed; verifyArtifactIdentity enforces deploy-ONLY-the-qualified-commit [commit AND digest must match]; hermetic injected bytes; no new primitive)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
