/*
 * POST /api/intake — the supported server entry that connects the website request form to the GOVERNED
 * client intake. It is a thin bridge: it reuses runtime/core/intake-endpoint.js (which performs ALL
 * server-side validation — method/content-type/size/JSON — and persists via client-intake) and never
 * trusts client-provided identity/consent/price/authorization. Node.js runtime, request-time (no caching).
 *
 * B-4 (V2 Pole B): the body is bounded BEFORE it is fully materialized. Previously `await request.text()`
 * buffered the entire request into a string and only THEN did handleIntakeRequest check MAX_BODY_BYTES — so
 * the size guard did not bound the read and a multi-GB POST could exhaust memory before the 413 fired. We now
 * reject early on an oversize Content-Length, and otherwise stream with a byte counter that aborts past the
 * cap (defense-in-depth for a chunked/absent-header request). The endpoint's own size check still runs after.
 *
 * Read the Next 16 Route Handlers guide before editing: node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
 */
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const endpoint = require_("../../../../runtime/dist/core/intake-endpoint.js") as {
  handleIntakeRequest: (
    req: { method: string; headers: Record<string, string>; body: string },
    opts: { cwd?: string },
  ) => { status: number; headers: Record<string, string>; body: string };
  MAX_BODY_BYTES: number;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // request-time only; never cached/prerendered

const TOO_LARGE = new Response(
  JSON.stringify({ ok: false, error: "payload too large" }),
  { status: 413, headers: { "content-type": "application/json" } },
);

/**
 * Read the request body as text WITHOUT materializing more than `max` bytes. Returns null when the body
 * exceeds the cap (the caller responds 413) — the stream is cancelled so the rest is never buffered.
 */
async function readBodyBounded(request: Request, max: number): Promise<string | null> {
  const body = request.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > max) { try { await reader.cancel(); } catch { /* best-effort */ } return null; }
        chunks.push(value);
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* best-effort */ }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

export async function POST(request: Request): Promise<Response> {
  const max = typeof endpoint.MAX_BODY_BYTES === "number" && endpoint.MAX_BODY_BYTES > 0 ? endpoint.MAX_BODY_BYTES : 16 * 1024;
  // Fast path: an honest oversize Content-Length is rejected before a single body byte is read.
  const cl = Number(request.headers.get("content-length"));
  if (Number.isFinite(cl) && cl > max) return TOO_LARGE;
  // Otherwise read bounded — a chunked or under-declared request is aborted past the cap, never fully buffered.
  const body = await readBodyBounded(request, max);
  if (body === null) return TOO_LARGE;
  const contentType = request.headers.get("content-type") ?? "";
  // No cwd override: the store base comes from ODG_CLIENT_STORE (persistent path) in production, and is
  // BLOCKED cleanly (503) when unconfigured — never a silent temp store under an ephemeral process cwd.
  const res = endpoint.handleIntakeRequest(
    { method: "POST", headers: { "content-type": contentType }, body },
    {},
  );
  return new Response(res.body, { status: res.status, headers: res.headers });
}
