import {
  addBoampEvent,
  getBoampEvents,
} from "@/core/boamp-event-log";

addBoampEvent({
  id: "1",
  timestamp: Date.now(),
});

console.assert(getBoampEvents().length === 1);

console.log("BOAMP Event Log OK");
