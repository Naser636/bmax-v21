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

  console.log("OBSERVABILITY");

  if (context.observability) {
    console.log("✓ Enabled");
    console.log(`Workflow : ${context.observability.metrics.workflowDurationMs} ms`);
    console.log(`Steps    : ${context.results.length}`);
    console.log(`Errors   : ${context.errors.length}`);
  }


  console.log("DISCOVERY");

  if (context.discovery) {
    console.log("✓ Discovery executed");
  }

  console.log("");

  console.log("FUSION");

  if (context.fusion) {
    console.log("✓ Fusion completed");
  }

  console.log("");

  console.log("OPPORTUNITIES");

  if (context.opportunities) {
    console.log(`✓ ${context.opportunities.length} opportunity(ies)`);
  }

  console.log("");

  console.log("DECISION");

  if (context.decision) {
    console.log("✓ Decision generated");
  }

  console.log("");

  console.log("CONNECTOR");

  if (context.connector) {
    console.log("✓ Connector selected");
  }

  console.log("");

  console.log("SOURCES");

  if (context.sources) {
    console.log(`✓ ${context.sources.length} source(s)`);
  }

  console.log("");


  console.log("");

  console.log("DECISION ENGINE");

  if (context.decisionEngine) {
    console.log("✓ Decision Engine executed");
  }

  console.log("EXPLANATION");

  if (context.explanation) {
    console.log("✓ Explanation generated");
  }

  console.log("");
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
