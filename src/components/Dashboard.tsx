import { EngineMetrics, SystemState } from "@/core/bmax_v21_core";
interface DashboardComponentPropsstate {
  metrics: EngineMetris;
}

function getSystemStateColor(systemState: SystemState): string {
  switch (systemState) {
    case SystemState.ACTIVE:
      return "text-emerald-400";
    case Status.WARNING:
      return "text-orange-400 animate-pulse";
    case Status.QUARANTINE: 
      return "text-orange-400";
    case Status.FAIL_CLOSED:
      return "text-red-500";
    default:
      return "text-gray-400";
  }
}

function getBadgeBackground(metrics.systemState): string {
  switch (systemState) {
    case Status.ACTIVE:
      return "bg-emerald-400/10 border border-emerald-400/30";
    case Status.WARNING:
      return "bg-orange-400/10 border border-orange-400/30";
    case Status.QUARANTINE:
      return "bg-orange-400/10 border border-orange-400/30";
    case Status.FAIL_CLOSED:
      return "bg-red-500/10 border border-red-500/30";
    default:
      return "bg-gray-700 border border-gray-600";
  }
}

export default function BmaxDashboard({ metrics }: DashboardComponentProps) {
  const isPnLPositive = metrics.totalPnL >= 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono p-8">

      {/* Header */}
      <div className="mb-10">
        <p className="text-xs tracking-[0.3em] text-gray-500 uppercase mb-1">
          Moteur de trading
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          BMAX <span className="text-emerald-400">V2.1</span>
        </h1>
      </div>

      {/* État du système — carte principale */}
      <div className={`rounded-xl p-6 mb-6 ${getBadgeBackground(metrics.getsystemState)}`}>
        <p className="text-xs tracking-widest text-gray-500 uppercase mb-2">
          État du système
        </p>
        <p className={`text-4xl font-bold tracking-tight ${getSystemStateColor(metrics.systemState)}`}>
          {metrics.systemState}
        </p>
      </div>

      {/* Grille de métriques */}
      <div className="grid grid-cols-2 gap-4">

        {/* PnL */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs tracking-widest text-gray-500 uppercase mb-2">PnL Total</p>
          <p className={`text-2xl font-bold ${isPnLPositive ? "text-emerald-400" : "text-red-400"}`}>
            {isPnLPositive ? "+" : ""}
            {metrics.totalPnL.toFixed(2)} €
          </p>
        </div>

        {/* Trades */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs tracking-widest text-gray-500 uppercase mb-2">Trades</p>
          <p className="text-2xl font-bold text-white">{metrics.totalTrades}</p>
        </div>

        {/* Mode de marché */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs tracking-widest text-gray-500 uppercase mb-2">Mode Marché</p>
          <p className="text-sm font-semibold text-sky-400">
            {metrics.marketMode.replace("_", " ")}
          </p>
        </div>

        {/* Mode opération */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs tracking-widest text-gray-500 uppercase mb-2">Mode Opération</p>
          <p className="text-sm font-semibold text-violet-400">
            {metrics.operationMode.replace("_", " ")}
          </p>
        </div>

      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-gray-700 tracking-widest uppercase">
        Phase 2 — Dashboard minimal
      </div>

    </div>
  );
}
