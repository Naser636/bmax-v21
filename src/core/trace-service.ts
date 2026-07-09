import { getDecisions } from "@/core/decision-registry";
import { getEvidenceStore } from "@/core/audit-registry";
import { getAuditEntries } from "@/core/audit-service";
import { getTimeline } from "@/core/timeline-registry";
import { getKnowledgeBase } from "@/core/knowledge-service";
import { getMemoryStore } from "@/core/memory-service";
import { getExplanationStore } from "@/core/explanation-service";

export function getUnifiedTrace() {
  return {
    decisions: getDecisions(),
    evidences: getEvidenceStore(),
    audits: getAuditEntries(),
    timeline: getTimeline(),
    knowledge: getKnowledgeBase(),
    memories: getMemoryStore(),
    explanations: getExplanationStore(),
  };
}
