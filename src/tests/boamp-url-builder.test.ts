import { buildBoampUrl } from "@/core/boamp-url-builder";

console.assert(buildBoampUrl("test").includes("test"));

console.log("BOAMP URL Builder OK");
