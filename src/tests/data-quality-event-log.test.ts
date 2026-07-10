import {
  addDataQualityEvent,
  getDataQualityEvents,
} from "@/core/data-quality-event-log";

addDataQualityEvent({
  source: "boamp",
  timestamp: Date.now(),
});

console.assert(getDataQualityEvents().length === 1);

console.log("Data Quality Event Log OK");
