import { buildQuery } from "@/core/http-query";

const query = buildQuery({
  q: "boamp",
  page: 1,
});

console.assert(query.includes("q=boamp"));
console.assert(query.includes("page=1"));

console.log("HTTP Query OK");
