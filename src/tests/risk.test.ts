import { evaluateRisk } from "@/core/risk-engine";

const risk = evaluateRisk({
  id: "1",
  capability: "demo",
  recommendation: "ACCEPT",
  confidence: 1,
  timestamp: Date.now(),
});

console.assert(risk.level === "LOW");

console.log("Risk test OK");
