import { workflowDemo } from "@/core/workflow-demo";

async function main() {
  const context = await workflowDemo();

  console.log("========================================================");
  console.log("ODG V2 - MISSION EXECUTION REPORT");
  console.log("========================================================");
  console.log("");

  console.log("MISSION");
  console.log(`✓ ${context.missionId}`);
  console.log("");

  console.log("STATE");
  console.log(`✓ ${context.state}`);
  console.log("");

  console.log("WORKFLOW");
  context.logs.forEach(log => console.log(`✓ ${log}`));
  console.log("");

  console.log("RESULTS");
  console.log(`✓ ${context.results.length} étape(s) exécutée(s)`);
  console.log("");

  console.log("METRICS");
  console.log(`Temps total : ${context.metrics.durationMs ?? 0} ms`);
  console.log(`Erreurs : ${context.errors.length}`);
  console.log("");

  console.log("========================================================");
  console.log("MISSION SUCCESS");
  console.log("========================================================");
}

main();
