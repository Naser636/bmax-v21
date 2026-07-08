import { getDashboardState } from "@/core/dashboard-adapter";

interface DashboardProps {
  metrics: unknown;
}

export default function Dashboard({ metrics }: DashboardProps) {
  void metrics;

  const {
    capability,
    decision,
    values,
    knowledge,
    memories,
  } = getDashboardState();

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>ODG v1.0</h1>

      <h2>Capability</h2>
      <p><strong>{capability.name}</strong> ({capability.version})</p>

      <h2>Decision</h2>
      <ul>
        <li>Recommandation : {decision.recommendation}</li>
        <li>Confiance : {decision.confidence}</li>
        <li>ID : {decision.id}</li>
        <li>Code : {decision.reason.code}</li>
        <li>Justification : {decision.reason.message}</li>
      </ul>

      <h2>Value Metrics</h2>
      <p>Valeurs calculées : {values.length}</p>

      <h2>Knowledge Base</h2>
      <p>Connaissances : {knowledge.length}</p>

      <h2>Memory Store</h2>
      <p>Mémoires : {memories.length}</p>
    </main>
  );
}
