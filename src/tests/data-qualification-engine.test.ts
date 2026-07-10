import { DataQualificationEngine } from "@/core/data-qualification-engine";

const engine = new DataQualificationEngine();

console.assert(engine.execute([]).length === 0);

console.log("Data Qualification Engine OK");
