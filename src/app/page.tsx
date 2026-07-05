import { BmaxV21CoreEngine } from "@/core/bmax_v21_core";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  const engine = new BmaxV21CoreEngine();
  const metrics = engine.getSystemSnapshot();

  return <Dashboard metrics={metrics} />;
}
