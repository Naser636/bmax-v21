import { BoampEvent } from "@/core/boamp-event";

const event: BoampEvent = {
  id: "1",
  timestamp: Date.now(),
};

console.assert(event.id === "1");

console.log("BOAMP Event OK");
