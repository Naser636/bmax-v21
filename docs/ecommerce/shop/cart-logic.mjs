// Pure cart/pricing logic for the Mistigri storefront prototype. Framework-free, unit-testable.
// The storefront HTML inlines the SAME functions; this module exists so the commerce logic is TESTED.
export const SHIPPING = { freeThreshold: 49.0, flat: 4.90 };

// catalogue: unit COST is NON_VERIFIED (supplier quote pending); price is the listed sale price.
export const CATALOGUE = [
  { sku: "MST-001", name: "Arbre à chat modulable 'Nuage'",        price: 39.90, costEst: 16.0, cat: "enrichissement" },
  { sku: "MST-002", name: "Tunnel de jeu pliable feutrine",        price: 19.90, costEst: 7.5,  cat: "jeu" },
  { sku: "MST-003", name: "Gamelle anti-glouton céramique",        price: 16.90, costEst: 5.5,  cat: "repas" },
  { sku: "MST-004", name: "Fontaine à eau silencieuse 2L",         price: 29.90, costEst: 12.0, cat: "repas" },
  { sku: "MST-005", name: "Griffoir carton recyclé (lot de 2)",    price: 14.90, costEst: 4.8,  cat: "enrichissement" },
  { sku: "MST-006", name: "Couchage ortho déhoussable 'Cosy'",     price: 34.90, costEst: 13.5, cat: "confort" },
];

export function lineTotal(item, qty) { return Math.round(item.price * qty * 100) / 100; }

export function cartTotals(lines /* [{sku, qty}] */) {
  const byId = Object.fromEntries(CATALOGUE.map(p => [p.sku, p]));
  let subtotal = 0, units = 0;
  for (const l of lines) {
    const p = byId[l.sku];
    if (!p || l.qty <= 0) continue;
    subtotal += lineTotal(p, l.qty); units += l.qty;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  const shipping = units === 0 ? 0 : (subtotal >= SHIPPING.freeThreshold ? 0 : SHIPPING.flat);
  const total = Math.round((subtotal + shipping) * 100) / 100;
  return { units, subtotal, shipping, total, freeShipping: shipping === 0 && units > 0 };
}
