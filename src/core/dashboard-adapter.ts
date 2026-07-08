import { capabilities } from "@/core/capability-registry";
import { evaluateCapability } from "@/core/decision-engine";
import { getValueMetrics } from "@/core/value-service";
import { getKnowledgeBase } from "@/core/knowledge-service";
import { getMemoryStore } from "@/core/memory-service";

export function getDashboardState() {
  const decision = evaluateCapability(capabilities[0]);

  return {
    capability: capabilities[0],
    decision,
    values: getValueMetrics(),
    knowledge: getKnowledgeBase(),
    memories: getMemoryStore(),
  };
}
