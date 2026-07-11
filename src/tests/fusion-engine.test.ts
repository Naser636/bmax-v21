import { FusionEngine } from "@/core/fusion-engine";

const engine = new FusionEngine();

console.assert(engine.execute([1],[2]).records.length === 2);

console.log("Fusion Engine OK");
