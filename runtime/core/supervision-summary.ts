/**
 * supervision-summary — pure formatter for the odg-health §G supervision line. Takes the LAST exposure +
 * maintenance monitor status objects (as written by the detectors) and a nowMs clock, returns one honest
 * summary string. Single source of truth = the monitor's status files; this only FORMATS them, never probes.
 *
 * Honesty: both absent ⇒ UNKNOWN (never "healthy"); a status older than `freshMaxMin` ⇒ "monitor STALE"
 * (perimé = inconnu, never presented as fresh/healthy); a missing half ⇒ that half is UNKNOWN. Freshness is a
 * COARSE bucket (no raw timestamp) so the JS and compiled-TS odg-health ports stay byte-identical.
 */
function summarizeSupervision(ex: any, mt: any, nowMs: number, freshMaxMin?: number): string {
  const freshMax = typeof freshMaxMin === "number" ? freshMaxMin : 25;
  if (!ex && !mt) return "UNKNOWN — no odg-monitor status yet (timer may not have ticked)";
  const ageMin = (s: any) => { const t = s && Date.parse(s.at); return Number.isFinite(t) ? Math.floor((nowMs - t) / 60000) : null; };
  const ages = [ageMin(ex), ageMin(mt)].filter((x: any) => x !== null) as number[];
  const oldest = ages.length ? Math.max.apply(null, ages) : null;
  const fresh = oldest === null ? "freshness UNKNOWN" : (oldest <= freshMax ? "monitor fresh" : "monitor STALE");
  const exS = ex ? `exposure=${ex.verdict}(odg=${ex.odgLoopback},drift=${ex.drift})` : "exposure=UNKNOWN";
  const mtS = mt ? `maintenance=${mt.ok ? "OK" : "ATTENTION"}(C${mt.CRIT}/W${mt.WARN}/I${mt.INFO})` : "maintenance=UNKNOWN";
  return `${exS} ${mtS} — ${fresh}`;
}

module.exports = { summarizeSupervision };
export {};
