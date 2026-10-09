/*
 * GET /site/<path> — serve the existing commercial site (`site/`) from the SAME ORIGIN as POST /api/intake,
 * directly from the single source files (no duplication ⇒ no silent divergence between source and served
 * form). Path-confined via realpath (no traversal / symlink escape). Node runtime, request-time.
 *
 * Why: the contact form in site/contact.html POSTs to same-origin /api/intake; served here, the form and the
 * API share one origin on a mono-instance VPS. `styles.css` etc. resolve under /site/ too.
 * Next 16 Route Handlers + dynamic params: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
 */
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};

function siteRoot(): string {
  return path.resolve(process.env.ODG_SITE_ROOT && process.env.ODG_SITE_ROOT.trim() ? process.env.ODG_SITE_ROOT : path.join(process.cwd(), "site"));
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug?: string[] }> }): Promise<Response> {
  const { slug } = await ctx.params;
  const parts = Array.isArray(slug) && slug.length ? slug : ["index.html"];
  const root = siteRoot();
  const target = path.resolve(root, ...parts);
  let real: string, realRoot: string;
  try { realRoot = fs.realpathSync(root); real = fs.realpathSync(target); }
  catch { return new Response("Not found", { status: 404 }); }
  // Confinement: resolved real path must stay within the real site root (reject traversal/symlink escape).
  const rel = path.relative(realRoot, real);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return new Response("Forbidden", { status: 403 });
  let data: Buffer, stat: fs.Stats;
  try { stat = fs.statSync(real); if (!stat.isFile()) return new Response("Not found", { status: 404 }); data = fs.readFileSync(real); }
  catch { return new Response("Not found", { status: 404 }); }
  const type = TYPES[path.extname(real).toLowerCase()] || "application/octet-stream";
  return new Response(new Uint8Array(data), { status: 200, headers: { "content-type": type, "cache-control": "no-store" } });
}
