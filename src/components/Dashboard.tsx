import type { RuntimeSnapshot } from "@/app/api/runtime-state/route";

// BMAX v21 Runtime Dashboard (WI-2 REPAIR_BMAX_DASHBOARD_REAL_DATA_V1; integration completed in
// ODG_MASTER_RECOVERY). Renders ONLY the real governed runtime snapshot (runtime/generated/* via
// readRuntimeSnapshot). Honest by construction: an unavailable value renders as "—" / "unavailable",
// never a fabricated zero; a non-measurable autonomy signal shows its reason, never a synthesized
// percentage. Presentational + read-only — no state, no I/O. Styling is driven ENTIRELY by the committed
// design-system classes in src/app/globals.css (light+dark, responsive grid); no inline hex colors.

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

/** Map a REAL status value to a badge class. Honest: unknown ⇒ muted, never a fabricated "positive". */
function badgeClass(v: string | boolean | null | undefined): string {
  if (v === null || v === undefined) return "badge badge-muted";
  const s = (typeof v === "boolean" ? (v ? "yes" : "no") : v).trim().toLowerCase();
  if (s === "—" || s === "" || s === UNAVAILABLE) return "badge badge-muted";
  if (/(^|\b)(ready|yes|true|success|ok|present|healthy|pass(ed)?|converged|active)\b/.test(s)) return "badge badge-pos";
  if (/(^|\b)(no|false|fail(ed)?|down|blocked|error|stopped|missing|degraded|not ready)\b/.test(s)) return "badge badge-neg";
  return "badge badge-neutral";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span className="kv-key">{label}</span>
      <span className={value === "—" ? "kv-val kv-muted" : "kv-val"}>{value}</span>
    </div>
  );
}

function BadgeRow({ label, value }: { label: string; value: string | boolean | null | undefined }) {
  return (
    <div className="kv">
      <span className="kv-key">{label}</span>
      <span className="kv-val">
        <span className={badgeClass(value)}>{val(value)}</span>
      </span>
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
    <main className="dash">
      <header className="dash-header">
        <div className="dash-header-top">
          <h1 className="dash-title">BMAX v21</h1>
          <span className={badgeClass(health.status)}>{val(health.status)}</span>
        </div>
        <p className="dash-subtitle">Runtime Dashboard — governed by ODG · live runtime artifacts</p>
        {!snapshot.present && (
          <p role="alert" className="dash-alert">
            Runtime state artifact ({snapshot.sources[0]?.path ?? "runtime-state.json"}) is {UNAVAILABLE}. Values shown as “—”
            are genuinely unknown — none are fabricated.
          </p>
        )}
        <p className="dash-asof">as of {val(snapshot.generatedAt)}</p>
      </header>

      <div className="dash-grid">
        <section className="card">
          <h2 className="card-title">Runtime Health</h2>
          <BadgeRow label="Status" value={health.status} />
          <BadgeRow label="Runtime" value={health.runtime} />
          <BadgeRow label="Foundation" value={health.foundation} />
          <BadgeRow label="Pipeline" value={health.pipeline} />
          <BadgeRow label="Brain" value={health.brain} />
          <BadgeRow label="Converged" value={health.converged} />
        </section>

        <section className="card">
          <h2 className="card-title">Missions</h2>
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
          <Row label="Outstanding" value={missions.outstanding.length === 0 ? "none" : missions.outstanding.join(", ")} />
        </section>

        <section className="card">
          <h2 className="card-title">Autonomy</h2>
          <Row label="Rate" value={autonomyLine} />
          {autonomy.total !== null && <Row label="Recorded events" value={String(autonomy.total)} />}
          {autonomy.counts && (
            <div className="chips">
              {Object.entries(autonomy.counts).map(([k, v]) => (
                <span className="chip" key={k}>
                  <b>{k}</b> {v}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">
            <span>Capabilities</span>
          </h2>
          <Row label="Registered" value={capabilities.total === null ? UNAVAILABLE : String(capabilities.total)} />
          <Row label="Missing" value={capabilities.missing === null ? UNAVAILABLE : String(capabilities.missing)} />
        </section>

        <section className="card card-wide">
          <h2 className="card-title">
            <span>Mission Queue</span>
            <span className="count">{snapshot.queueCount}</span>
          </h2>
          {queue.length === 0 ? (
            <p className="empty">queue {UNAVAILABLE} or empty</p>
          ) : (
            <ul className="queue">
              {queue.map((q, i) => (
                <li className="queue-item" key={`${q.mission}-${i}`}>
                  <span className="queue-mission">{q.mission}</span>
                  {q.priority ? <span className="badge badge-neutral">{q.priority}</span> : null}
                  {q.status ? <span className={badgeClass(q.status)}>{q.status}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="provenance">
        <span className="provenance-title">Provenance</span> — governed artifacts backing this view:
        <ul>
          {snapshot.sources.map((src) => (
            <li key={src.path}>
              <span>{src.path}</span>
              <span className={src.present ? "state-present" : "state-absent"}>{src.present ? "present" : UNAVAILABLE}</span>
            </li>
          ))}
        </ul>
      </footer>
    </main>
  );
}
