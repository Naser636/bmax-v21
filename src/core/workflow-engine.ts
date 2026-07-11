import { evaluateCapability } from "@/core/decision-engine";
import { opportunityToCapability } from "@/core/opportunity-decision-adapter";
import { ExplanationEngine } from "@/core/explanation-engine";
import { sourceRegistry } from "@/core/source-registry";
import { ConnectorManager } from "@/core/connector-manager";
import { DecisionPipeline } from "@/core/decision-pipeline";
import { OpportunityEngine } from "@/core/opportunity-engine";
import { FusionEngine } from "@/core/fusion-engine";
import { DiscoveryEngine } from "@/core/discovery-engine";
import { MissionContext } from "@/core/mission-context";
import { executeScheduler } from "@/core/workflow-scheduler";
import { executeHealth } from "@/core/workflow-health";
import { executeRecovery } from "@/core/workflow-recovery";
import { executeQualification } from "@/core/workflow-qualification";
import { executeConnector } from "@/core/workflow-connector";
import { executeHttp } from "@/core/workflow-http";
import { executeMaintenance } from "@/core/workflow-maintenance";
import { observabilityDemo } from "@/core/observability-demo";

export class WorkflowEngine {
  async execute(context: MissionContext): Promise<MissionContext> {
    context.metrics.startedAt = Date.now();

    await executeScheduler(context);

    const healthy = await executeHealth(context);

    if (!healthy) {
      await executeRecovery(context);
      await executeHealth(context);
    }

    await executeQualification(context);

    await executeConnector(context);

    await executeHttp(context);

    await executeMaintenance(context);

    const discovery = new DiscoveryEngine();
    const discovered = await discovery.execute();

    context.discovery = discovered;

    const fusion = new FusionEngine();
    const fused = fusion.execute(discovered.items);
    context.fusion = fused;

    const opportunities = new OpportunityEngine().execute();
    context.opportunities = opportunities;

    const manager = new ConnectorManager();
    context.connector = manager.select();

    context.sources = sourceRegistry;

    const decision = new DecisionPipeline().execute(opportunities);
    context.decision = decision;

    if (decision.accepted && decision.opportunity) {
      const capability =
        opportunityToCapability(decision.opportunity);

      context.decisionEngine =
        evaluateCapability(capability);
    }

    context.explanation =
      new ExplanationEngine().execute({
        id: crypto.randomUUID(),
        capability: "workflow",
        recommendation: decision.accepted ? "ACCEPT" : "REJECT",
        confidence: decision.accepted ? 1 : 0,
        timestamp: Date.now(),
      });


    context.observability = await observabilityDemo();

    context.metrics.finishedAt = Date.now();
    context.metrics.durationMs =
      context.metrics.finishedAt - context.metrics.startedAt;

    if (context.observability) {
      context.observability.metrics.workflowDurationMs =
        context.metrics.durationMs ?? 0;
      context.observability.metrics.totalSteps =
        context.results.length;
      context.observability.metrics.totalErrors =
        context.errors.length;
    }

    context.state = "COMPLETED";

    return context;
  }
}
