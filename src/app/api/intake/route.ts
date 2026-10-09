/*
 * POST /api/intake — the supported server entry that connects the website request form to the GOVERNED
 * client intake. It is a thin bridge: it reuses runtime/core/intake-endpoint.js (which performs ALL
 * server-side validation — method/content-type/size/JSON — and persists via client-intake) and never
 * trusts client-provided identity/consent/price/authorization. Node.js runtime, request-time (no caching).
 *
 * Read the Next 16 Route Handlers guide before editing: node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
 */
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const endpoint = require_("../../../../runtime/core/intake-endpoint.js") as {
  handleIntakeRequest: (
    req: { method: string; headers: Record<string, string>; body: string },
    opts: { cwd?: string },
  ) => { status: number; headers: Record<string, string>; body: string };
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // request-time only; never cached/prerendered

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const contentType = request.headers.get("content-type") ?? "";
  // No cwd override: the store base comes from ODG_CLIENT_STORE (persistent path) in production, and is
  // BLOCKED cleanly (503) when unconfigured — never a silent temp store under an ephemeral process cwd.
  const res = endpoint.handleIntakeRequest(
    { method: "POST", headers: { "content-type": contentType }, body },
    {},
  );
  return new Response(res.body, { status: res.status, headers: res.headers });
}
