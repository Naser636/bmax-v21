import { KnowledgePromotionGate } from "@/core/knowledge-promotion-gate";
import {
  KNOWLEDGE_PROMOTION_GATE_CONTRACT_VERSION,
  type KnowledgePromotionInputs,
} from "@/contracts/knowledge-promotion-gate";

const cap = new KnowledgePromotionGate();

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const d = cap.describe();
check(d.class === "capability" && d.owner === "Governance", "describe: capability owned by Governance");
check(cap.initialize().ready === true, "initialize ready");

const base = (prov: Partial<KnowledgePromotionInputs["provenance"]>): KnowledgePromotionInputs => ({
  knowledgePromotionGateContractVersion: KNOWLEDGE_PROMOTION_GATE_CONTRACT_VERSION,
  candidate: { id: "K-1", statement: "The local autonomy path refreshes verify evidence.", sourceMission: "RUNTIME_AUTONOMOUS_CLOSURE" },
  provenance: {
    releaseDecision: "RELEASE",
    evidencePackSealed: true,
    constitutionCompliant: true,
    aiDerived: false,
    ...prov,
  },
});

// fully backed, local (non-AI) → promote
const rOk = cap.decide(base({}));
check(rOk.ok === true && rOk.decision.promote === true && rOk.decision.blockers.length === 0, "promote: fully backed local knowledge is promoted");

// no release → blocked
const rNoRel = cap.decide(base({ releaseDecision: "NO_RELEASE" }));
check(rNoRel.ok === true && rNoRel.decision.promote === false && rNoRel.decision.blockers.includes("NO_RELEASE"), "block: no RELEASE decision blocks promotion");

// unsealed evidence → blocked
const rUnsealed = cap.decide(base({ evidencePackSealed: false }));
check(rUnsealed.ok === true && rUnsealed.decision.blockers.includes("EVIDENCE_NOT_SEALED"), "block: unsealed evidence pack blocks promotion");

// constitution violation → blocked
const rConst = cap.decide(base({ constitutionCompliant: false }));
check(rConst.ok === true && rConst.decision.blockers.includes("CONSTITUTION_VIOLATION"), "block: constitution non-compliance blocks promotion");

// AI-derived but quarantined → blocked
const rAiBad = cap.decide(base({ aiDerived: true, aiEvidenceAdmissible: false }));
check(rAiBad.ok === true && rAiBad.decision.blockers.includes("AI_EVIDENCE_QUARANTINED"), "block: AI-derived knowledge with quarantined evidence is blocked");

// AI-derived and admissible → promote
const rAiOk = cap.decide(base({ aiDerived: true, aiEvidenceAdmissible: true }));
check(rAiOk.ok === true && rAiOk.decision.promote === true, "promote: AI-derived knowledge with admissible evidence is promoted");

// AI-derived but admissibility omitted → blocked (must be explicitly admissible)
const rAiMissing = cap.decide(base({ aiDerived: true }));
check(rAiMissing.ok === true && rAiMissing.decision.blockers.includes("AI_EVIDENCE_QUARANTINED"), "block: AI-derived without explicit admissibility is blocked");

// multiple blockers accumulate
const rMulti = cap.decide(base({ releaseDecision: "NO_RELEASE", evidencePackSealed: false }));
check(rMulti.ok === true && rMulti.decision.blockers.length === 2, "block: multiple missing backings accumulate as separate blockers");

// determinism
const a = cap.decide(base({}));
const b = cap.decide(base({}));
check(a.ok && b.ok && JSON.stringify(a.decision) === JSON.stringify(b.decision), "determinism: identical inputs produce identical decision");

// malformed / version
const rBad = cap.decide({ ...base({}), provenance: { ...base({}).provenance, evidencePackSealed: "yes" as unknown as boolean } });
check(rBad.ok === false && rBad.error.code === "INPUTS_MALFORMED", "malformed: non-boolean provenance rejected");
const rVer = cap.decide({ ...base({}), knowledgePromotionGateContractVersion: "2.0.0" });
check(rVer.ok === false && rVer.error.code === "KNOWLEDGE_PROMOTION_GATE_CONTRACT_INCOMPATIBLE", "version: major mismatch rejected");

if (failures > 0) { console.error(`\nKnowledge Promotion Gate: ${failures} check(s) FAILED`); process.exit(1); }
console.log("\nKnowledge Promotion Gate OK");
