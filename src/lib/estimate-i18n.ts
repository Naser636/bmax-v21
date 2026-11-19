// App-layer UI copy for the BTP pre-contractual estimate page, in the product's four languages
// (FR / AR-RTL / EN / ES). Business logic (VAT, locale/RTL resolution) is reused from the governed
// runtime core (odg-fr-vat, odg-language-management) — these are presentation strings only.

export type Lang = "fr" | "ar" | "en" | "es";

// lang segment -> the product locale code odg-language-management resolves (ar-AE is RTL)
export const LANG_TO_LOCALE: Record<Lang, string> = {
  fr: "fr-FR",
  ar: "ar-AE",
  en: "en-GB",
  es: "es-ES",
};
export const LANGS: Lang[] = ["fr", "ar", "en", "es"];
export const LANG_NAMES: Record<Lang, string> = { fr: "Français", ar: "العربية", en: "English", es: "Español" };

export interface EstimateCopy {
  title: string; subtitle: string; preContractual: string;
  ref: string; designation: string; qty: string; unitHT: string; priceSource: string; netHT: string; rate: string;
  incomplete: string; missingPrice: string;
  totalHT: string; totalVAT: string; totalTTC: string;
  vatBreakdown: string; base: string; vat: string;
  confirmNotice: string; disclaimer: string; language: string;
}

export const COPY: Record<Lang, EstimateCopy> = {
  fr: {
    title: "Devis estimatif BTP", subtitle: "Estimation de travaux", preContractual: "Estimation pré-contractuelle",
    ref: "Réf.", designation: "Désignation", qty: "Qté", unitHT: "P.U. HT", priceSource: "Source prix", netHT: "Montant HT", rate: "TVA",
    incomplete: "Estimation incomplète (prix manquant)", missingPrice: "prix non sourcé",
    totalHT: "Total HT", totalVAT: "Total TVA", totalTTC: "Total TTC",
    vatBreakdown: "Détail TVA par taux", base: "Base HT", vat: "TVA",
    confirmNotice: "À confirmer avant tout engagement. Les prix sont fournis avec leur source ; aucun n'est inventé.",
    disclaimer: "Document estimatif pré-contractuel — ne constitue ni une facture, ni une commande, ni un engagement.",
    language: "Langue",
  },
  ar: {
    title: "تقدير أسعار أعمال البناء", subtitle: "تقدير الأشغال", preContractual: "تقدير ما قبل التعاقد",
    ref: "المرجع", designation: "التسمية", qty: "الكمية", unitHT: "السعر الوحدوي (بدون ضريبة)", priceSource: "مصدر السعر", netHT: "المبلغ بدون ضريبة", rate: "ض.ق.م",
    incomplete: "تقدير غير مكتمل (سعر مفقود)", missingPrice: "سعر غير موثّق",
    totalHT: "الإجمالي بدون ضريبة", totalVAT: "إجمالي الضريبة", totalTTC: "الإجمالي شامل الضريبة",
    vatBreakdown: "تفصيل الضريبة حسب النسبة", base: "الأساس", vat: "الضريبة",
    confirmNotice: "يتطلب التأكيد قبل أي التزام. الأسعار مرفقة بمصادرها ولا يُختلق أيٌّ منها.",
    disclaimer: "وثيقة تقدير ما قبل التعاقد — ليست فاتورة ولا طلبية ولا التزاماً.",
    language: "اللغة",
  },
  en: {
    title: "Construction cost estimate", subtitle: "Works estimate", preContractual: "Pre-contractual estimate",
    ref: "Ref.", designation: "Description", qty: "Qty", unitHT: "Unit price (excl. VAT)", priceSource: "Price source", netHT: "Net amount", rate: "VAT",
    incomplete: "Incomplete estimate (missing price)", missingPrice: "price not sourced",
    totalHT: "Total (excl. VAT)", totalVAT: "Total VAT", totalTTC: "Total (incl. VAT)",
    vatBreakdown: "VAT breakdown by rate", base: "Base", vat: "VAT",
    confirmNotice: "Confirm before any commitment. Prices are supplied with their source; none are invented.",
    disclaimer: "Pre-contractual estimate — not an invoice, order, or commitment.",
    language: "Language",
  },
  es: {
    title: "Presupuesto estimado de obra", subtitle: "Estimación de trabajos", preContractual: "Estimación precontractual",
    ref: "Ref.", designation: "Descripción", qty: "Cant.", unitHT: "P.U. sin IVA", priceSource: "Fuente de precio", netHT: "Importe sin IVA", rate: "IVA",
    incomplete: "Estimación incompleta (precio faltante)", missingPrice: "precio sin fuente",
    totalHT: "Total sin IVA", totalVAT: "Total IVA", totalTTC: "Total con IVA",
    vatBreakdown: "Desglose de IVA por tipo", base: "Base", vat: "IVA",
    confirmNotice: "Confirmar antes de cualquier compromiso. Los precios se aportan con su fuente; ninguno se inventa.",
    disclaimer: "Documento de estimación precontractual — no es una factura, un pedido ni un compromiso.",
    language: "Idioma",
  },
};

export function isLang(v: string): v is Lang { return (LANGS as string[]).includes(v); }
