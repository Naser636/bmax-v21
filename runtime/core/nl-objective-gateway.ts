/* TypeScript port (faithful transliteration) — parity with runtime/core/nl-objective-gateway.js.
 * all-any (explicit) facade: correctness proven by the hermetic equivalence bench. Type-suppression pragma
 * REMOVED (TS_NOCHECK_NL_OBJECTIVE): former TS2451 = script-vs-module scope collision → `export {}` marker;
 * MODE_SIGNALS/EFFECT_FAMILIES/CAPABILITY_PROBE given precise literal types (resolves the `.some`/index +
 * their callback params); params carry explicit `: any`; `compile` 2nd param made optional (runtime already
 * opts=opts||{}). NO business-behaviour or transition-condition change; the .js rollback twin is untouched.
 * The only V71 change (shared with the .js) is ROOT = repoRoot(__dirname) so a compiled dist/core copy maps
 * back to the canonical repo root. */

/*
 * Natural-Language Objective Gateway — DRY-RUN compiler for "parler naturellement à ODG".
 *
 * WHAT THIS IS
 *   The missing SEAM between an existing-but-orphaned compile half and the existing governed runtime:
 *   it accepts a user's raw natural-language objective and compiles it, through EXISTING governed
 *   mechanisms, into the full governed projection the Master's Universal Resolution Loop describes:
 *
 *     Natural Language → Intent → Objective → Requirements → Dependencies → Capabilities →
 *     Mission Contract → Authority → Policy → Risk → Workgraph → (planned) Execution →
 *     Verification → Evidence → Result
 *
 * WHAT IT IS NOT (hard invariants — the runtime stays authoritative, the LLM is never the authority)
 *   - It performs NO execution. It is DRY-RUN by default and refuses live execution (see `execute`).
 *   - It makes ZERO provider calls, ZERO network calls and ZERO external writes. It never mutates the
 *     repository, the ledger, or any durable state. It only READS local governance files (as the
 *     Governance Kernel already does) and returns a plain object.
 *   - It invents no authority, no policy and no 10th primitive. Authority/Policy/Risk admission is
 *     DELEGATED to the existing deterministic gate (runtime/core/action-gate.js), authority to the
 *     existing Governance Kernel (runtime/core/governance-kernel.js), the Mission Contract to the
 *     existing Mission Synthesizer (runtime/core/mission-synthesizer.js, the Mission-Loader schema),
 *     and capability resolution to the existing Capability Router (runtime/core/capability-router.js).
 *   - It never claims a result is EXECUTED / VERIFIED / CERTIFIED. A dry-run abstains fail-closed with
 *     a structured blocker whenever a stage cannot be satisfied without an external effect.
 *
 * THE ONLY GENUINELY NEW BEHAVIOUR is a small, deterministic Risk / External-Effect classifier
 * (`classifyObjective`) — the one governance stage the audit proved had no owner. It is pure and
 * keyword-driven, so an identical objective always classifies identically (DETERMINISM_FIRST).
 *
 * Pure: no clock, no randomness, no network. `compile()` returns a plain object; same input ⇒ same
 * output (there are no timestamps in the result, so repeated identical objectives are idempotent).
 */

"use strict";

const fs = require("fs");
const path = require("path");

const synth = require("./mission-synthesizer");       // NL → Mission-Loader contract (existing)
const router = require("./capability-router");         // objective → capability tier plan (existing)
const gate = require("./action-gate");                 // deterministic POLICY/AUTHORITY/RISK admission (existing)
const kernel = require("./governance-kernel");         // state-machine authorization (existing)
const assembler = require("./expert-profile-assembler"); // durable profile → mission-scoped §303 Expert Instance (existing, read-only)
const { repoRoot } = require("./runtime-paths");       // dist/core → canonical repo root (V71 __dirname fix)

// Repo root resolved via runtime-paths so a COMPILED dist/core copy still finds runtime/config &
// runtime/policies in the SOURCE tree (path.resolve(__dirname,"..","..") would yield runtime/dist). In the
// source layout this is identical to the historical computation, so production JS behaviour is unchanged.
const ROOT = repoRoot(__dirname);
const PROVIDER_POLICY_PATH = path.join(ROOT, "runtime", "config", "provider-policy.json");
const RUNTIME_POLICIES_PATH = path.join(ROOT, "runtime", "policies", "runtime-policies.json");

// ---- Intent derivation (mirrors src/runtime/mission-intent.ts defaults; deterministic) ----------
// Signals are matched against a DIACRITIC-FOLDED, lower-cased copy of the objective, so the runtime
// understands its FRENCH operating language too (the keywords below are stored folded — no accents —
// and English keywords fold to themselves, so English mode derivation is byte-identical).
const MODE_SIGNALS: Array<[string, string[]]> = [
    ["ANALYZE", ["analyze", "analyse", "audit", "investigate", "assess", "review", "find", "explore", "research", "discover",
        "audite", "auditer", "analyser", "examine", "examiner", "inspecte", "inspecter", "evalue", "evaluer",
        "investigue", "explorer", "recherche", "rechercher", "etudie", "etudier", "diagnostique", "diagnostiquer", "identifie"]],
    ["PLAN", ["plan", "design", "roadmap", "strategize", "propose",
        "planifie", "planifier", "concois", "concevoir", "proposer", "decompose", "decomposer", "decoupe", "decouper", "feuille de route"]],
    ["IMPLEMENT", ["implement", "build", "add", "create", "write", "fix", "refactor", "wire", "integrate", "develop",
        "implemente", "implementer", "corrige", "corriger", "repare", "reparer", "ajoute", "ajouter", "cree", "creer",
        "ecris", "ecrire", "developpe", "developper", "integre", "integrer", "cable", "cabler", "construis", "construire",
        "modifie", "modifier", "genere", "generer", "realise", "realiser", "execute", "executer", "refactorise"]],
    ["VALIDATE", ["validate", "verify", "test", "check", "certify",
        "valide", "valider", "verifie", "verifier", "teste", "tester", "controle", "controler", "certifie", "certifier"]],
    ["LEARN", ["learn", "train", "study", "apprends", "apprendre", "entraine", "entrainer"]],
];
const HIGH_PRIORITY_SIGNALS = ["urgent", "asap", "immediately", "critical", "now", "best",
    "immediatement", "critique", "maintenant", "prioritaire", "des que possible"];

function foldDiacritics(s: any) {
    // Strip Latin combining marks (\u0300\u2013\u036f) AND Arabic combining marks (harakat \u064b\u2013\u065f + superscript
    // alef \u0670), so accented FR ("d\u00e9ploie"\u2192"deploie") and hamza/harakat Arabic variants
    // ("\u0627\u0644\u0625\u0646\u062a\u0627\u062c"/"\u0623\u0631\u0633\u0644" \u2192 "\u0627\u0644\u0627\u0646\u062a\u0627\u062c"/"\u0627\u0631\u0633\u0644") normalise to a single matchable form. EN folds to itself.
    return String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, "");
}

function deriveIntent(mission: any, normalized: any) {
    const g = foldDiacritics(normalized).toLowerCase();
    let mode = "UNKNOWN";
    for (const [m, kws] of MODE_SIGNALS) {
        if (kws.some((k) => g.includes(k))) { mode = m; break; }
    }
    const priority = HIGH_PRIORITY_SIGNALS.some((k) => g.includes(k)) ? "HIGH" : "NORMAL";
    return { mission, type: "GENERIC", objective: normalized, priority, mode };
}

// ---- Normalization ------------------------------------------------------------------------------
function normalizeObjective(text: any) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "").trim();
}

// ---- Requirements & constraints (deterministic extraction from the compiled contract + goal) -----
// Requirements come from the governed contract's definition_of_done (no fabrication); constraints are
// explicit negative/limiting clauses found in the objective text.
// V2-B1 — multilingual constraint signals. EN + FR + AR negative/limiting clauses. (\b is ASCII-only, so
// Arabic patterns are anchored on the literal word, not \b.) Matched against the raw normalized text; the FR
// keywords are unaccented so no folding is needed here.
const CONSTRAINT_SIGNALS = [
    /\bwithout\b[^.,;]*/gi, /\bmust not\b[^.,;]*/gi, /\bno\s+\w+[^.,;]*/gi, /\bonly\b[^.,;]*/gi, /\bnever\b[^.,;]*/gi,
    // EN prohibition verbs: do not · don't · cannot · can't · mustn't (prohibitions were previously uncaptured,
    // so "fix the build but do not delete X" recorded no constraint — a governance-visibility gap, not a safety
    // inversion: the effect classifier already does NOT fire on these forms).
    /\bdo not\b[^.,;]*/gi, /\bdon['’]t\b[^.,;]*/gi, /\bcannot\b[^.,;]*/gi, /\bcan['’]t\b[^.,;]*/gi, /\bmustn['’]t\b[^.,;]*/gi,
    // FR: sans · ne … pas · ne pas · jamais · uniquement · seulement · pas de
    // "ne … pas" allows up to 3 words between (object pronouns/adverbs): "ne le lance pas", "ne les supprime pas".
    // "en aucun cas" = a strong FR prohibition ("under no circumstances").
    /\bsans\b[^.,;]*/gi, /\bne(\s+\S+){0,3}\s+pas\b[^.,;]*/gi, /\bne pas\b[^.,;]*/gi, /\bjamais\b[^.,;]*/gi, /\ben aucun cas\b[^.,;]*/gi, /\buniquement\b[^.,;]*/gi, /\bseulement\b[^.,;]*/gi, /\bpas de\b[^.,;]*/gi,
    // AR: بدون (without) · فقط (only) · ابدا/أبدا (never) · دون (without) · لا تَفعل (negated imperfect
    // prohibition "do not …") · ممنوع (forbidden). \b is ASCII-only so Arabic anchors on the literal word.
    /بدون[^.,;]*/g, /فقط[^.,;]*/g, /ابدا[^.,;]*/g, /أبدا[^.,;]*/g, /دون[^.,;]*/g, /لا\s+ت\S+[^.,;]*/g, /ممنوع[^.,;]*/g,
];
function extractConstraints(normalized: any) {
    const out: any[] = [];
    for (const re of CONSTRAINT_SIGNALS) {
        const matches = String(normalized).match(re);
        if (matches) for (const m of matches) { const s = m.trim(); if (s && !out.includes(s)) out.push(s); }
    }
    return out;
}

// ---- Risk / External-Effect classifier (THE one new governance stage) ---------------------------
// Keyword-driven and deterministic. Severity order is fixed; the first matching family wins so a
// single objective maps to exactly one external-effect family, one action class and one risk level.
// V2-B1 — MULTILINGUAL (EN + FR + AR). The classifier is matched against a DIACRITIC-FOLDED, lower-cased
// copy of the goal (classifyObjective), so the FRENCH signals below are stored folded (no accents: "deploie",
// "telecharge", "supprime"). Arabic signals are matched as-is (no case). This closes a governance SAFETY hole:
// before V2-B1 a FR/AR destructive/financial/deploy objective ("supprime le fichier", "paie la facture",
// "deploie en production", "احذف الملف") fell through to NONE/GENERATE/LOW — bypassing requiresHuman,
// requiresExternal provider-gating, consequential admission, and expert-profile selection. FR/AR signals mirror
// the EXISTING specificity (qualified phrases, not bare verbs) to avoid over-escalating local/analytic requests.
const EFFECT_FAMILIES: Array<[string, string[], string, string, string, boolean, boolean]> = [
    // family,          signals,                                                                   actionClass,   risk,       reversibility, requiresExternal, requiresHuman
    ["DESTRUCTIVE", ["delete file", "delete the", "drop table", "drop database", "truncate", "wipe", "destroy", "erase ", "purge ", "rm -rf",
        // FR (folded): supprime le fichier / efface le / détruis / vide la table / écrase le fichier
        "supprime le fichier", "supprime le", "supprimer le", "efface le", "efface ", "detruis", "detruire", "vide la table", "vide la base", "ecrase le fichier",
        // AR: احذف (delete) · امسح (erase) · دمر (destroy) · أزل الملف (remove the file)
        "احذف", "امسح", "دمر", "ازل الملف", "أزل الملف"], "DELETE", "CRITICAL", "R4", false, true],
    // NOTE: the bare word "transaction" is deliberately NOT a FINANCIAL signal. Like "current" below,
    // it over-matched non-financial senses ("transactional" source repair, a DB/git "transaction log")
    // and wrongly escalated local/ambiguous objectives to TRANSACT/CRITICAL/R4. Genuine money movement
    // is already carried by the explicit verbs (pay/charge/transfer money/withdraw/deposit/invoice/…),
    // so "transaction" only escalates when qualified as a money transaction (financial/payment/…).
    // "charge the/a/my" (billing), NOT bare "charge " — the bare form collided with FR "télécharge"
    // (download) and EN "recharge/discharge/surcharge", wrongly escalating them to FINANCIAL/CRITICAL.
    ["FINANCIAL", ["pay ", "buy ", "purchase", "sell ", "invoice", "charge the", "charge a", "charge my", "transfer money", "payment", "financial transaction", "payment transaction", "money transaction", "bank transaction", "card transaction", "deposit", "withdraw", "spend ",
        // FR (folded): paie/paye/payer · achete/acheter · vends/vendre · facture/facturer · virement · dépense · paiement
        "paie", "paye", "payer", "achete", "acheter", "vends", "vendre", "facture", "facturer", "virement", "vire de l argent", "transfere de l argent", "depense", "depenser", "retire de l argent", "paiement",
        // AR: ادفع (pay) · اشتر/اشتري (buy) · بع (sell) · فاتورة (invoice) · حول المال (transfer money) · اصرف (spend) · دفعة (payment)
        "ادفع", "اشتر", "اشتري", "بع ", "فاتورة", "حول المال", "حوّل المال", "اصرف", "دفعة"], "TRANSACT", "CRITICAL", "R4", true, true],
    ["DEPLOY", ["deploy", "release to production", "ship to production", "publish to", "go live", "push to prod",
        // FR (folded): déploie/déployer · mets en production · mise en production · passe en prod · livre en production
        "deploie", "deployer", "mets en production", "met en production", "mise en production", "passe en prod", "passe en production", "livre en production", "pousse en prod",
        // AR: انشر في الإنتاج (publish to production) · نشر الإنتاج · أطلق في الإنتاج
        "انشر في الانتاج", "انشر في الإنتاج", "نشر الانتاج", "اطلق في الانتاج"], "IRREVERSIBLE", "HIGH", "R3", true, true],
    ["COMMUNICATE", ["email", "send ", "post to", "publish ", "notify", " message ", "contact ", "tweet", " dm ",
        // FR (folded): envoie/envoyer · courriel · poste sur · notifie/notifier · contacte/contacter · écris à
        "envoie", "envoyer", "courriel", "poste sur", "notifie", "notifier", "contacte", "contacter", "ecris a ",
        // AR: أرسل/ارسل (send) · راسل (message) · انشر على (post to) · بريد الكتروني (email) · تواصل مع (contact)
        "ارسل", "أرسل", "راسل", "انشر على", "بريد الكتروني", "تواصل مع"], "COMMUNICATE", "HIGH", "R2", true, false],
    // NOTE: the bare word "current" is deliberately NOT a NETWORK signal. It over-matched local
    // repository reads ("current repository state" / "current repo state") — a V7 reliquat. True
    // "need live external data" intent is already carried by "live data" / "real-time" plus the
    // concrete transport signals (online/internet/web/http/url/fetch/download/scrape/crawl), so the
    // mere presence of "current" never alone classifies a request NETWORK. (FR "marché"/folded "marche"
    // is likewise EXCLUDED — it collides with "ça marche" = "it works".)
    ["NETWORK", ["online", "internet", " web", "scrape", "crawl", "fetch ", "download", "http", "url", "market", "opportunit", "browse", "search the", "live data", "real-time",
        // FR (folded): en ligne · sur internet · télécharge · aspire le site · explore le web · cherche sur · temps réel · appel d'offre
        "en ligne", "sur internet", "telecharge", "telecharger", "aspire le site", "explore le web", "cherche sur", "donnees en direct", "temps reel", "appel d offre", "appels d offres",
        // AR: عبر الإنترنت (online) · الإنترنت · نزّل/حمّل من (download) · ابحث في/على (search) · الويب (web) · السوق (market)
        "عبر الانترنت", "عبر الإنترنت", "الانترنت", "الإنترنت", "نزل الملف", "حمل من", "ابحث في", "ابحث على", "الويب", "السوق"], "ANALYZE", "MEDIUM", "R0", true, false],
];

// ---- Capability → registered evidence probe binding --------------------------------------------
// Maps a RESOLVED local capability (capability-router → decision-rules) to the EXISTING capability-
// probes probe that machine-verifies its outcome. Declaring it in the synthesized contract turns a
// read-only no-op objective into a genuinely verifiable one: the objective-evidence / Validation
// Engine gate then REQUIRES that probe to pass (fail-closed), closing Mission → Capability →
// Execution → Evidence for a natural-language intent. Reuses EXISTING probe names only (no new probe).
//
// ONLY read-only capabilities whose executor runs WITHOUT a human-authorized transport are auto-bound.
// A consequential capability (Governed Git Branch Integration / Governed Bash/Linux Command / External
// Research Acquisition) self-gates deny-by-default and REQUIRES a human authorization carried on the
// objective — a natural-language sentence can never self-authorize it (no-self-authorization), so it is
// deliberately NOT auto-bound here. Those remain reachable only through an explicitly-authored mission.
const CAPABILITY_PROBE: Record<string, string> = {
    "Connectivity Audit": "internet-reachable",
};
function probeForCapability(capability: any) {
    return (capability && CAPABILITY_PROBE[capability]) || null;
}

// NEGATION-INVERSION GUARD (SAFETY). A prohibition that NAMES an effect ("do not delete the file",
// "ne supprime pas", "لا تحذف") must NEVER be classified as that effect — else a forbidden destructive /
// deploy / financial action could be executed (a catastrophic inversion). Before accepting an effect-signal
// match, we reject it if it is immediately preceded (same short window) by a negation in EN/FR/AR. The
// prohibition is still recorded by extractConstraints; the EFFECT is suppressed (⇒ NONE), the safe direction.
// Negation is scoped to the CLAUSE containing the effect signal (not a fixed window) so a prohibition anywhere
// earlier in the same clause suppresses the effect — e.g. "do not pay the invoice" negates BOTH "pay" and the
// later noun-signal "invoice". Clause boundaries: Latin/Arabic punctuation + EN/FR conjunctions (and/then/but/
// et/puis/mais…). Arabic negation particle لا anywhere in the clause also negates.
// STRONG prohibition markers scope the WHOLE clause (deliberate: "do not pay the invoice" must negate the later
// noun-signal "invoice"). These are genuine prohibitions of the clause's effect.
// NOTE on FR tokens: `ne` is kept (it reliably marks FR negation and catches the standard "ne … pas" since `ne`
// appears in the clause), but bare `pas` is DROPPED — alone it collides with the English word "PAS"/"pas de deux"
// and wrongly SUPPRESSED a real destructive instruction ("the PAS system should DELETE …" ⇒ NONE, a fail-OPEN).
// Dropping it loses only dropped-"ne" colloquial negation ("supprime pas"), which then over-classifies (safe,
// human-gated) and is still captured by extractConstraints — never a new fail-open.
const CLAUSE_NEGATION_STRONG = /(\bdo not\b|\bdon['’]t\b|\bdoes not\b|\bdoesn['’]t\b|\bcannot\b|\bcan['’]t\b|\bmust not\b|\bmustn['’]t\b|\bwill not\b|\bwon['’]t\b|\bshould not\b|\bshouldn['’]t\b|\bnot\b|\bnever\b|\bne\b|\bjamais\b)/;
// WEAK/adverbial negators (no/without/sans/sauf) are frequently NON-prohibiting ("without further delay DELETE…",
// "we have no backup so WIPE…", "sans hesitation SUPPRIME…"). Clause-wide suppression on these produced a reproduced
// fail-OPEN: a genuinely destructive/financial/deploy instruction downgraded to NONE/LOW/no-human. They now suppress
// ONLY when IMMEDIATELY adjacent to the signal (optionally across an article) — a true local prohibition ("no delete",
// "sans suppression"). A non-adjacent weak negator leaves the effect intact (fail-CLOSED: over-classify, human-gated).
const WEAK_NEG_ADJACENT = /\b(?:no|without|sans|sauf)\b\s*(?:the\s+|a\s+|an\s+|le\s+|la\s+|les\s+|l['’]\s*|de\s+|des\s+|du\s+)?$/;
const CLAUSE_BOUNDARY = /[,;.:!?()\[\]—–/،؛]|\b(?:and|then|also|but|et|puis|ensuite|mais)\b/g;
function isNegatedBefore(g: string, idx: number): boolean {
    const pre = g.slice(0, idx);
    let start = 0, m: any;
    CLAUSE_BOUNDARY.lastIndex = 0;
    while ((m = CLAUSE_BOUNDARY.exec(pre)) !== null) start = m.index + m[0].length;
    const clause = pre.slice(start);
    // (a) strong prohibition anywhere in the clause ⇒ suppress; Arabic negation particle لا likewise.
    if (CLAUSE_NEGATION_STRONG.test(clause) || /لا\s/.test(clause)) return true;
    // (b) weak adverbial negator ONLY when immediately adjacent to the signal ⇒ suppress; otherwise the effect stands.
    if (WEAK_NEG_ADJACENT.test(clause)) return true;
    return false;
}
function signalPresentUnnegated(g: string, s: string): boolean {
    let from = 0;
    for (;;) {
        const idx = g.indexOf(s, from);
        if (idx === -1) return false;
        if (!isNegatedBefore(g, idx)) return true; // a genuine (un-negated) occurrence
        from = idx + 1;
    }
}
function classifyObjective(goal: any) {
    // Fold diacritics so FRENCH signals (stored folded in EFFECT_FAMILIES) match accented input
    // ("déploie"→"deploie"); English folds to itself (byte-identical) and Arabic is preserved.
    const g = foldDiacritics(String(goal || "")).toLowerCase();
    for (const [family, signals, actionClass, risk, reversibility, requiresExternal, requiresHuman] of EFFECT_FAMILIES) {
        if (signals.some((s) => signalPresentUnnegated(g, s))) {
            return { externalEffect: family, actionClass, risk, reversibility, requiresExternal, requiresHuman };
        }
    }
    // No outward-effect signal ⇒ a safe, local, observational/generative objective.
    return { externalEffect: "NONE", actionClass: "GENERATE", risk: "LOW", reversibility: "R0", requiresExternal: false, requiresHuman: false };
}

// ---- Ambiguity (ask for missing BUSINESS information only — never internal ODG commands) ---------
function detectAmbiguity(normalized: any) {
    const words = normalized.split(/\s+/).filter(Boolean);
    if (normalized.length === 0) {
        return { ambiguous: true, reason: "EMPTY_OBJECTIVE", question: "What outcome do you want? Describe the business goal, the target (market / audience / system), and any budget or deadline." };
    }
    if (words.length < 2) {
        return { ambiguous: true, reason: "UNDERSPECIFIED_OBJECTIVE", question: "That is too broad to act on. What specifically should be achieved, for whom, and by when?" };
    }
    return { ambiguous: false, reason: null, question: null };
}

// ---- Read-only policy loads (local file reads only; NOT external/network calls) ------------------
function readJsonSafe(p: any) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}
function resolveExternalProvidersEnabled(opts: any) {
    if (opts && typeof opts.externalProvidersEnabled === "boolean") return opts.externalProvidersEnabled;
    const policy = readJsonSafe(PROVIDER_POLICY_PATH);
    return !!(policy && policy.externalProvidersEnabled === true);
}
function resolveGovernanceStrategy() {
    const policies = readJsonSafe(RUNTIME_POLICIES_PATH);
    return (policies && policies.governance && policies.governance.strategy) || "DETERMINISM_FIRST";
}

// ---- Workgraph (deterministic linear projection over the ordered objectives) --------------------
// This is a PLAN projection, not a second executor: it mirrors the positional LOAD → objectives →
// VERIFY → REPORT ordering the Mission Orchestrator already derives, so the dry-run shows the shape
// of the work without running anything.
function buildWorkgraph(objectives: any) {
    const nodes = ["LOAD", ...objectives.map((o: any) => o.id), "VERIFY", "REPORT"];
    const edges = [];
    for (let i = 0; i < nodes.length - 1; i++) edges.push({ from: nodes[i], to: nodes[i + 1] });
    return { nodes, edges };
}

// ---- The gateway --------------------------------------------------------------------------------
/**
 * compile(rawObjective, opts) -> GatewayResult (dry-run projection; no side effects).
 *
 * opts (all optional):
 *   execute            boolean — MUST be falsy. true is refused with a structured blocker; the gateway
 *                      never executes. Live execution goes through the existing governed CLI with human
 *                      authorization, not through this gateway.
 *   currentState       string  — mission lifecycle state for the Authority check (default "CREATED").
 *   allowedPolicies    string[]— policy keys the governance context permits (passed to action-gate).
 *   revokedAuthorities string[]— authority keys revoked in context (passed to action-gate).
 *   authority          string|object — authority basis to attach to consequential planned actions.
 *   missionAuthority   string[] — authority keys the mission already carries; bounds the Expert Instance
 *                      authority_scope (intersection only — never increases authority). Default [].
 *   externalProvidersEnabled boolean — override the provider-policy flag (else read from disk).
 */
function compile(rawObjective: any, opts: any = {}) {
    opts = opts || {};
    const counters = { providerCalls: 0, externalCalls: 0, externalWrites: 0 };

    // The gateway is dry-run only in this increment: refuse live execution fail-closed.
    if (opts.execute === true) {
        return {
            mode: "DRY_RUN",
            rawObjective: String(rawObjective == null ? "" : rawObjective),
            status: "BLOCKED",
            blockers: [{ code: "LIVE_EXECUTION_NOT_PERMITTED", detail: "The NL gateway never executes. Run the authorized mission through the governed CLI (odg mission <NAME>) with human authorization." }],
            recovery: "ABSTAIN",
            ...counters,
        };
    }

    const normalized = normalizeObjective(rawObjective);

    // Stage A — Ambiguity: ask for business info only, never internal commands.
    const ambiguity = detectAmbiguity(normalized);
    if (ambiguity.ambiguous) {
        return {
            mode: "DRY_RUN",
            rawObjective: String(rawObjective == null ? "" : rawObjective),
            normalizedObjective: normalized,
            status: "AMBIGUOUS",
            ambiguity,
            recovery: "ASK_HUMAN",
            blockers: [],
            ...counters,
        };
    }

    // Stage B — Mission Contract via the EXISTING governed mechanism (Mission Synthesizer).
    const contract = synth.fromRequest(normalized);
    const strategy = resolveGovernanceStrategy();
    const externalProvidersEnabled = resolveExternalProvidersEnabled(opts);

    // Stage C — Intent, Requirements, Constraints.
    const intent = deriveIntent(contract.mission, normalized);
    const requirements = Array.isArray(contract.definition_of_done) ? contract.definition_of_done.slice() : [];
    const constraints = extractConstraints(normalized);

    // Stage D — Dependencies + Workgraph (deterministic linear projection over the ordered objectives).
    const workgraph = buildWorkgraph(contract.objectives);
    const dependencies = workgraph.edges;

    // Stages E–H — per-objective Capability resolution + Risk/External-effect + Policy/Authority/Risk admission.
    const blockers = [];
    const perObjective = contract.objectives.map((obj: any) => {
        // E — Capability resolution (existing router). EXTERNAL last-resort ⇒ no LOCAL capability.
        const routed = router.route({ goal: obj.goal, objectiveId: obj.id }, opts);
        const missingLocalCapability = routed.chosen.source === "EXTERNAL";

        // F — Risk / External-effect (the new deterministic classifier).
        const classification = classifyObjective(obj.goal);

        // G/H — Build the planned action and DELEGATE the admission decision to the existing gate.
        const action: any = {
            principal: "odg-nl-gateway",
            verb: intent.mode === "UNKNOWN" ? "PROCESS" : intent.mode,
            target: obj.id,
            actionClass: classification.actionClass,
            contract,
            policy: opts.policy || strategy,
            authority: opts.authority != null ? opts.authority : null,
            risk: classification.risk,
            reversibility: classification.reversibility,
        };
        if (gate.CONSEQUENTIAL_CLASSES.includes(classification.actionClass)) {
            // Consequential actions need a declared expected state transition; in a dry-run the next
            // governed step would be PLANNED → PREPARED. (Observational actions are not state-gated.)
            action.expectedTransition = {
                state_before: { lifecycle: "PLANNED" },
                action: "PREPARE",
                observed_effect: "mission prepared (dry-run projection)",
                state_after: { lifecycle: "PREPARED" },
                state_version_before: 1,
                state_version_after: 2,
                difference: { lifecycle: { before: "PLANNED", after: "PREPARED" } },
                evidence_refs: ["nl-objective-gateway:dry-run"],
                verification_status: "UNVERIFIED",
            };
        }
        const admission = gate.evaluateAction(action, {
            allowedPolicies: opts.allowedPolicies,
            revokedAuthorities: opts.revokedAuthorities,
        });

        // Per-objective blockers (fail-closed, deterministic).
        if (missingLocalCapability && !classification.requiresExternal) {
            blockers.push({ code: "MISSING_CAPABILITY", objective: obj.id, detail: `No local capability resolves "${obj.goal}" and no external effect was requested.` });
        }
        if (classification.requiresExternal && !externalProvidersEnabled) {
            blockers.push({ code: "EXTERNAL_PROVIDER_DISABLED_BY_POLICY", objective: obj.id, detail: `Objective needs an external effect (${classification.externalEffect}) but externalProvidersEnabled=false.` });
        }
        if (classification.requiresExternal && externalProvidersEnabled) {
            // Providers are enabled, but a dry-run never calls them: record the pending external effect.
            blockers.push({ code: "EXTERNAL_EFFECT_NOT_RUN_IN_DRY_RUN", objective: obj.id, detail: `Objective "${obj.goal}" would require an external ${classification.externalEffect} effect; dry-run does not perform it.` });
        }
        if (admission.decision === "DENY") {
            blockers.push({ code: "ADMISSION_DENIED", objective: obj.id, detail: admission.violations.join("; ") });
        }

        return {
            objective: obj,
            capability: { chosen: routed.chosen, plan: routed.plan, missingLocalCapability },
            classification,
            admission: { decision: admission.decision, checks: admission.checks, violations: admission.violations, escalation: admission.escalation },
        };
    });

    // Stage H.b — Evidence binding. Bind each objective's RESOLVED capability to its registered probe
    // (when one exists), so the synthesized contract declares a REAL, machine-checkable evidence
    // requirement instead of a tautological done_when. The binding is emitted both as the contract
    // `verify` block (objective-evidence + Validation Engine required-proof gate) and as the per-
    // objective `proof` (Validation Engine evaluateObjectiveProofs). A green pipeline over an unbound
    // objective can no longer read as SUCCESS; a bound objective passes only when its probe genuinely
    // verifies the capability's evidence. Pure: declares the requirement; it NEVER runs the probe here.
    const verify: any[] = [];
    perObjective.forEach((p: any, i: any) => {
        const probe = probeForCapability(p.capability.chosen.capability);
        if (probe && contract.objectives[i]) {
            contract.objectives[i].proof = probe;
            verify.push({ capability: p.capability.chosen.capability, evidence: probe });
        }
    });
    if (verify.length) contract.verify = verify;

    // Stage I — Authority (existing Governance Kernel: is a state transition permitted at all?).
    let authority;
    try {
        authority = kernel.authorizeMission(contract.mission, opts.currentState || "CREATED");
    } catch (e: any) {
        authority = { mission: contract.mission, authorized: false, error: String(e && e.message || e) };
    }
    if (!authority.authorized) {
        blockers.push({ code: "AUTHORITY_DENIED", detail: `No valid state transition from "${opts.currentState || "CREATED"}" for mission ${contract.mission}.` });
    }

    // Aggregate decision (deny-by-default precedence: DENY > ESCALATE > ALLOW).
    const decisions = perObjective.map((p: any) => p.admission.decision);
    const anyDeny = decisions.includes("DENY") || !authority.authorized;
    const anyEscalate = decisions.includes("ESCALATE");
    const admissionAggregate = anyDeny ? "DENY" : anyEscalate ? "ESCALATE" : "ALLOW";

    // Stage I.b — Expert binding (read-only §304→§303→§307). Compile a mission-scoped Expert Instance
    // from the durable profile the objective family indicates (FINANCIAL ⇒ ECONOMIC, else ENGINEERING;
    // reusing the existing classifier, no new one). Pure: reads profile JSON, executes nothing, and
    // grants NO authority — authority_scope is the intersection with the mission authority passed in
    // (opts.missionAuthority, default []); it is never self-granted from the profile (§307).
    let expert;
    try {
        const anyFinancial = perObjective.some((p: any) => p.classification.externalEffect === "FINANCIAL");
        const profileFile = anyFinancial ? "runtime/profiles/economic.json" : "runtime/profiles/engineering.json";
        const profile = assembler.loadProfile(profileFile);
        expert = assembler.compileInstance(profile, {
            mission_id: contract.mission,
            objective_id: (contract.objectives[0] && contract.objectives[0].id) || null,
            authority: Array.isArray(opts.missionAuthority) ? opts.missionAuthority : [],
            expected_output: requirements,
        });
    } catch (e: any) {
        expert = { error: String((e && e.message) || e) };
    }

    // Stage J — Result. A dry-run NEVER reports EXECUTED/VERIFIED/CERTIFIED.
    let status;
    let recovery = "NONE";
    if (admissionAggregate === "DENY") { status = "DENIED"; recovery = "ABSTAIN"; }
    else if (blockers.length > 0) { status = "BLOCKED"; recovery = "ABSTAIN"; }
    else if (admissionAggregate === "ESCALATE") { status = "ESCALATE_TO_HUMAN"; recovery = "ASK_HUMAN"; }
    else { status = "READY_DRY_RUN"; recovery = "NONE"; }

    return {
        mode: "DRY_RUN",
        rawObjective: String(rawObjective == null ? "" : rawObjective),
        normalizedObjective: normalized,
        intent,
        requirements,
        constraints,
        requestedCapabilities: perObjective.map((p: any) => p.capability.chosen.capability || p.capability.chosen.tier),
        dependencies,
        workgraph,
        contract,
        authority,
        policy: { strategy, externalProvidersEnabled, allowedPolicies: opts.allowedPolicies || null },
        objectives: perObjective,
        expert,
        admission: admissionAggregate,
        verification: "NOT_EXECUTED (dry-run)",
        evidence: "NONE (dry-run)",
        blockers,
        recovery,
        status,
        ...counters,
    };
}

module.exports = {
    compile,
    classifyObjective,
    normalizeObjective,
    deriveIntent,
    detectAmbiguity,
    extractConstraints,
    buildWorkgraph,
    probeForCapability,
    CAPABILITY_PROBE,
};

// ---- Read-only CLI: compile an objective and print the governed dry-run projection as JSON. ------
if (require.main === module) {
    const raw = process.argv.slice(2).join(" ");
    const result = compile(raw);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    // Exit non-zero when the gateway abstains, so callers/CI can gate on a clean dry-run.
    const clean = result.status === "READY_DRY_RUN";
    process.exit(clean ? 0 : 2);
}

// Module-scope marker (adds NO runtime export): forces TypeScript MODULE scope so top-level consts
// (fs/path/synth/gate/repoRoot/ROOT) do not collide with sibling script-scope files (TS2451).
export {};
