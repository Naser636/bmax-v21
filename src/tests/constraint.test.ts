import { initializeConstraint } from "@/core/constraint-service";

const constraint = initializeConstraint({
  budget: 10000,
  country: "France",
  language: "fr",
});

console.assert(constraint.budget === 10000);
console.assert(constraint.country === "France");

console.log("Constraint test OK");
