import type { RuntimeSnapshot } from "@/app/api/runtime-state/route";

// BMAX v21 Runtime Dashboard (WI-2 REPAIR_BMAX_DASHBOARD_REAL_DATA_V1).
// Renders ONLY the real governed runtime snapshot (runtime/generated/* via readRuntimeSnapshot).
// Honest by construction: an unavailable value renders as "—" / "unavailable", never as a fabricated
// zero; a non-measurable autonomy signal shows its reason, never a synthesized percentage. This
// component is presentational and read-only — it holds no state and performs no I/O.

interface DashboardProps {
  snapshot: RuntimeSnapshot;
}

const UNAVAILABLE = "unavailable";

/** Render a string/boolean value honestly: null ⇒ an explicit em-dash, never a misleading default. */
function val(v: string | boolean | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return v;
}

const sectionStyle: React.CSSProperties = {
  margin: "0 0 1.5rem",
  padding: "1rem 1.25rem",
  border: "1px solid #d0d7de",
  borderRadius: 8,
};
const hStyle: React.CSSProperties = { margin: "0 0 0.75rem", fontSize: "1.05rem" };
const rowStyle: React.CSSProperties = { display: "flex", gap: "0.5rem", padding: "0.15rem 0" };
const keyStyle: React.CSSProperties = { minWidth: 160, color: "#57606a" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <span style={keyStyle}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default function Dashboard({ snapshot }: DashboardProps) {
  const { health, missions, autonomy, queue, capabilities } = snapshot;

  // Autonomy is the most honesty-sensitive signal: show the real percentage ONLY when measurable.
  let autonomyLine: string;
  if (!autonomy.present) {
    autonomyLine = `autonomy signal ${UNAVAILABLE}`;
  } else if (!autonomy.measurable) {
    autonomyLine = `not yet measurable${autonomy.reason ? ` — ${autonomy.reason}` : ""}`;
  } else {
    autonomyLine = autonomy.autonomyPercent === null ? "not yet measurable" : `${autonomy.autonomyPercent}%`;
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: 860, margin: "0 auto" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>BMAX v21</h1>
        <p style={{ margin: "0.25rem 0 0", color: "#57606a" }}>
          Runtime Dashboard — governed by ODG · live runtime artifacts
        </p>
        {!snapshot.present && (
          <p
            role="alert"
            style={{ marginTop: "0.75rem", color: "#9a6700", background: "#fff8c5", padding: "0.5rem 0.75rem", borderRadius: 6 }}
          >
            Runtime state artifact ({snapshot.sources[0]?.path ?? "runtime-state.json"}) is {UNAVAILABLE}. Values shown as “—”
            are genuinely unknown — none are fabricated.
          </p>
        )}
        <p style={{ margin: "0.5rem 0 0", color: "#8c959f", fontSize: "0.85rem" }}>
          as of {val(snapshot.generatedAt)}
        </p>
      </header>

      <section style={sectionStyle}>
        <h2 style={hStyle}>Runtime Health</h2>
        <Row label="Status" value={val(health.status)} />
        <Row label="Runtime" value={val(health.runtime)} />
        <Row label="Foundation" value={val(health.foundation)} />
        <Row label="Pipeline" value={val(health.pipeline)} />
        <Row label="Brain" value={val(health.brain)} />
        <Row label="Converged" value={val(health.converged)} />
      </section>

      <section style={sectionStyle}>
        <h2 style={hStyle}>Missions</h2>
        <Row label="Last mission" value={val(missions.last)} />
        <Row label="Next mission" value={val(missions.next)} />
        <Row
          label="Last run"
          value={
            missions.lastRun
              ? `${val(missions.lastRun.mission)} — ${val(missions.lastRun.status)} (validated: ${val(missions.lastRun.validated)})`
              : "—"
          }
        />
        <Row
          label="Outstanding"
          value={missions.outstanding.length === 0 ? "none" : missions.outstanding.join(", ")}
        />
      </section>

      <section style={sectionStyle}>
        <h2 style={hStyle}>Autonomy</h2>
        <Row label="Rate" value={autonomyLine} />
        {autonomy.total !== null && <Row label="Recorded events" value={String(autonomy.total)} />}
        {autonomy.counts && (
          <div style={{ marginTop: "0.5rem", color: "#57606a", fontSize: "0.9rem" }}>
            descriptive counts:{" "}
            {Object.entries(autonomy.counts)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")}
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={hStyle}>Mission Queue ({snapshot.queueCount})</h2>
        {queue.length === 0 ? (
          <p style={{ margin: 0, color: "#57606a" }}>queue {UNAVAILABLE} or empty</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {queue.map((q, i) => (
              <li key={`${q.mission}-${i}`} style={{ padding: "0.1rem 0" }}>
                <strong>{q.mission}</strong>
                {q.priority ? ` · ${q.priority}` : ""}
                {q.status ? ` · ${q.status}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={hStyle}>Capabilities</h2>
        <Row label="Registered" value={capabilities.total === null ? UNAVAILABLE : String(capabilities.total)} />
        <Row label="Missing" value={capabilities.missing === null ? UNAVAILABLE : String(capabilities.missing)} />
      </section>

      <footer style={{ color: "#8c959f", fontSize: "0.8rem" }}>
        <strong>Provenance</strong> — governed artifacts backing this view:
        <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
          {snapshot.sources.map((src) => (
            <li key={src.path}>
              {src.path}: {src.present ? "present" : UNAVAILABLE}
            </li>
          ))}
        </ul>
      </footer>
    </main>
  );
}
