import { TokenManager } from "@/core/http-token-manager";

const manager = new TokenManager();

manager.set({
  accessToken: "abc",
  expiresAt: Date.now(),
});

console.assert(manager.get()?.accessToken === "abc");

manager.clear();

console.assert(manager.get() === undefined);

console.log("HTTP Token Manager OK");
