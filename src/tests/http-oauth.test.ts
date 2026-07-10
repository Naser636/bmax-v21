import { OAuthToken } from "@/core/http-oauth";

const token: OAuthToken = {
  accessToken: "abc",
  expiresAt: Date.now() + 3600_000,
};

console.assert(token.accessToken === "abc");

console.log("HTTP OAuth OK");
