import { createHash } from "node:crypto";

export function createFingerprint(data: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
}
