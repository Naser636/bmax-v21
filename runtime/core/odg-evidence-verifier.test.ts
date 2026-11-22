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
check("REAL contract + REAL evidence (hash recomputed, cross-referenced) ⇒ VERIFIED_ON_REAL_FILES", V.verifyMaturityEvidence(real, R).ok === true);
check("no reader ⇒ refused (a declared hash is never enough)", /NO_READER/.test(V.verifyMaturityEvidence(real, null).reason));
check("forged contract id (format-valid, no such file content) ⇒ CONTRACT_ID_MISMATCH", /CONTRACT_ID_MISMATCH/.test(V.verifyMaturityEvidence({ ...real, missionContract: "WIC-MADE-UP" }, R).reason));
check("non-existent contract file ⇒ CONTRACT_FILE_MISSING", /CONTRACT_FILE_MISSING/.test(V.verifyMaturityEvidence({ ...real, contractPath: "docs/odg/WIC_NOPE.json" }, R).reason));
check("declared hash ≠ recomputed hash of the real file ⇒ EVIDENCE_HASH_MISMATCH", /EVIDENCE_HASH_MISMATCH/.test(V.verifyMaturityEvidence({ ...real, evidenceSha256: "0".repeat(64) }, R).reason));
check("missing evidence file ⇒ EVIDENCE_FILE_MISSING", /EVIDENCE_FILE_MISSING/.test(V.verifyMaturityEvidence({ ...real, evidencePath: "docs/odg/evidence/NOPE.json" }, R).reason));
check("evidence not referenced by its contract (step-1 evidence under the step-2 contract) ⇒ NOT_CROSS_REFERENCED",
  /NOT_CROSS_REFERENCED/.test(V.verifyMaturityEvidence({ ...real, missionContract: "WIC-CM-RADAR-GATE-CHAIN-STEP2", contractPath: "docs/odg/WIC_CM-RADAR-GATE-CHAIN_STEP2.json" }, R).reason));
check("path traversal / absolute / wrong directory ⇒ refused", /BAD_EVIDENCE_PATH/.test(V.verifyMaturityEvidence({ ...real, evidencePath: "docs/odg/evidence/../../../etc/passwd" }, R).reason) && /BAD_CONTRACT_PATH/.test(V.verifyMaturityEvidence({ ...real, contractPath: "/etc/passwd" }, R).reason) && /BAD_EVIDENCE_PATH/.test(V.verifyMaturityEvidence({ ...real, evidencePath: "package.json" }, R).reason));
// stale / non-counting contract state + symlink escape — in a throw-away repo.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-evv-")); fs.mkdirSync(path.join(tmp, "docs/odg/evidence"), { recursive: true });
fs.writeFileSync(path.join(tmp, "docs/odg/evidence/E.json"), "{\"x\":1}");
fs.writeFileSync(path.join(tmp, "docs/odg/WIC_T.json"), JSON.stringify({ id: "WIC-T", state: "PROPOSED", evidence_required: ["docs/odg/evidence/E.json"] }));
const RT = V.makeRepoReader(tmp); const tEv = { missionContract: "WIC-T", contractPath: "docs/odg/WIC_T.json", evidencePath: "docs/odg/evidence/E.json", evidenceSha256: sha("{\"x\":1}") };
check("contract still PROPOSED (or REJECTED/ROLLED_BACK) ⇒ CONTRACT_STATE_NOT_COUNTING", /CONTRACT_STATE_NOT_COUNTING/.test(V.verifyMaturityEvidence(tEv, RT).reason));
fs.writeFileSync(path.join(tmp, "docs/odg/WIC_T.json"), JSON.stringify({ id: "WIC-T", state: "VERIFIED", evidence_required: ["docs/odg/evidence/E.json"] }));
check("same evidence once the contract is VERIFIED ⇒ accepted", V.verifyMaturityEvidence(tEv, RT).ok === true);
fs.writeFileSync(path.join(tmp, "docs/odg/evidence/E.json"), "{\"x\":2}");
check("evidence file REPLACED after the hash was declared ⇒ EVIDENCE_HASH_MISMATCH", /EVIDENCE_HASH_MISMATCH/.test(V.verifyMaturityEvidence(tEv, RT).reason));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "odg-evv-out-")); fs.writeFileSync(path.join(outside, "S.json"), "secret");
fs.symlinkSync(path.join(outside, "S.json"), path.join(tmp, "docs/odg/evidence/L.json"));
check("symlink escaping the repository ⇒ reader returns nothing ⇒ EVIDENCE_FILE_MISSING", /EVIDENCE_FILE_MISSING/.test(V.verifyMaturityEvidence({ ...tEv, evidencePath: "docs/odg/evidence/L.json", evidenceSha256: sha("secret") }, RT).reason));
fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true });
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-evidence-verifier (V375 Lot A / G2)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
