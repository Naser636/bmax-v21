import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output File Tracing standalone bundle: `next build` emits `.next/standalone/server.js` with only the
  // files the production server needs, so the app can be deployed without installing node_modules and
  // started via `node .next/standalone/server.js` (PORT/HOSTNAME env). `public/` and `.next/static` are
  // NOT copied automatically — see docs/odg-operational/DEPLOYMENT.md. No behavioural change to routes.
  output: "standalone",
};

export default nextConfig;
