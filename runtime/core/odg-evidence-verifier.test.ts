#!/usr/bin/env node
"use strict";
/* V375 Lot A (G2) — maturity evidence is verified on REAL files; forged / stale / tampered / escaping evidence is refused. */
const V = require("./odg-evidence-verifier.js");
const fs = require("fs"); const os = require("os"); const path = require("path"); const crypto = require("crypto");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ROOT = path.resolve(__dirname, "../.."); const R = V.makeRepoReader(ROOT);
const sha = (b: any) => crypto.createHash("sha256").update(b).digest("hex");
const EV1 = "docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP1_EVIDENCE.json";
const real = { missionContract: "WIC-CM-RADAR-GATE-CHAIN-STEP1", contractPath: "docs/odg/WIC_CM-RADAR-GATE-CHAIN_STEP1.json", evidencePath: EV1, evidenceSha256: sha(R(EV1)) };
check("REAL contract + REAL evidence but NO claim binding requested ⇒ NO_CLAIM_BINDING (binding is mandatory)", /NO_CLAIM_BINDING/.test(V.verifyMaturityEvidence(real, R).reason));
check("REAL contract + REAL evidence, claim binding requested but not declared by the contract ⇒ NOT_BOUND_TO_CLAIM", /NOT_BOUND_TO_CLAIM/.test(V.verifyMaturityEvidence(real, R, { claimKey: "x|is|y", level: "EXPERIMENTAL" }).reason));
check("no reader ⇒ refused (a declared hash is never enough)", /NO_READER/.test(V.verifyMaturityEvidence(real, null).reason));
check("forged contract id (format-valid, no such file content) ⇒ CONTRACT_ID_MISMATCH", /CONTRACT_ID_MISMATCH/.test(V.verifyMaturityEvidence({ ...real, missionContract: "WIC-MADE-UP" }, R).reason));
check("non-existent contract file ⇒ CONTRACT_FILE_MISSING", /CONTRACT_FILE_MISSING/.test(V.verifyMaturityEvidence({ ...real, contractPath: "docs/odg/WIC_NOPE.json" }, R).reason));
check("declared hash ≠ recomputed hash of the real file ⇒ EVIDENCE_HASH_MISMATCH", /EVIDENCE_HASH_MISMATCH/.test(V.verifyMaturityEvidence({ ...real, evidenceSha256: "0".repeat(64) }, R).reason));
check("missing evidence file ⇒ EVIDENCE_FILE_MISSING", /EVIDENCE_FILE_MISSING/.test(V.verifyMaturityEvidence({ ...real, evidencePath: "docs/odg/evidence/NOPE.json" }, R).reason));
check("ref reader: a file committed on a LOCAL branch but not on the reference ref does not exist for it", (() => { const g = fs.mkdtempSync(path.join(os.tmpdir(), "odg-evv-ref-")); const G = (a: string[]) => require("child_process").execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: g, stdio: "ignore" });
  G(["init", "-q", "-b", "main"]); G(["commit", "-q", "--allow-empty", "-m", "i"]); G(["update-ref", "refs/remotes/origin/main", "HEAD"]); G(["checkout", "-q", "-b", "feat"]); fs.mkdirSync(path.join(g, "docs/odg"), { recursive: true }); fs.writeFileSync(path.join(g, "docs/odg/WIC_L.json"), "{}"); G(["add", "."]); G(["commit", "-q", "-m", "local"]);
  const ok = V.makeCommittedReader(g, "HEAD")("docs/odg/WIC_L.json") !== null && V.makeCommittedReader(g, "origin/main")("docs/odg/WIC_L.json") === null; fs.rmSync(g, { recursive: true, force: true }); return ok; })());
check("committed-tree reader: an UNCOMMITTED file does not exist for it", (() => { const g = fs.mkdtempSync(path.join(os.tmpdir(), "odg-evv-git-")); require("child_process").execFileSync("git", ["init", "-q"], { cwd: g }); fs.mkdirSync(path.join(g, "docs/odg"), { recursive: true }); fs.writeFileSync(path.join(g, "docs/odg/WIC_U.json"), "{}"); const ok = V.makeCommittedReader(g)("docs/odg/WIC_U.json") === null; fs.rmSync(g, { recursive: true, force: true }); return ok; })());
check("evidence not referenced by its contract (step-1 evidence under the step-2 contract) ⇒ NOT_CROSS_REFERENCED",
  /NOT_CROSS_REFERENCED/.test(V.verifyMaturityEvidence({ ...real, missionContract: "WIC-CM-RADAR-GATE-CHAIN-STEP2", contractPath: "docs/odg/WIC_CM-RADAR-GATE-CHAIN_STEP2.json" }, R).reason));
check("path traversal / absolute / wrong directory ⇒ refused", /BAD_EVIDENCE_PATH/.test(V.verifyMaturityEvidence({ ...real, evidencePath: "docs/odg/evidence/../../../etc/passwd" }, R).reason) && /BAD_CONTRACT_PATH/.test(V.verifyMaturityEvidence({ ...real, contractPath: "/etc/passwd" }, R).reason) && /BAD_EVIDENCE_PATH/.test(V.verifyMaturityEvidence({ ...real, evidencePath: "package.json" }, R).reason));
// stale / non-counting contract state + symlink escape — in a throw-away repo.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-evv-")); fs.mkdirSync(path.join(tmp, "docs/odg/evidence"), { recursive: true });
fs.writeFileSync(path.join(tmp, "docs/odg/evidence/E.json"), "{\"x\":1}");
fs.writeFileSync(path.join(tmp, "docs/odg/WIC_T.json"), JSON.stringify({ id: "WIC-T", state: "PROPOSED", evidence_required: ["docs/odg/evidence/E.json"] }));
const RT = V.makeRepoReader(tmp); const tEv = { missionContract: "WIC-T", contractPath: "docs/odg/WIC_T.json", evidencePath: "docs/odg/evidence/E.json", evidenceSha256: sha("{\"x\":1}") };
check("contract still PROPOSED (or REJECTED/ROLLED_BACK) ⇒ CONTRACT_STATE_NOT_COUNTING", /CONTRACT_STATE_NOT_COUNTING/.test(V.verifyMaturityEvidence(tEv, RT).reason));
fs.writeFileSync(path.join(tmp, "docs/odg/WIC_T.json"), JSON.stringify({ id: "WIC-T", state: "VERIFIED", evidence_required: ["docs/odg/evidence/E.json"], maturityClaims: [{ claimKey: "error budget|equals|1 minus the slo", level: "EXPERIMENTAL" }] }));
check("same evidence once the contract is VERIFIED, without binding ⇒ still refused (NO_CLAIM_BINDING)", /NO_CLAIM_BINDING/.test(V.verifyMaturityEvidence(tEv, RT).reason));
check("claim binding: contract declares this claim at this level ⇒ accepted", V.verifyMaturityEvidence(tEv, RT, { claimKey: "error budget|equals|1 minus the slo", level: "EXPERIMENTAL" }).ok === true);
check("claim binding: another claim, or a higher level ⇒ NOT_BOUND_TO_CLAIM", /NOT_BOUND_TO_CLAIM/.test(V.verifyMaturityEvidence(tEv, RT, { claimKey: "odg|is|perfect", level: "EXPERIMENTAL" }).reason) && /NOT_BOUND_TO_CLAIM/.test(V.verifyMaturityEvidence(tEv, RT, { claimKey: "error budget|equals|1 minus the slo", level: "QUALIFIED" }).reason));
fs.writeFileSync(path.join(tmp, "docs/odg/evidence/E.json"), "{\"x\":2}");
for (const st of ["AUTHORIZED", "EXECUTING"]) { fs.writeFileSync(path.join(tmp, "docs/odg/WIC_T.json"), JSON.stringify({ id: "WIC-T", state: st, evidence_required: ["docs/odg/evidence/E.json"], maturityClaims: [{ claimKey: "error budget|equals|1 minus the slo", level: "EXPERIMENTAL" }] }));
  check("contract " + st + " (allowed/started, NOT inspected) ⇒ CONTRACT_STATE_NOT_COUNTING", /CONTRACT_STATE_NOT_COUNTING/.test(V.verifyMaturityEvidence(tEv, RT, { claimKey: "error budget|equals|1 minus the slo", level: "EXPERIMENTAL" }).reason)); }
fs.writeFileSync(path.join(tmp, "docs/odg/WIC_T.json"), JSON.stringify({ id: "WIC-T", state: "VERIFIED", evidence_required: ["docs/odg/evidence/E.json"], maturityClaims: [{ claimKey: "error budget|equals|1 minus the slo", level: "EXPERIMENTAL" }] }));
fs.writeFileSync(path.join(tmp, "docs/odg/evidence/E.json"), "{\"x\":2}");
check("evidence file REPLACED after the hash was declared ⇒ EVIDENCE_HASH_MISMATCH", /EVIDENCE_HASH_MISMATCH/.test(V.verifyMaturityEvidence(tEv, RT, { claimKey: "error budget|equals|1 minus the slo", level: "EXPERIMENTAL" }).reason));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "odg-evv-out-")); fs.writeFileSync(path.join(outside, "S.json"), "secret");
fs.symlinkSync(path.join(outside, "S.json"), path.join(tmp, "docs/odg/evidence/L.json"));
check("symlink escaping the repository ⇒ reader returns nothing ⇒ EVIDENCE_FILE_MISSING", /EVIDENCE_FILE_MISSING/.test(V.verifyMaturityEvidence({ ...tEv, evidencePath: "docs/odg/evidence/L.json", evidenceSha256: sha("secret") }, RT, { claimKey: "k", level: "EXPERIMENTAL" }).reason));
fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true });
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-evidence-verifier (V375 Lot A / G2)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
