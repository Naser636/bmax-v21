import { BOAMP_BASE_URL } from "@/core/boamp-config";

console.assert(
  BOAMP_BASE_URL.startsWith("https://")
);

console.log("BOAMP Config OK");
