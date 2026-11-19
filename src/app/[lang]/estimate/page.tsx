import { createRequire } from "node:module";
import { notFound } from "next/navigation";
import { COPY, LANG_TO_LOCALE, isLang, type Lang } from "@/lib/estimate-i18n";

// First thin vertical slice of the BTP multilingual product surface (FR / AR-RTL / EN / ES).
// It REUSES the governed runtime core — odg-fr-vat (VAT computation) and odg-language-management
// (locale/RTL resolution) — compiled to runtime/dist/core and required at runtime, exactly like
// src/app/api/intake/route.ts. Line totals are plain qty×unitPrice arithmetic in the view.
//
// Honesty / governance: this renders a PRE-CONTRACTUAL estimate for owner review. It is input/display
// only — no real client, order, invoice, or payment (OWNER_GATED preserved). Prices are shown with
// their source; a line with no sourced price is marked INCOMPLETE and excluded from the totals
// (fail-closed) rather than guessed.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Required at runtime from the compiled dist closure (not bundled) — same pattern/depth as the intake route.
const require_ = createRequire(import.meta.url);
type VatBreakdown = {
  byRate: { rateBps: number; baseMinor: number; vatMinor: number }[];
  totals: { netMinor: number; vatMinor: number; grossMinor: number };
};
const vat = require_("../../../../runtime/dist/core/odg-fr-vat.js") as {
  vatBreakdown: (lines: { netMinor: number; rateBps: number }[]) => VatBreakdown;
};
const langmod = require_("../../../../runtime/dist/core/odg-language-management.js") as {
  selectLocale: (
    requested: string,
    available: string[],
  ) => { ok: boolean; locale?: string; how?: string };
  SUPPORTED_LOCALES: { code: string; lang: string; region: string; rtl: boolean }[];
};

// Demo BTP line items for the slice. ref/qty/unit price (HT, in centimes)/VAT rate (bps)/price source.
// 10% reduced rate on renovation labour, 20% standard on materials — realistic FR BTP rates.
type Item = {
  ref: string;
  qty: number;
  unitHTMinor: number;
  rateBps: number;
  source: string | null;
  label: Record<Lang, string>;
};
const DEMO_ITEMS: Item[] = [
  { ref: "BET-C25", qty: 12, unitHTMinor: 11500, rateBps: 2000, source: "Fournisseur — devis 2026-11",
    label: { fr: "Béton C25/30 (m³)", ar: "خرسانة C25/30 (م³)", en: "C25/30 concrete (m³)", es: "Hormigón C25/30 (m³)" } },
  { ref: "ACR-HA", qty: 850, unitHTMinor: 165, rateBps: 2000, source: "Fournisseur — devis 2026-11",
    label: { fr: "Acier HA (kg)", ar: "فولاذ مضلّع (كغ)", en: "Rebar steel (kg)", es: "Acero corrugado (kg)" } },
  { ref: "MO-MAC", qty: 64, unitHTMinor: 4200, rateBps: 1000, source: "Barème interne 2026",
    label: { fr: "Main d'œuvre maçonnerie (h)", ar: "يد عاملة بناء (ساعة)", en: "Masonry labour (h)", es: "Mano de obra albañilería (h)" } },
];

export function generateStaticParams(): { lang: Lang }[] {
  return (["fr", "ar", "en", "es"] as Lang[]).map((lang) => ({ lang }));
}

export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const sp = await searchParams;
  const copy = COPY[lang];
  const localeCode = LANG_TO_LOCALE[lang];

  // Resolve the locale (and its RTL flag) from the REUSED core — single source of truth for direction.
  const available = langmod.SUPPORTED_LOCALES.map((l) => l.code);
  const sel = langmod.selectLocale(localeCode, available);
  const resolved = sel.ok && sel.locale ? sel.locale : "en-GB";
  const rtl = langmod.SUPPORTED_LOCALES.find((l) => l.code === resolved)?.rtl === true;

  const money = (minor: number) =>
    new Intl.NumberFormat(resolved, { style: "currency", currency: "EUR" }).format(minor / 100);

  // `?missing=1` demonstrates the fail-closed path: drop the price source of the last line.
  const demoMissing = sp.missing === "1";
  const items: Item[] = DEMO_ITEMS.map((it, i) =>
    demoMissing && i === DEMO_ITEMS.length - 1 ? { ...it, source: null } : it,
  );

  // Price each line: a line with a sourced price is PRICED (net = qty × unit HT); otherwise INCOMPLETE.
  const priced = items.map((it) => {
    const complete = typeof it.source === "string" && it.source.length > 0;
    return { ...it, complete, netMinor: complete ? it.qty * it.unitHTMinor : 0 };
  });
  const pricedLines = priced.filter((p) => p.complete);
  const anyMissing = priced.some((p) => !p.complete);
  const bd = vat.vatBreakdown(pricedLines.map((p) => ({ netMinor: p.netMinor, rateBps: p.rateBps })));

  const th: React.CSSProperties = {
    textAlign: rtl ? "right" : "left",
    padding: "0.5rem 0.6rem",
    borderBottom: "2px solid var(--border)",
    fontSize: "0.8rem",
    color: "var(--muted)",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = { padding: "0.5rem 0.6rem", borderBottom: "1px solid var(--border)", fontSize: "0.9rem" };
  const num: React.CSSProperties = { ...td, textAlign: rtl ? "left" : "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  const card: React.CSSProperties = {
    background: "var(--surface, var(--background))",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "1.25rem 1.4rem",
    boxShadow: "var(--card-shadow, none)",
  };

  return (
    <main style={card}>
      <header style={{ marginBottom: "1rem" }}>
        <div
          style={{
            display: "inline-block",
            fontSize: "0.72rem",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--warn-fg, var(--muted))",
            background: "var(--warn-bg, transparent)",
            border: "1px solid var(--border)",
            borderRadius: "999px",
            padding: "0.15rem 0.7rem",
            marginBottom: "0.6rem",
          }}
        >
          {copy.preContractual}
        </div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>{copy.title}</h1>
        <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>{copy.subtitle}</p>
      </header>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>{copy.ref}</th>
              <th style={th}>{copy.designation}</th>
              <th style={{ ...th, textAlign: rtl ? "left" : "right" }}>{copy.qty}</th>
              <th style={{ ...th, textAlign: rtl ? "left" : "right" }}>{copy.unitHT}</th>
              <th style={th}>{copy.priceSource}</th>
              <th style={{ ...th, textAlign: rtl ? "left" : "right" }}>{copy.rate}</th>
              <th style={{ ...th, textAlign: rtl ? "left" : "right" }}>{copy.netHT}</th>
            </tr>
          </thead>
          <tbody>
            {priced.map((p) => (
              <tr key={p.ref}>
                <td style={{ ...td, fontFamily: "var(--font-mono, monospace)", fontSize: "0.82rem" }}>{p.ref}</td>
                <td style={td}>{p.label[lang]}</td>
                <td style={num}>{p.qty}</td>
                <td style={num}>{money(p.unitHTMinor)}</td>
                <td style={{ ...td, fontSize: "0.8rem", color: p.complete ? "var(--muted)" : "var(--neg, crimson)" }}>
                  {p.complete ? p.source : copy.missingPrice}
                </td>
                <td style={num}>{(p.rateBps / 100).toFixed(p.rateBps % 100 === 0 ? 0 : 1)}%</td>
                <td style={num}>{p.complete ? money(p.netMinor) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {anyMissing && (
        <p style={{ color: "var(--neg, crimson)", fontSize: "0.85rem", marginTop: "0.8rem" }}>⚠ {copy.incomplete}</p>
      )}

      <section style={{ marginTop: "1.4rem" }}>
        <h2 style={{ fontSize: "0.9rem", color: "var(--muted)", fontWeight: 600, margin: "0 0 0.4rem" }}>{copy.vatBreakdown}</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>{copy.rate}</th>
              <th style={{ ...th, textAlign: rtl ? "left" : "right" }}>{copy.base}</th>
              <th style={{ ...th, textAlign: rtl ? "left" : "right" }}>{copy.vat}</th>
            </tr>
          </thead>
          <tbody>
            {bd.byRate.map((r) => (
              <tr key={r.rateBps}>
                <td style={td}>{(r.rateBps / 100).toFixed(r.rateBps % 100 === 0 ? 0 : 1)}%</td>
                <td style={num}>{money(r.baseMinor)}</td>
                <td style={num}>{money(r.vatMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section
        style={{
          marginTop: "1.4rem",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "0.35rem 1rem",
          maxWidth: "360px",
          [rtl ? "marginLeft" : "marginRight"]: "auto",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ color: "var(--muted)" }}>{copy.totalHT}</span>
        <span style={{ textAlign: rtl ? "left" : "right" }}>{money(bd.totals.netMinor)}</span>
        <span style={{ color: "var(--muted)" }}>{copy.totalVAT}</span>
        <span style={{ textAlign: rtl ? "left" : "right" }}>{money(bd.totals.vatMinor)}</span>
        <strong>{copy.totalTTC}</strong>
        <strong style={{ textAlign: rtl ? "left" : "right" }}>{money(bd.totals.grossMinor)}</strong>
      </section>

      <footer style={{ marginTop: "1.6rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "0 0 0.4rem" }}>{copy.confirmNotice}</p>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: 0, fontStyle: "italic" }}>{copy.disclaimer}</p>
      </footer>
    </main>
  );
}
