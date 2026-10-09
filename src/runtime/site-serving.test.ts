/*
 * /site/[...slug] Route Handler — serves the commercial site same-origin as /api/intake, from the single
 * source files (no divergence), path-confined. Offline; reads real repo site/ (read-only).
 */
import { GET } from "../app/site/[...slug]/route";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

let passed = 0;
function ok(name: string, cond: boolean): void { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }
const REPO = path.resolve(__dirname, "..", "..");
async function serve(slug: string[]): Promise<{ status: number; type: string | null; text: string }> {
  const res = await GET(new Request("http://local/site/" + slug.join("/")), { params: Promise.resolve({ slug }) });
  return { status: res.status, type: res.headers.get("content-type"), text: await res.text() };
}

(async () => {
  // 1 — the served contact form is byte-identical to the source (no silent divergence).
  const src = fs.readFileSync(path.join(REPO, "site/contact.html"), "utf8");
  const r = await serve(["contact.html"]);
  ok("1 GET /site/contact.html ⇒ 200 text/html, bytes === source", r.status === 200 && /text\/html/.test(r.type || "") && r.text === src);
  // 2 — the served form posts to same-origin /api/intake.
  ok("2 served form targets same-origin POST /api/intake", /action="\/api\/intake"/.test(r.text) && /method="post"/i.test(r.text));
  // 3 — CSS asset served too (same origin under /site/).
  const css = await serve(["styles.css"]);
  ok("3 GET /site/styles.css ⇒ 200 text/css", css.status === 200 && /text\/css/.test(css.type || ""));
  // 4 — path traversal is refused (confinement).
  ok("4 traversal ../package.json ⇒ 403/404 (confined)", [403, 404].includes((await serve(["..", "package.json"])).status));
  // 5 — missing file ⇒ 404.
  ok("5 missing file ⇒ 404", (await serve(["does-not-exist.html"])).status === 404);
  console.log(`\nSITE SERVING (/site) — ${passed} assertions passed.`);
})().catch((e) => { console.error("SITE TEST ERROR:", e && (e as Error).stack); process.exit(1); });
