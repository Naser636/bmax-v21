import { filterBoampResults } from "@/core/boamp-filter";

console.assert(
  filterBoampResults([
    { id: "1", title: "OK" },
    { id: "", title: "KO" },
  ]).length === 1
);

console.log("BOAMP Filter OK");
