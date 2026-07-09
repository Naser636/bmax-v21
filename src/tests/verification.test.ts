import { initializeVerification } from "@/core/verification-service";

const verification = initializeVerification(
  "Example API",
  0.95
);

console.assert(verification.verified === true);
console.assert(verification.confidence === 0.95);

console.log("Verification test OK");
