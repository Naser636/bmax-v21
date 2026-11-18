#!/usr/bin/env node
"use strict";
/* V296 — tests for odg-deployable-package (qual C9). Known-answer manifest/digest, packageDigest DISTINCT from a
 * source treeDigest, single-file-change flips the digest, fail-closed verify (deploy-the-validated-package),
 * secret-exclusion, and the honest deny-by-default C9 qualifier (PARTIAL until real VPS runtime is proven). */
const P = require("./odg-deployable-package.js");
const crypto = require("crypto");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const D1 = sha("a"), D2 = sha("b"), D3 = sha("c");

function main() {
  // deterministic, sorted manifest + real sha256 package digest.
  const m = P.buildPackageManifest([{ path: "runtime/z.ts", sha256: D2 }, { path: "runtime/a.ts", sha256: D1 }]);
  check("manifest built, sorted, fileCount=2, packageDigest is real sha256", m.ok && m.fileCount === 2 && /^[0-9a-f]{64}$/.test(m.packageDigest) && m.manifest.indexOf("runtime/a.ts") < m.manifest.indexOf("runtime/z.ts"));
  check("packageDigest == sha256(manifest) (known-answer, recomputed independently)", m.packageDigest === sha(m.manifest));
  // order-independent: same files in any input order ⇒ same digest.
  check("input order does not change the digest (sorted manifest)", P.buildPackageManifest([{ path: "runtime/a.ts", sha256: D1 }, { path: "runtime/z.ts", sha256: D2 }]).packageDigest === m.packageDigest);

  // DISTINCT from a source treeDigest (different input space).
  const treeDigest = "3552bfbe0fa88fcc706e28c70068c5e7d4a3fd0afb7b65ed789af1565cfa6ef8"; // V293 HEAD source tree digest
  check("packageDigest is DISTINCT from the source treeDigest", m.packageDigest !== treeDigest);

  // a single changed deployable file flips the packageDigest.
  const changed = P.buildPackageManifest([{ path: "runtime/z.ts", sha256: D3 /* was D2 */ }, { path: "runtime/a.ts", sha256: D1 }]);
  check("a single changed deployable file ⇒ different packageDigest", changed.packageDigest !== m.packageDigest);

  // fail-closed build input.
  check("empty/malformed file list ⇒ fail-closed", P.buildPackageManifest([]).ok === false && P.buildPackageManifest([{ path: "x" }]).ok === false && P.buildPackageManifest([{ path: "x", sha256: "nothex" }]).ok === false);
  check("duplicate path ⇒ fail-closed", P.buildPackageManifest([{ path: "a", sha256: D1 }, { path: "a", sha256: D2 }]).ok === false);

  // verifyPackage: accept ONLY the validated candidate (deploy-the-validated-package).
  const files = [{ path: "runtime/a.ts", sha256: D1 }, { path: "runtime/z.ts", sha256: D2 }];
  check("verify: exact package match ⇒ ok", P.verifyPackage({ packageDigest: m.packageDigest }, files).ok === true);
  check("verify: a changed file ⇒ REFUSED (not the validated candidate)", (() => { const r = P.verifyPackage({ packageDigest: m.packageDigest }, [{ path: "runtime/a.ts", sha256: D1 }, { path: "runtime/z.ts", sha256: D3 }]); return r.ok === false && /mismatch/.test(r.reason); })());
  check("verify: incomplete expected ⇒ fail-closed", P.verifyPackage({}, files).ok === false);

  // secret exclusion.
  check("assertNoSecrets: clean set ⇒ ok", P.assertNoSecrets(["runtime/a.ts", "scripts/b.ts", "package.json"]).ok === true);
  check("assertNoSecrets: .env/.pem/credential ⇒ offenders", (() => { const r = P.assertNoSecrets(["runtime/a.ts", ".env", "x/key.pem", "my-credential.json"]); return r.ok === false && r.offenders.length === 3; })());

  // qualifyC9: deny-by-default; FAIL on build fail; PARTIAL on local-chain-only; PASS only with real VPS.
  check("C9 deny-by-default: empty facts ⇒ NOT_MEASURED", P.qualifyC9({}).c9Status === "NOT_MEASURED");
  check("C9: artifactBuilt=false ⇒ FAIL", P.qualifyC9({ artifactBuilt: false }).c9Status === "FAIL");
  const localOnly = { commitExact: true, artifactBuilt: true, identityVerifiable: true, depsSatisfied: true, nodeCompatible: true };
  check("C9: full local chain but VPS runtime unproven ⇒ PARTIAL (not PASS)", P.qualifyC9(localOnly).c9Status === "PARTIAL" && P.qualifyC9(localOnly).localChainProven === true && P.qualifyC9(localOnly).vpsRuntimeProven === false);
  check("C9: full chain incl. real VPS start/health ⇒ PASS", P.qualifyC9({ ...localOnly, startupHealthOk: true, vpsCompatDemonstrated: true }).c9Status === "PASS");
  check("C9: missing node-compat ⇒ NOT_MEASURED (incomplete local chain, lists missing)", (() => { const r = P.qualifyC9({ ...localOnly, nodeCompatible: false }); return r.c9Status === "NOT_MEASURED" && r.missing.includes("nodeCompatible"); })());

  // determinism + frozen + contract.
  check("deterministic + frozen", P.buildPackageManifest(files).packageDigest === m.packageDigest && Object.isFrozen(m) && Object.isFrozen(P.qualifyC9(localOnly)));
  check("contract: packageDigest≠treeDigest + single-file-flip + no-secrets + PARTIAL-until-VPS invariants", P.DEPLOYABLE_PACKAGE_CONTRACT.invariants.some((i: string) => /DISTINCT from the source treeDigest/.test(i)) && P.DEPLOYABLE_PACKAGE_CONTRACT.invariants.some((i: string) => /single changed deployable file flips/.test(i)) && P.DEPLOYABLE_PACKAGE_CONTRACT.invariants.some((i: string) => /NO secret/.test(i)) && P.DEPLOYABLE_PACKAGE_CONTRACT.invariants.some((i: string) => /PARTIAL/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-deployable-package (V296 qual C9: deterministic sorted manifest + sha256 packageDigest DISTINCT from source treeDigest; single-file-change flips it; fail-closed verifyPackage [deploy-the-validated-candidate]; secret exclusion; deny-by-default qualifyC9 = PARTIAL until real VPS runtime proven; reuses V293 doctrine; no new primitive)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
