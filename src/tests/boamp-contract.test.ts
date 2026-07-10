import { BoampConnector } from "@/contracts/boamp-connector";

const connector: BoampConnector = {
  async search() {
    return [];
  },
};

console.assert(connector !== undefined);

console.log("BOAMP Contract OK");
