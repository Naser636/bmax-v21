import { EvidencePack } from "@/core/evidence-pack";
import { EVIDENCE_PACK_CONTRACT_VERSION, type EvidencePackInputs } from "@/contracts/evidence-pack";

const cap = new EvidencePack();

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

// describe / initialize
const d = cap.describe();
check(d.class === "capability" && d.owner === "Governance", "describe: capability owned by Governance");
check(d.evidencePackContractVersion === "1.0.0", "describe: contract version 1.0.0");
check(cap.initialize().ready === true, "initialize ready");

const base = (items: EvidencePackInputs["items"]): EvidencePackInputs => ({
  evidencePackContractVersion: EVIDENCE_PACK_CONTRACT_VERSION,
  mission: "M2_DEMO",
  items,
});

// seal a complete set
const r1 = cap.seal(base([
  { kind: "validation", id: "verify", hash: "aaa" },
  { kind: "release", id: "rec-1", hash: "bbb" },
]));
check(r1.ok === true, "seal: complete set is sealed");
if (r1.ok) {
  check(r1.pack.complete === true && r1.pack.itemCount === 2, "seal: pack marked complete with item count");
  check(typeof r1.pack.sealHash === "string" && r1.pack.sealHash.length === 8, "seal: 8-hex sealHash produced");
}

// determinism: reordered input → identical seal
const r2 = cap.seal(base([
  { kind: "release", id: "rec-1", hash: "bbb" },
  { kind: "validation", id: "verify", hash: "aaa" },
]));
check(
  r1.ok && r2.ok && r1.pack.sealHash === r2.pack.sealHash,
  "determinism: reordered items produce the identical sealHash",
);
check(
  r2.ok && r2.pack.items[0].kind === "release" && r2.pack.items[1].kind === "validation",
  "determinism: items are canonically ordered (kind asc)",
);

// content sensitivity: a different hash changes the seal
const r3 = cap.seal(base([
  { kind: "validation", id: "verify", hash: "aaa" },
  { kind: "release", id: "rec-1", hash: "ZZZ" },
]));
check(r3.ok === true && r1.ok && r3.pack.sealHash !== r1.pack.sealHash, "content: changing an item hash changes the seal");

// empty pack rejected
const rEmpty = cap.seal(base([]));
check(rEmpty.ok === false && rEmpty.error.code === "PACK_EMPTY", "empty: a pack with no items is rejected as PACK_EMPTY");

// malformed item rejected
const rBad = cap.seal(base([{ kind: "", id: "x", hash: "h" }]));
check(rBad.ok === false && rBad.error.code === "INPUTS_MALFORMED", "malformed: empty kind rejected");

// incompatible contract version
const rVer = cap.seal({ ...base([{ kind: "k", id: "i", hash: "h" }]), evidencePackContractVersion: "2.0.0" });
check(rVer.ok === false && rVer.error.code === "EVIDENCE_PACK_CONTRACT_INCOMPATIBLE", "version: major mismatch rejected");

if (failures > 0) { console.error(`\nEvidence Pack: ${failures} check(s) FAILED`); process.exit(1); }
console.log("\nEvidence Pack OK");
