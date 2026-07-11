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
