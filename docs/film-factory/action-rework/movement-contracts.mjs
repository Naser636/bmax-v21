// Reusable, testable production improvement (local, €0). Validates ACTION movement contracts (makes action
// legible + gives the generator concrete motion + something to check), and flags repetitive gestures across
// shots (the pilot showed generic/repeated action labels). No generation, no network.
export const CONTRACT_FIELDS = ['initial', 'trajectory', 'contact', 'consequence', 'final', 'raccord'];
export function validateContract(c = {}) {
  const missing = CONTRACT_FIELDS.filter(f => !c[f] || String(c[f]).trim().length < 3);
  return { valid: missing.length === 0, missing };
}
// flag adjacent beats whose (trajectory+contact) are near-identical => repetitive, unless justified.
export function repetitiveActions(contracts = []) {
  const flags = [];
  const key = c => ((c.trajectory || '') + '|' + (c.contact || '')).toLowerCase().replace(/\s+/g, ' ').trim();
  const seen = new Map();
  contracts.forEach((c, i) => { const k = key(c); if (k && seen.has(k)) flags.push({ beatA: seen.get(k), beatB: c.beat || i, repeatedMotion: k.slice(0, 50) }); else seen.set(k, c.beat || i); });
  return flags;
}
