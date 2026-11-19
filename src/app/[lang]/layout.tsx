import { createRequire } from "node:module";
import { notFound } from "next/navigation";
import { LANGS, LANG_NAMES, LANG_TO_LOCALE, COPY, isLang, type Lang } from "@/lib/estimate-i18n";

// Nested layout for the multilingual BTP product surface. It renders INSIDE the existing root
// <html lang="en"> (src/app/layout.tsx) — it does NOT create a second <html> element. The locale's
// writing direction is applied to a wrapper <div dir>, which is valid HTML and scopes RTL (ar) to
// this subtree without restructuring the dashboard root. First thin vertical slice (owner review).

export const runtime = "nodejs";

// Writing direction comes from the SAME reused core resolver the page uses (odg-language-management),
// not a hardcoded per-lang guess — one source of truth, so a future RTL locale added to the core is
// honoured here automatically.
const require_ = createRequire(import.meta.url);
const langmod = require_("../../../runtime/dist/core/odg-language-management.js") as {
  SUPPORTED_LOCALES: { code: string; rtl: boolean }[];
};
function dirFor(lang: Lang): "rtl" | "ltr" {
  const code = LANG_TO_LOCALE[lang];
  return langmod.SUPPORTED_LOCALES.find((l) => l.code === code)?.rtl === true ? "rtl" : "ltr";
}

export function generateStaticParams(): { lang: Lang }[] {
  return LANGS.map((lang) => ({ lang }));
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const dir = dirFor(lang);
  const copy = COPY[lang];

  return (
    <div
      lang={lang}
      dir={dir}
      style={{
        minHeight: "100%",
        background: "var(--app-bg, var(--background))",
        color: "var(--text, var(--foreground))",
        padding: "2rem 1rem",
      }}
    >
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        <nav
          aria-label={copy.language}
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            justifyContent: dir === "rtl" ? "flex-start" : "flex-end",
            marginBottom: "1.25rem",
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{copy.language}:</span>
          {LANGS.map((l) => (
            <a
              key={l}
              href={`/${l}/estimate`}
              hrefLang={l}
              aria-current={l === lang ? "true" : undefined}
              style={{
                fontSize: "0.85rem",
                padding: "0.2rem 0.6rem",
                borderRadius: "6px",
                textDecoration: "none",
                border: "1px solid var(--border)",
                background: l === lang ? "var(--accent-bg, var(--accent))" : "transparent",
                color: l === lang ? "var(--accent, inherit)" : "var(--text, inherit)",
                fontWeight: l === lang ? 600 : 400,
              }}
            >
              {LANG_NAMES[l]}
            </a>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
