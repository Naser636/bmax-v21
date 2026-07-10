import { normalizeBoampResult } from "@/core/boamp-normalizer";

const result = normalizeBoampResult({
  id: "1",
  title: " Test ",
});

console.assert(result.title === "Test");

console.log("BOAMP Normalizer OK");
