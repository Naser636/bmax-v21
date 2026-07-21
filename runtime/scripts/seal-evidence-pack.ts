/*
 * Evidence Pack sealer (industrialization tool).
 *
 * Reuses the Mission-2 Evidence Pack capability (src/core/evidence-pack.ts) to seal a mission's real
 * artifacts into an IMMUTABLE, content-addressed pack. Each file is content-hashed (FNV-1a) so the
 * seal changes iff an artifact changes. Deterministic: no timestamps, no randomness.
 *
 * Usage: tsx runtime/scripts/seal-evidence-pack.ts <mission> <outPath> <file...>
 */
import fs from "node:fs";
import { EvidencePack } from "@/core/evidence-pack";
import { EVIDENCE_PACK_CONTRACT_VERSION, type EvidencePackItem } from "@/contracts/evidence-pack";

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function kindOf(path: string): string {
  if (path.includes("/contracts/")) return "contract";
  if (path.includes("/tests/")) return "test";
  if (path.includes("/core/")) return "core";
  if (path.endsWith(".md")) return "report";
  return "artifact";
}

const [mission, outPath, ...files] = process.argv.slice(2);
if (!mission || !outPath || files.length === 0) {
  console.error("Usage: tsx runtime/scripts/seal-evidence-pack.ts <mission> <outPath> <file...>");
  process.exit(2);
}

const items: EvidencePackItem[] = files.map((f) => ({
  kind: kindOf(f),
  id: f,
  hash: fnv1a(fs.readFileSync(f, "utf8")),
}));

const result = new EvidencePack().seal({
  evidencePackContractVersion: EVIDENCE_PACK_CONTRACT_VERSION,
  mission,
  items,
});

if (!result.ok) {
  console.error("SEAL FAILED:", result.error);
  process.exit(1);
}

fs.writeFileSync(outPath, JSON.stringify(result.pack, null, 2) + "\n");
console.log(`SEALED ${mission}: itemCount=${result.pack.itemCount} sealHash=${result.pack.sealHash}`);
console.log(`WROTE ${outPath}`);
