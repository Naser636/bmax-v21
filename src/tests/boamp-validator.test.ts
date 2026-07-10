import { validateBoampResult } from "@/core/boamp-validator";

console.assert(
  validateBoampResult({
    id: "1",
    title: "Test",
  })
);

console.log("BOAMP Validator OK");
