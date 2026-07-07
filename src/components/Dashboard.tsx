interface DashboardProps {
  metrics: unknown;
}

export default function Dashboard({ metrics }: DashboardProps) {
  void metrics;

  return (
    <main style={{ padding: "2rem" }}>
      <h1>BMAX v2.2</h1>
      <p>Dashboard en cours de génération…</p>
    </main>
  );
}
