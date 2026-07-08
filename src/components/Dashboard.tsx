import { getDashboardState } from "@/core/dashboard-adapter";

interface DashboardProps {
  metrics: unknown;
}

export default function Dashboard({ metrics }: DashboardProps) {
  void metrics;

  const { capability, decision } = getDashboardState();

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
      </ul>
    </main>
  );
}
