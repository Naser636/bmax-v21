import { ConstitutionCompliance } from "@/core/constitution-compliance";
import {
  CONSTITUTION_COMPLIANCE_CONTRACT_VERSION,
  CONSTITUTION_PRINCIPLES,
  type ConstitutionComplianceInputs,
} from "@/contracts/constitution-compliance";

const cap = new ConstitutionCompliance();

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const d = cap.describe();
check(d.class === "capability" && d.owner === "Governance", "describe: capability owned by Governance");
check(cap.initialize().ready === true, "initialize ready");
check(CONSTITUTION_PRINCIPLES.length === 7, "frozen principle set has the 7 constitution principles");

const allTrue = () =>
  Object.fromEntries(CONSTITUTION_PRINCIPLES.map((p) => [p, true])) as ConstitutionComplianceInputs["attestations"];

const base = (attestations: ConstitutionComplianceInputs["attestations"]): ConstitutionComplianceInputs => ({
  constitutionComplianceContractVersion: CONSTITUTION_COMPLIANCE_CONTRACT_VERSION,
  subject: "M2_ACTION",
  attestations,
});

// fully attested → compliant
const rOk = cap.evaluate(base(allTrue()));
check(rOk.ok === true && rOk.report.compliant === true && rOk.report.violations.length === 0, "compliant: all principles attested true ⇒ compliant, no violations");
check(rOk.ok === true && rOk.report.checked.length === 7, "compliant: all 7 principles were checked");

// one missing → NOT_ATTESTED violation
const missing = allTrue();
delete (missing as Record<string, boolean>)["EVIDENCE_REQUIRED"];
const rMissing = cap.evaluate(base(missing));
check(
  rMissing.ok === true && rMissing.report.compliant === false &&
    rMissing.report.violations.some((v) => v.principle === "EVIDENCE_REQUIRED" && v.reason === "NOT_ATTESTED"),
  "missing: an un-attested principle is a NOT_ATTESTED violation",
);

// one false → ATTESTED_FALSE violation
const falseOne = allTrue();
(falseOne as Record<string, boolean>)["ROLLBACK_MUST_ALWAYS_BE_POSSIBLE"] = false;
const rFalse = cap.evaluate(base(falseOne));
check(
  rFalse.ok === true && rFalse.report.compliant === false &&
    rFalse.report.violations.some((v) => v.principle === "ROLLBACK_MUST_ALWAYS_BE_POSSIBLE" && v.reason === "ATTESTED_FALSE"),
  "false: an explicitly false attestation is an ATTESTED_FALSE violation",
);

// determinism: same input twice → identical report
const a = cap.evaluate(base(allTrue()));
const b = cap.evaluate(base(allTrue()));
check(a.ok && b.ok && JSON.stringify(a.report) === JSON.stringify(b.report), "determinism: identical inputs produce identical report");

// malformed / version
const rBad = cap.evaluate(base({ DETERMINISM_FIRST: "yes" as unknown as boolean }));
check(rBad.ok === false && rBad.error.code === "INPUTS_MALFORMED", "malformed: non-boolean attestation rejected");
const rVer = cap.evaluate({ ...base(allTrue()), constitutionComplianceContractVersion: "9.9.9" });
check(rVer.ok === false && rVer.error.code === "CONSTITUTION_COMPLIANCE_CONTRACT_INCOMPATIBLE", "version: major mismatch rejected");

if (failures > 0) { console.error(`\nConstitution Compliance: ${failures} check(s) FAILED`); process.exit(1); }
console.log("\nConstitution Compliance OK");
