import {
  addBoampHistory,
  getBoampHistory,
} from "@/core/boamp-history";

addBoampHistory([]);

console.assert(getBoampHistory().length === 1);

console.log("BOAMP History OK");
