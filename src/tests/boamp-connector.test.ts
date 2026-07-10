import { DefaultBoampConnector } from "@/core/boamp-connector";

const connector = new DefaultBoampConnector();

console.assert(connector !== undefined);

console.log("BOAMP Connector OK");
