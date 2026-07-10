import { DataQualityEvent } from "@/core/data-quality-event";

const event: DataQualityEvent = {
  source: "boamp",
  timestamp: Date.now(),
};

console.assert(event.source === "boamp");

console.log("Data Quality Event OK");
